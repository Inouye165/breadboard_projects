import { useMemo, useRef, useState } from 'react'

import type { BreadboardDefinition, ConnectionPoint } from '../lib/breadboardDefinitionModel'
import { createWireId, type BreadboardProject, type Wire } from '../lib/breadboardProjectModel'

const WIRE_COLORS = ['#cc3333', '#1f8e4d', '#1f5fcc', '#e08a00', '#7a3fc6', '#000000']

type WireEditorProps = {
  project: BreadboardProject
  breadboard: BreadboardDefinition
  isBusy?: boolean
  status: string
  onBack: () => void
  onChange: (project: BreadboardProject) => void
}

function nextWireColor(wires: Wire[]) {
  return WIRE_COLORS[wires.length % WIRE_COLORS.length]
}

function findPoint(points: ConnectionPoint[], pointId: string) {
  return points.find((point) => point.id === pointId)
}

export function WireEditor({
  project,
  breadboard,
  isBusy = false,
  status,
  onBack,
  onChange,
}: WireEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pendingFromPointId, setPendingFromPointId] = useState<string | null>(null)
  const [pendingRemovalWireId, setPendingRemovalWireId] = useState<string | null>(null)
  const [trackedProjectId, setTrackedProjectId] = useState(project.id)
  const safeWidth = breadboard.imageWidth > 0 ? breadboard.imageWidth : 1
  const safeHeight = breadboard.imageHeight > 0 ? breadboard.imageHeight : 1

  if (trackedProjectId !== project.id) {
    setTrackedProjectId(project.id)
    setPendingFromPointId(null)
    setPendingRemovalWireId(null)
  }

  const wireSegments = useMemo(() => {
    return project.wires
      .map((wire) => {
        const fromPoint = findPoint(breadboard.points, wire.fromPointId)
        const toPoint = findPoint(breadboard.points, wire.toPointId)

        if (!fromPoint || !toPoint) {
          return null
        }

        return { wire, fromPoint, toPoint }
      })
      .filter((segment): segment is { wire: Wire; fromPoint: ConnectionPoint; toPoint: ConnectionPoint } => segment !== null)
  }, [project.wires, breadboard.points])

  function handlePinClick(pointId: string) {
    setPendingRemovalWireId(null)

    if (pendingFromPointId === null) {
      setPendingFromPointId(pointId)
      return
    }

    if (pendingFromPointId === pointId) {
      setPendingFromPointId(null)
      return
    }

    const newWire: Wire = {
      id: createWireId(),
      fromPointId: pendingFromPointId,
      toPointId: pointId,
      color: nextWireColor(project.wires),
    }

    onChange({
      ...project,
      wires: [...project.wires, newWire],
    })

    setPendingFromPointId(null)
  }

  function handleWireClick(wireId: string) {
    setPendingFromPointId(null)

    if (pendingRemovalWireId === wireId) {
      onChange({
        ...project,
        wires: project.wires.filter((wire) => wire.id !== wireId),
      })
      setPendingRemovalWireId(null)
      return
    }

    setPendingRemovalWireId(wireId)
  }

  function handleClearAll() {
    if (project.wires.length === 0) {
      return
    }

    onChange({
      ...project,
      wires: [],
    })
    setPendingFromPointId(null)
    setPendingRemovalWireId(null)
  }

  function handleNameChange(name: string) {
    onChange({
      ...project,
      name,
    })
  }

  const radius = Math.max(6, Math.min(safeWidth, safeHeight) * 0.008)
  const strokeWidth = Math.max(3, radius * 0.6)

  return (
    <section className="wire-editor" aria-label="Wire breadboard">
      <header className="pin-editor__header">
        <div className="pin-editor__title-block">
          <p className="image-workspace__eyebrow">Project mode - wire two points</p>
          <p className="image-workspace__status">{status}</p>
        </div>
        <div className="pin-editor__controls">
          <label className="control-group" htmlFor="wire-editor-project-name">
            <span className="control-group__label">Project name</span>
            <input
              id="wire-editor-project-name"
              className="control-group__input"
              type="text"
              value={project.name}
              onChange={(event) => handleNameChange(event.target.value)}
              disabled={isBusy}
              placeholder="Untitled project"
            />
          </label>
          <p className="pin-editor__count" aria-live="polite">
            {project.wires.length} wire{project.wires.length === 1 ? '' : 's'}
          </p>
          <div className="pin-editor__actions">
            <button
              type="button"
              className="action-button action-button--ghost"
              onClick={onBack}
              disabled={isBusy}
            >
              Back to projects
            </button>
            <button
              type="button"
              className="action-button action-button--ghost"
              onClick={handleClearAll}
              disabled={isBusy || project.wires.length === 0}
            >
              Clear all wires
            </button>
          </div>
        </div>
      </header>
      <p className="pin-editor__hint">
        Click a pin hole to start a wire, then click another pin hole to finish it. Click an existing wire once to select it, then click again to delete it. Wires are saved automatically.
      </p>
      <section className="image-workspace__stage-shell">
        <div className="image-stage" aria-label="Breadboard wiring stage">
          <svg
            ref={svgRef}
            className="image-stage__svg pin-editor__svg wire-editor__svg"
            viewBox={`0 0 ${safeWidth} ${safeHeight}`}
            role="img"
            aria-label={`Breadboard wiring canvas with ${project.wires.length} wires`}
          >
            <image
              href={breadboard.imagePath}
              width={safeWidth}
              height={safeHeight}
              preserveAspectRatio="none"
            />
            {wireSegments.map(({ wire, fromPoint, toPoint }) => {
              const isPending = pendingRemovalWireId === wire.id

              return (
                <line
                  key={wire.id}
                  className={`wire-editor__wire${isPending ? ' wire-editor__wire--pending' : ''}`}
                  x1={fromPoint.x}
                  y1={fromPoint.y}
                  x2={toPoint.x}
                  y2={toPoint.y}
                  stroke={wire.color ?? '#222'}
                  strokeWidth={isPending ? strokeWidth * 1.6 : strokeWidth}
                  strokeLinecap="round"
                  role="button"
                  aria-label={`Wire from ${fromPoint.label} to ${toPoint.label}${isPending ? ' (click again to delete)' : ''}`}
                  onClick={() => handleWireClick(wire.id)}
                />
              )
            })}
            {breadboard.points.map((point) => {
              const isPendingFrom = pendingFromPointId === point.id

              return (
                <g key={point.id} className="pin-editor__pin-group">
                  <circle
                    data-pin-point-id={point.id}
                    className={`pin-editor__pin wire-editor__pin${isPendingFrom ? ' wire-editor__pin--pending-from' : ''}`}
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    role="button"
                    aria-label={`Pin hole ${point.label}${isPendingFrom ? ' (selected as wire start)' : ''}`}
                    onClick={() => handlePinClick(point.id)}
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
