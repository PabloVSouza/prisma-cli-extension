module.exports = {
  listPackage: jest.fn(() => ['prisma/build/index.js']),
  extractFile: jest.fn(() => Buffer.from('mock prisma binary'))
}
