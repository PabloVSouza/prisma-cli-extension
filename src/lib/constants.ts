import path from 'path'
import fs from 'fs'
import { PrismaEngine } from './engines'

export class PrismaConstants extends PrismaEngine {
  public prismaPath: string
  public extraResourcesPath: string
  public schemaPath: string
  public prismaRoot: string

  constructor(public dbUrl: string, public latestMigration: string) {
    super()

    process.env.DATABASE_URL = this.dbUrl

    this.setBinaryTargets(this.platform)

    this.prismaRoot = this.getPrismaLocation()

    this.prismaPath = path.join('node_modules', 'prisma', 'build', 'index.js')

    this.schemaPath = path.join(this.prismaRoot, 'prisma', 'schema.prisma')
  }

  private setBinaryTargets = (platform: string) => {
    process.env.PRISMA_CLI_BINARY_TARGETS = platform
  }

  private getPrismaLocation = () => {
    const dirList = fs.readdirSync('node_modules')
    const prismaDir = dirList.filter((item) => {
      const folder = path.join('node_modules', item)

      if (fs.lstatSync(folder).isDirectory()) {
        const inside = fs.readdirSync(path.join('node_modules', item))
        if (inside.includes('prisma')) {
          if (fs.lstatSync(path.join(folder, 'prisma')).isDirectory()) return inside
        }
      }
    })
    if (prismaDir.length) return path.join('node_modules', prismaDir[0])
    return 'Prisma schema not found'
  }
}
