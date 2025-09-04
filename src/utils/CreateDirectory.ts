import fs from 'fs'
import path from 'path'

const CreateDirectory = (dirPath: string): string => {
  try {
    const normalizedPath = path.normalize(dirPath)

    if (!fs.existsSync(normalizedPath)) {
      fs.mkdirSync(normalizedPath, {
        recursive: true,
        mode: 0o755 // Set appropriate permissions
      })
      console.log(`Created directory: ${normalizedPath}`)
    }

    return normalizedPath
  } catch (error) {
    console.error(`Failed to create directory ${dirPath}:`, error)
    throw new Error(
      `Could not create directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

export default CreateDirectory
