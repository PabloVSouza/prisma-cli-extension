import { fork } from 'child_process'
import { PrismaConstants } from './constants'
import { PrismaClient } from '../../../../node_modules/@prisma/client'

type Migration = {
  id: string
  checksum: string
  finished_at: string
  migration_name: string
  logs: string
  rolled_back_at: string
  started_at: string
  applied_steps_count: string
}

export class PrismaMigration extends PrismaConstants {
  public runMigration = async (prisma: PrismaClient): Promise<void> => {
    let needsMigration: boolean

    try {
      const latest: Migration[] =
        await prisma.$queryRaw`select * from _prisma_migrations order by finished_at`
      needsMigration = latest[latest.length - 1]?.migration_name !== this.latestMigration
    } catch (e) {
      needsMigration = true
    }

    if (needsMigration) {
      await this.runPrismaCommand({
        command: ['migrate', 'deploy', '--schema', this.schemaPath],
        dbUrl: this.dbUrl
      })
    }
  }

  public runPrismaCommand = async ({
    command,
    dbUrl
  }: {
    command: string[]
    dbUrl: string
  }): Promise<number | void> => {
    const { prismaPath } = this

    console.log(prismaPath)

    try {
      const exitCode = await new Promise((resolve) => {
        const child = fork(prismaPath, command, {
          env: {
            ...process.env,
            DATABASE_URL: dbUrl,
            PRISMA_SCHEMA_ENGINE_BINARY: this.sePath,
            PRISMA_QUERY_ENGINE_LIBRARY: this.qePath,
            PRISMA_FMT_BINARY: this.qePath,
            PRISMA_INTROSPECTION_ENGINE_BINARY: this.qePath
          },
          stdio: 'pipe'
        })

        child.on('message', (msg) => {
          console.log(msg)
        })

        child.on('error', (err) => {
          console.log('Child process got error:', err)
        })

        child.on('close', (code) => {
          resolve(code)
        })

        child.stdout?.on('data', function (data) {
          console.log('prisma: ', data.toString())
        })

        child.stderr?.on('data', function (data) {
          console.log('prisma: ', data.toString())
        })
      })
      if (exitCode !== 0) throw Error(`command ${command} failed with exit code ${exitCode}`)
      return exitCode
    } catch (e) {
      console.log(e)
      throw e
    }
  }
}
