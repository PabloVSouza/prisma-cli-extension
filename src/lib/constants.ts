import path from 'path'
import { PrismaEngine } from './engines'

export class PrismaConstants extends PrismaEngine {
  public prismaPath: string
  public extraResourcesPath: string
  public latestMigration: string
  public schemaPath: string

  constructor(public dbUrl: string) {
    super()

    process.env.DATABASE_URL = this.dbUrl

    this.setBinaryTargets(this.platform)

    const parentRoot = path.join('..', '..', '..', '..')

    this.prismaPath = path.join(parentRoot, 'node_modules', 'prisma', 'build', 'index.js')

    this.schemaPath = path.join(parentRoot, 'prisma', 'schema.prisma')

    this.latestMigration = '20231029180851_menu'
  }

  private setBinaryTargets = (platform: string) => {
    process.env.PRISMA_CLI_BINARY_TARGETS = platform
  }
}
