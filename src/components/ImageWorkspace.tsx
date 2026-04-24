import { useEffect, useRef, useState } from 'react'

import type { AlignmentPoint } from '../lib/imageAlignment'

type ImageWorkspaceProps = {
  imageName?: string
  imagePath?: string
  rotationDegrees: number
  pendingPoints: AlignmentPoint[]
  isAlignmentMode: boolean
  isBusy?: boolean
  isSaveDisabled?: boolean
  status: string
  onUploadRequest: () => void
  onEnterAlignmentMode: () => void
  onResetAlignment: () => void
  onSaveAlignment: () => void
  onStagePointSelect: (point: AlignmentPoint) => void
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
  pendingPoints,
  isAlignmentMode,
  isBusy = false,
  isSaveDisabled = false,
  status,
  onUploadRequest,
  onEnterAlignmentMode,
  onResetAlignment,
  onSaveAlignment,
  onStagePointSelect,
}: ImageWorkspaceProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions>()
  const layout = imageDimensions
    ? getRotatedLayout(imageDimensions.width, imageDimensions.height, rotationDegrees)
    : undefined

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

  function handleStageClick(event: React.MouseEvent<SVGSVGElement>) {
    if (!isAlignmentMode || !imageDimensions || !layout) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()

    if (rect.width <= 0 || rect.height <= 0) {
      return
    }

    const stageX = ((event.clientX - rect.left) / rect.width) * layout.width
    const stageY = ((event.clientY - rect.top) / rect.height) * layout.height

    onStagePointSelect({
      x: stageX,
      y: stageY,
    })
  }

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
          <button
            type="button"
            className={`action-button${isAlignmentMode ? ' action-button--active' : ''}`}
            onClick={onEnterAlignmentMode}
            disabled={!imagePath || isBusy}
          >
            Align horizontally
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
              onClick={handleStageClick}
            >
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
              {pendingPoints.map((point, index) => (
                <circle
                  key={`${point.x}-${point.y}-${index}`}
                  className="image-stage__marker"
                  cx={point.x}
                  cy={point.y}
                  r={Math.max(layout.width, layout.height) * 0.008}
                />
              ))}
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