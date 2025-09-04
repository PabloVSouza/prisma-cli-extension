/* eslint-env node, jest */
const { Buffer } = require('buffer')

module.exports = {
  listPackage: jest.fn(() => ['prisma/build/index.js']),
  extractFile: jest.fn(() => Buffer.from('mock prisma binary'))
}
