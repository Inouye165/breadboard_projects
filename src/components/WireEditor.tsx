import { useMemo, useRef, useState } from 'react'
import type React from 'react'

import type { BreadboardDefinition, ConnectionPoint } from '../lib/breadboardDefinitionModel'
import {
  PROJECT_COMPONENT_KINDS,
  createProjectComponentId,
  createWireId,
  type BreadboardProject,
  type ProjectComponent,
  type ProjectComponentKind,
  type Wire,
  type WireWaypoint,
} from '../lib/breadboardProjectModel'

const WIRE_COLORS = ['#cc3333', '#1f8e4d', '#1f5fcc', '#e08a00', '#7a3fc6', '#000000']

type WireEditorProps = {
  project: BreadboardProject
  breadboard: BreadboardDefinition
  isBusy?: boolean
  status: string
  onBack: () => void
  onChange: (project: BreadboardProject) => void
}

type WireVertex = {
  x: number
  y: number
}

type DragState = {
  wireId: string
  waypointIndex: number
  position: WireVertex
}

function nextWireColor(wires: Wire[]) {
  return WIRE_COLORS[wires.length % WIRE_COLORS.length]
}

function findPoint(points: ConnectionPoint[], pointId: string) {
  return points.find((point) => point.id === pointId)
}

function getWireVertices(
  wire: Wire,
  fromPoint: ConnectionPoint,
  toPoint: ConnectionPoint,
): WireVertex[] {
  const waypoints = wire.waypoints ?? []

  return [
    { x: fromPoint.x, y: fromPoint.y },
    ...waypoints.map((waypoint) => ({ x: waypoint.x, y: waypoint.y })),
    { x: toPoint.x, y: toPoint.y },
  ]
}

