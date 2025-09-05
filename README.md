# Prisma Cli Extension

## A PrismaDB extension library that add some usefull functionalities.

This library was created originally with the purpose of supporting prisma and sqlite on a Electron application. As it was evolving, it became a prisma extension adding extra funcionalities like:

- Run prisma cli commands inside the application
- Verify when database migrations are needed and run them programatically
- Run prisma on packaged apps, like electron.

The solutions on this package where inspired (but not the same) by this [Article](https://www.funtoimagine.com/blog/using-react-trpc-electron/) and [Repository](https://github.com/awohletz/electron-prisma-trpc-example) from [Ayron Wohletz](https://twitter.com/ayron_wohletz).

## Usage

This package is an extension to Prisma, so first you need to do the initial Prisma setup on your project.

```
npm install prisma
```

Then, we need to initiate it, with the command:

```
npx prisma init
```

This will create a folder called <b>Prisma</b> into your project root, with a <b><i>schema.prisma</i></b> file inside.

This file will be where you declare your models.

For more informations about setting up prisma, check the official documentation [here](https://www.prisma.io/docs/getting-started)

Now for this package, first we need to install it:

```
npm install prisma-cli-extension
```

And we can import it like this:

```typescript
import { PrismaInitializer } from 'prisma-cli-extension'
```

This is a class that requires two params:

- The first one is the database connection string, the same one you usually would put on the .env file. You could just passthrough the value from the .env, or you could read it from whenever you want, this is part of what is cool about this package.

- The secone one is the name of your latest migration. You need to update this every time there's a new migration (Or you could write some code to get this automatically, that's up to you 😊)

```typescript
import { PrismaInitializer } from 'prisma-cli-extension'

const dbConnection = 'mysql://user:password@host:port/database'
const dbMigration = '2023_mylatestcoolmigration'

const initializer = new PrismaInitializer(dbConnection, dbMigration)
```

Now that we have initiated our class, we can use our prisma connection like this:

```typescript
import { PrismaInitializer } from 'prisma-cli-extension'

const dbConnection = 'mysql://user:password@host:port/database'
const dbMigration = '2023_mylatestcoolmigration'

const initializer = new PrismaInitializer(dbConnection, dbMigration)

const prisma = initializer.prisma
```

And now we have your regular Prisma Client object, with all the properties that you use for querying the database.

We also have a <b>async</b> function called <b><i>verifyMigration()</i></b>, that returns a boolean that tells you if you have a pending migration on the current database.

This function needs the current prisma connection as a parameter.

```typescript
import { PrismaInitializer } from 'prisma-cli-extension'

const dbConnection = 'mysql://user:password@host:port/database'
const dbMigration = '2023_mylatestcoolmigration'

const initializer = new PrismaInitializer(dbConnection, dbMigration)

const prisma = initializer.prisma

initializer.checkMigration(prisma).then(() => {
  //Do something
})
```

And now we get to running the migration itself, and we have the function <b><i>runMigration()</i></b> that does exactly this.

```typescript
import { PrismaInitializer } from 'prisma-cli-extension'

const dbConnection = 'mysql://user:password@host:port/database'
const dbMigration = '2023_mylatestcoolmigration'

const initializer = new PrismaInitializer(dbConnection, dbMigration)

const prisma = initializer.prisma

initializer.checkMigration(prisma).then((response) => {
  if (response) initializer.runMigration()
})
```

And just to finalize the features of this package, we can also run any Prisma CLI commands at execution time, using the <b>async</b> function <b><i>runPrismaCommand()</b></i>, that takes two params:

- The command itself, using an string array of the words needed
- The database connection string

As an example, let's copy how the <b><i>runMigration()</i></b> function does it's migration magic using the <b><i>runPrismaCommand()</b></i> function:

```typescript
import { PrismaInitializer } from 'prisma-cli-extension'

const dbConnection = 'mysql://user:password@host:port/database'
const dbMigration = '2023_mylatestcoolmigration'

const initializer = new PrismaInitializer(dbConnection, dbMigration)

const prisma = initializer.prisma

initializer.checkMigration(prisma).then((response) => {
  if (response) initializer.runMigration()
})

initializer
  .runPrismaCommand({
    command: ['migrate', 'deploy', '--schema', 'path to schema file'],
    dbUrl: dbConnection
  })
  .then(() => {
    console.log('Hey, i did a migration by myself!')
  })
```

## Development

### Prerequisites

- Node.js 18.x or 20.x
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/PabloVSouza/prisma-cli-extension.git
cd prisma-cli-extension

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build
```

### Available Scripts

- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run tsc` - TypeScript type checking
- `npm run build` - Build the project
- `npm run clean` - Clean build artifacts

### Testing

This project includes comprehensive unit and integration tests:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode during development
npm run test:watch
```

### CI/CD Pipeline

This project uses GitHub Actions for continuous integration and deployment:

- **CI Pipeline**: Runs on every push and pull request

  - TypeScript compilation
  - Linting
  - Testing
  - Build verification
  - Security audit

- **Release Pipeline**: Automatically triggered on main branch
  - **Safety First**: Only runs after all tests pass and code is merged
  - Semantic versioning based on commit messages
  - Automatic changelog generation
  - NPM publishing
  - GitHub release creation

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

For information about the release process, see [RELEASE_PROCESS.md](RELEASE_PROCESS.md).

## Environment Detection

The package automatically detects your environment and adapts accordingly:

- **Development**: Uses project-relative paths
- **Production**: Uses appropriate system paths
- **Electron**: Handles ASAR-packed applications
- **Cross-platform**: Works on Windows, macOS, and Linux

## Electron Builder Integration

**No configuration needed!** The `prisma-cli-extension` works seamlessly with Electron apps without requiring any changes to your `electron-builder.yml` configuration.

### What the extension handles automatically:

- ✅ **ASAR extraction**: Automatically extracts Prisma files from ASAR archives
- ✅ **Missing engines**: Gracefully handles missing Prisma engines and lets Prisma download them
- ✅ **Environment detection**: Automatically detects development vs production environments
- ✅ **Cross-platform**: Works on Windows, macOS, and Linux without additional configuration

### Example electron-builder.yml

You can use any standard electron-builder configuration. Here's a minimal example:

```yaml
# Example electron-builder configuration
files:
  - '**/*'
  - '!src/*'
  - '!*.code-workspace'
# ✅ NO PRISMA CONFIGURATION NEEDED!
# The prisma-cli-extension handles everything automatically
```

### Optional optimizations

If you want to reduce your app size, you can optionally exclude Prisma files from your build (the extension will still work):

```yaml
files:
  - '**/*'
  - '!node_modules/prisma/**/*'
  - '!node_modules/@prisma/**/*'
  - '!node_modules/.prisma/**/*'
```

This approach reduces app size while maintaining full functionality through automatic engine downloading.

## Error Handling

The package includes comprehensive error handling and logging:

- Detailed error messages for debugging
- Graceful fallbacks for missing dependencies
- Environment-specific path resolution
- Permission error handling

## Security

- Regular dependency audits
- CodeQL security analysis
- No hardcoded secrets
- Secure file system operations

This package is actively maintained and all feedback is welcome!
