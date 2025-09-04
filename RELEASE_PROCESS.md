# Release Process

This document describes the automated release process for the Prisma CLI Extension package.

## Overview

The release process is fully automated and ensures that:

1. All tests pass before any release
2. Code is properly validated and linted
3. Releases only happen from the main branch
4. Semantic versioning is applied automatically
5. NPM publishing and GitHub releases are created

## Workflow

### 1. Development Process

1. **Create Feature Branch**: Developers create feature branches from `main`
2. **Make Changes**: Implement features, fixes, or improvements
3. **Add Tests**: Ensure new functionality is properly tested
4. **Create Pull Request**: Submit PR for review

### 2. CI Pipeline (on every PR)

The CI pipeline runs automatically on every pull request and includes:

- **TypeScript Compilation**: Ensures type safety
- **Linting**: Code quality and style checks
- **Testing**: Unit and integration tests with coverage
- **Build Verification**: Ensures the project builds successfully
- **Security Audit**: Checks for known vulnerabilities

### 3. Merge to Main

When a PR is approved and merged to `main`:

1. **CI Pipeline Runs**: All tests and validations must pass
2. **Merge Validation**: The system verifies the merge was successful
3. **Release Trigger**: If all conditions are met, the release process begins

### 4. Release Pipeline

The release pipeline runs automatically when code is pushed to `main` and includes:

#### Test & Validate Job

- Runs all tests again to ensure nothing broke during merge
- Performs TypeScript compilation
- Runs linting
- Builds the project
- Performs security audit

#### Release Job (only if tests pass)

- **Version Bumping**: Automatically determines version bump based on commit messages
- **Changelog Generation**: Creates changelog from commit messages
- **NPM Publishing**: Publishes to npm registry
- **Git Tagging**: Creates git tags
- **GitHub Release**: Creates GitHub release with changelog

## Version Bumping Rules

The system uses semantic versioning with these rules:

| Commit Type                | Version Bump          | Example                              |
| -------------------------- | --------------------- | ------------------------------------ |
| `feat:`                    | Minor (0.1.0 → 0.2.0) | `feat: add new database support`     |
| `fix:`                     | Patch (0.1.0 → 0.1.1) | `fix: resolve ASAR extraction issue` |
| `BREAKING CHANGE:` or `!:` | Major (0.1.0 → 1.0.0) | `feat!: change API interface`        |
| Other commits              | Patch (0.1.0 → 0.1.1) | `docs: update README`                |

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Examples

```bash
# Feature (minor version bump)
git commit -m "feat: add support for custom database paths"

# Bug fix (patch version bump)
git commit -m "fix: resolve ASAR extraction issue on Windows"

# Breaking change (major version bump)
git commit -m "feat!: change PrismaInitializer constructor signature

BREAKING CHANGE: The constructor now requires an additional parameter"

# Documentation (patch version bump)
git commit -m "docs: update installation instructions"

# Chore (patch version bump)
git commit -m "chore: update dependencies"
```

## Manual Release

You can also trigger a manual release using the GitHub Actions interface:

1. Go to the **Actions** tab in the GitHub repository
2. Select the **Release** workflow
3. Click **Run workflow**
4. Choose the release type (patch, minor, or major)
5. Click **Run workflow**

## Safety Measures

### Pre-Release Validation

- All tests must pass before release
- TypeScript compilation must succeed
- Linting must pass
- Security audit must pass
- Build must complete successfully

### Branch Protection

- Releases only happen from `main` branch
- Direct pushes to `main` are allowed but logged
- PR merges are preferred and validated

### Rollback Process

If a release has issues:

1. **NPM**: Use `npm deprecate` to deprecate the version
2. **GitHub**: Delete the release and tag
3. **Fix**: Create a new PR with fixes
4. **Release**: The next release will be a patch version

## Environment Variables

The following secrets must be configured in GitHub:

- `NPM_TOKEN`: NPM authentication token for publishing
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

## Monitoring

### Release Status

- Check the **Actions** tab for release status
- Monitor NPM for successful publishing
- Verify GitHub releases are created

### Notifications

- GitHub will send notifications for failed releases
- NPM will send notifications for successful publishing
- Consider setting up Slack/Discord notifications for team awareness

## Troubleshooting

### Common Issues

1. **Tests Failing**: Fix failing tests before release
2. **Linting Errors**: Run `npm run lint:fix` to auto-fix issues
3. **TypeScript Errors**: Fix type issues before release
4. **NPM Publishing Failed**: Check NPM_TOKEN secret
5. **GitHub Release Failed**: Check GITHUB_TOKEN permissions

### Debug Steps

1. Check the Actions logs for detailed error messages
2. Verify all secrets are properly configured
3. Ensure the main branch is up to date
4. Check if there are any dependency conflicts

## Best Practices

1. **Always use PRs**: Don't push directly to main
2. **Write good commit messages**: Follow conventional commits
3. **Add tests**: Ensure new features are tested
4. **Update documentation**: Keep README and docs current
5. **Review changes**: Have someone review your PR
6. **Test locally**: Run `npm run check` before pushing

## Support

If you encounter issues with the release process:

1. Check the GitHub Actions logs
2. Review this documentation
3. Create an issue in the repository
4. Contact the maintainers
