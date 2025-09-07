/// <reference types="node" />

import fs from 'fs'
import path from 'path'
import os from 'os'
import asar from '@electron/asar'
import CreateDirectory from 'utils/CreateDirectory'
import type { PrismaClient as PrismaClientProps } from '@prisma/client'
import { PrismaMigration } from './migration'

// Lazy load PrismaClient to handle ASAR extraction timing
let PrismaClient: PrismaClientProps | null = null

const getPrismaClient = (): PrismaClientProps => {
  if (!PrismaClient) {
    try {
      // In ASAR environments, we need to handle module resolution differently
      if (process.env.NODE_ENV === 'production' || __dirname.includes('asar')) {
        // Try to find the Prisma client in unpacked locations
        const resourcesPath = (process as any).resourcesPath || ''
        const possiblePaths = [
          path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'client'),
          path.join(resourcesPath, 'node_modules', '@prisma', 'client'),
          path.join(__dirname, '..', '..', '..', 'node_modules', '@prisma', 'client')
        ]

        for (const clientPath of possiblePaths) {
          if (fs.existsSync(path.join(clientPath, 'index.js'))) {
            console.log(`Loading Prisma client from: ${clientPath}`)
            // Add the path to module resolution
            if (!require.main?.paths.includes(clientPath)) {
              require.main?.paths.unshift(clientPath)
            }
            break
          }
        }
      }

      // Dynamically require the module
      PrismaClient = require('@prisma/client').PrismaClient
    } catch (error) {
      console.error('Failed to load Prisma client:', error)
      console.error(
        'This usually means the Prisma client was not generated or is not available in the ASAR archive'
      )
      console.error('Please ensure Prisma client is generated during the build process')
      throw new Error(
        `@prisma/client is not available. This usually means the Prisma client was not generated or is not available in the ASAR archive. Please ensure Prisma client is generated during the build process. Error: ${error}`
      )
    }
  }
  return PrismaClient
}

export class PrismaInitializer extends PrismaMigration {
  public prisma: PrismaClientProps

  public initializePrisma = async () => {
    // Ensure ASAR extraction happens first
    if (this.isAsarEnvironment()) {
      console.log('ASAR environment detected, ensuring Prisma files are extracted...')
      this.handleAsarExtraction()
      this.ensureModuleResolution()
    }

    if (this.dbUrl.startsWith('file')) await this.prepareDb()

    // Ensure Prisma client is generated before trying to use it
    await this.ensurePrismaClientGenerated()

    const PrismaClientClass = getPrismaClient()

    const prismaConfig: Parameters<typeof PrismaClientClass>[0] = {
      datasources: {
        db: {
          url: this.dbUrl
        }
      }
    }

    // Add internal engine configuration if available
    if (this.qePath) {
      ;(prismaConfig as Record<string, unknown>).__internal = {
        engine: {
          binaryPath: this.qePath
        }
      }
    }

    this.prisma = new PrismaClientClass(prismaConfig)
  }

