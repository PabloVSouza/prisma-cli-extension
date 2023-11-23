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

  public backPath: string = path.join(__dirname, '..', '..')

  constructor() {
    this.getPlatformData()
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
      const newPath = enginePath.replace('app.asar', '').replace('//', '/').replace('\\\\', '\\')
      const finalFilePath = path.join(newPath, fileName)

      if (!fs.existsSync(finalFilePath)) {
        const asarLocation = enginePath.substring(0, enginePath.indexOf('asar') + 4)
        const targetFile = path.join(enginePath.substring(enginePath.indexOf('asar') + 5), fileName)
        CreateDirectory(newPath).then(() => {
          fs.writeFileSync(path.join(newPath, fileName), asar.extractFile(asarLocation, targetFile))
        })
      }
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
}
