import path from 'path'
import fs from 'fs'
import distroNameTranslations from './distro-name-translations'
import sslVersions from './ssl-versions'
import asar from '@electron/asar'
import CreateDirectory from './utils/CreateDirectory'

type TEngine = {
  [key: string]: {
    queryEngine: string
    schemaEngine: string
  }
}

type TDistroInfo = {
  name: string
  id: string
  version_id: string
  pretty_name: string
  home_url: string
  bug_report_url: string
  prismaName: string
  ssl?: string
}

export class PrismaEngine {
  public qePath: string
  public sePath: string
  public platform: string
  public binaryTarget: string
  public prismaPath: string
  public schemaPath: string
  public prismaRoot: string

  public backPath: string = path.join(__dirname, '..', '..')

  constructor() {
    this.getPlatformData()
    this.preparePrismaClient()
  }

  private preparePrismaClient = (): void => {
    this.prismaRoot =
      this.getPrismaLocation(path.join(this.backPath)) ??
      this.getPrismaLocation(path.join(this.backPath, '..', '..')) ??
      'Prisma not Found!'

    this.prismaPath = path.join(this.backPath, 'prisma', 'build', 'index.js')

    this.schemaPath = path.join(this.prismaRoot, 'prisma', 'schema.prisma')

    if (this.prismaPath.includes('asar')) {
      const asarLocation = path.join(
        this.prismaPath.substring(0, this.prismaPath.indexOf('asar') + 4)
      )

      const files = asar
        .listPackage(asarLocation)
        .filter((file) => file.includes('prisma') && !file.includes('prisma-packaged'))

      this.prismaPath = path.join(this.prismaPath.replace('app.asar', ''))
      this.schemaPath = path.join(this.schemaPath.replace('app.asar', ''))

      for (const file of files) {
        const finalPath = path.join(this.backPath, '..', file)
        const newPath = this.extractFile(finalPath)
        try {
          fs.chmodSync(newPath, '755')
        } catch {
          //Do nothing
        }
      }
    }
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

  private getPlatformData = (): void => {
    this.platform = process.platform
    const arch = process.arch
    const distro = this.platform === 'linux' ? this.getDistro() : undefined
    const fileName = this.getFileName(this.platform, arch, distro?.prismaName, distro?.ssl)
    this.sePath = this.getEnginePath(
      path.join(this.backPath, '@prisma', 'engines'),
      fileName.schemaEngine
    )
    this.qePath = this.getEnginePath(
      path.join(this.backPath, '.prisma', 'client'),
      fileName.queryEngine
    )

    this.binaryTarget = this.getBinaryTarget(this.platform)
  }

  private getEnginePath = (enginePath: string, fileName: string): string => {
    if (enginePath.includes('app.asar')) {
      const finalFilePath = this.extractFile(path.join(enginePath, fileName))
      return finalFilePath
    }
    return path.join(enginePath, fileName)
  }

  private getBinaryTarget = (platform: string): string => {
    if (platform === 'darwin') return 'darwin, darwin-arm64'
    if (platform === 'linux') return 'linux, linux-arm64'
    return platform
  }

  private getDistro = (): TDistroInfo => {
    const os = fs.readFileSync('/etc/os-release', 'utf8')
    const opj = {} as { [key: string]: string }

    os?.split('\n')?.forEach((line) => {
      const words = line?.split('=')
      const key = words[0]?.toLowerCase()
      if (key === '') return
      const value = words[1]?.replace(/"/g, '')
      opj[key] = value
    })

    const result = { ...opj } as TDistroInfo

    const ssl = this.getSSLVersion(result.id, result.version_id ?? 0)
    const prismaName = this.getDistroNameTranslation(result.id)

    return { ...result, ssl, prismaName }
  }

  private getSSLVersion = (distro: string, version: string | undefined): string => {
    const versionHasDots = version?.lastIndexOf('.') ?? 0 > 0

    const versionNumber = version
      ? Number(
          version
            .substring(0, versionHasDots ? version.lastIndexOf('.') : version.length)
            .replace('.', '')
        )
      : 0

    const foundDistro = sslVersions[distro] ?? undefined

    let ssl = '1.1.x'

    if (foundDistro) {
      const distroVersions = Object.keys(sslVersions[distro] ?? []).map((val) =>
        Number(val)
      ) as number[]
      const getCorrectVersion = (): number => {
        const version = distroVersions.reduce((acc, cur) => {
          if (versionNumber > acc) return cur
          return versionNumber > cur ? cur : acc
        })

        return version
      }
      ssl = distroVersions.includes(versionNumber)
        ? sslVersions[distro][versionNumber]
        : sslVersions[distro][getCorrectVersion()]
    }

    return ssl
  }

  private getDistroNameTranslation = (distro: string): string => {
    return distroNameTranslations[distro.toLowerCase()] ?? distro
  }

  private getFileName = (
    platform: string,
    arch: string,
    distro = '',
    sslVersion: string = ''
  ): { queryEngine: string; schemaEngine: string } => {
    const archName = arch === 'arm64' ? '-arm64' : ''
    const engineFiles: TEngine = {
      win32: {
        queryEngine: 'query_engine-windows.dll.node',
        schemaEngine: 'schema-engine-windows.exe'
      },
      darwin: {
        schemaEngine: `schema-engine-darwin${archName}`,
        queryEngine: `libquery_engine-darwin${archName}.dylib.node`
      },
      linux: {
        schemaEngine: `schema-engine-${distro}${archName}-openssl-${sslVersion}`,
        queryEngine: `libquery_engine-${distro}${archName}-openssl-${sslVersion}.so.node`
      }
    }

    return engineFiles[platform]
  }

  private extractFile = (originalPath: string): string => {
    const fixedPath = originalPath

    try {
      const fileName = fixedPath.substring(
        fixedPath.includes('/') ? fixedPath.lastIndexOf('/') + 1 : fixedPath.lastIndexOf('\\') + 1
      )
      const newPath = fixedPath
        .substring(
          0,
          fixedPath.includes('/') ? fixedPath.lastIndexOf('/') : fixedPath.lastIndexOf('\\')
        )
        .replace('app.asar', '')
        .replace('//', '/')

      const finalFilePath = path.join(newPath, fileName)

      if (!fs.existsSync(finalFilePath)) {
        const asarLocation = path.join(fixedPath.substring(0, fixedPath.indexOf('asar') + 4))
        const targetFile = fixedPath.substring(fixedPath.indexOf('asar') + 5)

        CreateDirectory(newPath)
        const writePath = path.join(newPath, fileName)

        fs.writeFileSync(path.join(writePath), asar.extractFile(asarLocation, targetFile))
      }
      return finalFilePath
    } catch {
      //
    }
    return ''
  }
}
