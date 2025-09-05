/// <reference types="node" />

import fs from 'fs'
import path from 'path'
import os from 'os'
import CreateDirectory from 'utils/CreateDirectory'
import type { PrismaClient as PrismaClientProps } from '@prisma/client'
import { PrismaMigration } from './migration'

let PrismaClient: PrismaClientProps

try {
  // Dynamically require the module
  PrismaClient = require('@prisma/client').PrismaClient
} catch {
  throw new Error(
    "@prisma/client is not installed. Please ensure that '@prisma/client' is installed as a dependency in your project."
  )
}

export class PrismaInitializer extends PrismaMigration {
  public prisma: PrismaClientProps

  public initializePrisma = async () => {
    if (this.dbUrl.startsWith('file')) await this.prepareDb()

    const prismaConfig: Parameters<typeof PrismaClient>[0] = {
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

    this.prisma = new PrismaClient(prismaConfig)
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

  // Removed unused normalizeDbPath helper.
}
