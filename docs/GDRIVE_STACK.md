
## ☁️  Google Drive + Turso + Gmail Stack

This stack is ideal for cost-effective, serverless-style deployments where you want to minimize persistent volume usage and use managed services.

### 1. Database: Turso (LibSQL)

Turso is a managed SQLite-compatible database perfect for edge deployments.

**Get Credentials:**
1. Create a database on [Turso](https://turso.tech).
2. Get your Database URL (e.g., `libsql://db-name-user.turso.io`).
3. Create an Auth Token.

**Configuration:**
```env
DATABASE_DRIVER=libsql
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=your-auth-token
```

### 2. Storage: Google Drive

Store repositories and LFS objects in a Google Drive folder.

**Get Credentials:**
1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project and enable the **Google Drive API**.
3. Configure OAuth Consent Screen (Internal or External).
4. Create Credentials -> **OAuth Client ID** (Web Application).
   - Set Redirect URI to `https://developers.google.com/oauthplayground` (for generating token).
5. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
   - Step 1: Input your own scope: `https://www.googleapis.com/auth/drive.file`
   - Step 2: Use your Client ID & Secret in settings.
   - Step 3: Authorize and exchange for **Refresh Token**.
6. Create a folder in Google Drive and copy its **Folder ID** (from URL).

**Configuration:**
```env
STORAGE_TYPE=gdrive
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_FOLDER_ID=your-folder-id
```

### 3. Email: Google Mail (Gmail SMTP)

Use Gmail to send system emails.

**Get Credentials:**
1. Enable 2-Step Verification on your Google Account.
2. Go to **App Passwords** (Security settings).
3. Create a new App Password for "Mail".

**Configuration:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=OpenCodeHub <your-email@gmail.com>
```

### 4. Full `.env` Example

```env
# Security
JWT_SECRET=<run: openssl rand -hex 32>
SESSION_SECRET=<run: openssl rand -hex 32>
INTERNAL_HOOK_SECRET=<run: openssl rand -hex 32>
SITE_URL=https://your-app.com

# Turso Database
DATABASE_DRIVER=libsql
DATABASE_URL=libsql://...
DATABASE_AUTH_TOKEN=...

# Google Drive Storage
STORAGE_TYPE=gdrive
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_FOLDER_ID=...

# Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
```
