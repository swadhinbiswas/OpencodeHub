# Tutorial: Automated Deployment Pipeline

This tutorial shows you how to set up a CI/CD pipeline in OpenCodeHub to deploy your application automatically when code is pushed.

We will use **GitHub Actions** syntax, which OpenCodeHub supports via its integrated runner system.

## Scenario
We have a Node.js web app. We want to:
1. Run tests on every push.
2. If tests pass on `main`, deploy to a production server via SSH.

## Step 1: Create the Workflow File

Create a file named `.github/workflows/deploy.yml` in your repository.

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy via SSH
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
             cd /var/www/myapp
             git pull origin main
             npm install
             pm2 restart myapp
```

## Step 2: Configure Secrets

Your workflow needs access to your production server credentials. Never commit these to code!

1. Go to **Repository Settings** > **Secrets**.
2. Add the following secrets:
   - `PROD_HOST`: Your server IP (e.g., `1.2.3.4`).
   - `PROD_USER`: SSH username (e.g., `ubuntu`).
   - `PROD_SSH_KEY`: Your private SSH key content.

## Step 3: Push and Watch

1. Commit and push the workflow file.
2. Navigate to the **Actions** tab in your repository.
3. You should see a new workflow run named "CI/CD Pipeline".
4. Click on it to see the live logs of the `test` and `deploy` jobs.

## Troubleshooting

- **"Runner not found"**: Ensure you have at least one runner connected to your instance (see [Runner Setup](../administration/runners.md)).
- **SSH Failures**: Verify your `PROD_SSH_KEY` matches the public key in `~/.ssh/authorized_keys` on the target server.
