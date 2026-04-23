import { useEffect, useRef, useState } from 'react'

type BreadboardCanvasProps = {
  imageSrc?: string
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

export function BreadboardCanvas({ imageSrc, onImageSelected }: BreadboardCanvasProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)
  const processedImageUrlRef = useRef<string | undefined>(undefined)
  const resizeObserverRef = useRef<ResizeObserver | undefined>(undefined)
  const [displayImageSrc, setDisplayImageSrc] = useState<string>()
  const [imageStyle, setImageStyle] = useState<React.CSSProperties>()

  function revokeProcessedImageUrl() {
    if (!processedImageUrlRef.current) {
      return
    }

    URL.revokeObjectURL(processedImageUrlRef.current)
    processedImageUrlRef.current = undefined
  }

  function updateImageLayout() {
    const mediaElement = mediaRef.current
    const imageElement = imageRef.current

    if (!mediaElement || !imageElement || !imageElement.naturalWidth || !imageElement.naturalHeight) {
      setImageStyle(undefined)
      return
    }

    const availableWidth = mediaElement.clientWidth
    const availableHeight = mediaElement.clientHeight

    if (!availableWidth || !availableHeight) {
      return
    }

    const scale = Math.min(
      availableWidth / imageElement.naturalHeight,
      availableHeight / imageElement.naturalWidth,
    )

    const rotatedWidth = imageElement.naturalHeight * scale
    const rotatedHeight = imageElement.naturalWidth * scale

    setImageStyle({
      width: `${rotatedHeight}px`,
      height: `${rotatedWidth}px`,
    })
  }

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
      return source
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
      return source
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
      return source
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
      return source
    }

    const trimmedImageUrl = URL.createObjectURL(trimmedBlob)
    processedImageUrlRef.current = trimmedImageUrl

    return trimmedImageUrl
  }

  useEffect(() => {
    if (!imageSrc) {
      revokeProcessedImageUrl()
      setDisplayImageSrc(undefined)
      setImageStyle(undefined)
      return
    }

    let isActive = true
    const sourceImage = imageSrc

    async function prepareDisplayImage() {
      revokeProcessedImageUrl()

      try {
        const nextDisplayImageSrc = await buildDisplayImage(sourceImage)

        if (!isActive) {
          if (nextDisplayImageSrc !== sourceImage) {
            URL.revokeObjectURL(nextDisplayImageSrc)
          }
          return
        }

        setDisplayImageSrc(nextDisplayImageSrc)
      } catch {
        if (isActive) {
          setDisplayImageSrc(sourceImage)
        }
      }
    }

    void prepareDisplayImage()

    return () => {
      isActive = false
      revokeProcessedImageUrl()
    }
  }, [imageSrc])

  useEffect(() => {
    if (!displayImageSrc) {
      resizeObserverRef.current?.disconnect()
      setImageStyle(undefined)
      return
    }

    updateImageLayout()

    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = new ResizeObserver(() => {
      updateImageLayout()
    })

    if (mediaRef.current) {
      resizeObserverRef.current.observe(mediaRef.current)
    }

    return () => {
      resizeObserverRef.current?.disconnect()
    }
  }, [displayImageSrc])

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
            <div className="breadboard-toolbar breadboard-toolbar--overlay">
              <button type="button" className="action-button" onClick={handlePickImage}>
                Replace image
              </button>
            </div>
            <div ref={mediaRef} className="breadboard-media">
              <img
                ref={imageRef}
                className="breadboard-image"
                src={displayImageSrc ?? imageSrc}
                alt="Uploaded breadboard reference"
                style={imageStyle}
                onLoad={updateImageLayout}
              />
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