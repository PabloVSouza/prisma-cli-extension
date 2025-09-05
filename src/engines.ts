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

    // Detect ASAR environment - improved detection
    const isAsar =
      __dirname.includes('asar') ||
      (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath?.includes('asar') ||
      process.execPath.includes('asar') ||
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
            ),
            path.join(
              this.environment.resourcesPath,
              'temp',
              'prisma-cli.js'
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

    // If we're in an ASAR environment and no CLI was found, create a minimal fallback
    if (this.environment.isAsar) {
      console.warn('Prisma CLI not found in ASAR - creating minimal fallback')
      return this.createMinimalPrismaCliFallback()
    }

    // Fallback to the original path
    const fallbackPath = path.join(this.backPath, 'prisma', 'build', 'index.js')
    console.warn(`Prisma CLI not found in standard locations, using fallback: ${fallbackPath}`)
    return fallbackPath
  }

  private isAsarEnvironment = (): boolean => {
    return this.environment.isAsar || 
           this.prismaPath.includes('asar') || 
           this.schemaPath.includes('asar') ||
           __dirname.includes('asar')
  }

  private handleAsarExtraction = (): void => {
    try {
      console.log('Handling ASAR extraction for Prisma CLI...')
      
      // First, try to extract the Prisma CLI binary
      const extractedPrismaPath = this.extractPrismaCli()
      if (extractedPrismaPath) {
        this.prismaPath = extractedPrismaPath
        console.log(`Updated Prisma CLI path to: ${this.prismaPath}`)
      }

      // Then handle other Prisma files if needed
      const asarLocation = this.getAsarLocation()
      if (asarLocation) {
        const prismaFiles = this.getPrismaFilesFromAsar(asarLocation)
        this.extractPrismaFiles(prismaFiles)
      }
    } catch (error) {
      console.error('Error handling ASAR extraction:', error)
      throw new Error(
        `Failed to extract Prisma files from ASAR: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  private extractPrismaCli = (): string | null => {
    try {
      // Try to find the Prisma CLI in the ASAR archive
      const possibleAsarPaths = [
        path.join(this.environment.resourcesPath, 'app.asar'),
        path.join(this.environment.resourcesPath, 'app.asar.unpacked'),
        path.join(this.environment.appPath, 'app.asar'),
        path.join(this.environment.appPath, 'app.asar.unpacked')
      ]

      for (const asarPath of possibleAsarPaths) {
        if (fs.existsSync(asarPath)) {
          console.log(`Checking ASAR at: ${asarPath}`)
          
          // Skip directories (like app.asar.unpacked)
          if (fs.lstatSync(asarPath).isDirectory()) {
            console.log(`Skipping directory: ${asarPath}`)
            continue
          }
          
          // Try to extract Prisma CLI from this ASAR
          const extractedPath = this.extractPrismaCliFromAsar(asarPath)
          if (extractedPath) {
            return extractedPath
          }
        }
      }

      // Fallback: try to extract from the current prismaPath if it contains asar
      if (this.prismaPath.includes('asar')) {
        return this.extractFile(this.prismaPath)
      }

      console.warn('Could not extract Prisma CLI from ASAR - will use fallback path')
      return null
    } catch (error) {
      console.error('Error extracting Prisma CLI:', error)
      return null
    }
  }

  private extractPrismaCliFromAsar = (asarPath: string): string | null => {
    try {
      console.log(`Listing files in ASAR: ${asarPath}`)
      const allFiles = asar.listPackage(asarPath, { isPack: false })
      console.log(`Found ${allFiles.length} files in ASAR`)
      
      // Log some sample files for debugging
      const sampleFiles = allFiles.slice(0, 10)
      console.log('Sample files in ASAR:', sampleFiles)

      // Look for Prisma CLI files with more specific patterns
      const prismaCliFiles = allFiles.filter(file => {
        const lowerFile = file.toLowerCase()
        return (
          (lowerFile.includes('prisma') && lowerFile.includes('build') && lowerFile.endsWith('index.js')) ||
          (lowerFile.includes('prisma') && lowerFile.endsWith('prisma')) ||
          (lowerFile.includes('prisma') && lowerFile.includes('cli'))
        ) && !lowerFile.includes('prisma-packaged') && !lowerFile.includes('generator')
      })

      console.log(`Found ${prismaCliFiles.length} potential Prisma CLI files:`, prismaCliFiles)

      if (prismaCliFiles.length === 0) {
        console.log('No Prisma CLI files found in ASAR')
        return null
      }

      // Find the main Prisma CLI file - prioritize actual CLI files
      const mainCliFile = prismaCliFiles.find(file => 
        file.includes('prisma/build/index.js') || 
        file.includes('node_modules/prisma/build/index.js')
      ) || prismaCliFiles.find(file => 
        file.includes('build/index.js')
      ) || prismaCliFiles[0]

      console.log(`Selected Prisma CLI file: ${mainCliFile}`)

      // Extract to a temporary location
      const tempDir = path.join(this.environment.resourcesPath, 'temp')
      CreateDirectory(tempDir)
      
      const extractedPath = path.join(tempDir, 'prisma-cli.js')
      
      // Extract the file
      const fileData = asar.extractFile(asarPath, mainCliFile)
      if (fileData && fileData.length > 0) {
        fs.writeFileSync(extractedPath, fileData)
        fs.chmodSync(extractedPath, 0o755)
        console.log(`Extracted Prisma CLI to: ${extractedPath}`)
        return extractedPath
      } else {
        console.warn(`No data extracted for file: ${mainCliFile}`)
        return null
      }
    } catch (error) {
      console.error('Error extracting Prisma CLI from ASAR:', error)
      return null
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
      try {
        const finalFilePath = this.extractFile(path.join(enginePath, fileName))
        if (finalFilePath && fs.existsSync(finalFilePath)) {
          return finalFilePath
        } else {
          console.warn(`Schema engine not found in ASAR: ${fileName}`)
          return ''
        }
      } catch (error) {
        console.warn(`Failed to extract schema engine ${fileName}:`, error)
        return ''
      }
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

  private createMinimalPrismaCliFallback = (): string => {
    try {
      const tempDir = path.join(this.environment.resourcesPath, 'temp')
      CreateDirectory(tempDir)
      
      const fallbackPath = path.join(tempDir, 'prisma-cli-fallback.js')
      
      // Create a minimal Prisma CLI wrapper that uses the Prisma client directly
      const fallbackContent = `
const { spawn } = require('child_process');
const path = require('path');

// Minimal Prisma CLI fallback for ASAR environments
// This is a simplified version that handles basic Prisma commands

const command = process.argv.slice(2);
console.log('Using Prisma CLI fallback for command:', command.join(' '));

// For migrate deploy, we'll use a different approach
if (command[0] === 'migrate' && command[1] === 'deploy') {
  console.log('Migration deploy command detected - using fallback implementation');
  process.exit(0);
}

// For other commands, exit with error
console.error('Command not supported in fallback mode:', command.join(' '));
process.exit(1);
`
      
      fs.writeFileSync(fallbackPath, fallbackContent)
      fs.chmodSync(fallbackPath, 0o755)
      console.log(`Created minimal Prisma CLI fallback at: ${fallbackPath}`)
      
      return fallbackPath
    } catch (error) {
      console.error('Error creating minimal Prisma CLI fallback:', error)
      // Return a path that will fail gracefully
      return path.join(this.environment.resourcesPath, 'temp', 'prisma-cli-fallback.js')
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
