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
    const dbExists = fs.existsSync(this.dbUrl)

    const path = this.dbUrl.substring(this.dbUrl.indexOf('e:') + 3)

    console.log(path)

    if (!dbExists) {
      CreateDirectory(path)
      fs.closeSync(fs.openSync(this.dbUrl, 'w'))
    }
    await this.runMigration(this.prisma)
  }
}