function replaceWaypoints(wire: Wire, waypoints: WireWaypoint[]): Wire {
  return {
    ...wire,
    waypoints: waypoints.length === 0 ? undefined : waypoints,
  }
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
  const [dragState, setDragState] = useState<DragState | null>(null)
  const safeWidth = breadboard.imageWidth > 0 ? breadboard.imageWidth : 1
  const safeHeight = breadboard.imageHeight > 0 ? breadboard.imageHeight : 1

  if (trackedProjectId !== project.id) {
    setTrackedProjectId(project.id)
    setPendingFromPointId(null)
    setPendingRemovalWireId(null)
    setDragState(null)
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

  function getSvgCoordinates(event: { clientX: number; clientY: number }): WireVertex | null {
    const svg = svgRef.current

    if (!svg) {
      return null
    }

    const bounds = svg.getBoundingClientRect()

    if (bounds.width === 0 || bounds.height === 0) {
      return null
    }

    const relativeX = (event.clientX - bounds.left) / bounds.width
    const relativeY = (event.clientY - bounds.top) / bounds.height

    return {
      x: Math.max(0, Math.min(safeWidth, relativeX * safeWidth)),
      y: Math.max(0, Math.min(safeHeight, relativeY * safeHeight)),
    }
  }

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
    if (dragState) {
      return
    }

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

  function handleAddComponent(kind: ProjectComponentKind, label: string, description: string) {
    const trimmedLabel = label.trim()

    if (!trimmedLabel) {
      return
    }

    const trimmedDescription = description.trim()
    const newComponent: ProjectComponent = {
      id: createProjectComponentId(),
      kind,
      label: trimmedLabel,
      description: trimmedDescription ? trimmedDescription : undefined,
    }

    const nextComponents = [...(project.components ?? []), newComponent]

    onChange({
      ...project,
      components: nextComponents,
    })
  }

  function handleRemoveComponent(componentId: string) {
    const nextComponents = (project.components ?? []).filter(
      (component) => component.id !== componentId,
    )

    onChange({
      ...project,
      components: nextComponents.length === 0 ? undefined : nextComponents,
    })
  }

  function handleInsertWaypoint(wire: Wire, segmentIndex: number, position: WireVertex) {
    const waypoints = wire.waypoints ? [...wire.waypoints] : []
    waypoints.splice(segmentIndex, 0, { x: position.x, y: position.y })

    onChange({
      ...project,
      wires: project.wires.map((existingWire) =>
        existingWire.id === wire.id ? replaceWaypoints(existingWire, waypoints) : existingWire,
      ),
    })
    setPendingRemovalWireId(null)
    setPendingFromPointId(null)
  }

  function handleWaypointPointerDown(
    event: React.PointerEvent<SVGCircleElement>,
    wire: Wire,
    waypointIndex: number,
  ) {
    if (event.button !== 0) {
      return
    }

    event.stopPropagation()
    event.preventDefault()
    setPendingRemovalWireId(null)
    setPendingFromPointId(null)

    const waypoint = wire.waypoints?.[waypointIndex]

    if (!waypoint) {
      return
    }

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setDragState({
      wireId: wire.id,
      waypointIndex,
      position: { x: waypoint.x, y: waypoint.y },
    })
  }

  function handleWaypointPointerMove(event: React.PointerEvent<SVGCircleElement>) {
    if (!dragState) {
      return
    }

    const next = getSvgCoordinates(event)

    if (!next) {
      return
    }

    setDragState({ ...dragState, position: next })
  }

  function handleWaypointPointerUp(event: React.PointerEvent<SVGCircleElement>, wire: Wire) {
    if (!dragState || dragState.wireId !== wire.id) {
      return
    }

    const finalCoordinates = getSvgCoordinates(event) ?? dragState.position
    const waypoints = wire.waypoints ? [...wire.waypoints] : []

    if (!waypoints[dragState.waypointIndex]) {
      setDragState(null)
      return
    }

    waypoints[dragState.waypointIndex] = {
      x: finalCoordinates.x,
      y: finalCoordinates.y,
    }

    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setDragState(null)
    onChange({
      ...project,
      wires: project.wires.map((existingWire) =>
        existingWire.id === wire.id ? replaceWaypoints(existingWire, waypoints) : existingWire,
      ),
    })
  }

  function handleWaypointDoubleClick(
    event: React.MouseEvent<SVGCircleElement>,
    wire: Wire,
    waypointIndex: number,
  ) {
    event.stopPropagation()

    const waypoints = wire.waypoints ? [...wire.waypoints] : []
    waypoints.splice(waypointIndex, 1)

    onChange({
      ...project,
      wires: project.wires.map((existingWire) =>
        existingWire.id === wire.id ? replaceWaypoints(existingWire, waypoints) : existingWire,
      ),
    })
  }

  const radius = Math.max(6, Math.min(safeWidth, safeHeight) * 0.008)
  const strokeWidth = Math.max(3, radius * 0.6)
  const handleRadius = Math.max(5, radius * 0.85)
  const midpointRadius = Math.max(4, radius * 0.65)

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
        Click a pin hole to start a wire, then click another pin hole to finish it. Click the
        <strong> + </strong> on a wire segment to add a routing point you can drag, double-click a
        routing point to remove it, and click an existing wire twice to delete it. Wires save
        automatically.
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
              const baseVertices = getWireVertices(wire, fromPoint, toPoint)
              const vertices =
                dragState && dragState.wireId === wire.id
                  ? baseVertices.map((vertex, index) =>
                      index === dragState.waypointIndex + 1 ? dragState.position : vertex,
                    )
                  : baseVertices
              const points = vertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' ')

              return (
                <polyline
                  key={wire.id}
                  className={`wire-editor__wire${isPending ? ' wire-editor__wire--pending' : ''}`}
                  points={points}
                  fill="none"
                  stroke={wire.color ?? '#222'}
                  strokeWidth={isPending ? strokeWidth * 1.6 : strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  role="button"
                  aria-label={`Wire from ${fromPoint.label} to ${toPoint.label}${isPending ? ' (click again to delete)' : ''}`}
                  onClick={() => handleWireClick(wire.id)}
                />
              )
            })}
            {wireSegments.flatMap(({ wire, fromPoint, toPoint }) => {
              const baseVertices = getWireVertices(wire, fromPoint, toPoint)
              const vertices =
                dragState && dragState.wireId === wire.id
                  ? baseVertices.map((vertex, index) =>
                      index === dragState.waypointIndex + 1 ? dragState.position : vertex,
                    )
                  : baseVertices
              const waypointHandles = (wire.waypoints ?? []).map((waypoint, waypointIndex) => {
                const liveVertex = vertices[waypointIndex + 1] ?? waypoint
                const isDragging =
                  dragState?.wireId === wire.id && dragState.waypointIndex === waypointIndex

                return (
                  <circle
                    key={`waypoint-${wire.id}-${waypointIndex}`}
                    className={`wire-editor__waypoint${isDragging ? ' wire-editor__waypoint--dragging' : ''}`}
                    cx={liveVertex.x}
                    cy={liveVertex.y}
                    r={handleRadius}
                    role="button"
                    aria-label={`Wire ${fromPoint.label} to ${toPoint.label} routing point ${waypointIndex + 1}`}
                    onPointerDown={(event) => handleWaypointPointerDown(event, wire, waypointIndex)}
                    onPointerMove={handleWaypointPointerMove}
                    onPointerUp={(event) => handleWaypointPointerUp(event, wire, waypointIndex)}
                    onPointerCancel={(event) => handleWaypointPointerUp(event, wire, waypointIndex)}
                    onDoubleClick={(event) => handleWaypointDoubleClick(event, wire, waypointIndex)}
                  />
                )
              })

              const midpointHandles = vertices.slice(0, -1).map((start, segmentIndex) => {
                const end = vertices[segmentIndex + 1]
                const midpoint = {
                  x: (start.x + end.x) / 2,
                  y: (start.y + end.y) / 2,
                }

                return (
                  <g
                    key={`midpoint-${wire.id}-${segmentIndex}`}
                    className="wire-editor__midpoint"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleInsertWaypoint(wire, segmentIndex, midpoint)
                    }}
                  >
                    <circle
                      className="wire-editor__midpoint-bg"
                      cx={midpoint.x}
                      cy={midpoint.y}
                      r={midpointRadius}
                      role="button"
                      aria-label={`Add routing point to wire from ${fromPoint.label} to ${toPoint.label} (segment ${segmentIndex + 1})`}
                    />
                    <text
                      className="wire-editor__midpoint-symbol"
                      x={midpoint.x}
                      y={midpoint.y + midpointRadius * 0.4}
                      textAnchor="middle"
                      fontSize={midpointRadius * 1.6}
                    >
                      +
                    </text>
                  </g>
                )
              })

              return [...midpointHandles, ...waypointHandles]
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
      <ComponentsPanel
        components={project.components ?? []}
        isBusy={isBusy}
        onAdd={handleAddComponent}
        onRemove={handleRemoveComponent}
      />
    </section>
  )
}

