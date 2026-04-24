import { useEffect, useRef, useState } from 'react'

import { PartEditor } from './PartEditor'
import { DEFAULT_BREADBOARD_IMAGE_HEIGHT, DEFAULT_BREADBOARD_IMAGE_WIDTH } from '../lib/breadboardPartDefinitions'

function pixelHasVisibleContent(data: Uint8ClampedArray, offset: number) {
  const alpha = data[offset + 3]

  if (alpha < 20) {
    return false
  }

  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  const brightness = (red + green + blue) / 3
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)

  return brightness < 248 || chroma > 10
}

async function buildDisplayImage(source: string) {
  const image = new Image()
  image.decoding = 'async'

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Unable to load image for display.'))
    image.src = source
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return {
      src: source,
      width: image.naturalWidth,
      height: image.naturalHeight,
    }
  }

  context.drawImage(image, 0, 0)

  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
  let top = 0
  let bottom = height - 1
  let left = 0
  let right = width - 1

  function rowHasContent(rowIndex: number) {
    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      if (pixelHasVisibleContent(data, (rowIndex * width + columnIndex) * 4)) {
        return true
      }
    }

    return false
  }

  function columnHasContent(columnIndex: number) {
    for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
      if (pixelHasVisibleContent(data, (rowIndex * width + columnIndex) * 4)) {
        return true
      }
    }

    return false
  }

  while (top < height && !rowHasContent(top)) {
    top += 1
  }

  while (bottom > top && !rowHasContent(bottom)) {
    bottom -= 1
  }

  while (left < width && !columnHasContent(left)) {
    left += 1
  }

  while (right > left && !columnHasContent(right)) {
    right -= 1
  }

  const trimmedWidth = right - left + 1
  const trimmedHeight = bottom - top + 1

  if (
    trimmedWidth <= 0 ||
    trimmedHeight <= 0 ||
    (trimmedWidth === width && trimmedHeight === height)
  ) {
    return {
      src: source,
      width,
      height,
    }
  }

  const edgePadding = Math.max(8, Math.round(Math.min(width, height) * 0.012))
  const cropLeft = Math.max(0, left - edgePadding)
  const cropTop = Math.max(0, top - edgePadding)
  const cropRight = Math.min(width, right + edgePadding)
  const cropBottom = Math.min(height, bottom + edgePadding)
  const cropWidth = cropRight - cropLeft + 1
  const cropHeight = cropBottom - cropTop + 1
  const trimmedCanvas = document.createElement('canvas')
  trimmedCanvas.width = cropWidth
  trimmedCanvas.height = cropHeight

  const trimmedContext = trimmedCanvas.getContext('2d')

  if (!trimmedContext) {
    return {
      src: source,
      width,
      height,
    }
  }

  trimmedContext.drawImage(
    canvas,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  )

  const trimmedBlob = await new Promise<Blob | null>((resolve) => {
    trimmedCanvas.toBlob(resolve, 'image/png')
  })

  if (!trimmedBlob) {
    return {
      src: source,
      width,
      height,
    }
  }

  return {
    src: URL.createObjectURL(trimmedBlob),
    width: cropWidth,
    height: cropHeight,
  }
}

type BreadboardCanvasProps = {
  imageSrc?: string
  imageName?: string
  onImageSelected: (file: File) => void
}

type PickerFileHandle = {
  getFile: () => Promise<File>
}

type PickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    excludeAcceptAllOption?: boolean
    multiple?: boolean
    startIn?: 'downloads'
    types?: Array<{
      accept: Record<string, string[]>
      description: string
    }>
  }) => Promise<PickerFileHandle[]>
}

export function BreadboardCanvas({ imageSrc, imageName, onImageSelected }: BreadboardCanvasProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const processedImageUrlRef = useRef<string | undefined>(undefined)
  const [processedDisplayImage, setProcessedDisplayImage] = useState<{
    source: string
    src: string
    width: number
    height: number
  }>()

  const displayImage = imageSrc
    ? processedDisplayImage?.source === imageSrc
      ? processedDisplayImage
      : {
          source: imageSrc,
          src: imageSrc,
          width: DEFAULT_BREADBOARD_IMAGE_WIDTH,
          height: DEFAULT_BREADBOARD_IMAGE_HEIGHT,
        }
    : undefined

  function revokeProcessedImageUrl() {
    if (!processedImageUrlRef.current) {
      return
    }

    URL.revokeObjectURL(processedImageUrlRef.current)
    processedImageUrlRef.current = undefined
  }

  useEffect(() => {
    if (!imageSrc) {
      revokeProcessedImageUrl()
      return
    }

    let isActive = true
    const sourceImage = imageSrc

    async function prepareDisplayImage() {
      revokeProcessedImageUrl()

      try {
        const nextDisplayImage = await buildDisplayImage(sourceImage)
        if (nextDisplayImage.src !== sourceImage) {
          processedImageUrlRef.current = nextDisplayImage.src
        }

        if (!isActive) {
          if (nextDisplayImage.src !== sourceImage) {
            URL.revokeObjectURL(nextDisplayImage.src)
          }
          return
        }

        setProcessedDisplayImage({
          source: sourceImage,
          src: nextDisplayImage.src,
          width: nextDisplayImage.width,
          height: nextDisplayImage.height,
        })
      } catch {
        if (isActive) {
          setProcessedDisplayImage({
            source: sourceImage,
            src: sourceImage,
            width: DEFAULT_BREADBOARD_IMAGE_WIDTH,
            height: DEFAULT_BREADBOARD_IMAGE_HEIGHT,
          })
        }
      }
    }

    void prepareDisplayImage()

    return () => {
      isActive = false
      revokeProcessedImageUrl()
    }
  }, [imageSrc])

  async function handlePickImage() {
    const pickerWindow = window as PickerWindow

    if (pickerWindow.showOpenFilePicker) {
      try {
        const [fileHandle] = await pickerWindow.showOpenFilePicker({
          multiple: false,
          startIn: 'downloads',
          types: [
            {
              description: 'Breadboard images',
              accept: {
                'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
              },
            },
          ],
        })
        const file = await fileHandle.getFile()
        onImageSelected(file)
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      }
    }

    fileInputRef.current?.click()
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0]

    if (!selectedFile) {
      return
    }

    onImageSelected(selectedFile)
    event.target.value = ''
  }

  return (
    <div className="breadboard-card">
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Upload breadboard image"
        onChange={handleFileChange}
      />
      <div className="breadboard-frame">
        {imageSrc ? (
          <div className="breadboard-stage">
            <div className="breadboard-media">
              {displayImage ? (
                <PartEditor
                  imageSrc={displayImage.src}
                  imageWidth={displayImage.width}
                  imageHeight={displayImage.height}
                  imageName={imageName}
                  onReplaceImage={() => void handlePickImage()}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <section className="breadboard-prompt" aria-label="Breadboard upload prompt">
            <h3>Add a breadboard screenshot to begin.</h3>
            <p>
              Provide a clear screenshot or photo of the breadboard you want to
              use. This view will display that board as the project reference in
              the workspace.
            </p>
            <button type="button" className="action-button" onClick={handlePickImage}>
              Choose image
            </button>
            <ul>
              <li>Use a straight-on image so rows and rails are easy to read.</li>
              <li>Include the full board area you want to diagram.</li>
              <li>Keep lighting even so holes and markings stay visible.</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}