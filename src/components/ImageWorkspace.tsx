import { useEffect, useRef, useState } from 'react'

type ImageWorkspaceProps = {
  imageName?: string
  imagePath?: string
  rotationDegrees: number
  guideLinePercent: number
  rotationInput: string
  isBusy?: boolean
  isSaveDisabled?: boolean
  status: string
  onUploadRequest: () => void
  onGuideLineChange: (value: number) => void
  onRotationInputChange: (value: string) => void
  onApplyRotation: () => void
  onResetAlignment: () => void
  onSaveAlignment: () => void
}

type ImageDimensions = {
  width: number
  height: number
}

type RotatedLayout = {
  width: number
  height: number
  offsetX: number
  offsetY: number
}

function rotatePoint(x: number, y: number, centerX: number, centerY: number, angleRadians: number) {
  const translatedX = x - centerX
  const translatedY = y - centerY
  const cos = Math.cos(angleRadians)
  const sin = Math.sin(angleRadians)

  return {
    x: translatedX * cos - translatedY * sin + centerX,
    y: translatedX * sin + translatedY * cos + centerY,
  }
}

function getRotatedLayout(width: number, height: number, rotationDegrees: number): RotatedLayout {
  const centerX = width / 2
  const centerY = height / 2
  const angleRadians = (rotationDegrees * Math.PI) / 180
  const corners = [
    rotatePoint(0, 0, centerX, centerY, angleRadians),
    rotatePoint(width, 0, centerX, centerY, angleRadians),
    rotatePoint(width, height, centerX, centerY, angleRadians),
    rotatePoint(0, height, centerX, centerY, angleRadians),
  ]
  const xValues = corners.map((corner) => corner.x)
  const yValues = corners.map((corner) => corner.y)
  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const minY = Math.min(...yValues)
  const maxY = Math.max(...yValues)

  return {
    width: maxX - minX,
    height: maxY - minY,
    offsetX: -minX,
    offsetY: -minY,
  }
}

export function ImageWorkspace({
  imageName,
  imagePath,
  rotationDegrees,
  guideLinePercent,
  rotationInput,
  isBusy = false,
  isSaveDisabled = false,
  status,
  onUploadRequest,
  onGuideLineChange,
  onRotationInputChange,
  onApplyRotation,
  onResetAlignment,
  onSaveAlignment,
}: ImageWorkspaceProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions>()
  const layout = imageDimensions
    ? getRotatedLayout(imageDimensions.width, imageDimensions.height, rotationDegrees)
    : undefined
  const guideLineY = layout ? (guideLinePercent / 100) * layout.height : 0

  useEffect(() => {
    if (!imagePath) {
      return
    }

    let isActive = true
    const image = new Image()

    image.onload = () => {
      if (!isActive) {
        return
      }

      setImageDimensions({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      })
    }

    image.onerror = () => {
      if (isActive) {
        setImageDimensions({ width: 1, height: 1 })
      }
    }

    image.src = imagePath

    return () => {
      isActive = false
    }
  }, [imagePath])

  return (
    <section className="image-workspace" aria-label="Image alignment workspace">
      <header className="image-workspace__header">
        <div className="image-workspace__title-block">
          <p className="image-workspace__eyebrow">Phase 1 image alignment</p>
          <p className="image-workspace__status">{status}</p>
        </div>
        <div className="image-workspace__actions">
          {imagePath ? (
            <button type="button" className="action-button action-button--ghost" onClick={onUploadRequest}>
              Replace image
            </button>
          ) : null}
          <label className="control-group" htmlFor="guide-line-position">
            <span className="control-group__label">Guide line</span>
            <input
              id="guide-line-position"
              className="control-group__slider"
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={guideLinePercent}
              onChange={(event) => onGuideLineChange(Number.parseFloat(event.target.value))}
              disabled={!imagePath || isBusy}
            />
          </label>
          <label className="control-group" htmlFor="rotation-amount">
            <span className="control-group__label">Rotate by deg</span>
            <input
              id="rotation-amount"
              className="control-group__input"
              type="number"
              step="0.01"
              value={rotationInput}
              onChange={(event) => onRotationInputChange(event.target.value)}
              disabled={!imagePath || isBusy}
            />
          </label>
          <button
            type="button"
            className="action-button"
            onClick={onApplyRotation}
            disabled={!imagePath || isBusy}
          >
            Apply rotation
          </button>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={onResetAlignment}
            disabled={!imagePath || isBusy}
          >
            Reset alignment
          </button>
          <button
            type="button"
            className="action-button"
            onClick={onSaveAlignment}
            disabled={isSaveDisabled || !imagePath || isBusy}
          >
            Save alignment
          </button>
        </div>
      </header>

      <section className="image-workspace__stage-shell">
        {imagePath && imageDimensions && layout ? (
          <div className="image-stage" aria-label="Breadboard image stage">
            <svg
              ref={svgRef}
              className="image-stage__svg"
              data-rotation-degrees={rotationDegrees}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              role="img"
              aria-label={imageName ? `Breadboard image ${imageName}` : 'Breadboard image'}
            >
              <line
                className="image-stage__guide-line"
                x1="0"
                y1={guideLineY}
                x2={layout.width}
                y2={guideLineY}
              />
              <g
                className="image-stage__transform"
                transform={`translate(${layout.offsetX} ${layout.offsetY}) rotate(${rotationDegrees} ${imageDimensions.width / 2} ${imageDimensions.height / 2})`}
              >
                <image
                  href={imagePath}
                  width={imageDimensions.width}
                  height={imageDimensions.height}
                  preserveAspectRatio="none"
                />
              </g>
            </svg>
          </div>
        ) : (
          <div className="upload-empty-state" aria-label="Breadboard upload prompt">
            <p className="upload-empty-state__eyebrow">Local persistence</p>
            <h2>Upload a breadboard image to begin.</h2>
            <p>
              The image and its saved horizontal alignment will be written into a repo-local
              folder and reloaded automatically the next time the app starts.
            </p>
            <button type="button" className="action-button" onClick={onUploadRequest}>
              Upload image
            </button>
          </div>
        )}
      </section>
    </section>
  )
}
