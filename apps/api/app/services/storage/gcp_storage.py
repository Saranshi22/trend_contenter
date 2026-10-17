"""
Google Cloud Storage adapter — concrete implementation of StorageProvider.

The GCP Cloud Storage SDK does not have a native async client.
Blocking calls are offloaded to a thread pool via asyncio.get_running_loop().run_in_executor()
to avoid blocking the FastAPI event loop.

Supports authentication via:
1. Base64-encoded GCLOUD_SERVICE_KEY (or raw JSON / key file path)
2. GOOGLE_APPLICATION_CREDENTIALS
3. Workload Identity / Application Default Credentials (ADC)
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import mimetypes
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from functools import partial
from typing import Any, BinaryIO, Iterator, Optional, Tuple
from urllib.parse import quote
from xml.etree import ElementTree

try:
    import google.auth
    from google.auth import credentials as google_auth_credentials
    from google.auth.transport.requests import AuthorizedSession, Request
    from google.oauth2 import service_account
except ImportError:
    google = None
    google_auth_credentials = None
    AuthorizedSession = None
    Request = None
    service_account = None

try:
    from google.cloud import storage
    from google.cloud.exceptions import GoogleCloudError, NotFound
except ImportError:
    storage = None
    GoogleCloudError = Exception
    NotFound = FileNotFoundError

from .base import ExternalServiceException, StorageProvider, ValidationError

logger = logging.getLogger(__name__)

_GCS_XML_API_BASE_URL = "https://storage.googleapis.com"
_GCS_XML_REQUEST_TIMEOUT = 60


def parse_service_account_credentials(raw_key: Optional[str] = None):
    """
    Parses Google Cloud service account credentials from:
    1. Base64-encoded JSON string
    2. Raw JSON string
    3. File path on disk
    4. GCLOUD_SERVICE_KEY, GCP_SERVICE_KEY, or GOOGLE_APPLICATION_CREDENTIALS env vars
    """
    key_str = (
        raw_key
        or os.getenv("GCLOUD_SERVICE_KEY")
        or os.getenv("GCP_SERVICE_KEY")
        or os.getenv("GCP_SERVICE_ACCOUNT_KEY")
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    )
    if not key_str:
        return None, None

    cleaned = key_str.strip()

    # 1. Check if raw JSON string
    if cleaned.startswith("{") and cleaned.endswith("}"):
        try:
            info = json.loads(cleaned)
            if service_account:
                creds = service_account.Credentials.from_service_account_info(info)
                return creds, info.get("project_id")
        except Exception as e:
            logger.warning("Failed to parse raw JSON service account credentials: %s", e)

    # 2. Check if base64 encoded JSON
    try:
        decoded = base64.b64decode(cleaned).decode("utf-8").strip()
        if decoded.startswith("{") and decoded.endswith("}"):
            info = json.loads(decoded)
            if service_account:
                creds = service_account.Credentials.from_service_account_info(info)
                return creds, info.get("project_id")
    except Exception:
        pass

    # 3. Check if file path on disk
    if os.path.isfile(cleaned):
        try:
            if service_account:
                creds = service_account.Credentials.from_service_account_file(cleaned)
                return creds, getattr(creds, "project_id", None)
        except Exception as e:
            logger.warning("Failed to load service account key file '%s': %s", cleaned, e)

    return None, None


class GCPStorageAdapter(StorageProvider):
    """Google Cloud Storage adapter.

    Authentication is handled automatically via:
    - Base64-encoded GCLOUD_SERVICE_KEY or GCP_SERVICE_KEY
    - GOOGLE_APPLICATION_CREDENTIALS file
    - Workload Identity / Application Default Credentials when running on GCP.

    Environment variables:
        GCP_STORAGE_BUCKET_NAME / GCS_BUCKET — GCS bucket name (required)
        GCP_PROJECT_ID / GOOGLE_CLOUD_PROJECT — Google Cloud project ID (optional)
        GCLOUD_SERVICE_KEY — Base64-encoded JSON service account key (optional)
        GCP_SIGNING_SERVICE_ACCOUNT_EMAIL — Signer email for ADC/WIF signed URLs (optional)
    """

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        project_id: Optional[str] = None,
        signing_service_account_email: Optional[str] = None,
        service_key: Optional[str] = None,
    ):
        self.bucket_name = (
            bucket_name
            or os.getenv("GCP_STORAGE_BUCKET_NAME")
            or os.getenv("GCS_BUCKET")
        )
        self.project_id = (
            project_id
            or os.getenv("GCP_PROJECT_ID")
            or os.getenv("GOOGLE_CLOUD_PROJECT")
        )
        self.signing_service_account_email = signing_service_account_email or os.getenv(
            "GCP_SIGNING_SERVICE_ACCOUNT_EMAIL"
        )
        self._custom_credentials, detected_project = parse_service_account_credentials(service_key)
        if not self.project_id and detected_project:
            self.project_id = detected_project

        self._session: Optional[Any] = None
        self._resolved_service_account_email: Optional[str] = None

        if not self.bucket_name:
            raise ValidationError(
                "bucket_name is required: set directly or via GCP_STORAGE_BUCKET_NAME / GCS_BUCKET"
            )

        if storage is None:
            raise ValidationError(
                "google-cloud-storage package is not installed. Please run: pip install google-cloud-storage"
            )

        client_kwargs: dict[str, Any] = {}
        if self.project_id:
            client_kwargs["project"] = self.project_id
        if self._custom_credentials:
            client_kwargs["credentials"] = self._custom_credentials

        try:
            self.client = storage.Client(**client_kwargs)
            self.bucket = self.client.bucket(self.bucket_name)
            logger.info("GCPStorageAdapter initialised → bucket=%s, project=%s", self.bucket_name, self.project_id)
        except Exception as e:
            raise ValidationError(f"Failed to initialise GCP Cloud Storage: {e}")

    # ── Helpers ──────────────────────────────────────────────────────

    def _build_storage_key(
        self,
        workspace_id: str,
        filename: str,
        file_type: str,
        source_id: Optional[str] = None,
    ) -> str:
        parts = [workspace_id.strip("/"), file_type.strip("/")]
        if source_id:
            parts.append(source_id.strip("/"))
        parts.append(filename.lstrip("/"))
        return "/".join(parts)

    def _get_content_type(self, filename: str) -> str:
        guessed, _ = mimetypes.guess_type(filename)
        return guessed or "application/octet-stream"

    # ── Connection lifecycle ─────────────────────────────────────────

    def is_connected(self) -> bool:
        canary_key = ".healthcheck_canary"
        try:
            # 1. Canary write
            blob = self.bucket.blob(canary_key)
            blob.upload_from_string(b"1", content_type="text/plain")
            try:
                # 2. Canary read
                content = blob.download_as_bytes()
                if content != b"1":
                    return False

                # 3. Verify signed GET and PUT URL generation
                self.get_file_url(canary_key, expiry_seconds=60)
                self._generate_signed_url(canary_key, "PUT", expiry_seconds=60)
            finally:
                try:
                    blob.delete()
                except Exception:
                    pass

            return True
        except Exception as e:
            logger.warning("GCPStorageAdapter is_connected check failed: %s", e)
            return False

    def close(self) -> None:
        """Close the Google Cloud Storage client's HTTP transport."""
        if self._session is not None:
            try:
                self._session.close()
            except Exception:
                pass
            self._session = None
        try:
            self.client.close()
        except Exception:
            pass

    # ── File operations ──────────────────────────────────────────────

    async def upload_file(
        self,
        workspace_id: str,
        filename: str,
        file_content: bytes,
        file_type: str,
        source_id: Optional[str] = None,
    ) -> Tuple[str, int]:
        try:
            blob_name = self._build_storage_key(
                workspace_id, filename, file_type, source_id
            )
            file_size = len(file_content)
            content_type = self._get_content_type(filename)
            blob = self.bucket.blob(blob_name)
            blob.content_type = content_type
            blob.metadata = {
                "workspace_id": workspace_id,
                "file_type": file_type,
                "original_filename": filename,
            }
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                partial(
                    blob.upload_from_string, file_content, content_type=content_type
                ),
            )
            logger.info("Uploaded to GCS: %s (%d bytes)", blob_name, file_size)
            return blob_name, file_size
        except GoogleCloudError as e:
            raise ValidationError(f"Failed to upload to GCS: {e}")

    def upload_file_with_key_sync(
        self,
        storage_key: str,
        file_content: bytes,
    ) -> Tuple[str, int]:
        try:
            file_size = len(file_content)
            filename = storage_key.rsplit("/", 1)[-1]
            content_type = self._get_content_type(filename)
            blob = self.bucket.blob(storage_key)
            blob.content_type = content_type
            blob.upload_from_string(file_content, content_type=content_type)
            logger.info(
                "Uploaded to GCS with key: %s (%d bytes)", storage_key, file_size
            )
            return storage_key, file_size
        except GoogleCloudError as e:
            raise ValidationError(f"Failed to upload to GCS with key: {e}")

    async def upload_file_with_key(
        self,
        storage_key: str,
        file_content: bytes,
    ) -> Tuple[str, int]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, partial(self.upload_file_with_key_sync, storage_key, file_content)
        )

    def download_file_sync(self, storage_key: str) -> bytes:
        try:
            blob = self.bucket.blob(storage_key)
            kwargs: dict[str, Any] = {"timeout": 120}
            try:
                from google.cloud.storage.retry import DEFAULT_RETRY
                kwargs["retry"] = DEFAULT_RETRY
            except Exception:
                pass
            content = blob.download_as_bytes(**kwargs)
            logger.info("Downloaded from GCS: %s (%d bytes)", storage_key, len(content))
            return content
        except NotFound:
            raise FileNotFoundError(f"File not found in GCS: {storage_key}")
        except Exception as e:
            raise ExternalServiceException(f"Failed to download from GCS: {e}")

    def download_prefix_sync(self, storage_key: str, length: int) -> bytes:
        """Fetch at most ``length`` leading bytes via a ranged GCS read."""
        if length <= 0:
            return b""
        try:
            blob = self.bucket.blob(storage_key)
            kwargs: dict[str, Any] = {"timeout": 120}
            try:
                from google.cloud.storage.retry import DEFAULT_RETRY
                kwargs["retry"] = DEFAULT_RETRY
            except Exception:
                pass
            content = blob.download_as_bytes(start=0, end=length - 1, **kwargs)
            logger.info(
                "Range-read from GCS: %s (%d bytes, window %d)",
                storage_key,
                len(content),
                length,
            )
            return content
        except NotFound:
            raise FileNotFoundError(f"File not found in GCS: {storage_key}")
        except Exception:
            logger.warning(
                "Range-read failed for %s, falling back to full download", storage_key
            )
            return self.download_file_sync(storage_key)

    @contextmanager
    def open_download_stream_sync(self, storage_key: str) -> Iterator[BinaryIO]:
        try:
            blob = self.bucket.blob(storage_key)
            kwargs: dict[str, Any] = {}
            try:
                from google.cloud.storage.retry import DEFAULT_RETRY
                kwargs["retry"] = DEFAULT_RETRY
            except Exception:
                pass
            with blob.open("rb", **kwargs) as stream:
                logger.info("Opened GCS download stream: %s", storage_key)
                yield stream
        except NotFound:
            raise FileNotFoundError(f"File not found in GCS: {storage_key}")
        except Exception as e:
            raise ExternalServiceException(f"Failed to stream download from GCS: {e}")

    async def download_file(self, storage_key: str) -> bytes:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self.download_file_sync, storage_key)

    def delete_file(self, storage_key: str) -> None:
        try:
            self.bucket.blob(storage_key).delete()
            logger.info("Deleted from GCS: %s", storage_key)
        except NotFound:
            # Idempotent delete: a missing blob is a no-op.
            logger.info("GCS blob already absent, skipping delete: %s", storage_key)
        except GoogleCloudError as e:
            raise ValidationError(f"Failed to delete from GCS: {e}")

    def delete_workspace_files(self, workspace_id: str) -> None:
        try:
            blobs = self.bucket.list_blobs(prefix=f"{workspace_id}/")
            deleted = 0
            for blob in blobs:
                try:
                    blob.delete()
                    deleted += 1
                except NotFound:
                    continue
            logger.info("Deleted %d blobs for workspace %s", deleted, workspace_id)
        except GoogleCloudError as e:
            raise ValidationError(f"Failed to delete workspace files from GCS: {e}")

    # ── Signed URL Generation ────────────────────────────────────────

    def _signed_url_kwargs(self) -> dict[str, Any]:
        """Return signing kwargs that work with service account keys and WIF/ADC."""
        credentials = self._credentials()

        if google_auth_credentials and isinstance(credentials, google_auth_credentials.Signing):
            return {"credentials": credentials}

        self._ensure_valid_credentials(credentials)

        if self._resolved_service_account_email:
            service_account_email = self._resolved_service_account_email
        else:
            service_account_email = self.signing_service_account_email or getattr(
                credentials, "service_account_email", None
            )
            if not service_account_email or service_account_email == "default":
                try:
                    service_account_email = self.client.get_service_account_email()
                except Exception:
                    service_account_email = getattr(credentials, "signer_email", None)
            self._resolved_service_account_email = service_account_email

        if not service_account_email:
            raise ValidationError(
                "Failed to resolve service account email for GCS signed URL generation"
            )

        token = getattr(credentials, "token", None)
        return {
            "service_account_email": service_account_email,
            "access_token": token,
        }

    def _credentials(self):
        if self._custom_credentials is not None:
            return self._custom_credentials
        credentials = getattr(self.client, "_credentials", None)
        if credentials is None and google:
            credentials, _ = google.auth.default()
        return credentials

    def _ensure_valid_credentials(self, credentials) -> None:
        if credentials is not None:
            if not getattr(credentials, "valid", False) or not getattr(credentials, "token", None):
                if Request:
                    credentials.refresh(Request())

    def _generate_signed_url(
        self,
        storage_key: str,
        method: str,
        expiry_seconds: int,
        query_parameters: Optional[dict[str, Any]] = None,
    ) -> str:
        blob = self.bucket.blob(storage_key)
        return blob.generate_signed_url(
            expiration=datetime.now(timezone.utc) + timedelta(seconds=expiry_seconds),
            method=method,
            version="v4",
            query_parameters=query_parameters,
            **self._signed_url_kwargs(),
        )

    def get_file_url(self, storage_key: str, expiry_seconds: int = 3600) -> str:
        try:
            url = self._generate_signed_url(storage_key, "GET", expiry_seconds)
            logger.info(
                "Generated signed URL for %s (expires %ds)", storage_key, expiry_seconds
            )
            return url
        except Exception as e:
            raise ValidationError(f"Failed to generate signed URL: {e}")

    # ── XML API / Multipart Upload operations ────────────────────────

    def _xml_api_object_url(self, storage_key: str, query: str) -> str:
        encoded_bucket = quote(self.bucket_name or "", safe="")
        encoded_key = quote(storage_key, safe="/~")
        return f"{_GCS_XML_API_BASE_URL}/{encoded_bucket}/{encoded_key}?{query}"

    def _xml_api_session(self) -> Any:
        if self._session is None:
            credentials = self._credentials()
            self._ensure_valid_credentials(credentials)
            if AuthorizedSession:
                self._session = AuthorizedSession(credentials)
            else:
                import requests
                self._session = requests.Session()
        else:
            self._ensure_valid_credentials(getattr(self._session, "credentials", None))
        return self._session

    @staticmethod
    def _xml_text(root: ElementTree.Element, tag_name: str) -> Optional[str]:
        return root.findtext(f".//{{*}}{tag_name}") or root.findtext(tag_name)

    @staticmethod
    def _validate_xml_response(response, failure_message: str) -> None:
        if 200 <= response.status_code < 300:
            return
        raise ValidationError(
            f"{failure_message}: HTTP {response.status_code} {response.text}"
        )

    def _list_multipart_part_etags(
        self, storage_key: str, upload_id: str
    ) -> dict[int, str]:
        etags: dict[int, str] = {}
        part_number_marker: Optional[str] = None
        session = self._xml_api_session()

        while True:
            query = f"uploadId={quote(upload_id, safe='')}&max-parts=1000"
            if part_number_marker:
                query += f"&part-number-marker={quote(part_number_marker, safe='')}"

            response = session.get(
                self._xml_api_object_url(storage_key, query),
                timeout=_GCS_XML_REQUEST_TIMEOUT,
            )
            self._validate_xml_response(
                response, "Failed to list GCS XML multipart upload parts"
            )

            root = ElementTree.fromstring(response.text)
            for part_el in root.findall(".//{*}Part") or root.findall(".//Part"):
                part_number = self._xml_text(part_el, "PartNumber")
                etag = self._xml_text(part_el, "ETag")
                if part_number and etag:
                    etags[int(part_number)] = etag

            is_truncated = (self._xml_text(root, "IsTruncated") or "").lower()
            if is_truncated != "true":
                return etags

            part_number_marker = self._xml_text(root, "NextPartNumberMarker")
            if not part_number_marker:
                raise ValidationError(
                    "Failed to list GCS XML multipart upload parts: missing "
                    "NextPartNumberMarker in truncated response"
                )

    def create_multipart_upload(
        self, storage_key: str, content_type: Optional[str] = None
    ) -> str:
        try:
            filename = storage_key.rsplit("/", 1)[-1]
            content_type = content_type or self._get_content_type(filename)
            response = self._xml_api_session().post(
                self._xml_api_object_url(storage_key, "uploads"),
                headers={"Content-Type": content_type},
                timeout=_GCS_XML_REQUEST_TIMEOUT,
            )
            self._validate_xml_response(
                response, "Failed to initiate GCS XML multipart upload"
            )

            root = ElementTree.fromstring(response.text)
            upload_id = self._xml_text(root, "UploadId")
            if not upload_id:
                raise ValidationError(
                    "Failed to initiate GCS XML multipart upload: missing UploadId"
                )

            logger.info(
                "Started GCS XML multipart upload for %s (UploadId: %s)",
                storage_key,
                upload_id,
            )
            return upload_id
        except ValidationError:
            raise
        except Exception as e:
            raise ValidationError(
                f"Failed to initiate GCS XML multipart upload: {e}"
            ) from e

    def generate_presigned_part_url(
        self,
        storage_key: str,
        upload_id: str,
        part_number: int,
        expiry_seconds: int = 3600,
    ) -> str:
        try:
            url = self._generate_signed_url(
                storage_key,
                "PUT",
                expiry_seconds,
                query_parameters={
                    "partNumber": str(part_number),
                    "uploadId": upload_id,
                },
            )
            logger.info(
                "Generated signed PUT URL for GCS multipart part %s, part %d",
                storage_key,
                part_number,
            )
            return url
        except Exception as e:
            raise ValidationError(f"Failed to generate GCS signed part URL: {e}")

    def complete_multipart_upload(
        self, storage_key: str, upload_id: str, parts: list[dict]
    ) -> None:
        try:
            root = ElementTree.Element("CompleteMultipartUpload")
            sorted_parts = sorted(parts, key=lambda x: x["PartNumber"])
            if any(
                not part.get("ETag") or part.get("ETag") == "dummy-etag"
                for part in sorted_parts
            ):
                listed_etags = self._list_multipart_part_etags(storage_key, upload_id)
            else:
                listed_etags = {}

            for part in sorted_parts:
                etag = part.get("ETag")
                if not etag or etag == "dummy-etag":
                    etag = listed_etags.get(part["PartNumber"])

                if not etag:
                    raise ValidationError(
                        "Failed to complete GCS XML multipart upload: missing ETag "
                        f"for part {part['PartNumber']}"
                    )

                part_el = ElementTree.SubElement(root, "Part")
                ElementTree.SubElement(part_el, "PartNumber").text = str(
                    part["PartNumber"]
                )
                ElementTree.SubElement(part_el, "ETag").text = etag

            body = ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)
            response = self._xml_api_session().post(
                self._xml_api_object_url(
                    storage_key, f"uploadId={quote(upload_id, safe='')}"
                ),
                data=body,
                headers={"Content-Type": "application/xml"},
                timeout=_GCS_XML_REQUEST_TIMEOUT,
            )
            self._validate_xml_response(
                response, "Failed to complete GCS XML multipart upload"
            )
            logger.info("Completed GCS XML multipart upload for %s", storage_key)
        except ValidationError:
            raise
        except Exception as e:
            raise ValidationError(
                f"Failed to complete GCS XML multipart upload: {e}"
            ) from e

    def abort_multipart_upload(self, storage_key: str, upload_id: str) -> None:
        try:
            response = self._xml_api_session().delete(
                self._xml_api_object_url(
                    storage_key, f"uploadId={quote(upload_id, safe='')}"
                ),
                timeout=_GCS_XML_REQUEST_TIMEOUT,
            )
            self._validate_xml_response(
                response, "Failed to abort GCS XML multipart upload"
            )
            logger.info("Aborted GCS XML multipart upload for %s", storage_key)
        except Exception as e:
            logger.warning("Failed to abort GCS XML multipart upload: %s", e)


_default_gcp_adapter: Optional[GCPStorageAdapter] = None


def get_gcp_storage_adapter(
    bucket_name: Optional[str] = None,
    service_key: Optional[str] = None,
) -> Optional[GCPStorageAdapter]:
    """Returns a singleton or configured instance of GCPStorageAdapter if configured."""
    global _default_gcp_adapter
    resolved_bucket = (
        bucket_name
        or os.getenv("GCP_STORAGE_BUCKET_NAME")
        or os.getenv("GCS_BUCKET")
    )
    if not resolved_bucket:
        return None

    try:
        if _default_gcp_adapter is None:
            _default_gcp_adapter = GCPStorageAdapter(
                bucket_name=resolved_bucket,
                service_key=service_key,
            )
        return _default_gcp_adapter
    except Exception as e:
        logger.warning("Could not initialise GCPStorageAdapter: %s", e)
        return None

