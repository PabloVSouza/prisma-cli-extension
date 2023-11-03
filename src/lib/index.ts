import { PrismaClient } from '@prisma/client'
import { PrismaMigration } from './migration'

export class PrismaInitializer extends PrismaMigration {
  public prisma: PrismaClient

  constructor(public dbUrl: string) {
    super(dbUrl)
    this.prisma = this.initializePrisma()
  }

  private initializePrisma = (): PrismaClient => {
    return new PrismaClient({
      datasources: {
        db: {
          url: this.dbUrl
        }
      },
      __internal: {
        engine: {
          binaryPath: this.qePath
        }
      }
    })
  }
}
