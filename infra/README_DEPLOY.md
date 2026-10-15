# Trend Contenter — Google Cloud Platform Deployment Guide

This guide outlines how to deploy Trend Contenter to **Google Cloud Platform (GCP)** using **Cloud Run**, **Google Secret Manager**, **Artifact Registry**, and **Cloud Scheduler**.

---

## Architecture Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Google Cloud Platform                           │
│                                                                        │
│   ┌─────────────────────┐                 ┌────────────────────────┐  │
│   │ trend-contenter-web │ ───────────────>│  trend-contenter-api   │  │
│   │ (Cloud Run Service) │                 │  (Cloud Run Service)   │  │
│   └─────────────────────┘                 └───────────┬────────────┘  │
│                                                       │               │
│                                                       ▼               │
│   ┌───────────────────────────┐           ┌────────────────────────┐  │
│   │ trend-contenter-ingestion │           │  PostgreSQL Database   │  │
│   │ (Cloud Run Job)           │──────────>│  (Cloud SQL / Neon)    │  │
│   └─────────────▲─────────────┘           └────────────────────────┘  │
│                 │                                     ▲               │
│   ┌─────────────┴─────────────┐                       │               │
│   │      Cloud Scheduler      │           ┌───────────┴────────────┐  │
│   │ (Hourly cron: 0 * * * *)  │           │ Google Secret Manager  │  │
│   └───────────────────────────┘           └────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Prerequisites

1. **Google Cloud SDK (`gcloud`)**:
   If not yet installed on macOS:
   ```bash
   brew install --cask google-cloud-sdk
   ```
2. **Authenticate with GCP**:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```
3. **Select or Create a GCP Project**:
   ```bash
   gcloud config set project <YOUR_PROJECT_ID>
   ```

---

## 2. One-Click Automated Deployment

We have provided a fully automated deployment script [`infra/deploy.sh`](file:///Users/sarsingh16/Intern-Scrunch/trend_contenter/infra/deploy.sh).

Run from the repository root:
```bash
./infra/deploy.sh <YOUR_PROJECT_ID> [REGION]
```
*(Default region is `us-central1` if omitted)*

### What the script automates:
1. Enables required GCP APIs: `run.googleapis.com`, `artifactregistry.googleapis.com`, `cloudbuild.googleapis.com`, `secretmanager.googleapis.com`, `sqladmin.googleapis.com`.
2. Creates an Artifact Registry Docker repository (`trend-contenter-repo`).
3. Reads secrets from your local `.env` and provisions them in Google Secret Manager (`serpapi-key`, `openai-key`, `gemini-key`, `postgres-uri`, `jwt-secret`).
4. Configures IAM permissions for the Cloud Run Compute service account.
5. Builds and pushes production containers using **Cloud Build** (`cloudbuild.yaml`).
6. Deploys `trend-contenter-api` and `trend-contenter-web` to Cloud Run.
7. Prints out the live public URLs.

---

## 3. Database Options on GCP

You can use either **Cloud SQL for PostgreSQL** or an external serverless PostgreSQL (e.g., Supabase / Neon):

### Option A: Managed Cloud SQL PostgreSQL
1. Create a Cloud SQL instance:
   ```bash
   gcloud sql instances create trend-contenter-db \
       --database-version=POSTGRES_16 \
       --cpu=1 \
       --memory=3840MiB \
       --region=us-central1
   ```
2. Set the password:
   ```bash
   gcloud sql users set-password postgres \
       --instance=trend-contenter-db \
       --password="YOUR_STRONG_PASSWORD"
   ```
3. Update the `postgres-uri` secret:
   ```bash
   echo -n "postgresql+asyncpg://postgres:YOUR_STRONG_PASSWORD@/trend_contenter?host=/cloudsql/<PROJECT_ID>:us-central1:trend-contenter-db" | \
       gcloud secrets versions add postgres-uri --data-file=-
   ```

### Option B: Neon / Supabase Serverless Postgres
Simply store the connection string directly in Secret Manager:
```bash
echo -n "postgresql+asyncpg://user:pass@ep-xxxx.us-east-1.aws.neon.tech/trend_contenter?ssl=require" | \
    gcloud secrets versions add postgres-uri --data-file=-
```

---

## 4. Scheduling Automated Trend Ingestion (Cloud Scheduler)

To run the trend discovery ingestion job automatically every hour:

1. Deploy the Cloud Run Job:
   ```bash
   gcloud run jobs replace infra/cloudrun/job-ingestion.yaml --region=us-central1
   ```
2. Create the Cloud Scheduler trigger:
   ```bash
   gcloud scheduler jobs create http trend-hourly-ingestion \
       --location=us-central1 \
       --schedule="0 * * * *" \
       --uri="https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/<YOUR_PROJECT_ID>/jobs/trend-contenter-ingestion:run" \
       --http-method=POST \
       --oauth-service-account-email="<PROJECT_NUMBER>-compute@developer.gserviceaccount.com"
   ```

---

## 5. Local Docker Compose Verification

To test the entire containerized deployment locally before going to the cloud:
```bash
docker compose up --build
```
- Web frontend: `http://localhost:5173`
- Backend API: `http://localhost:8001/api/v1`
- Postgres DB: `localhost:5432`
