# Contributing to Prisma CLI Extension

Thank you for your interest in contributing to Prisma CLI Extension! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- Node.js 18.x or 20.x
- npm or yarn
- Git

### Installation

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/your-username/prisma-cli-extension.git
   cd prisma-cli-extension
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests for CI
npm run test:ci
```

### Code Quality

```bash
# Type checking
npm run tsc

# Linting
npm run lint

# Build
npm run build
```

### Making Changes

1. Create a feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes
3. Add tests for new functionality
4. Ensure all tests pass:

   ```bash
   npm test
   ```

5. Run linting and type checking:

   ```bash
   npm run lint
   npm run tsc
   ```

6. Commit your changes:

   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

7. Push to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

8. Create a Pull Request

## Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` - A new feature
- `fix:` - A bug fix
- `docs:` - Documentation only changes
- `style:` - Changes that do not affect the meaning of the code
- `refactor:` - A code change that neither fixes a bug nor adds a feature
- `perf:` - A code change that improves performance
- `test:` - Adding missing tests or correcting existing tests
- `chore:` - Changes to the build process or auxiliary tools

Examples:

- `feat: add support for custom database paths`
- `fix: resolve ASAR extraction issue on Windows`
- `docs: update README with new examples`

## Pull Request Process

1. Ensure your PR has a clear description
2. Link any related issues
3. Ensure all CI checks pass
4. Request review from maintainers
5. Address any feedback

## CI/CD Pipeline

### Automated Checks

Every PR automatically runs:

- **TypeScript compilation** - Ensures type safety
- **Linting** - Code style and quality checks
- **Testing** - Unit and integration tests
- **Build** - Ensures the project builds successfully
- **Security audit** - Checks for known vulnerabilities

### Release Process

Releases are automatically triggered when code is pushed to the main branch:

1. **Version bumping** - Automatically determines version bump based on commit messages
2. **Changelog generation** - Creates changelog from commit messages
3. **NPM publishing** - Publishes to npm registry
4. **GitHub release** - Creates a GitHub release with changelog

### Version Bumping Rules

- `feat:` commits → minor version bump
- `fix:` commits → patch version bump
- `BREAKING CHANGE:` or `!:` → major version bump
- Other commits → patch version bump

## Testing Guidelines

### Unit Tests

- Test individual functions and methods
- Mock external dependencies
- Aim for high coverage
- Use descriptive test names

### Integration Tests

- Test component interactions
- Test with real file system operations
- Test error scenarios

### Test Structure

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should do something when condition is met', () => {
      // Arrange
      // Act
      // Assert
    })
  })
})
```

## Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Environment Variables

For local development, you can set these environment variables:

- `NODE_ENV=development` - Development mode
- `ELECTRON_APP_PATH` - Custom Electron app path
- `ELECTRON_USER_DATA` - Custom Electron user data path

## Troubleshooting

### Common Issues

1. **Tests failing**: Ensure all dependencies are installed and up to date
2. **Build errors**: Check TypeScript configuration and imports
3. **Linting errors**: Run `npm run lint` to see specific issues

### Getting Help

- Check existing issues and discussions
- Create a new issue with detailed information
- Join our community discussions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