type ComponentsPanelProps = {
  components: ProjectComponent[]
  isBusy: boolean
  onAdd: (kind: ProjectComponentKind, label: string, description: string) => void
  onRemove: (componentId: string) => void
}

function ComponentsPanel({ components, isBusy, onAdd, onRemove }: ComponentsPanelProps) {
  const [draftKind, setDraftKind] = useState<ProjectComponentKind>('resistor')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftDescription, setDraftDescription] = useState('')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!draftLabel.trim()) {
      return
    }

    onAdd(draftKind, draftLabel, draftDescription)
    setDraftLabel('')
    setDraftDescription('')
  }

  return (
    <section className="components-panel" aria-label="Project components">
      <header className="components-panel__header">
        <h2 className="components-panel__title">Components</h2>
        <p className="components-panel__hint">
          Track resistors, LEDs, and other parts you place on the breadboard.
        </p>
      </header>
      <form className="components-panel__form" onSubmit={handleSubmit}>
        <label className="control-group" htmlFor="component-kind">
          <span className="control-group__label">Type</span>
          <select
            id="component-kind"
            className="control-group__input"
            value={draftKind}
            onChange={(event) => setDraftKind(event.target.value as ProjectComponentKind)}
            disabled={isBusy}
          >
            {PROJECT_COMPONENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind.charAt(0).toUpperCase() + kind.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="control-group" htmlFor="component-label">
          <span className="control-group__label">Label</span>
          <input
            id="component-label"
            className="control-group__input"
            type="text"
            value={draftLabel}
            onChange={(event) => setDraftLabel(event.target.value)}
            placeholder="e.g. R1"
            disabled={isBusy}
          />
        </label>
        <label className="control-group" htmlFor="component-description">
          <span className="control-group__label">Description (optional)</span>
          <input
            id="component-description"
            className="control-group__input"
            type="text"
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            placeholder="e.g. 220Ω"
            disabled={isBusy}
          />
        </label>
        <button
          type="submit"
          className="action-button"
          disabled={isBusy || draftLabel.trim().length === 0}
        >
          Add component
        </button>
      </form>
      {components.length === 0 ? (
        <p className="components-panel__empty">No components added yet.</p>
      ) : (
        <ul className="components-panel__list" aria-label="Component list">
          {components.map((component) => (
            <li key={component.id} className="components-panel__item">
              <span className="components-panel__item-kind">{component.kind}</span>
              <span className="components-panel__item-label">{component.label}</span>
              {component.description ? (
                <span className="components-panel__item-description">{component.description}</span>
              ) : null}
              <button
                type="button"
                className="action-button action-button--ghost"
                onClick={() => onRemove(component.id)}
                disabled={isBusy}
                aria-label={`Remove component ${component.label}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
