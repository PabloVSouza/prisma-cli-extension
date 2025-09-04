import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import fs from 'fs'

// Mock fs module
jest.mock('fs')
const mockedFs = fs as jest.Mocked<typeof fs>

describe('PrismaEngine - Simple Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Mock fs operations to simulate a valid Prisma project
    mockedFs.existsSync.mockImplementation((path) => {
      const pathStr = path.toString()
      if (pathStr.includes('schema.prisma')) return true
      if (pathStr.includes('prisma/build/index.js')) return true
      return true
    })

    mockedFs.readdirSync.mockImplementation((path) => {
      const pathStr = path.toString()
      if (pathStr.includes('test-project')) return ['prisma'] as any
      return ['test-project'] as any
    })

    mockedFs.lstatSync.mockReturnValue({ isDirectory: () => true } as any)

    // Mock process properties
    Object.defineProperty(process, 'cwd', {
      value: () => '/test/project',
      writable: true
    })

    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      writable: true
    })

    Object.defineProperty(process, 'arch', {
      value: 'x64',
      writable: true
    })
  })

  it('should detect development environment', () => {
    process.env.NODE_ENV = 'development'

    // Import after setting up mocks
    const { PrismaEngine } = require('../src/engines')
    const engine = new PrismaEngine()

    expect(engine.environment.isDevelopment).toBe(true)
    expect(engine.environment.isProduction).toBe(false)
    expect(engine.environment.isElectron).toBe(false)
  })

  it('should detect production environment', () => {
    process.env.NODE_ENV = 'production'

    const { PrismaEngine } = require('../src/engines')
    const engine = new PrismaEngine()

    expect(engine.environment.isDevelopment).toBe(false)
    expect(engine.environment.isProduction).toBe(true)
  })

  it('should detect Electron environment', () => {
    Object.defineProperty(process, 'versions', {
      value: { electron: '1.0.0' },
      writable: true
    })

    const { PrismaEngine } = require('../src/engines')
    const engine = new PrismaEngine()

    expect(engine.environment.isElectron).toBe(true)
  })

  it('should detect macOS platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      writable: true
    })

    const { PrismaEngine } = require('../src/engines')
    const engine = new PrismaEngine()

    expect(engine.platform).toBe('darwin')
    expect(engine.binaryTarget).toBe('darwin, darwin-arm64')
  })

  it('should detect Windows platform', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true
    })

    const { PrismaEngine } = require('../src/engines')
    const engine = new PrismaEngine()

    expect(engine.platform).toBe('win32')
    expect(engine.binaryTarget).toBe('win32')
  })
})
