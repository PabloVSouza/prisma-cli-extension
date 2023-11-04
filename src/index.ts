/// <reference types="node" />

//@ts-ignore
import { PrismaClient } from '../../../node_modules/@prisma/client'
import fs from 'fs'
import path from 'path'
import CreateDirectory from 'utils/CreateDirectory'
import { PrismaMigration } from './migration'

export class PrismaInitializer extends PrismaMigration {
  public prisma: PrismaClient

  constructor(public dbUrl: string, public latestMigration: string) {
    super(dbUrl, latestMigration)
    this.prisma = this.initializePrisma()
    if (dbUrl.startsWith('file')) this.prepareDb()
  }

  private initializePrisma = (): PrismaClient => {
    return new PrismaClient({
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
    const dbPath = this.dbUrl.substring(
      this.dbUrl.indexOf('e:') + 2,
      this.dbUrl.lastIndexOf('/') + 1
    )
    const filename = this.dbUrl.substring(this.dbUrl.indexOf('/') + 1, this.dbUrl.lastIndexOf('?'))
    const dbExists = fs.existsSync(path.join(dbPath, filename))

    console.log({ dbPath, filename, path: path.join(dbPath, filename) })
    if (!dbExists) {
      CreateDirectory(path.join(dbPath, filename))
      fs.closeSync(fs.openSync(this.dbUrl, 'w'))
    }
    await this.runMigration(this.prisma)
  }
}