  private prepareDb = async (): Promise<void> => {
    try {
      const { dbFolder, filename, fullPath } = this.parseDatabaseUrl()

      console.log(`Preparing database:`, {
        originalUrl: this.dbUrl,
        resolvedPath: fullPath,
        folder: dbFolder,
        filename: filename,
        environment: this.environment.isDevelopment ? 'development' : 'production'
      })

      // Ensure the database directory exists
      if (!fs.existsSync(dbFolder)) {
        console.log(`Creating database directory: ${dbFolder}`)
        CreateDirectory(dbFolder)
      }

      if (!fs.existsSync(fullPath)) {
        console.log('Database file does not exist, creating...')

        // Create empty database file
        fs.closeSync(fs.openSync(fullPath, 'w'))
        console.log(`Database file created successfully at: ${fullPath}`)

        // Run initial migration with retry logic
        try {
          console.log('Running initial migration...')
          await this.runMigration()
          console.log('Initial migration completed successfully')
        } catch (migrationError) {
          console.warn('Initial migration failed, but database file was created:', migrationError)
          // Don't throw here - the database file exists and can be migrated later
        }
      } else {
        console.log(`Database file already exists at: ${fullPath}`)
      }
    } catch (error) {
      console.error('Error preparing database:', error)
      throw new Error(
        `Failed to prepare database: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private parseDatabaseUrl = (): { dbFolder: string; filename: string; fullPath: string } => {
    const filePrefix = 'file:'
    const fileIndex = this.dbUrl.indexOf(filePrefix)

    if (fileIndex === -1) {
      throw new Error('Invalid file database URL format')
    }

    const pathPart = this.dbUrl.substring(fileIndex + filePrefix.length)
    const queryIndex = pathPart.indexOf('?')
    const cleanPath = queryIndex !== -1 ? pathPart.substring(0, queryIndex) : pathPart
    const decodedPath = decodeURIComponent(cleanPath)

    console.log(`Parsing database URL: ${this.dbUrl}`)
    console.log(`Decoded path: ${decodedPath}`)

    // Handle different path formats
    let resolvedPath: string

    if (path.isAbsolute(decodedPath)) {
      // Absolute path - use as is
      resolvedPath = path.normalize(decodedPath)
      console.log(`Using absolute path: ${resolvedPath}`)
    } else {
      // Relative path - resolve based on environment
      if (this.environment.isDevelopment) {
        // In development, resolve relative to project root
        resolvedPath = path.resolve(this.environment.appPath, decodedPath)
        console.log(`Development: resolved relative path: ${resolvedPath}`)
      } else {
        // In production, resolve relative to app data directory
        const appDataPath = this.getAppDataPath()
        resolvedPath = path.resolve(appDataPath, decodedPath)
        console.log(`Production: resolved relative path: ${resolvedPath}`)
      }
    }

    const dbFolder = path.dirname(resolvedPath)
    const filename = path.basename(resolvedPath)

    console.log(`Final database path: ${resolvedPath}`)
    console.log(`Database folder: ${dbFolder}`)
    console.log(`Database filename: ${filename}`)

    return { dbFolder, filename, fullPath: resolvedPath }
  }

  private getAppDataPath = (): string => {
    if (this.environment.isElectron) {
      // In Electron, use app.getPath('userData')
      return process.env.ELECTRON_USER_DATA || path.join(os.homedir(), '.config', 'your-app-name')
    } else {
      // In Node.js, use a standard location
      return path.join(os.homedir(), '.local', 'share', 'your-app-name')
    }
  }

  private ensurePrismaClientGenerated = async (): Promise<void> => {
    try {
      console.log('Ensuring Prisma client is generated...')

      // Check if the generated client exists in multiple possible locations
      const possibleClientPaths = [
        // Standard location
        path.join(this.environment.appPath, 'node_modules', '@prisma', 'client'),
        // Resources location
        path.join(this.environment.resourcesPath, 'node_modules', '@prisma', 'client'),
        // Unpacked location
        path.join(
          this.environment.resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          '@prisma',
          'client'
        ),
        // Direct location
        path.join(this.environment.resourcesPath, 'node_modules', '@prisma', 'client')
      ]

      // Also check for .prisma/client directory
      const possiblePrismaClientPaths = [
        path.join(this.environment.appPath, 'node_modules', '.prisma', 'client'),
        path.join(this.environment.resourcesPath, 'node_modules', '.prisma', 'client'),
        path.join(this.environment.resourcesPath, 'app.asar.unpacked', 'node_modules', '.prisma', 'client'),
        path.join(this.environment.resourcesPath, 'node_modules', '.prisma', 'client')
      ]

      let clientExists = false
      let prismaClientExists = false

      // Check @prisma/client
      for (const clientPath of possibleClientPaths) {
        const defaultClientPath = path.join(clientPath, 'index.js')
        if (fs.existsSync(defaultClientPath)) {
          console.log(`✅ @prisma/client found at: ${clientPath}`)
          clientExists = true
          break
        }
      }

      // Check .prisma/client
      for (const clientPath of possiblePrismaClientPaths) {
        const defaultClientPath = path.join(clientPath, 'default.js')
        if (fs.existsSync(defaultClientPath)) {
          console.log(`✅ .prisma/client found at: ${clientPath}`)
          prismaClientExists = true
          break
        }
      }

      if (clientExists && prismaClientExists) {
        console.log('✅ Prisma client already generated')
        return
      }

      // If we're in an ASAR environment, try to extract the Prisma client
      if (this.isAsarEnvironment()) {
        console.log('ASAR environment detected, attempting to extract Prisma client...')
        await this.extractPrismaClientFromAsar()

        // Check again after extraction
        for (const clientPath of possibleClientPaths) {
          const defaultClientPath = path.join(clientPath, 'index.js')
          if (fs.existsSync(defaultClientPath)) {
            console.log(`✅ @prisma/client found after extraction at: ${clientPath}`)
            clientExists = true
            break
          }
        }

        for (const clientPath of possiblePrismaClientPaths) {
          const defaultClientPath = path.join(clientPath, 'default.js')
          if (fs.existsSync(defaultClientPath)) {
            console.log(`✅ .prisma/client found after extraction at: ${clientPath}`)
            prismaClientExists = true
            break
          }
        }
      }

      // If .prisma/client is missing, try to generate it
      if (clientExists && !prismaClientExists) {
        console.log('⚠️ .prisma/client directory missing, attempting to generate...')
        try {
          // Use a dummy database URL for generation
          const dummyDbUrl = 'file:./dev-data/database/database.db'
          await this.runPrismaCommand({ command: ['generate'], dbUrl: dummyDbUrl })
          console.log('✅ Prisma client generated successfully')
          return
        } catch (error) {
          console.error('Failed to generate Prisma client:', error)
          console.log('Continuing without generated client...')
        }
      }

      if (clientExists) {
        console.log('✅ Prisma client available')
        return
      }

      console.log('Prisma client not found, but skipping generation to avoid binary target issues')
      console.log('The Prisma client should be generated during the build process')
      console.log('If you encounter issues, run: npx prisma generate')

      // Don't try to generate the client here to avoid binary target issues
      // The client should be generated during the build process
    } catch (error) {
      console.error('Error checking Prisma client:', error)
      // Don't throw here - let the system try to continue
      console.warn('Prisma client check failed, continuing with available client')
    }
  }

  private extractPrismaClientFromAsar = async (): Promise<void> => {
    try {
      console.log('Extracting Prisma client from ASAR...')

      const asarLocation = this.getAsarLocationForClient()
      if (!asarLocation) {
        console.log('No ASAR location found, skipping Prisma client extraction')
        return
      }

      console.log(`Extracting from ASAR: ${asarLocation}`)

      // List all files in the ASAR
      const allFiles = asar.listPackage(asarLocation, { isPack: false })
      console.log(`Found ${allFiles.length} files in ASAR`)

      // Find all Prisma client files
      const prismaClientFiles = allFiles.filter(
        (file) =>
          file.includes('node_modules/@prisma/client') ||
          file.includes('node_modules/.prisma/client') ||
          file.includes('.prisma/client')
      )

      console.log(`Found ${prismaClientFiles.length} Prisma client files to extract`)

      // Determine the best extraction location
      const unpackedDir = path.join(this.environment.resourcesPath, 'app.asar.unpacked')
      const directDir = path.join(this.environment.resourcesPath, 'node_modules')

      // Prefer app.asar.unpacked if it exists, otherwise use direct extraction
      const extractionBase = fs.existsSync(unpackedDir) ? unpackedDir : directDir
      console.log(`Using extraction base: ${extractionBase}`)

      // Extract each Prisma client file
      for (const file of prismaClientFiles) {
        try {
          // Remove the leading slash and node_modules/ prefix for extraction
          const relativePath = file.startsWith('/node_modules/') ? file.substring(1) : file
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

          // Extract the file
          const fileData = asar.extractFile(asarLocation, file)
          if (fileData && fileData.length > 0) {
            fs.writeFileSync(targetPath, fileData)
            console.log(`Extracted: ${file} -> ${targetPath}`)
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

      console.log('Prisma client extraction completed')
    } catch (error) {
      console.error('Error extracting Prisma client from ASAR:', error)
    }
  }

  private getAsarLocationForClient = (): string | null => {
    const asarIndex = this.prismaPath.indexOf('asar')
    if (asarIndex === -1) return null

    return path.join(this.prismaPath.substring(0, asarIndex + 4))
  }

  // Removed unused normalizeDbPath helper.
}
