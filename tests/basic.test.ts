import { describe, it, expect } from '@jest/globals'

describe('Basic Test', () => {
  it('should pass a simple test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should test environment detection', () => {
    expect(process.env.NODE_ENV).toBe('test')
  })
})
