import { useRef, useState } from 'react'

import type { BreadboardDefinition, ConnectionPoint } from '../lib/breadboardDefinitionModel'

type PinPointEditorProps = {
  definition: BreadboardDefinition
  imagePath: string
  imageWidth: number
  imageHeight: number
  isBusy?: boolean
  status: string
  onBack: () => void
  onChange: (definition: BreadboardDefinition) => void
  onSaveAndFinish: () => void
}

function createPointId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `pin-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

function nextPointLabel(points: ConnectionPoint[]) {
  const numericLabels = points
    .map((point) => Number.parseInt(point.label, 10))
    .filter((value) => Number.isFinite(value))
  const nextNumber = numericLabels.length === 0 ? 1 : Math.max(...numericLabels) + 1

  return String(nextNumber)
}

export function PinPointEditor({
  definition,
  imagePath,
  imageWidth,
  imageHeight,
  isBusy = false,
  status,
  onBack,
  onChange,
  onSaveAndFinish,
}: PinPointEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null)
  const [trackedDefinitionId, setTrackedDefinitionId] = useState(definition.id)
  const safeWidth = imageWidth > 0 ? imageWidth : 1
  const safeHeight = imageHeight > 0 ? imageHeight : 1

  if (trackedDefinitionId !== definition.id) {
    setTrackedDefinitionId(definition.id)
    setPendingRemovalId(null)
  }

  function getStageCoordinates(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current

    if (!svg) {
      return null
    }

    const rect = svg.getBoundingClientRect()

    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    const xRatio = (event.clientX - rect.left) / rect.width
    const yRatio = (event.clientY - rect.top) / rect.height

    return {
      x: Math.min(safeWidth, Math.max(0, xRatio * safeWidth)),
      y: Math.min(safeHeight, Math.max(0, yRatio * safeHeight)),
    }
  }

  function handleStagePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) {
      return
    }

    const target = event.target as SVGElement | null

    if (target?.dataset?.pinPointId) {
      // Pin click handled separately.
      return
    }

    const coordinates = getStageCoordinates(event)

    if (!coordinates) {
      return
    }

    const newPoint: ConnectionPoint = {
      id: createPointId(),
      label: nextPointLabel(definition.points),
      x: coordinates.x,
      y: coordinates.y,
      kind: 'breadboard-hole',
      snapSource: 'manual',
    }

    onChange({
      ...definition,
      points: [...definition.points, newPoint],
    })
  }

  function handlePinClick(pointId: string) {
    if (pendingRemovalId === pointId) {
      onChange({
        ...definition,
        points: definition.points.filter((point) => point.id !== pointId),
      })
      setPendingRemovalId(null)
      return
    }

    setPendingRemovalId(pointId)
  }

  function handleClearAll() {
    if (definition.points.length === 0) {
      return
    }

    onChange({
      ...definition,
      points: [],
    })
  }

  function handleNameChange(name: string) {
    onChange({
      ...definition,
      name,
    })
  }

  return (
    <section className="pin-editor" aria-label="Add pin holes">
      <header className="pin-editor__header">
        <div className="pin-editor__title-block">
          <p className="image-workspace__eyebrow">Step 2 of 2 - Add pin holes</p>
          <p className="image-workspace__status">{status}</p>
        </div>
        <div className="pin-editor__controls">
          <label className="control-group" htmlFor="pin-editor-definition-name">
            <span className="control-group__label">Breadboard name</span>
            <input
              id="pin-editor-definition-name"
              className="control-group__input"
              type="text"
              value={definition.name}
              onChange={(event) => handleNameChange(event.target.value)}
              disabled={isBusy}
              placeholder="Untitled breadboard"
            />
          </label>
          <p className="pin-editor__count" aria-live="polite">
            {definition.points.length} pin hole{definition.points.length === 1 ? '' : 's'} placed
          </p>
          <div className="pin-editor__actions">
            <button
              type="button"
              className="action-button action-button--ghost"
              onClick={onBack}
              disabled={isBusy}
            >
              Back to alignment
            </button>
            <button
              type="button"
              className="action-button action-button--ghost"
              onClick={handleClearAll}
              disabled={isBusy || definition.points.length === 0}
            >
              Clear all
            </button>
            <button
              type="button"
              className="action-button"
              onClick={onSaveAndFinish}
              disabled={isBusy}
            >
              Save breadboard
            </button>
          </div>
        </div>
      </header>
      <p className="pin-editor__hint">
        Click the image to drop a pin hole. Click an existing pin once to select it, then click again to remove it. These points will be selectable later when wiring the breadboard.
      </p>
      <section className="image-workspace__stage-shell">
        <div className="image-stage" aria-label="Breadboard pin hole stage">
          <svg
            ref={svgRef}
            className="image-stage__svg pin-editor__svg"
            viewBox={`0 0 ${safeWidth} ${safeHeight}`}
            role="img"
            aria-label={`Breadboard pin hole canvas with ${definition.points.length} pins`}
            onPointerDown={handleStagePointerDown}
          >
            <image
              href={imagePath}
              width={safeWidth}
              height={safeHeight}
              preserveAspectRatio="none"
            />
            {definition.points.map((point) => {
              const isPending = pendingRemovalId === point.id
              const radius = Math.max(6, Math.min(safeWidth, safeHeight) * 0.008)

              return (
                <g key={point.id} className="pin-editor__pin-group">
                  <circle
                    data-pin-point-id={point.id}
                    className={`pin-editor__pin${isPending ? ' pin-editor__pin--pending' : ''}`}
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    role="button"
                    aria-label={`Pin hole ${point.label}${isPending ? ' (click again to remove)' : ''}`}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      handlePinClick(point.id)
                    }}
                  />
                  <text
                    className="pin-editor__pin-label"
                    x={point.x}
                    y={point.y - radius - 4}
                    textAnchor="middle"
                  >
                    {point.label}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </section>
    </section>
  )
}
