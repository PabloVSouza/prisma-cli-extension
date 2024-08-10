/// <reference types="node" />

//@ts-ignore
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import CreateDirectory from 'utils/CreateDirectory'
import { PrismaMigration } from './migration'

export class PrismaInitializer extends PrismaMigration {
  public prisma: PrismaClient

  public initializePrisma = async () => {
    if (this.dbUrl.startsWith('file')) await this.prepareDb()

    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.dbUrl
        }
      },
      //@ts-ignore
      __internal: {
        engine: {
          binaryPath: this.qePath
        }
      }
    })
  }

  private prepareDb = async (): Promise<void> => {
    const dbFolder = this.dbUrl.substring(
      this.dbUrl.indexOf('le:') + 3,
      this.dbUrl.includes('/') ? this.dbUrl.lastIndexOf('/') + 1 : this.dbUrl.lastIndexOf('\\')
    )
    const filename = this.dbUrl.substring(
      this.dbUrl.includes('/') ? this.dbUrl.lastIndexOf('/') + 1 : this.dbUrl.lastIndexOf('\\'),
      this.dbUrl.lastIndexOf('?')
    )

    const dbPath = path.join(dbFolder, filename)

    const finalDbPath = dbPath.startsWith('..') ? dbPath.substring(1) : dbPath

    const dbExists = fs.existsSync(finalDbPath)

    if (!dbExists) {
      CreateDirectory(path.join(dbFolder))
      fs.closeSync(fs.openSync(finalDbPath, 'w'))
      await this.runMigration()
    }
  }
}
