# Storage Adapters

OpenCodeHub supports a pluggable storage system, allowing you to store repository data (git objects, LFS files, artifacts) on various backends.

## Supported Adapters

- **Local Filesystem**: Default, stores data on the server's disk.
- **S3 Compatible**: AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces.
- **Google Drive**: Ideal for personal/low-cost deployments.
- **Azure Blob Storage**: Microsoft Azure storage.

---

## 📂 Local Storage (Default)

Data is stored in the `data/` directory relative to the application root.

**Configuration:**
```env
STORAGE_TYPE=local
STORAGE_PATH=./data/storage  # Optional, default is ./data
```

---

## ☁️ S3 Compatible Storage

Store data in any S3-compatible bucket. This is recommended for production scalablity.

**Configuration:**
```env
STORAGE_TYPE=s3
STORAGE_BUCKET=my-opencodehub-bucket
STORAGE_REGION=us-east-1      # or auto
STORAGE_ENDPOINT=https://s3.amazonaws.com # or your custom endpoint
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
```

### Examples

**MinIO (Self-hosted):**
```env
STORAGE_ENDPOINT=http://minio:9000
STORAGE_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

**Cloudflare R2:**
```env
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_REGION=auto
```

---

## 🚗 Google Drive Stack

This stack is ideal for cost-effective, serverless-style deployments where you want to minimize persistent volume usage.

### Prerequisites

1.  **Google Cloud Project**: Enable **Google Drive API**.
2.  **OAuth Credentials**: Create "Web Application" credentials.
3.  **Refresh Token**: Obtain a long-lived refresh token (e.g., via OAuth Playground).

### Configuration

```env
STORAGE_TYPE=gdrive
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_FOLDER_ID=your-folder-id
```

**How to get Credentials:**
1.  Go to [Google Cloud Console](https://console.cloud.google.com).
2.  Create a project -> Enable **Google Drive API**.
3.  Create **OAuth Client ID**.
4.  Get Refresh Token via [OAuth Playground](https://developers.google.com/oauthplayground) with scope `https://www.googleapis.com/auth/drive.file`.

---

## 🔷 Azure Blob Storage

**Configuration:**
```env
STORAGE_TYPE=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_CONTAINER_NAME=opencodehub
```
