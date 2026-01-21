# Publishing Guide

## NPM Registry

To publish the OpenCodeHub CLI to the official npm registry:

1.  **Login to npm**:
    ```bash
    npm login
    ```

2.  **Run the publish script**:
    ```bash
    ./scripts/publish-cli.sh
    ```

## GitHub Packages (Other Registry)

To publish to GitHub Packages:

1.  **Configure `.npmrc`**:
    Create a `.npmrc` file in `cli/` with:
    ```ini
    @swadhinbiswas:registry=https://npm.pkg.github.com
    ```

2.  **Update Package Name**:
    In `cli/package.json`, change the name to allow scoped publishing:
    ```json
    "name": "@swadhinbiswas/opencodehub-cli"
    ```

3.  **Authenticate**:
    Generate a Value Access Token (PAT) with `write:packages` scope on GitHub.
    ```bash
    npm login --scope=@swadhinbiswas --registry=https://npm.pkg.github.com
    ```

4.  **Publish**:
    ```bash
    cd cli
    npm publish
    ```
