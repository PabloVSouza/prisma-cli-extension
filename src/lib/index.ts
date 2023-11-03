//@ts-ignore
import { PrismaClient } from '../../../../node_modules/@prisma/client'
import { PrismaMigration } from './migration'

export class PrismaInitializer extends PrismaMigration {
  public prisma: PrismaClient

  constructor(public dbUrl: string, public latestMigration: string) {
    super(dbUrl, latestMigration)
    this.prisma = this.initializePrisma()
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
}
