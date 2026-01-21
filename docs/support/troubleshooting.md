# Troubleshooting Guide

Solutions to common issues encountered when running or using OpenCodeHub.

## 🔍 Diagnostics

Before trying specific fixes, check the system health.

**1. Check Container Status (Docker)**
```bash
docker-compose ps
```
*All containers (`app`, `postgres`, `redis`) should be `Up`.*

**2. Check Application Logs**
```bash
docker-compose logs -f app
```
*Look for "Error" or "Exception" stacks.*

**3. Check Database Connection**
```bash
docker-compose exec app npm run db:check
```

---

## 🛑 Common Errors

### `Git Push Failed: 403 Forbidden`

**Symptoms:**
- You try to push code and get `remote: Forbidden`.
- CLI says `Error: 403`.

**Possible Causes:**
1. **Protected Branch**: You are trying to push directly to `main` on a protected branch.
   - *Fix*: Create a new branch and open a Pull Request.
2. **Permissions**: You only have `Read` access to the repository.
   - *Fix*: Ask an admin to grant `Write` or `Admin` access.
3. **LFS Locking**: Someone else has locked a binary file.

---

### `Repository Not Found (404)`

**Symptoms:**
- `git clone` fails with `repository not found`.

**Possible Causes:**
1. **Private Repo**: You are not logged in, or your token is invalid.
   - *Fix*: Run `och auth login`.
2. **Typo**: Check the owner and repository name.
3. **Deleted**: The repository was deleted.

---

### `Database Connection Refused`

**Symptoms:**
- App crashes on startup.
- Logs show `P1001: Can't reach database server`.

**Solutions:**
1. **Wait**: Postgres takes a few seconds to start. The app usually retries.
2. **Network**: Ensure `DATABASE_URL` uses the correct internal hostname (`postgres` in Docker, `localhost` if running locally).
3. **Credentials**: Check that `POSTGRES_PASSWORD` in `docker-compose.yml` matches `DATABASE_URL`.

---

### `Runner: "Job stuck in queue"`

**Symptoms:**
- CI pipelines stay "Pending" forever.

**Solutions:**
1. **Check Runner**: Is a runner registered and active?
   - Go to *Admin Panel > Runners*.
2. **Docker Socket**: Ensure the runner has access to `/var/run/docker.sock`.
3. **Resource Limits**: The runner might be OOM (Out of Memory). Increase Docker memory limit.

---

### `White Screen / 500 Error`

**Symptoms:**
- The website loads a blank page.

**Solutions:**
1. **Build Mismatch**: You might be serving an old frontend with a new backend API.
   - *Fix*: Hard refresh (Ctrl+F5) or rebuild the docker image.
2. **Environment Variables**: Check if `NEXT_PUBLIC_SITE_URL` matches your actual domain.

---

## 🆘 Getting Support

If you can't resolve the issue:

1. **Search Documentation**: Use the search bar for related keywords.
2. **Check GitHub Issues**: See if others have reported it.
3. **Join Discord**: Ask the community in `#support`.

**When reporting bugs, include:**
- OpenCodeHub Version (footer).
- Deployment method (Docker vs. Source).
- Logs (redacted).
