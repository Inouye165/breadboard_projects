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
    if (!isAlignmentMode || !imageDimensions) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()

    if (rect.width <= 0 || rect.height <= 0) {
      return
    }

    onStagePointSelect({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    })
  }

  return (
    <section className="image-workspace" aria-label="Image alignment workspace">
      <header className="image-workspace__header">
        <div className="image-workspace__title-block">
          <p className="image-workspace__eyebrow">Phase 1</p>
          <h1>Image alignment</h1>
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
        {imagePath && imageDimensions ? (
          <div className="image-stage" aria-label="Breadboard image stage">
            <svg
              ref={svgRef}
              className="image-stage__svg"
              data-rotation-degrees={rotationDegrees}
              viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}
              role="img"
              aria-label={imageName ? `Breadboard image ${imageName}` : 'Breadboard image'}
              onClick={handleStageClick}
            >
              <g
                className="image-stage__transform"
                transform={`rotate(${rotationDegrees} ${imageDimensions.width / 2} ${imageDimensions.height / 2})`}
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
                  cx={point.x * imageDimensions.width}
                  cy={point.y * imageDimensions.height}
                  r={Math.max(imageDimensions.width, imageDimensions.height) * 0.008}
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