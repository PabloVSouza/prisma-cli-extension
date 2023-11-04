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
    process.env.PRISMA_CLI_BINARY_TARGETS = this.platform

    const backPath = path.join(__dirname, '..', '..', '..')

    this.prismaRoot =
      this.getPrismaLocation(path.join(backPath)) ??
      this.getPrismaLocation(path.join(backPath, '..', '..')) ??
      'Prisma not Found!'

    this.prismaPath = path.join(backPath, 'prisma', 'build', 'index.js')

    this.schemaPath = path.join(this.prismaRoot, 'prisma', 'schema.prisma')
  }

  private getPrismaLocation = (initialPath: string): string | undefined => {
    const dirList = fs.readdirSync(initialPath)

    const prismaDir = dirList.filter((item) => {
      const folder = path.join(initialPath, item)

      if (fs.lstatSync(folder).isDirectory()) {
        const inside = fs.readdirSync(path.join(initialPath, item))
        if (inside.includes('prisma')) {
          if (
            fs.lstatSync(path.join(folder, 'prisma')).isDirectory() &&
            fs.existsSync(path.join(folder, 'prisma', 'schema.prisma'))
          )
            return inside
        }
      }
    })

    if (prismaDir.length) return path.join(initialPath, prismaDir[0])
  }
}
