import { fork } from 'child_process'
import fs from 'fs'
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
  applied_steps_count: string
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

export class PrismaMigration extends PrismaConstants {
  public needsMigration: boolean

  public verifyMigration = async (prisma: PrismaClientProps): Promise<boolean> => {
    try {
      const latest: Migration[] =
        await prisma.$queryRaw`SELECT * FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1`

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
      console.log('Starting migration process...')
      console.log(`Schema path: ${this.schemaPath}`)
      console.log(`Database URL: ${this.dbUrl}`)

      await this.runPrismaCommand({
        command: ['migrate', 'deploy', '--schema', this.schemaPath],
        dbUrl: this.dbUrl
      })

      console.log('Migration completed successfully')
    } catch (error) {
      console.error('Migration failed:', error)
      throw error
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

        // Prepare environment variables for Prisma v6
        const env: Record<string, string> = {
          ...process.env,
          DATABASE_URL: dbUrl,
          // For generate command, use minimal environment variables
          ...(command.includes('generate')
            ? {
                // Only set essential variables for generate
                PRISMA_ENGINES_MIRROR:
                  process.env.PRISMA_ENGINES_MIRROR || 'https://binaries.prisma.sh',
                // Allow Prisma to download engines if needed
                PRISMA_CLI_BINARY_TARGETS: this.getBinaryTargets().join(','),
                PRISMA_BINARY_TARGETS: this.getBinaryTargets().join(',')
              }
            : {
                // For other commands, set engine paths
                PRISMA_SCHEMA_ENGINE_BINARY: this.sePath,
                PRISMA_FMT_BINARY: this.qePath,
                PRISMA_INTROSPECTION_ENGINE_BINARY: this.sePath,
                PRISMA_QUERY_ENGINE_LIBRARY: this.qePath,
                PRISMA_ENGINES_MIRROR:
                  process.env.PRISMA_ENGINES_MIRROR || 'https://binaries.prisma.sh'
              })
        }

        // Only set PRISMA_QUERY_ENGINE_LIBRARY for commands that need it (not for generate)
        if (!command.includes('generate')) {
          env.PRISMA_QUERY_ENGINE_LIBRARY = this.qePath
        }

        console.log(`Executing: ${prismaPath} ${command.join(' ')}`)

        const child = fork(prismaPath, command, {
          env,
          stdio: 'pipe',
          silent: false
        })

        child.on('message', (msg) => {
          console.log('Prisma message:', msg)
        })

        child.on('error', (error) => {
          console.error('Child process error:', error)
          reject(new Error(`Prisma command failed: ${error.message}`))
        })

        child.on('close', (code, signal) => {
          const result: PrismaCommandResult = {
            exitCode: code || 0,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          }

          if (signal) {
            result.stderr += `\nProcess terminated by signal: ${signal}`
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
          console.log('Prisma stderr:', output.trim())
        })
      })

      if (result.exitCode !== 0) {
        const errorMessage = `Prisma command "${command.join(' ')}" failed with exit code ${
          result.exitCode
        }`
        const fullError = result.stderr ? `${errorMessage}. Stderr: ${result.stderr}` : errorMessage

        console.error('Prisma command failed:', {
          command: command.join(' '),
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr
        })

        throw new Error(fullError)
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
