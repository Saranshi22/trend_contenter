#!/usr/bin/env bash
# ==============================================================================
# Trend Contenter — Google Cloud Platform Automated Deployment Script
# Targets: Cloud Run (API & Web), Google Secret Manager, Artifact Registry
# ==============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}    Trend Contenter — Google Cloud Run Deployment   ${NC}"
echo -e "${CYAN}====================================================${NC}"

# 1. Project Configuration
PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || echo "")}}"
REGION="${2:-${GOOGLE_CLOUD_LOCATION:-us-central1}}"

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: GCP Project ID not specified.${NC}"
    echo "Usage: ./infra/deploy.sh <GCP_PROJECT_ID> [REGION]"
    echo "Example: ./infra/deploy.sh my-gcp-project-123 us-central1"
    exit 1
fi

echo -e "Project ID: ${GREEN}${PROJECT_ID}${NC}"
echo -e "Region:     ${GREEN}${REGION}${NC}"
gcloud config set project "$PROJECT_ID"

# 2. Enable Required GCP APIs
echo -e "\n${CYAN}[1/5] Enabling required Google Cloud APIs...${NC}"
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    sqladmin.googleapis.com \
    --project="$PROJECT_ID"

# 3. Create Artifact Registry Repository if not exists
echo -e "\n${CYAN}[2/5] Configuring Artifact Registry repository...${NC}"
REPO_NAME="trend-contenter-repo"
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
    echo "Creating repository: $REPO_NAME in $REGION..."
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --description="Docker repository for Trend Contenter" \
        --project="$PROJECT_ID"
else
    echo "Repository $REPO_NAME already exists in $REGION."
fi

# 4. Ensure Secret Manager Secrets Exist
echo -e "\n${CYAN}[3/5] Verifying Secret Manager secrets...${NC}"

ensure_secret_exists() {
    local secret_name="$1"

    if ! gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &>/dev/null; then
        echo "Creating initial placeholder secret: $secret_name..."
        gcloud secrets create "$secret_name" \
            --replication-policy="automatic" \
            --project="$PROJECT_ID"
        echo -n "not_configured" | gcloud secrets versions add "$secret_name" \
            --data-file=- \
            --project="$PROJECT_ID" >/dev/null
        echo -e "  ✓ Created placeholder secret ${GREEN}${secret_name}${NC}."
    else
        echo -e "  ✓ Secret ${GREEN}${secret_name}${NC} is present in Secret Manager."
    fi
}

# Ensure required secrets exist in Secret Manager without reading or using .env
ensure_secret_exists "serpapi-key"
ensure_secret_exists "openai-key"
ensure_secret_exists "gemini-key"
ensure_secret_exists "jwt-secret"
ensure_secret_exists "postgres-uri"
ensure_secret_exists "socialcrawl-key"
ensure_secret_exists "youtube-key"

# Grant Cloud Build & Compute Service Accounts all required IAM roles
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

echo "Ensuring required IAM roles for Cloud Build ($COMPUTE_SA & $CLOUDBUILD_SA)..."
for role in "roles/storage.admin" "roles/logging.logWriter" "roles/artifactregistry.writer" "roles/run.admin" "roles/iam.serviceAccountUser" "roles/secretmanager.secretAccessor"; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${COMPUTE_SA}" \
        --role="$role" \
        --condition=None >/dev/null 2>&1 || true
done

for role in "roles/run.admin" "roles/iam.serviceAccountUser" "roles/secretmanager.secretAccessor" "roles/artifactregistry.writer"; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:${CLOUDBUILD_SA}" \
        --role="$role" \
        --condition=None >/dev/null 2>&1 || true
done

# 5. Build and Deploy using Cloud Build
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
echo -e "\n${CYAN}[4/5] Building container images and deploying via Cloud Build (tag: ${COMMIT_SHA})...${NC}"
gcloud builds submit \
    --config=cloudbuild.yaml \
    --substitutions=_REGION="$REGION",_TAG="$COMMIT_SHA" \
    --project="$PROJECT_ID"

# 6. Retrieve Service URLs
echo -e "\n${CYAN}[5/5] Deployment complete! Retrieving live endpoints...${NC}"
API_URL=$(gcloud run services describe trend-contenter-api --region="$REGION" --format="value(status.url)" --project="$PROJECT_ID" || echo "")
WEB_URL=$(gcloud run services describe trend-contenter-web --region="$REGION" --format="value(status.url)" --project="$PROJECT_ID" || echo "")

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}    Trend Contenter Successfully Deployed to GCP    ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "API Endpoint: ${CYAN}${API_URL}${NC}"
echo -e "Web App URL:  ${CYAN}${WEB_URL}${NC}"
echo -e "Region:       ${REGION}"
echo -e "Project:      ${PROJECT_ID}"
