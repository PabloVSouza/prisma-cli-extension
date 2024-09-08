import { PrismaEngine } from './engines'

export class PrismaConstants extends PrismaEngine {
  constructor(public dbUrl: string, public latestMigration: string) {
    super()

    process.env.DATABASE_URL = this.dbUrl
    process.env.PRISMA_CLI_BINARY_TARGETS = this.platform
  }
}
