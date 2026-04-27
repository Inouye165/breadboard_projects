import { useEffect, useRef, useState } from 'react'

type ImageWorkspaceProps = {
  currentDefinitionName?: string
  definitionOptions?: Array<{ id: string; name: string }>
  imageName?: string
  imagePath?: string
  rotationDegrees: number
  guideLinePercent: number
  rotationStep: number
  guideLineStep: number
  isBusy?: boolean
  isDefinitionBusy?: boolean
  isDefinitionSaveDisabled?: boolean
  isSaveDisabled?: boolean
  showDefinitionPanel?: boolean
  canContinueToPoints?: boolean
  status: string
  onCreateDefinition?: () => void
  onCurrentDefinitionNameChange?: (value: string) => void
  onDefinitionSelected?: (definitionId: string) => void
  onImageDimensionsChange?: (dimensions: ImageDimensions) => void
  onUploadRequest: () => void
  onGuideLineChange: (value: number) => void
  onRotationStepChange: (value: number) => void
  onGuideLineStepChange: (value: number) => void
  onRotateLeft: (multiplier?: number) => void
  onRotateRight: (multiplier?: number) => void
  onNudgeGuideLine: (direction: -1 | 1, multiplier?: number) => void
  onResetAlignment: () => void
  onSaveDefinition?: () => void
  onSaveAlignment: () => void
  onBackToHome?: () => void
  onContinueToPoints?: () => void
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
  currentDefinitionName = '',
  definitionOptions = [],
  imageName,
  imagePath,
  rotationDegrees,
  guideLinePercent,
  rotationStep,
  guideLineStep,
  isBusy = false,
  isDefinitionBusy = false,
  isDefinitionSaveDisabled = false,
  isSaveDisabled = false,
  showDefinitionPanel = false,
  canContinueToPoints = false,
  status,
  onCreateDefinition,
  onCurrentDefinitionNameChange,
  onDefinitionSelected,
  onImageDimensionsChange,
  onUploadRequest,
  onGuideLineChange,
  onRotationStepChange,
  onGuideLineStepChange,
  onRotateLeft,
  onRotateRight,
  onNudgeGuideLine,
  onResetAlignment,
  onSaveDefinition,
  onSaveAlignment,
  onBackToHome,
  onContinueToPoints,
}: ImageWorkspaceProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions>()
  const [isDraggingGuideLine, setIsDraggingGuideLine] = useState(false)
  const layout = imageDimensions
    ? getRotatedLayout(imageDimensions.width, imageDimensions.height, rotationDegrees)
    : undefined
  const guideLineY = layout ? (guideLinePercent / 100) * layout.height : 0

  function updateGuideLineFromPointer(clientY: number) {
    if (!layout || !svgRef.current) {
      return
    }

    const rect = svgRef.current.getBoundingClientRect()

    if (rect.height <= 0) {
      return
    }

    const nextPercent = ((clientY - rect.top) / rect.height) * 100
    onGuideLineChange(nextPercent)
  }

  function handleStageKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    const multiplier = event.shiftKey ? 10 : 1

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        onRotateLeft(multiplier)
        break
      case 'ArrowRight':
        event.preventDefault()
        onRotateRight(multiplier)
        break
      case 'ArrowUp':
        event.preventDefault()
        onNudgeGuideLine(-1, event.shiftKey ? 10 : 1)
        break
      case 'ArrowDown':
        event.preventDefault()
        onNudgeGuideLine(1, event.shiftKey ? 10 : 1)
        break
      default:
        break
    }
  }

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
      onImageDimensionsChange?.({
        width: image.naturalWidth || 1,
        height: image.naturalHeight || 1,
      })
    }

    image.onerror = () => {
      if (isActive) {
        setImageDimensions({ width: 1, height: 1 })
        onImageDimensionsChange?.({ width: 1, height: 1 })
      }
    }

    image.src = imagePath

    return () => {
      isActive = false
    }
  }, [imagePath, onImageDimensionsChange])

  return (
    <section className="image-workspace" aria-label="Image alignment workspace">
      <header className="image-workspace__header">
        <div className="image-workspace__title-block">
          <p className="image-workspace__eyebrow">Phase 1 image alignment</p>
          <p className="image-workspace__status">{status}</p>
        </div>
        <div className="image-workspace__actions">
          {onBackToHome ? (
            <button type="button" className="action-button action-button--ghost" onClick={onBackToHome}>
              Back
            </button>
          ) : null}
          {imagePath ? (
            <button type="button" className="action-button action-button--ghost" onClick={onUploadRequest}>
              Replace image
            </button>
          ) : null}
          {showDefinitionPanel ? (
          <section className="definition-panel" aria-label="Saved definition controls">
            <div className="alignment-panel__intro">
              <p className="control-guide__title">Saved definition</p>
              <p className="control-guide__body">
                Keep a named definition record for this aligned image. Point editing comes in the next phase.
              </p>
            </div>
            <label className="control-group" htmlFor="current-definition-name">
              <span className="control-group__label">Current definition name</span>
              <input
                id="current-definition-name"
                className="control-group__input"
                type="text"
                value={currentDefinitionName}
                onChange={(event) => onCurrentDefinitionNameChange(event.target.value)}
                placeholder="Untitled breadboard definition"
                disabled={!imagePath || isDefinitionBusy}
              />
            </label>
            <label className="control-group" htmlFor="saved-definition-list">
              <span className="control-group__label">Load definition list</span>
              <select
                id="saved-definition-list"
                className="control-group__input"
                defaultValue=""
                onChange={(event) => {
                  onDefinitionSelected(event.target.value)
                  event.currentTarget.value = ''
                }}
                disabled={definitionOptions.length === 0 || isDefinitionBusy}
              >
                <option value="">Select a saved definition</option>
                {definitionOptions.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="definition-panel__actions">
              <button
                type="button"
                className="action-button action-button--ghost"
                onClick={onCreateDefinition}
                disabled={!imagePath || isDefinitionBusy}
              >
                New definition
              </button>
              <button
                type="button"
                className="action-button"
                onClick={onSaveDefinition}
                disabled={isDefinitionSaveDisabled || isDefinitionBusy}
              >
                Save definition
              </button>
            </div>
          </section>
          ) : null}
          <section className="alignment-panel" aria-label="Alignment controls">
            <div className="alignment-panel__intro">
              <p className="control-guide__title">Live controls</p>
              <p className="control-guide__body">
                Click the image to focus it. Left and right arrows rotate the preview live. Up and down arrows move the guide line. Hold Shift for faster moves, or drag the guide line directly.
              </p>
            </div>
            <div className="alignment-panel__groups">
              <div className="control-cluster">
                <p className="control-cluster__title">Guide line</p>
                <label className="control-group" htmlFor="guide-line-position">
                  <span className="control-group__label">Position</span>
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
                <label className="control-group" htmlFor="guide-line-step">
                  <span className="control-group__label">Nudge step</span>
                  <input
                    id="guide-line-step"
                    className="control-group__slider"
                    type="range"
                    min="0.05"
                    max="5"
                    step="0.05"
                    value={guideLineStep}
                    onChange={(event) => onGuideLineStepChange(Number.parseFloat(event.target.value))}
                    disabled={!imagePath || isBusy}
                  />
                </label>
                <p className="control-group__value">{guideLineStep.toFixed(2)}% per key press</p>
              </div>
              <div className="control-cluster">
                <p className="control-cluster__title">Rotation</p>
                <label className="control-group" htmlFor="rotation-step">
                  <span className="control-group__label">Step size</span>
                  <input
                    id="rotation-step"
                    className="control-group__slider"
                    type="range"
                    min="0.01"
                    max="3"
                    step="0.01"
                    value={rotationStep}
                    onChange={(event) => onRotationStepChange(Number.parseFloat(event.target.value))}
                    disabled={!imagePath || isBusy}
                  />
                </label>
                <p className="control-group__value">{rotationStep.toFixed(2)} deg per key press</p>
                <div className="alignment-panel__buttons">
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => onRotateLeft()}
                    disabled={!imagePath || isBusy}
                  >
                    Rotate left
                  </button>
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => onRotateRight()}
                    disabled={!imagePath || isBusy}
                  >
                    Rotate right
                  </button>
                </div>
              </div>
            </div>
            <div className="alignment-panel__footer">
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
              {onContinueToPoints ? (
                <button
                  type="button"
                  className="action-button"
                  onClick={onContinueToPoints}
                  disabled={!canContinueToPoints || isBusy}
                  title={canContinueToPoints ? 'Continue to pin holes' : 'Save alignment first'}
                >
                  Continue to pin holes
                </button>
              ) : null}
            </div>
          </section>
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
              tabIndex={0}
              onKeyDown={handleStageKeyDown}
              onPointerMove={(event) => {
                if (isDraggingGuideLine) {
                  updateGuideLineFromPointer(event.clientY)
                }
              }}
              onPointerUp={() => setIsDraggingGuideLine(false)}
              onPointerLeave={() => setIsDraggingGuideLine(false)}
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
              <line
                className="image-stage__guide-line-hitbox"
                x1="0"
                y1={guideLineY}
                x2={layout.width}
                y2={guideLineY}
                onPointerDown={(event) => {
                  setIsDraggingGuideLine(true)
                  updateGuideLineFromPointer(event.clientY)
                }}
              />
              <line
                className="image-stage__guide-line"
                x1="0"
                y1={guideLineY}
                x2={layout.width}
                y2={guideLineY}
              />
              <circle className="image-stage__guide-handle" cx={layout.width - 20} cy={guideLineY} r="10" />
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
