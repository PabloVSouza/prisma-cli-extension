import { jest } from '@jest/globals'

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}

// Mock process.env for consistent testing
process.env.NODE_ENV = 'test'

// Mock Electron-specific properties
Object.defineProperty(process, 'versions', {
  value: { electron: undefined },
  writable: true
})

// Mock process.resourcesPath
Object.defineProperty(process, 'resourcesPath', {
  value: undefined,
  writable: true
})

// Mock os.homedir for consistent testing
jest.mock('os', () => ({
  homedir: () => '/home/test-user'
}))

// Global test timeout
jest.setTimeout(30000)
