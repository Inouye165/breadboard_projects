import { useMemo, useRef, useState } from 'react'
import type React from 'react'

import type { BreadboardDefinition, ConnectionPoint } from '../lib/breadboardDefinitionModel'
import {
  PROJECT_COMPONENT_KINDS,
  createProjectComponentId,
  createProjectModuleInstanceId,
  createWireId,
  type BreadboardProject,
  type ProjectComponent,
  type ProjectComponentKind,
  type ProjectModuleInstance,
  type Wire,
  type WireWaypoint,
} from '../lib/breadboardProjectModel'
import { estimatePixelsPerMm } from '../lib/breadboardScale'
import {
  PART_CATEGORIES,
  type LibraryPartDefinition,
  type PartCategory,
  type PhysicalPoint,
} from '../lib/partLibraryModel'

const WIRE_COLORS = ['#cc3333', '#1f8e4d', '#1f5fcc', '#e08a00', '#7a3fc6', '#000000']

/** Snap threshold in millimeters. One standard 0.1" pin pitch = 2.54 mm. */
const SNAP_THRESHOLD_MM = 1.3

type WireEditorProps = {
  project: BreadboardProject
  breadboard: BreadboardDefinition
  libraryParts?: LibraryPartDefinition[]
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

type ModuleDragState = {
  moduleId: string
  pointerOffsetX: number
  pointerOffsetY: number
  /** Raw (unsnapped) center position following the pointer. */
  position: WireVertex
  /** Snapped center to show in the SVG, or null if no snap in range. */
  snappedPosition: WireVertex | null
  /** Breadboard pin being targeted for snap, or null. */
  snapPinId: string | null
}

function nextWireColor(wires: Wire[]) {
  return WIRE_COLORS[wires.length % WIRE_COLORS.length]
}

/** Physical points that can snap to breadboard holes (through-hole header pins). */
function isSnapPoint(pt: PhysicalPoint) {
  return pt.throughHole === true || pt.kind === 'header-pin'
}

type SnapResult = {
  /** Snapped module center, or the original candidate if no snap found. */
  center: WireVertex
  /** Breadboard point id that was snapped to, or null. */
  snapPinId: string | null
}

/**
 * Find the best snap for a module being placed at `candidateCenter`.
 * Iterates all snap-eligible physical points of the part against every
 * breadboard connection point and, if any pair is within the threshold,
 * shifts the whole module center so that physical point lands on the
 * breadboard pin exactly. Respects the current rotation of the instance.
 */
function computeSnapResult(
  candidateCenter: WireVertex,
  rotationDeg: number,
  part: LibraryPartDefinition,
  pixelsPerMm: number,
  breadboardPoints: ConnectionPoint[],
  snapThresholdPx: number,
): SnapResult {
  const widthPx = part.dimensions.widthMm * pixelsPerMm
  const heightPx = part.dimensions.heightMm * pixelsPerMm
  const angleRad = (rotationDeg * Math.PI) / 180
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)
  const snapPoints = part.physicalPoints.filter(isSnapPoint)

  let bestDistSq = snapThresholdPx * snapThresholdPx
  let bestCenter: WireVertex | null = null
  let bestPinId: string | null = null

  for (const physPt of snapPoints) {
    // Offset from module center in pixel space (pre-rotation)
    const dx = physPt.xMm * pixelsPerMm - widthPx / 2
    const dy = physPt.yMm * pixelsPerMm - heightPx / 2
    // Apply rotation around module center
    const rotDx = dx * cosA - dy * sinA
    const rotDy = dx * sinA + dy * cosA
    // Absolute canvas position of this physical point
    const absX = candidateCenter.x + rotDx
    const absY = candidateCenter.y + rotDy

    for (const boardPt of breadboardPoints) {
      const distSq = (boardPt.x - absX) ** 2 + (boardPt.y - absY) ** 2

      if (distSq < bestDistSq) {
        bestDistSq = distSq
        bestPinId = boardPt.id
        bestCenter = { x: boardPt.x - rotDx, y: boardPt.y - rotDy }
      }
    }
  }

  return { center: bestCenter ?? candidateCenter, snapPinId: bestPinId }
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
  libraryParts = [],
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
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [moduleDragState, setModuleDragState] = useState<ModuleDragState | null>(null)
  const safeWidth = breadboard.imageWidth > 0 ? breadboard.imageWidth : 1
  const safeHeight = breadboard.imageHeight > 0 ? breadboard.imageHeight : 1
  const pixelsPerMm = useMemo(() => estimatePixelsPerMm(breadboard), [breadboard])
  const libraryPartIndex = useMemo(() => {
    const map = new Map<string, LibraryPartDefinition>()
    for (const part of libraryParts) {
      map.set(part.id, part)
    }
    return map
  }, [libraryParts])
  const modules = useMemo(() => project.modules ?? [], [project.modules])

  if (trackedProjectId !== project.id) {
    setTrackedProjectId(project.id)
    setPendingFromPointId(null)
    setPendingRemovalWireId(null)
    setDragState(null)
    setSelectedModuleId(null)
    setModuleDragState(null)
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

  function updateModule(
    moduleId: string,
    transform: (instance: ProjectModuleInstance) => ProjectModuleInstance,
  ) {
    const nextModules = (project.modules ?? []).map((instance) =>
      instance.id === moduleId ? transform(instance) : instance,
    )

    onChange({
      ...project,
      modules: nextModules.length === 0 ? undefined : nextModules,
    })
  }

  function handleAddModule(libraryPartId: string) {
    const part = libraryPartIndex.get(libraryPartId)

    if (!part) {
      return
    }

    const newModule: ProjectModuleInstance = {
      id: createProjectModuleInstanceId(),
      libraryPartId,
      viewId: part.imageViews[0]?.id,
      centerX: safeWidth / 2,
      centerY: safeHeight / 2,
      rotationDeg: 0,
    }

    onChange({
      ...project,
      modules: [...(project.modules ?? []), newModule],
    })
    setSelectedModuleId(newModule.id)
  }

  function handleRemoveModule(moduleId: string) {
    const nextModules = (project.modules ?? []).filter((instance) => instance.id !== moduleId)

    onChange({
      ...project,
      modules: nextModules.length === 0 ? undefined : nextModules,
    })

    if (selectedModuleId === moduleId) {
      setSelectedModuleId(null)
    }
  }

  function handleRotateModule(moduleId: string, deltaDeg: number) {
    updateModule(moduleId, (instance) => ({
      ...instance,
      rotationDeg: ((instance.rotationDeg + deltaDeg) % 360 + 360) % 360,
    }))
  }

  function handleSetModuleRotation(moduleId: string, rotationDeg: number) {
    updateModule(moduleId, (instance) => ({
      ...instance,
      rotationDeg: ((rotationDeg % 360) + 360) % 360,
    }))
  }

  function handleAlignModuleToPin(moduleId: string) {
    const instance = (project.modules ?? []).find((entry) => entry.id === moduleId)

    if (!instance || breadboard.points.length === 0) {
      return
    }

    const part = libraryPartIndex.get(instance.libraryPartId)

    if (!part) {
      return
    }

    // Use a very large threshold so align-to-pin always finds the nearest pair
    const largeThresholdPx = Math.max(safeWidth, safeHeight)
    const { center } = computeSnapResult(
      { x: instance.centerX, y: instance.centerY },
      instance.rotationDeg,
      part,
      pixelsPerMm,
      breadboard.points,
      largeThresholdPx,
    )

    updateModule(moduleId, (entry) => ({
      ...entry,
      centerX: Math.max(0, Math.min(safeWidth, center.x)),
      centerY: Math.max(0, Math.min(safeHeight, center.y)),
    }))
  }

  function handleModulePointerDown(
    event: React.PointerEvent<SVGGElement>,
    instance: ProjectModuleInstance,
  ) {
    if (event.button !== 0) {
      return
    }

    event.stopPropagation()
    setSelectedModuleId(instance.id)
    setPendingFromPointId(null)
    setPendingRemovalWireId(null)

    const coords = getSvgCoordinates(event)

    if (!coords) {
      return
    }

    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    setModuleDragState({
      moduleId: instance.id,
      pointerOffsetX: coords.x - instance.centerX,
      pointerOffsetY: coords.y - instance.centerY,
      position: { x: instance.centerX, y: instance.centerY },
      snappedPosition: null,
      snapPinId: null,
    })
  }

  function handleModulePointerMove(event: React.PointerEvent<SVGGElement>) {
    if (!moduleDragState) {
      return
    }

    const coords = getSvgCoordinates(event)

    if (!coords) {
      return
    }

    const rawPosition = {
      x: coords.x - moduleDragState.pointerOffsetX,
      y: coords.y - moduleDragState.pointerOffsetY,
    }
    const instance = (project.modules ?? []).find((entry) => entry.id === moduleDragState.moduleId)
    const part = instance ? libraryPartIndex.get(instance.libraryPartId) : undefined

    if (part && instance) {
      const { center: snappedPosition, snapPinId } = computeSnapResult(
        rawPosition,
        instance.rotationDeg,
        part,
        pixelsPerMm,
        breadboard.points,
        SNAP_THRESHOLD_MM * pixelsPerMm,
      )
      setModuleDragState({
        ...moduleDragState,
        position: rawPosition,
        snappedPosition: snapPinId ? snappedPosition : null,
        snapPinId,
      })
    } else {
      setModuleDragState({
        ...moduleDragState,
        position: rawPosition,
        snappedPosition: null,
        snapPinId: null,
      })
    }
  }

  function handleModulePointerUp(event: React.PointerEvent<SVGGElement>) {
    if (!moduleDragState) {
      return
    }

    const coords = getSvgCoordinates(event)
    const rawPosition = coords
      ? { x: coords.x - moduleDragState.pointerOffsetX, y: coords.y - moduleDragState.pointerOffsetY }
      : moduleDragState.position
    const moduleId = moduleDragState.moduleId

    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setModuleDragState(null)
    updateModule(moduleId, (instance) => {
      const part = libraryPartIndex.get(instance.libraryPartId)
      const { center } = part
        ? computeSnapResult(rawPosition, instance.rotationDeg, part, pixelsPerMm, breadboard.points, SNAP_THRESHOLD_MM * pixelsPerMm)
        : { center: rawPosition }

      return {
        ...instance,
        centerX: Math.max(0, Math.min(safeWidth, center.x)),
        centerY: Math.max(0, Math.min(safeHeight, center.y)),
      }
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
            {modules.map((instance) => {
              const part = libraryPartIndex.get(instance.libraryPartId)

              if (!part) {
                return null
              }

              const view =
                part.imageViews.find((entry) => entry.id === instance.viewId) ??
                part.imageViews[0]
              const widthPx = part.dimensions.widthMm * pixelsPerMm
              const heightPx = part.dimensions.heightMm * pixelsPerMm

              if (widthPx <= 0 || heightPx <= 0) {
                return null
              }

              const isDragging = moduleDragState?.moduleId === instance.id
              const rawCenter = isDragging && moduleDragState ? moduleDragState.position : { x: instance.centerX, y: instance.centerY }
              // During drag, show the snapped position if a snap is in range
              const center = isDragging && moduleDragState?.snappedPosition
                ? moduleDragState.snappedPosition
                : rawCenter
              const isSelected = selectedModuleId === instance.id
              const isSnapping = isDragging && moduleDragState?.snapPinId !== null

              return (
                <g
                  key={instance.id}
                  className={`wire-editor__module${isSelected ? ' wire-editor__module--selected' : ''}${isSnapping ? ' wire-editor__module--snapping' : ''}`}
                  data-module-id={instance.id}
                  transform={`rotate(${instance.rotationDeg} ${center.x} ${center.y})`}
                  onPointerDown={(event) => handleModulePointerDown(event, instance)}
                  onPointerMove={handleModulePointerMove}
                  onPointerUp={handleModulePointerUp}
                  onPointerCancel={handleModulePointerUp}
                  role="button"
                  aria-label={`Module ${part.name} (${part.category})`}
                  style={{ cursor: 'move' }}
                >
                  {view ? (
                    <image
                      href={view.imagePath}
                      x={center.x - widthPx / 2}
                      y={center.y - heightPx / 2}
                      width={widthPx}
                      height={heightPx}
                      preserveAspectRatio="none"
                    />
                  ) : null}
                  <rect
                    x={center.x - widthPx / 2}
                    y={center.y - heightPx / 2}
                    width={widthPx}
                    height={heightPx}
                    fill="transparent"
                    stroke={isSnapping ? '#1f8e4d' : isSelected ? '#1f5fcc' : '#444'}
                    strokeWidth={isSnapping ? 3.5 : isSelected ? 3 : 1.5}
                    strokeDasharray={isSelected || isSnapping ? undefined : '4 3'}
                  />
                </g>
              )
            })}
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
              const isSnapTarget = moduleDragState?.snapPinId === point.id

              return (
                <g key={point.id} className="pin-editor__pin-group">
                  {isSnapTarget ? (
                    <circle
                      className="wire-editor__snap-target"
                      cx={point.x}
                      cy={point.y}
                      r={radius * 2.2}
                      fill="none"
                      stroke="#1f8e4d"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                  ) : null}
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
      <ModulesPanel
        libraryParts={libraryParts}
        modules={modules}
        selectedModuleId={selectedModuleId}
        isBusy={isBusy}
        onSelect={setSelectedModuleId}
        onAdd={handleAddModule}
        onRemove={handleRemoveModule}
        onRotate={handleRotateModule}
        onSetRotation={handleSetModuleRotation}
        onAlignToPin={handleAlignModuleToPin}
      />
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

type ModulesPanelProps = {
  libraryParts: LibraryPartDefinition[]
  modules: ProjectModuleInstance[]
  selectedModuleId: string | null
  isBusy: boolean
  onSelect: (moduleId: string | null) => void
  onAdd: (libraryPartId: string) => void
  onRemove: (moduleId: string) => void
  onRotate: (moduleId: string, deltaDeg: number) => void
  onSetRotation: (moduleId: string, rotationDeg: number) => void
  onAlignToPin: (moduleId: string) => void
}

function ModulesPanel({
  libraryParts,
  modules,
  selectedModuleId,
  isBusy,
  onSelect,
  onAdd,
  onRemove,
  onRotate,
  onSetRotation,
  onAlignToPin,
}: ModulesPanelProps) {
  const placeableParts = useMemo(
    () => libraryParts.filter((part) => part.dimensions.widthMm > 0 && part.dimensions.heightMm > 0),
    [libraryParts],
  )
  const availableCategories = useMemo(() => {
    const present = new Set(placeableParts.map((part) => part.category))
    return PART_CATEGORIES.filter((category) => present.has(category))
  }, [placeableParts])
  const [draftCategory, setDraftCategory] = useState<PartCategory | ''>('')
  const [draftPartId, setDraftPartId] = useState<string>('')

  const effectiveCategory: PartCategory | '' =
    draftCategory && availableCategories.includes(draftCategory)
      ? draftCategory
      : (availableCategories[0] ?? '')

  const partsInCategory = useMemo(() => {
    if (!effectiveCategory) {
      return [] as LibraryPartDefinition[]
    }
    return placeableParts.filter((part) => part.category === effectiveCategory)
  }, [effectiveCategory, placeableParts])

  const partIndex = useMemo(() => {
    const map = new Map<string, LibraryPartDefinition>()
    for (const part of libraryParts) {
      map.set(part.id, part)
    }
    return map
  }, [libraryParts])

  const effectivePartId =
    partsInCategory.find((part) => part.id === draftPartId)?.id ?? partsInCategory[0]?.id ?? ''

  function handleAdd() {
    if (!effectivePartId) {
      return
    }
    onAdd(effectivePartId)
  }

  return (
    <section className="components-panel modules-panel" aria-label="Project modules">
      <header className="components-panel__header">
        <h2 className="components-panel__title">Modules</h2>
        <p className="components-panel__hint">
          Place sensors, microcontrollers, and other library modules. Drag to position, rotate to
          fit, and align to the nearest pin hole. All modules render at the breadboard&apos;s
          physical scale.
        </p>
      </header>
      {placeableParts.length === 0 ? (
        <p className="components-panel__empty">
          No library modules with image + dimensions yet. Open the Library tab to create one.
        </p>
      ) : (
        <div className="components-panel__form" role="group" aria-label="Add module">
          <label className="control-group" htmlFor="module-category">
            <span className="control-group__label">Family</span>
            <select
              id="module-category"
              className="control-group__input"
              value={effectiveCategory}
              onChange={(event) => {
                setDraftCategory(event.target.value as PartCategory)
                setDraftPartId('')
              }}
              disabled={isBusy}
            >
              {availableCategories.map((category) => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="control-group" htmlFor="module-part">
            <span className="control-group__label">Module</span>
            <select
              id="module-part"
              className="control-group__input"
              value={effectivePartId}
              onChange={(event) => setDraftPartId(event.target.value)}
              disabled={isBusy || partsInCategory.length === 0}
            >
              {partsInCategory.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="action-button"
            onClick={handleAdd}
            disabled={isBusy || !effectivePartId}
          >
            Add module
          </button>
        </div>
      )}
      {modules.length === 0 ? (
        <p className="components-panel__empty">No modules placed yet.</p>
      ) : (
        <ul className="components-panel__list" aria-label="Placed modules">
          {modules.map((instance) => {
            const part = partIndex.get(instance.libraryPartId)
            const isSelected = selectedModuleId === instance.id
            const displayName = part?.name ?? 'Unknown module'

            return (
              <li
                key={instance.id}
                className={`components-panel__item${isSelected ? ' components-panel__item--selected' : ''}`}
              >
                <button
                  type="button"
                  className="action-button action-button--ghost"
                  onClick={() => onSelect(isSelected ? null : instance.id)}
                  aria-pressed={isSelected}
                  aria-label={`${isSelected ? 'Deselect' : 'Select'} ${displayName}`}
                >
                  {isSelected ? 'Selected' : 'Select'}
                </button>
                <span className="components-panel__item-kind">{part?.category ?? 'module'}</span>
                <span className="components-panel__item-label">{displayName}</span>
                <span className="components-panel__item-description">
                  {Math.round(instance.rotationDeg)}°
                </span>
                <button
                  type="button"
                  className="action-button action-button--ghost"
                  onClick={() => onRotate(instance.id, -90)}
                  disabled={isBusy}
                  aria-label={`Rotate ${displayName} counter-clockwise 90 degrees`}
                >
                  ⟲ 90°
                </button>
                <button
                  type="button"
                  className="action-button action-button--ghost"
                  onClick={() => onRotate(instance.id, 90)}
                  disabled={isBusy}
                  aria-label={`Rotate ${displayName} clockwise 90 degrees`}
                >
                  ⟳ 90°
                </button>
                <label className="control-group" htmlFor={`module-rotation-${instance.id}`}>
                  <span className="control-group__label">Rotate</span>
                  <input
                    id={`module-rotation-${instance.id}`}
                    className="control-group__input"
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={Math.round(instance.rotationDeg)}
                    onChange={(event) =>
                      onSetRotation(instance.id, Number(event.target.value))
                    }
                    disabled={isBusy}
                  />
                </label>
                <button
                  type="button"
                  className="action-button action-button--ghost"
                  onClick={() => onAlignToPin(instance.id)}
                  disabled={isBusy}
                  aria-label={`Align ${displayName} to nearest pin`}
                >
                  Align to pin
                </button>
                <button
                  type="button"
                  className="action-button action-button--ghost"
                  onClick={() => onRemove(instance.id)}
                  disabled={isBusy}
                  aria-label={`Remove ${displayName}`}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
