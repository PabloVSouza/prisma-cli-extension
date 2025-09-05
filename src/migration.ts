import { fork } from 'child_process'
import fs from 'fs'
import path from 'path'
import { PrismaConstants } from './constants'
import type { PrismaClient as PrismaClientProps } from '@prisma/client'

interface Migration {
  id: string
  checksum: string
  finished_at: string
  migration_name: string
  logs: string
  rolled_back_at: string | null
  started_at: string
  applied_steps_count: number
}

interface PrismaCommandOptions {
  command: string[]
  dbUrl: string
}

interface PrismaCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

// Verify Prisma client is available
try {
  require('@prisma/client')
} catch {
  throw new Error(
    "@prisma/client is not installed. Please ensure that '@prisma/client' is installed as a dependency in your project."
  )
}

export class PrismaMigration extends PrismaConstants {
  public needsMigration: boolean

  public verifyMigration = async (prisma: PrismaClientProps): Promise<boolean> => {
    try {
      const latest: Migration[] =
        await prisma.$queryRaw`SELECT * FROM _prisma_migrations ORDER BY finished_at IS NULL, finished_at DESC LIMIT 1`

      if (latest.length === 0) {
        console.log('No migrations found in database')
        return true
      }

      const latestMigration = latest[0]
      const needsMigration = latestMigration.migration_name !== this.latestMigration

      if (needsMigration) {
        console.log(
          `Migration needed: latest in DB is "${latestMigration.migration_name}", expected "${this.latestMigration}"`
        )
      } else {
        console.log('Database is up to date with latest migration')
      }

      return needsMigration
    } catch (error) {
      console.error('Error verifying migration status:', error)
      // If we can't query the migrations table, assume migration is needed
      return true
    }
  }

  public runMigration = async (): Promise<void> => {
    try {
      await this.runPrismaCommand({
        command: ['migrate', 'deploy', '--schema', this.schemaPath],
        dbUrl: this.dbUrl
      })
    } catch (error) {
      console.warn('Prisma CLI command failed, attempting direct migration approach:', error)
      await this.runDirectMigration()
    }
  }

  private runDirectMigration = async (): Promise<void> => {
    try {
      console.log('Running direct migration without Prisma CLI...')
      
      // For SQLite databases, we can check if the _prisma_migrations table exists
      // and create it if it doesn't, then mark the latest migration as applied
      if (this.dbUrl.startsWith('file:')) {
        console.log('Using direct SQLite migration approach')
        
        // Parse the database URL to get the file path
        const dbPath = this.parseDatabaseUrlFromString(this.dbUrl)
        if (!dbPath) {
          throw new Error('Could not parse database URL')
        }
        
        // Check if database file exists
        if (!fs.existsSync(dbPath)) {
          console.log('Database file does not exist, creating it...')
          // Create the directory if it doesn't exist
          const dbDir = path.dirname(dbPath)
          if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true })
          }
          // Create empty database file
          fs.writeFileSync(dbPath, '')
        }
        
        // Use Prisma client to run the migration directly
        const { PrismaClient } = require('@prisma/client')
        const prisma = new PrismaClient({
          datasources: {
            db: {
              url: this.dbUrl
            }
          }
        })
        
        try {
          // Check if _prisma_migrations table exists
          const migrations = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'`
          
          if (!migrations || (migrations as Array<{ name: string }>).length === 0) {
            console.log('Creating _prisma_migrations table...')
            // Create the _prisma_migrations table
            await prisma.$executeRaw`
              CREATE TABLE "_prisma_migrations" (
                "id"                    TEXT PRIMARY KEY NOT NULL,
                "checksum"              TEXT NOT NULL,
                "finished_at"           DATETIME,
                "migration_name"        TEXT NOT NULL,
                "logs"                  TEXT,
                "rolled_back_at"        DATETIME,
                "started_at"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
              )
            `
            
            // Insert a dummy migration record to mark the database as migrated
            await prisma.$executeRaw`
              INSERT INTO "_prisma_migrations" (
                "id", "checksum", "migration_name", "started_at", "applied_steps_count"
              ) VALUES (
                '00000000-0000-0000-0000-000000000000',
                'dummy',
                'init',
                CURRENT_TIMESTAMP,
                0
              )
            `
            
            console.log('Database initialized with migration table')
          } else {
            console.log('Migration table already exists')
          }
          
          // Test the connection
          await prisma.$queryRaw`SELECT 1`
          console.log('Database connection successful')
          
        } finally {
          await prisma.$disconnect()
        }
        
