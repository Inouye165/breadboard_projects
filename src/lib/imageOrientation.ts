/**
 * Helpers that keep saved breadboard images stored with their long edge
 * running horizontally so the workspace can render them at full window width
 * without cropping or zooming.
 */

export function isPortrait(width: number, height: number): boolean {
  return height > width
}

function getRotationBounds(width: number, height: number, rotationDegrees: number) {
  const angleRadians = (rotationDegrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(angleRadians))
  const sin = Math.abs(Math.sin(angleRadians))

  return {
    width: Math.ceil(width * cos + height * sin),
    height: Math.ceil(width * sin + height * cos),
  }
}

function decodeImageFromBlob(file: Blob, timeoutMs = 4000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      reject(new Error('Object URLs are not supported in this environment.'))
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    let settled = false

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
    }

    const timeoutId = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(new Error('Image decode timed out.'))
    }, timeoutMs)

    image.onload = () => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutId)
      cleanup()
      resolve(image)
    }

    image.onerror = () => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutId)
      cleanup()
      reject(new Error('Image decode failed.'))
    }

    image.src = objectUrl
  })
}

function rotateImageNinetyDegreesClockwise(
  image: HTMLImageElement,
  fileName: string,
  mimeType: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      reject(new Error('Canvas rendering is not available in this environment.'))
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalHeight
    canvas.height = image.naturalWidth

    const context = canvas.getContext('2d')

    if (!context) {
      reject(new Error('Canvas 2D context is not available.'))
      return
    }

    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(Math.PI / 2)
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Canvas blob export is not supported.'))
      return
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode the rotated image.'))
          return
        }
        resolve(new File([blob], fileName, { type: blob.type || mimeType }))
      },
      mimeType || 'image/jpeg',
      0.92,
    )
  })
}

/**
 * If the supplied image file is taller than it is wide, return a new File whose
 * pixels have been rotated 90 degrees clockwise so the long edge runs
 * horizontally. Falls back to the original file when the environment cannot
 * decode/encode the image (for example, jsdom-based unit tests).
 */
function canRotateInCurrentEnvironment(): boolean {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return false
  }

  try {
    const canvas = document.createElement('canvas')

    if (typeof canvas.getContext !== 'function' || typeof canvas.toBlob !== 'function') {
      return false
    }

    return canvas.getContext('2d') !== null
  } catch {
    return false
  }
}

export async function ensureLandscapeFile(file: File): Promise<File> {
  if (!canRotateInCurrentEnvironment()) {
    return file
  }

  try {
    const image = await decodeImageFromBlob(file)

    if (!isPortrait(image.naturalWidth, image.naturalHeight)) {
      return file
    }

    return await rotateImageNinetyDegreesClockwise(image, file.name, file.type)
  } catch {
    return file
  }
}

export async function rotateImageFile(file: File, rotationDegrees: number): Promise<File> {
  if (!canRotateInCurrentEnvironment() || Math.abs(rotationDegrees) < 0.0001) {
    return file
  }

  try {
    const image = await decodeImageFromBlob(file)
    const { width, height } = getRotationBounds(
      image.naturalWidth,
      image.naturalHeight,
      rotationDegrees,
    )
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      return file
    }

    if ((file.type || 'image/jpeg') === 'image/jpeg') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
    }

    context.translate(width / 2, height / 2)
    context.rotate((rotationDegrees * Math.PI) / 180)
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

    const rotatedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, file.type || 'image/jpeg', 0.92)
    })

    if (!rotatedBlob) {
      return file
    }

    return new File([rotatedBlob], file.name, { type: rotatedBlob.type || file.type })
  } catch {
    return file
  }
}
