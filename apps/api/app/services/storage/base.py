"""
Base interfaces and exceptions for storage providers.
"""

from abc import ABC, abstractmethod
from typing import BinaryIO, Iterator, Optional, Tuple


class StorageException(Exception):
    """Base exception for storage provider errors."""
    pass


class ExternalServiceException(StorageException):
    """Raised when an external cloud storage service fails."""
    pass


class ValidationError(StorageException):
    """Raised when validation fails for storage operations or configuration."""
    pass


class StorageProvider(ABC):
    """Abstract base class for cloud storage providers."""

    @abstractmethod
    def is_connected(self) -> bool:
        """Verify storage provider connectivity and permissions."""
        pass

    @abstractmethod
    def close(self) -> None:
        """Close storage client connections."""
        pass

    @abstractmethod
    async def upload_file(
        self,
        workspace_id: str,
        filename: str,
        file_content: bytes,
        file_type: str,
        source_id: Optional[str] = None,
    ) -> Tuple[str, int]:
        """Upload a file asynchronously, returning (storage_key, file_size)."""
        pass

    @abstractmethod
    def upload_file_with_key_sync(
        self,
        storage_key: str,
        file_content: bytes,
    ) -> Tuple[str, int]:
        """Upload a file with a specific storage key synchronously."""
        pass

    @abstractmethod
    async def upload_file_with_key(
        self,
        storage_key: str,
        file_content: bytes,
    ) -> Tuple[str, int]:
        """Upload a file with a specific storage key asynchronously."""
        pass

    @abstractmethod
    def download_file_sync(self, storage_key: str) -> bytes:
        """Download file bytes synchronously."""
        pass

    @abstractmethod
    async def download_file(self, storage_key: str) -> bytes:
        """Download file bytes asynchronously."""
        pass

    @abstractmethod
    def get_file_url(self, storage_key: str, expiry_seconds: int = 3600) -> str:
        """Generate a public or signed URL for accessing the file."""
        pass

    @abstractmethod
    def delete_file(self, storage_key: str) -> None:
        """Delete a file by storage key."""
        pass

