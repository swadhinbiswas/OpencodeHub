# Branch Protection

Branch protection rules help you enforce code quality and prevent accidental deletions of important branches (like `main`).

## Configuring Rules

1. Navigate to your repository.
2. Click **Settings** > **Branches**.
3. Click **Add Rule**.

### Rule Options

#### Branch Pattern
Specify which branches this rule applies to.
- `main`: Matches exactly the main branch.
- `release/*`: Matches `release/v1`, `release/v2`, etc.
- `*`: Matches all branches (use with caution).

#### Require Pull Request
Ensures that no one can push directly to the branch. All changes must go through a Pull Request.

#### Require Approvals
Set the minimum number of code reviews required before merging.
- **Recommended**: 1 or 2.

#### Dismiss Stale Reviews
If checked, pushing new commits to a PR will dismiss existing approvals. This ensures reviewers see the latest code before merging.

#### Require Status Checks (CI)
(Coming Soon) Require CI/CD jobs (GitHub Actions) to pass before merging.

## Bypassing Protection

Repository administrators can bypass protection rules if "Include Administrators" is not checked. Use this Power cautiously!
