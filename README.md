# Prisma Shell Extension

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
npm install prisma-shell-extension
```

And we can import it like this:

```typescript
import { PrismaInitializer } from 'prisma-shell-extension'
```

This is a class that requires two params:

- The first one is the database connection string, the same one you usually would put on the .env file. You could just passthrough the value from the .env, or you could read it from whenever you want, this is part of what is cool about this package.

- The secone one is the name of your latest migration. You need to update this every time there's a new migration (Or you could write some code to get this automatically, that's up to you 😊)

```typescript
import { PrismaInitializer } from 'prisma-shell-extension'

const dbConnection = 'mysql://user:password@host:port/database'
const dbMigration = '2023_mylatestcoolmigration'

const initializer = new PrismaInitializer(dbConnection, dbMigration)
```

Now that we have initiated our class, we can use our prisma connection like this:

```typescript
import { PrismaInitializer } from 'prisma-shell-extension'

const dbConnection = 'mysql://user:password@host:port/database'
const dbMigration = '2023_mylatestcoolmigration'

const initializer = new PrismaInitializer(dbConnection, dbMigration)

const prisma = initializer.prisma
```

And now we have your regular Prisma Client object, with all the properties that you use for querying the database.

We also have a <b>async</b> function called <b><i>verifyMigration()</i></b>, that returns a boolean that tells you if you have a pending migration on the current database.

This function needs the current prisma connection as a parameter.

```typescript
import { PrismaInitializer } from 'prisma-shell-extension'

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
import { PrismaInitializer } from 'prisma-shell-extension'

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
import { PrismaInitializer } from 'prisma-shell-extension'

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

This package is still a work in progress, so all feedback is valid!
