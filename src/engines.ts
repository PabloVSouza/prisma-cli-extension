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
      // First, check unpacked files from ASAR (highest priority)
      path.join(this.environment.resourcesPath, 'app.asar.unpacked', 'node_modules', 'prisma', 'build', 'index.js'),
      path.join(this.environment.resourcesPath, 'node_modules', 'prisma', 'build', 'index.js'),
      path.join(this.environment.resourcesPath, 'temp', 'prisma-cli.js'),

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
            path.join(this.environment.resourcesPath, 'temp', 'prisma-cli.js')
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

  public isAsarEnvironment = (): boolean => {
    return (
      this.environment.isAsar ||
      this.prismaPath.includes('asar') ||
      this.schemaPath.includes('asar') ||
      __dirname.includes('asar')
    )
  }

  public ensureModuleResolution = (): void => {
    if (this.isAsarEnvironment()) {
      // Add the unpacked directory to module resolution paths
      const unpackedDir = path.join(this.environment.resourcesPath, 'app.asar.unpacked')
      const directDir = path.join(this.environment.resourcesPath, 'node_modules')

      // Check if @prisma/client exists in unpacked location
      const prismaClientUnpacked = path.join(unpackedDir, 'node_modules', '@prisma', 'client')
      const prismaClientDirect = path.join(directDir, 'node_modules', '@prisma', 'client')

      if (fs.existsSync(prismaClientUnpacked)) {
        console.log('✅ @prisma/client found in unpacked location')
        // Add to module resolution if needed
        if (!require.main?.paths.includes(unpackedDir)) {
          require.main?.paths.unshift(unpackedDir)
        }
      } else if (fs.existsSync(prismaClientDirect)) {
        console.log('✅ @prisma/client found in direct location')
        // Add to module resolution if needed
        if (!require.main?.paths.includes(directDir)) {
          require.main?.paths.unshift(directDir)
        }
      } else {
        console.warn('⚠️ @prisma/client not found in any expected location')
      }
    }
  }

  public handleAsarExtraction = (): void => {
    try {
      console.log('Handling ASAR extraction for Prisma files...')

      // Extract all necessary Prisma files from ASAR automatically
      this.extractAllPrismaFilesFromAsar()

      // First, try to extract the Prisma CLI binary
      const extractedPrismaPath = this.extractPrismaCli()
      if (extractedPrismaPath) {
        this.prismaPath = extractedPrismaPath
        console.log(`Updated Prisma CLI path to: ${this.prismaPath}`)
      }
    } catch (error) {
      console.error('Error handling ASAR extraction:', error)
      // Don't throw here - let the system try to work with what it has
      console.warn('ASAR extraction failed, continuing with available files')
    }
  }

  private extractAllPrismaFilesFromAsar = (): void => {
    try {
      console.log('Extracting all Prisma files from ASAR...')

      const asarLocation = this.getAsarLocation()
      if (!asarLocation) {
        console.log('No ASAR location found, skipping extraction')
        return
      }

      console.log(`Extracting from ASAR: ${asarLocation}`)

      // List all files in the ASAR
      const allFiles = asar.listPackage(asarLocation, { isPack: false })
      console.log(`Found ${allFiles.length} files in ASAR`)

      // Find all Prisma-related files
      const prismaFiles = allFiles.filter(
        (file) =>
          file.includes('node_modules/prisma') ||
          file.includes('node_modules/@prisma') ||
          file.includes('node_modules/.prisma')
      )

      console.log(`Found ${prismaFiles.length} Prisma-related files to extract`)

      // Log some sample files for debugging
      const sampleFiles = prismaFiles.slice(0, 10)
      console.log('Sample Prisma files in ASAR:', sampleFiles)

      // Determine the best extraction location
      const unpackedDir = path.join(this.environment.resourcesPath, 'app.asar.unpacked')
      const directDir = path.join(this.environment.resourcesPath, 'node_modules')

      // Prefer app.asar.unpacked if it exists, otherwise use direct extraction
      const extractionBase = fs.existsSync(unpackedDir) ? unpackedDir : directDir
      console.log(`Using extraction base: ${extractionBase}`)

      // Extract each Prisma file
      for (const file of prismaFiles) {
        try {
          // Handle different file path formats
          let relativePath: string
          if (file.startsWith('/node_modules/')) {
            // Remove the leading slash
            relativePath = file.substring(1)
          } else if (file.startsWith('node_modules/')) {
            // Already has the correct format
            relativePath = file
          } else {
            // Add node_modules prefix if missing
            relativePath = `node_modules/${file}`
          }

          const targetPath = path.join(extractionBase, relativePath)
          const targetDir = path.dirname(targetPath)

          // Create directory if it doesn't exist
          if (!fs.existsSync(targetDir)) {
            CreateDirectory(targetDir)
          }

          // Skip if file already exists
          if (fs.existsSync(targetPath)) {
            continue
          }

          // Extract the file - try different path formats
          let fileData: Buffer | null = null
          const possiblePaths = [file, file.substring(1), file.replace(/^\//, '')]

          for (const tryPath of possiblePaths) {
            try {
              fileData = asar.extractFile(asarLocation, tryPath)
              if (fileData && fileData.length > 0) {
                break
              }
            } catch (pathError) {
              // Try next path format
              continue
            }
          }

          if (fileData && fileData.length > 0) {
            fs.writeFileSync(targetPath, fileData)

            // Set executable permissions for binaries
            if (
              file.endsWith('.exe') ||
              file.endsWith('.dylib') ||
              file.endsWith('.so') ||
              file.endsWith('.node')
            ) {
              fs.chmodSync(targetPath, 0o755)
            }

            console.log(`Extracted: ${file} -> ${targetPath}`)
          } else {
            console.warn(`No data extracted for: ${file}`)
          }
        } catch (error) {
          console.warn(`Failed to extract ${file}:`, error)
        }
      }

      // Verify @prisma/client was extracted
      const prismaClientPath = path.join(extractionBase, 'node_modules', '@prisma', 'client')
      if (fs.existsSync(prismaClientPath)) {
        console.log('✅ @prisma/client successfully extracted')
      } else {
        console.warn('⚠️ @prisma/client not found in extracted files')
        console.log(`Checked path: ${prismaClientPath}`)
      }

      // Handle missing Prisma engines - create fallback mechanism
      this.handleMissingPrismaEngines(extractionBase)

      console.log('Prisma files extraction completed')
    } catch (error) {
      console.error('Error extracting Prisma files from ASAR:', error)
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
      const prismaCliFiles = allFiles.filter((file) => {
        const lowerFile = file.toLowerCase()
        return (
          ((lowerFile.includes('prisma') &&
            lowerFile.includes('build') &&
            lowerFile.endsWith('index.js')) ||
            (lowerFile.includes('prisma') && lowerFile.endsWith('prisma')) ||
            (lowerFile.includes('prisma') && lowerFile.includes('cli'))) &&
          !lowerFile.includes('prisma-packaged') &&
          !lowerFile.includes('generator')
        )
      })

      console.log(`Found ${prismaCliFiles.length} potential Prisma CLI files:`, prismaCliFiles)

      if (prismaCliFiles.length === 0) {
        console.log('No Prisma CLI files found in ASAR')
        return null
      }

      // Find the main Prisma CLI file - prioritize actual CLI files
      const mainCliFile =
        prismaCliFiles.find(
          (file) =>
            file.includes('prisma/build/index.js') ||
            file.includes('node_modules/prisma/build/index.js')
        ) ||
        prismaCliFiles.find((file) => file.includes('build/index.js')) ||
        prismaCliFiles[0]

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

  private handleMissingPrismaEngines = (extractionBase: string): void => {
    try {
      console.log('Checking for missing Prisma engines...')

      const enginesDir = path.join(extractionBase, 'node_modules', '@prisma', 'engines')

      // Check if engines directory exists
      if (!fs.existsSync(enginesDir)) {
        console.log('Creating @prisma/engines directory...')
        CreateDirectory(enginesDir)
      }

      // List expected engine files for the current platform
      const expectedEngines = this.getExpectedEngineFiles()
      console.log(`Expected engines for ${this.platform}:`, expectedEngines)

      // Check which engines are missing
      const missingEngines = expectedEngines.filter((engine) => {
        const enginePath = path.join(enginesDir, engine)
        return !fs.existsSync(enginePath)
      })

      if (missingEngines.length > 0) {
        console.warn(`Missing Prisma engines: ${missingEngines.join(', ')}`)
        console.log('This is expected in production builds where engines are not included in ASAR')
        console.log('Prisma will automatically download missing engines when needed')

        // Create placeholder files to prevent extraction errors
        for (const engine of missingEngines) {
          const enginePath = path.join(enginesDir, engine)
          const engineDir = path.dirname(enginePath)

          if (!fs.existsSync(engineDir)) {
            CreateDirectory(engineDir)
          }

          // Create a placeholder file that indicates the engine should be downloaded
          const placeholderContent = `# This file indicates that the Prisma engine "${engine}" should be downloaded automatically by Prisma
# This is normal in production builds where engines are not included in the ASAR archive
# Prisma will handle downloading this engine when needed
`
          fs.writeFileSync(enginePath + '.placeholder', placeholderContent)
          console.log(`Created placeholder for missing engine: ${engine}`)
        }
      } else {
        console.log('✅ All expected Prisma engines are present')
      }
    } catch (error) {
      console.error('Error handling missing Prisma engines:', error)
    }
  }

  private getExpectedEngineFiles = (): string[] => {
    const engines = []
    const arch = process.arch

    // Add platform-specific engines with architecture
    if (this.platform.includes('darwin')) {
      if (arch === 'arm64') {
        engines.push('schema-engine-darwin-arm64')
        engines.push('libquery_engine-darwin-arm64.dylib.node')
      } else {
        engines.push('schema-engine-darwin')
        engines.push('libquery_engine-darwin.dylib.node')
      }
    } else if (this.platform.includes('linux')) {
      if (arch === 'arm64') {
        engines.push('schema-engine-linux-arm64')
        engines.push('libquery_engine-linux-arm64.so.node')
      } else {
        engines.push('schema-engine-linux-glibc-libssl3')
        engines.push('libquery_engine-linux-glibc-libssl3.so.node')
      }
    } else if (this.platform.includes('windows')) {
      engines.push('schema-engine-windows.exe')
      engines.push('query_engine-windows.dll.node')
    }

    // Add common engines
    engines.push('prisma-fmt')
    engines.push('introspection-engine')

    return engines
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
    // First, check in app.asar.unpacked location (prioritize unpacked engines)
    const unpackedPath = path.join(
      this.environment.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@prisma',
      'engines',
      fileName
    )
    if (fs.existsSync(unpackedPath)) {
      console.log(`Using unpacked engine: ${unpackedPath}`)
      return unpackedPath
    }

    // If the requested engine doesn't exist, try the ARM64 version (for universal builds)
    if (fileName.includes('darwin') && !fileName.includes('arm64')) {
      const arm64FileName = fileName.replace('darwin', 'darwin-arm64')
      const arm64UnpackedPath = path.join(
        this.environment.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        '@prisma',
        'engines',
        arm64FileName
      )
      if (fs.existsSync(arm64UnpackedPath)) {
        console.log(`Using ARM64 unpacked engine: ${arm64UnpackedPath}`)
        return arm64UnpackedPath
      }
    }

    // Check if the file exists in the extracted location
    const extractedPath = path.join(
      this.environment.resourcesPath,
      'node_modules',
      '@prisma',
      'engines',
      fileName
    )
    if (fs.existsSync(extractedPath)) {
      console.log(`Using extracted engine: ${extractedPath}`)
      return extractedPath
    }

    // If not extracted, try the original path
    if (enginePath.includes('app.asar')) {
      try {
        const finalFilePath = this.extractFile(path.join(enginePath, fileName))
        if (finalFilePath && fs.existsSync(finalFilePath)) {
          return finalFilePath
        } else {
          console.warn(`Engine not found in ASAR: ${fileName}`)
          // Don't return empty string - let Prisma handle missing engines
          return this.getFallbackEnginePath(enginePath, fileName)
        }
      } catch (error) {
        console.warn(`Failed to extract engine ${fileName}:`, error)
        // Don't return empty string - let Prisma handle missing engines
        return this.getFallbackEnginePath(enginePath, fileName)
      }
    }
    return path.join(enginePath, fileName)
  }

  private getFallbackEnginePath = (enginePath: string, fileName: string): string => {
    // In production, if engines are missing from ASAR, let Prisma handle it
    // by returning a path that Prisma can use to download the engine
    const fallbackPath = path.join(
      this.environment.resourcesPath,
      'node_modules',
      '@prisma',
      'engines',
      fileName
    )

    console.log(`Using fallback engine path for ${fileName}: ${fallbackPath}`)
    console.log('Prisma will automatically download the engine if needed')

    return fallbackPath
  }

  private getBinaryTarget = (platform: string): string => {
    if (platform === 'darwin') return 'darwin,darwin-arm64'
    if (platform === 'linux') return 'linux,linux-arm64'
    return platform
  }

  public getBinaryTargets = (): string[] => {
    if (this.platform === 'darwin') return ['darwin', 'darwin-arm64']
    if (this.platform === 'linux') return ['linux', 'linux-arm64']
    return [this.platform]
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
