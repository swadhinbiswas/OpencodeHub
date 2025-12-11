# OpenCodeHub

<p align="center">
  <img src="public/logo.png" alt="OpenCodeHub Logo" width="200">
</p>

<p align="center">
  <strong>A powerful, self-hosted Git platform with CI/CD, code review, and collaboration features</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#usage">Usage</a> •
  <a href="#api">API</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## 🚀 Features

### Git Hosting

- **Full Git Support** - SSH and HTTP protocols
- **Repository Management** - Create, fork, and manage repositories
- **Branch Management** - Create, protect, and merge branches
- **Code Browser** - View files, commits, and blame history
- **GitLens-style Features** - Commit graph, blame annotations, and history visualization

### Collaboration

- **Pull Requests** - Review code changes with inline comments
- **Issues** - Track bugs and feature requests
- **Wiki** - Built-in documentation wiki
- **Organizations** - Team management with fine-grained permissions

### CI/CD Pipelines

- **GitHub Actions Compatible** - Run workflows defined in `.github/workflows/`
- **Self-hosted Runners** - Docker-based job execution
- **Artifacts** - Store and download build artifacts
- **Secrets Management** - Secure storage for sensitive data

### Modern Tech Stack

- **Astro + React** - Fast, modern frontend
- **TailwindCSS + shadcn/ui** - Beautiful, customizable UI
- **Universal Database Adapter** - Support for PostgreSQL, MySQL, SQLite, MongoDB
- **Flexible Storage** - Local, S3, MinIO, and more

---

## 📦 Installation

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/opencodehub/opencodehub.git
cd opencodehub

# Copy environment file
cp .env.example .env

# Start the services
docker-compose up -d
```

Access the application at `http://localhost:4321`

### Manual Installation

**Prerequisites:**

- Node.js 20+
- PostgreSQL 14+ (or SQLite/MySQL)
- Redis (optional, for caching)
- Git

```bash
# Clone the repository
git clone https://github.com/opencodehub/opencodehub.git
cd opencodehub

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run database migrations
npm run db:migrate

# Build the application
npm run build

# Start the server
npm start
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Server
HOST=0.0.0.0
PORT=4321
SERVER_URL=http://localhost:4321

# Database
DATABASE_TYPE=postgres  # postgres, mysql, sqlite, mongodb
DATABASE_URL=postgresql://user:password@localhost:5432/opencodehub

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# SSH Server
SSH_PORT=2222
SSH_HOST_KEY_PATH=./data/ssh/host_key

# Storage
STORAGE_TYPE=local  # local, s3, minio
STORAGE_PATH=./data/storage

# Git Repositories
REPOS_PATH=./data/repos

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Email (optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASSWORD=password
SMTP_FROM=noreply@example.com
```

### Database Configuration

**PostgreSQL:**

```env
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://user:password@localhost:5432/opencodehub
```

**MySQL:**

```env
DATABASE_TYPE=mysql
DATABASE_URL=mysql://user:password@localhost:3306/opencodehub
```

**SQLite:**

```env
DATABASE_TYPE=sqlite
DATABASE_URL=file:./data/opencodehub.db
```

**MongoDB:**

```env
DATABASE_TYPE=mongodb
DATABASE_URL=mongodb://localhost:27017/opencodehub
```

### Storage Configuration

**Local Storage:**

```env
STORAGE_TYPE=local
STORAGE_PATH=./data/storage
```

**S3/MinIO:**

```env
STORAGE_TYPE=s3
STORAGE_BUCKET=opencodehub
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=https://s3.amazonaws.com  # Or MinIO URL
STORAGE_ACCESS_KEY_ID=your-access-key
STORAGE_SECRET_ACCESS_KEY=your-secret-key
```

---

## 🔧 Usage

### Creating a Repository

1. Log in to your account
2. Click the **+** button in the header
3. Select **New Repository**
4. Fill in the repository details
5. Click **Create Repository**

### Cloning a Repository

**SSH:**

```bash
git clone git@localhost:username/repository.git
```

**HTTPS:**

```bash
git clone http://localhost:4321/username/repository.git
```

### Setting up CI/CD

1. Create a `.github/workflows/` directory in your repository
2. Add a workflow file (e.g., `ci.yml`):

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

3. Push your changes and watch the pipeline run!

---

## 📚 API Documentation

### Authentication

**Register:**

```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

**Login:**

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}
```

### Repositories

**List Repositories:**

```bash
GET /api/repos
Authorization: Bearer <token>
```

**Create Repository:**

```bash
POST /api/repos
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "my-project",
  "description": "My awesome project",
  "visibility": "public"
}
```

**Get Repository:**

```bash
GET /api/repos/{owner}/{repo}
```

### Full API documentation available at `/api/docs`

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │  Astro  │  │  React  │  │Tailwind │  │  Monaco Editor  │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                       API Layer                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │  Auth   │  │  Repos  │  │ Issues  │  │    Pipelines    │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     Core Services                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │   Git   │  │   SSH   │  │ Storage │  │     Pipeline    │ │
│  │ Engine  │  │ Server  │  │ Adapter │  │     Runner      │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer (UDA-Layer)                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │PostgreSQL│ │  MySQL  │  │ SQLite  │  │    MongoDB      │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔌 Plugin System

OpenCodeHub supports plugins for extending functionality:

```typescript
// plugins/my-plugin/index.ts
import { definePlugin } from "@opencodehub/plugin-api";

export default definePlugin({
  name: "my-plugin",
  version: "1.0.0",

  hooks: {
    "repo:push": async (event) => {
      console.log("Push received:", event.repository);
    },

    "issue:create": async (event) => {
      // Custom issue handling
    },
  },

  routes: [
    {
      path: "/api/my-plugin/webhook",
      method: "POST",
      handler: async (req, res) => {
        // Custom API endpoint
      },
    },
  ],
});
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Astro](https://astro.build/) - The web framework
- [shadcn/ui](https://ui.shadcn.com/) - UI components
- [Drizzle ORM](https://orm.drizzle.team/) - Database toolkit
- [simple-git](https://github.com/steveukx/git-js) - Git operations
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor

---

<p align="center">
  Made with ❤️ by the OpenCodeHub Team
</p>