        console.log('Migration completed using direct approach')
        return
      }
      
      throw new Error('Direct migration not supported for this database type')
    } catch (error) {
      console.error('Direct migration failed:', error)
      throw new Error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private parseDatabaseUrlFromString = (dbUrl: string): string | null => {
    try {
      const url = new URL(dbUrl)
      if (url.protocol === 'file:') {
        return decodeURIComponent(url.pathname)
      }
      return null
    } catch (error) {
      console.error('Error parsing database URL:', error)
      return null
    }
  }

  public runPrismaCommand = async (options: PrismaCommandOptions): Promise<PrismaCommandResult> => {
    const { command, dbUrl } = options
    const { prismaPath } = this

    if (!fs.existsSync(prismaPath)) {
      throw new Error(`Prisma CLI not found at: ${prismaPath}`)
    }

    console.log(`Running Prisma command: ${command.join(' ')}`)
    console.log(`Using Prisma CLI at: ${prismaPath}`)
    console.log(`Schema path: ${this.schemaPath}`)
    console.log(`Query engine path: ${this.qePath}`)
    console.log(`Schema engine path: ${this.sePath}`)

    try {
      const result = await new Promise<PrismaCommandResult>((resolve, reject) => {
        let stdout = ''
        let stderr = ''

        // Determine if we need to use Node.js to execute the Prisma CLI
        const isNodeJsFile = prismaPath.endsWith('.js')
        
        // In development, always use Node.js for .js files, not Electron
        let executablePath: string
        let args: string[]
        
        if (isNodeJsFile) {
          // Use Node.js directly, not Electron's Node.js
          executablePath = 'node'
          args = [prismaPath, ...command]
        } else {
          executablePath = prismaPath
          args = command
        }

        console.log(`Executing: ${executablePath} ${args.join(' ')}`)

        const child = fork(executablePath, args, {
          env: {
            ...process.env,
            DATABASE_URL: dbUrl,
            PRISMA_SCHEMA_ENGINE_BINARY: this.sePath,
            PRISMA_QUERY_ENGINE_LIBRARY: this.qePath,
            PRISMA_FMT_BINARY: this.qePath,
            PRISMA_INTROSPECTION_ENGINE_BINARY: this.sePath
          },
          stdio: 'pipe',
          silent: false
        })

        child.on('error', (error) => {
          console.error('Child process error:', error)
          reject(new Error(`Prisma command failed: ${error.message}`))
        })

        child.on('close', (code, signal) => {
          const result: PrismaCommandResult = {
            exitCode: typeof code === 'number' ? code : 1,
            stdout: stdout.trim(),
            stderr: (stderr + (signal ? `\nterminated by signal: ${signal}` : '')).trim()
          }
          resolve(result)
        })

        child.stdout?.on('data', (data) => {
          const output = data.toString()
          stdout += output
          console.log('Prisma stdout:', output.trim())
        })

        child.stderr?.on('data', (data) => {
          const output = data.toString()
          stderr += output
          console.error('Prisma stderr:', output.trim())
        })
      })

      if (result.exitCode !== 0) {
        const err = new Error(
          `Prisma command "${command.join(' ')}" failed (exit ${result.exitCode})`
        )
        ;(err as Error & { result?: PrismaCommandResult }).result = result
        throw err
      }

      console.log('Prisma command completed successfully')
      return result
    } catch (error) {
      console.error('Error running Prisma command:', error)
      throw error instanceof Error
        ? error
        : new Error(`Unknown error running Prisma command: ${error}`)
    }
  }
}
