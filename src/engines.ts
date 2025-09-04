import path from 'path'
import fs from 'fs'
import distroNameTranslations from './distro-name-translations'
import sslVersions from './ssl-versions'
import asar from '@electron/asar'
import CreateDirectory from './utils/CreateDirectory'

interface EnvironmentInfo {
  isDevelopment: boolean
  isProduction: boolean
  isElectron: boolean
  isAsar: boolean
  appPath: string
  resourcesPath: string
}

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
  public environment: EnvironmentInfo

  public backPath: string = path.join(__dirname, '..', '..')

  constructor() {
    this.environment = this.detectEnvironment()
    this.getPlatformData()
    this.preparePrismaClient()
  }

  private detectEnvironment = (): EnvironmentInfo => {
    const isElectron =
      typeof process !== 'undefined' && process.versions && process.versions.electron
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev'
    const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod'

    // Detect ASAR environment
    const isAsar =
      __dirname.includes('asar') ||
      (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath?.includes('asar') ||
      false

    // Determine app paths based on environment
    let appPath: string
    let resourcesPath: string

    if (isElectron) {
      // In Electron, use app.getAppPath() equivalent
      appPath = process.env.ELECTRON_APP_PATH || process.cwd()
      resourcesPath =
        (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ||
        path.join(appPath, 'resources')
    } else {
      // In Node.js, use current working directory
      appPath = process.cwd()
      resourcesPath = path.join(appPath, 'resources')
    }

    return {
      isDevelopment,
      isProduction,
      isElectron: !!isElectron,
      isAsar,
      appPath,
      resourcesPath
    }
  }

  private preparePrismaClient = (): void => {
    console.log('Environment detected:', {
      isDevelopment: this.environment.isDevelopment,
      isProduction: this.environment.isProduction,
      isElectron: this.environment.isElectron,
      isAsar: this.environment.isAsar,
      appPath: this.environment.appPath
    })

    // Find Prisma root directory using multiple strategies
    this.prismaRoot = this.findPrismaRoot()

    if (this.prismaRoot === 'Prisma not Found!') {
      throw new Error(
        'Could not locate Prisma project. Please ensure you have a valid Prisma schema file.'
      )
    }

    // Set up Prisma CLI path based on environment
    this.prismaPath = this.findPrismaCliPath()
    this.schemaPath = path.join(this.prismaRoot, 'prisma', 'schema.prisma')

    console.log('Prisma paths configured:', {
      prismaRoot: this.prismaRoot,
      prismaPath: this.prismaPath,
      schemaPath: this.schemaPath
    })

    if (this.isAsarEnvironment()) {
      this.handleAsarExtraction()
    }
  }

  private findPrismaRoot = (): string => {
    const searchPaths = this.getPrismaSearchPaths()

    for (const searchPath of searchPaths) {
      console.log(`Searching for Prisma in: ${searchPath}`)
      const prismaRoot = this.getPrismaLocation(searchPath)
      if (prismaRoot) {
        console.log(`Found Prisma root at: ${prismaRoot}`)
        return prismaRoot
      }
    }

    return 'Prisma not Found!'
  }

  private getPrismaSearchPaths = (): string[] => {
    const paths: string[] = []

    // Add environment-specific paths
    if (this.environment.isDevelopment) {
      // Development paths - more focused search
      paths.push(
        this.environment.appPath,
        path.join(this.environment.appPath, '..'),
        process.cwd(),
        path.join(process.cwd(), '..')
      )
    } else {
      // Production paths
      paths.push(
        this.environment.appPath,
        this.environment.resourcesPath,
        path.join(this.environment.resourcesPath, 'app'),
        path.join(this.environment.resourcesPath, 'app.asar.unpacked'),
        process.cwd()
      )
    }

    // Add common fallback paths (but limit depth to avoid system directories)
    paths.push(this.backPath, path.join(this.backPath, '..'), path.join(this.backPath, '..', '..'))

    // Remove duplicates and filter out system directories and non-existent paths
    return [...new Set(paths)].filter((p) => {
      try {
        // Skip system directories and root filesystem
        if (
          p === '/' ||
          p === 'C:\\' ||
          p.includes('/System/') ||
          p.includes('/usr/') ||
          p.includes('/var/')
        ) {
          return false
        }

        // Skip hidden directories that might cause permission issues
        if (path.basename(p).startsWith('.')) {
          return false
        }

        return fs.existsSync(p)
      } catch {
        return false
      }
    })
  }

  private findPrismaCliPath = (): string => {
    const possiblePaths = [
      // Standard Prisma CLI locations
      path.join(this.prismaRoot, 'node_modules', 'prisma', 'build', 'index.js'),
      path.join(this.prismaRoot, 'node_modules', '.bin', 'prisma'),
      path.join(this.environment.appPath, 'node_modules', 'prisma', 'build', 'index.js'),
      path.join(this.environment.appPath, 'node_modules', '.bin', 'prisma'),

      // Development paths
      ...(this.environment.isDevelopment
        ? [
            path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
            path.join(process.cwd(), 'node_modules', '.bin', 'prisma'),
            path.join(this.backPath, 'prisma', 'build', 'index.js')
          ]
        : []),

      // Production/ASAR paths
      ...(this.environment.isAsar
        ? [
            path.join(
              this.environment.resourcesPath,
              'app.asar.unpacked',
              'node_modules',
              'prisma',
              'build',
              'index.js'
            ),
            path.join(
              this.environment.resourcesPath,
              'app.asar.unpacked',
              'node_modules',
              '.bin',
              'prisma'
            )
          ]
        : [])
    ]

    for (const cliPath of possiblePaths) {
      if (fs.existsSync(cliPath)) {
        console.log(`Found Prisma CLI at: ${cliPath}`)
        return cliPath
      }
    }

    // Fallback to the original path
    const fallbackPath = path.join(this.backPath, 'prisma', 'build', 'index.js')
    console.warn(`Prisma CLI not found in standard locations, using fallback: ${fallbackPath}`)
    return fallbackPath
  }

  private isAsarEnvironment = (): boolean => {
    return this.prismaPath.includes('asar') || this.schemaPath.includes('asar')
  }

  private handleAsarExtraction = (): void => {
    try {
      const asarLocation = this.getAsarLocation()
      if (!asarLocation) {
        console.warn('Could not determine ASAR location')
        return
      }

      const prismaFiles = this.getPrismaFilesFromAsar(asarLocation)
      this.updatePathsForAsar()
      this.extractPrismaFiles(prismaFiles)
    } catch (error) {
      console.error('Error handling ASAR extraction:', error)
      throw new Error(
        `Failed to extract Prisma files from ASAR: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private getAsarLocation = (): string | null => {
    const asarIndex = this.prismaPath.indexOf('asar')
    if (asarIndex === -1) return null

    return path.join(this.prismaPath.substring(0, asarIndex + 4))
  }

  private getPrismaFilesFromAsar = (asarLocation: string): string[] => {
    try {
      const allFiles = asar.listPackage(asarLocation, { isPack: false })
      return allFiles.filter(
        (file) =>
          file.includes('prisma') && !file.includes('prisma-packaged') && !file.endsWith('.map') // Exclude source maps
      )
    } catch (error) {
      console.error('Error listing ASAR package:', error)
      return []
    }
  }

  private updatePathsForAsar = (): void => {
    this.prismaPath = path.join(this.prismaPath.replace('app.asar', ''))
    this.schemaPath = path.join(this.schemaPath.replace('app.asar', ''))
  }

  private extractPrismaFiles = (files: string[]): void => {
    for (const file of files) {
      try {
        const finalPath = path.join(this.backPath, '..', file)
        const extractedPath = this.extractFile(finalPath)

        if (extractedPath) {
          this.setFilePermissions(extractedPath)
        }
      } catch (error) {
        console.warn(`Failed to extract file ${file}:`, error)
      }
    }
  }

  private setFilePermissions = (filePath: string): void => {
    try {
      fs.chmodSync(filePath, 0o755)
    } catch (error) {
      console.warn(`Failed to set permissions for ${filePath}:`, error)
    }
  }

  private getPrismaLocation = (initialPath: string): string | undefined => {
    try {
      if (!fs.existsSync(initialPath)) {
        return undefined
      }

      const dirList = fs.readdirSync(initialPath)

      for (const item of dirList) {
        const folder = path.join(initialPath, item)

        try {
          if (fs.lstatSync(folder).isDirectory()) {
            const inside = fs.readdirSync(folder)

            if (inside.includes('prisma')) {
              const prismaPath = path.join(folder, 'prisma')

              if (
                fs.lstatSync(prismaPath).isDirectory() &&
                fs.existsSync(path.join(prismaPath, 'schema.prisma'))
              ) {
                return folder
              }
            }
          }
        } catch (error) {
          // Skip items that can't be read (permissions, etc.)
          console.warn(`Could not read directory ${folder}:`, error)
          continue
        }
      }
    } catch (error) {
      console.error(`Error searching for Prisma location in ${initialPath}:`, error)
    }

    return undefined
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

    const ssl = this.getSSLVersion(result.id, result.version_id)
    const prismaName = this.getDistroNameTranslation(result.id)

    return { ...result, ssl, prismaName }
  }

  private getSSLVersion = (distro: string, version?: string): string => {
    const versionHasDots = version && version.includes('.')

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
        schemaEngine:
          arch === 'arm64'
            ? `libquery_engine-darwin${archName}.dylib.node`
            : 'schema-engine-windows.exe'
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
    try {
      const fileName = path.basename(originalPath)
      const dirPath = path.dirname(originalPath)

      // Normalize path separators and remove ASAR references
      const normalizedDirPath = dirPath
        .replace(/app\.asar/g, '')
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/') // Remove duplicate slashes
        .replace(/\/$/, '') // Remove trailing slash

      const finalFilePath = path.join(normalizedDirPath, fileName)

      if (!fs.existsSync(finalFilePath)) {
        const asarInfo = this.parseAsarPath(originalPath)
        if (!asarInfo) {
          console.warn(`Could not parse ASAR path: ${originalPath}`)
          return ''
        }

        CreateDirectory(normalizedDirPath)
        const extractedData = asar.extractFile(asarInfo.asarLocation, asarInfo.targetFile)

        if (extractedData && extractedData.length > 0) {
          fs.writeFileSync(finalFilePath, extractedData)
          console.log(`Extracted: ${fileName} to ${finalFilePath}`)
        } else {
          console.warn(`No data extracted for: ${fileName}`)
          return ''
        }
      }

      return finalFilePath
    } catch (error) {
      console.error(`Error extracting file ${originalPath}:`, error)
      return ''
    }
  }

  private parseAsarPath = (
    filePath: string
  ): { asarLocation: string; targetFile: string } | null => {
    const asarIndex = filePath.indexOf('asar')
    if (asarIndex === -1) return null

    const asarLocation = filePath.substring(0, asarIndex + 4)
    const targetFile = filePath.substring(asarIndex + 5) // Skip 'asar/'

    return { asarLocation, targetFile }
  }
}
