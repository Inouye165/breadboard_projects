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
  ALIGNMENT_THRESHOLD_MM,
  computeAlignedBreadboardPinIds,
  computeCoveredBreadboardPinIds,
  computeElectricalGroups,
  computeElectricallyConnectedPinIds,
  getPhysicalPointModuleOffsetPx,
  getViewForPoint,
} from '../lib/modulePinAlignment'
import {
  PART_CATEGORIES,
  type LibraryPartDefinition,
  type PartCategory,
  type PhysicalPoint,
} from '../lib/partLibraryModel'
import { GeneratedPassiveGraphic } from './GeneratedPassiveSvg'

/** Distance between the two leads of a generated passive part, in millimeters. */
function getPassiveLeadSpacingMm(part: LibraryPartDefinition): number {
  const leads = part.physicalPoints
  if (leads.length < 2) return 0
  const dx = leads[0].xMm - leads[1].xMm
  const dy = leads[0].yMm - leads[1].yMm
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * The acceptable range of pin-to-pin distance (in mm) for placing a generated
 * passive part. The minimum is the rigid body length — the part can't be
 * compressed below that. The maximum reflects how far the leads can be
 * straightened or bent without becoming impractical. Leads can be cut to fit,
 * so the user is encouraged to pick the shortest pair within the range.
 */
function getPassiveLeadDistanceRangeMm(part: LibraryPartDefinition): {
  minMm: number
  maxMm: number
  rigid: boolean
} {
  const natural = getPassiveLeadSpacingMm(part)
  const spec = part.passive
  if (!spec) {
    return { minMm: natural, maxMm: natural, rigid: true }
  }
  if (spec.passiveType === 'resistor') {
    const r = spec.physical
    if (r.mounting === 'smd-chip') {
      return { minMm: natural, maxMm: natural, rigid: true }
    }
    // Axial / ceramic-power: leads can be straightened up to bodyLength + 2 * leadLength
    // and bent inward only as far as the body itself.
    const body = Math.max(r.bodyLengthMm, 0.1)
    const lead = 'leadLengthMm' in r ? r.leadLengthMm : 25
    return { minMm: body + 0.5, maxMm: body + 2 * lead, rigid: false }
  }
  // Capacitor
  const c = spec.physical
  if (c.mounting === 'smd') {
    return { minMm: natural, maxMm: natural, rigid: true }
  }
  if (c.mounting === 'through-hole-axial') {
    const body = Math.max(c.bodyLengthMm, 0.1)
    const lead = c.leadLengthMm
    return { minMm: body + 0.5, maxMm: body + 2 * lead, rigid: false }
  }
  // Radial / ceramic-disc: rigid body footprint with bendable leads.
  const lead = c.leadLengthMm
  return {
    minMm: Math.max(natural - lead * 0.6, 0.5),
    maxMm: natural + lead * 1.2,
    rigid: false,
  }
}

const WIRE_COLORS = ['#cc3333', '#1f8e4d', '#1f5fcc', '#e08a00', '#7a3fc6', '#000000']

/** Parse a #rgb or #rrggbb hex color into [r,g,b] (0-255). Returns null for unknown formats. */
function parseHexColor(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) {
    return null
  }
  let value = m[1]
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('')
  }
  const num = parseInt(value, 16)
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Mix `color` toward black by `amount` in [0,1]. */
function shadeDarken(color: string, amount: number): string {
  const rgb = parseHexColor(color)
  if (!rgb) {
    return color
  }
  const k = 1 - amount
  return rgbToHex(rgb[0] * k, rgb[1] * k, rgb[2] * k)
}

/** Mix `color` toward white by `amount` in [0,1]. */
function shadeLighten(color: string, amount: number): string {
  const rgb = parseHexColor(color)
  if (!rgb) {
    return color
  }
  return rgbToHex(
    rgb[0] + (255 - rgb[0]) * amount,
    rgb[1] + (255 - rgb[1]) * amount,
    rgb[2] + (255 - rgb[2]) * amount,
  )
}

const RAIL_COLORS = [
  '#1f5fcc',
  '#cc3333',
  '#1f8e4d',
  '#e08a00',
  '#7a3fc6',
  '#0a8a8a',
  '#b8338a',
  '#5a6f00',
]

function railColorFor(groupKey: string) {
  let hash = 0
  for (let index = 0; index < groupKey.length; index += 1) {
    hash = (hash * 31 + groupKey.charCodeAt(index)) >>> 0
  }
  return RAIL_COLORS[hash % RAIL_COLORS.length]
}

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
  onCreatePassive?: () => void
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

/**
 * Active drag of a single contact endpoint of a placed generated-passive
 * module. The opposite endpoint stays anchored at its original pin, the body
 * remains at its native size, and the leads on both sides recompute so the
 * body stays centred between the two contacts.
 */
type PassiveEndpointDragState = {
  moduleId: string
  /** Anchor endpoint (world SVG coords) — does not move during the drag. */
  anchor: WireVertex
  /** Current draggable endpoint position (world SVG coords). */
  draggedPos: WireVertex
  /** Pin currently snapped to (highlighted), or null if free-floating. */
  snapPinId: string | null
  /** True if the resulting body+leads geometry is achievable. */
  valid: boolean
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
  const angleRad = (rotationDeg * Math.PI) / 180
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)
  const snapPoints = part.physicalPoints.filter(isSnapPoint)

  let bestDistSq = snapThresholdPx * snapThresholdPx
  let bestCenter: WireVertex | null = null
  let bestPinId: string | null = null

  for (const physPt of snapPoints) {
    const { dx, dy } = getPhysicalPointModuleOffsetPx(physPt, part, pixelsPerMm)
    const rotDx = dx * cosA - dy * sinA
    const rotDy = dx * sinA + dy * cosA
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
  onCreatePassive,
}: WireEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pendingFromPointId, setPendingFromPointId] = useState<string | null>(null)
  const [pendingRemovalWireId, setPendingRemovalWireId] = useState<string | null>(null)
  const [trackedProjectId, setTrackedProjectId] = useState(project.id)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [moduleDragState, setModuleDragState] = useState<ModuleDragState | null>(null)
  const [passiveEndpointDrag, setPassiveEndpointDrag] = useState<PassiveEndpointDragState | null>(null)
  const [showPinLabels, setShowPinLabels] = useState(false)
  const [showRails, setShowRails] = useState(false)
  const [placement, setPlacement] = useState<{
    libraryPartId: string
    firstPinId: string | null
    message: string
  } | null>(null)
  const [placementPointer, setPlacementPointer] = useState<WireVertex | null>(null)
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

    if (placement) {
      handlePassivePinClick(pointId)
      return
    }

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

    if (part.kind === 'generated-passive') {
      startPassivePlacement(libraryPartId)
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

  function startPassivePlacement(libraryPartId: string) {
    const part = libraryPartIndex.get(libraryPartId)
    if (!part || part.kind !== 'generated-passive') return
    setPendingFromPointId(null)
    setSelectedModuleId(null)
    const range = getPassiveLeadDistanceRangeMm(part)
    setPlacementPointer(null)
    setPlacement({
      libraryPartId,
      firstPinId: null,
      message: range.rigid
        ? `Placing ${part.name} (rigid, ${getPassiveLeadSpacingMm(part).toFixed(2)} mm). Click the first pin.`
        : `Placing ${part.name}. Body is ${range.minMm.toFixed(1)} mm; leads reach up to ${range.maxMm.toFixed(1)} mm. Click the first pin.`,
    })
  }

  function handlePassivePinClick(pointId: string) {
    if (!placement) return
    const part = libraryPartIndex.get(placement.libraryPartId)
    if (!part) {
      setPlacement(null)
      return
    }
    const range = getPassiveLeadDistanceRangeMm(part)
    const natural = getPassiveLeadSpacingMm(part)
    if (placement.firstPinId === null) {
      setPlacement({
        ...placement,
        firstPinId: pointId,
        message: range.rigid
          ? `First pin selected. Click the second pin exactly ${natural.toFixed(2)} mm away.`
          : `First pin selected. Click any second pin between ${range.minMm.toFixed(1)} and ${range.maxMm.toFixed(1)} mm away (highlighted). Shorter is better.`,
      })
      return
    }
    if (placement.firstPinId === pointId) {
      setPlacement({
        ...placement,
        firstPinId: null,
        message: `Selection cleared. Click the first pin for ${part.name}.`,
      })
      return
    }
    const a = findPoint(breadboard.points, placement.firstPinId)
    const b = findPoint(breadboard.points, pointId)
    if (!a || !b) {
      setPlacement(null)
      return
    }
    const distMm = Math.hypot(b.x - a.x, b.y - a.y) / pixelsPerMm
    if (distMm < range.minMm) {
      setPlacement({
        ...placement,
        firstPinId: null,
        message: `Those pins are only ${distMm.toFixed(2)} mm apart but the ${part.name} body is ${range.minMm.toFixed(2)} mm long and won't fit. Pick a wider pair.`,
      })
      return
    }
    if (distMm > range.maxMm) {
      setPlacement({
        ...placement,
        firstPinId: null,
        message: `Those pins are ${distMm.toFixed(2)} mm apart, more than the ${range.maxMm.toFixed(1)} mm reach of ${part.name}'s leads. Pick a closer pair.`,
      })
      return
    }
    const centerX = (a.x + b.x) / 2
    const centerY = (a.y + b.y) / 2
    const rotationDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    const newModule: ProjectModuleInstance = {
      id: createProjectModuleInstanceId(),
      libraryPartId: placement.libraryPartId,
      centerX,
      centerY,
      rotationDeg,
      passiveSpanMm: distMm,
    }
    onChange({
      ...project,
      modules: [...(project.modules ?? []), newModule],
    })
    setSelectedModuleId(newModule.id)
    setPlacement(null)
    setPlacementPointer(null)
  }

  function cancelPlacement() {
    setPlacement(null)
    setPlacementPointer(null)
  }

  function handleSvgPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!placement) return
    const pos = getSvgCoordinates(event)
    if (pos) setPlacementPointer(pos)
  }

  function handleSvgPointerLeave() {
    if (placement) setPlacementPointer(null)
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

  function handleSetModuleScale(moduleId: string, scaleFactor: number) {
    updateModule(moduleId, (instance) => ({
      ...instance,
      scaleFactor: Math.max(0.5, Math.min(2, scaleFactor)),
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
    const effectivePpm = pixelsPerMm * (instance.scaleFactor ?? 1)
    const { center } = computeSnapResult(
      { x: instance.centerX, y: instance.centerY },
      instance.rotationDeg,
      part,
      effectivePpm,
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
      const instancePpm = pixelsPerMm * (instance.scaleFactor ?? 1)
      const { center: snappedPosition, snapPinId } = computeSnapResult(
        rawPosition,
        instance.rotationDeg,
        part,
        instancePpm,
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
      const instancePpm = pixelsPerMm * (instance.scaleFactor ?? 1)
      const { center } = part
        ? computeSnapResult(rawPosition, instance.rotationDeg, part, instancePpm, breadboard.points, SNAP_THRESHOLD_MM * pixelsPerMm)
        : { center: rawPosition }

      return {
        ...instance,
        centerX: Math.max(0, Math.min(safeWidth, center.x)),
        centerY: Math.max(0, Math.min(safeHeight, center.y)),
      }
    })
  }

  /**
   * World-coordinate positions of a generated-passive's two contact endpoints
   * (the silver tips that physically plug into the breadboard). Returns null
   * for non-passive parts or when the instance lacks a recorded span.
   */
  function getPassiveEndpoints(
    instance: ProjectModuleInstance,
  ): { a: WireVertex; b: WireVertex } | null {
    const part = libraryPartIndex.get(instance.libraryPartId)
    if (!part || part.kind !== 'generated-passive' || !part.passive) return null
    const spanMm =
      typeof instance.passiveSpanMm === 'number' && instance.passiveSpanMm > 0
        ? instance.passiveSpanMm
        : part.dimensions.widthMm
    const halfPx = (spanMm * pixelsPerMm * (instance.scaleFactor ?? 1)) / 2
    const angleRad = (instance.rotationDeg * Math.PI) / 180
    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)
    return {
      a: { x: instance.centerX - cosA * halfPx, y: instance.centerY - sinA * halfPx },
      b: { x: instance.centerX + cosA * halfPx, y: instance.centerY + sinA * halfPx },
    }
  }

  /**
   * For a passive endpoint drag: snap the dragged pointer to the nearest
   * breadboard pin within ~3 mm whose distance to the anchor falls inside
   * the part's lead-distance range. Returns the (possibly snapped) world
   * coords plus the snapped pin id and validity.
   */
  function snapPassiveEndpoint(
    part: LibraryPartDefinition,
    anchor: WireVertex,
    pointer: WireVertex,
  ): { pos: WireVertex; snapPinId: string | null; valid: boolean } {
    const range = getPassiveLeadDistanceRangeMm(part)
    const snapRadiusPx = pixelsPerMm * 3
    let bestId: string | null = null
    let bestDist = snapRadiusPx
    let bestPin: WireVertex | null = null
    for (const pin of breadboard.points) {
      if (!isSnapPoint(pin)) continue
      const d = Math.hypot(pin.x - pointer.x, pin.y - pointer.y)
      if (d >= bestDist) continue
      const distFromAnchorMm = Math.hypot(pin.x - anchor.x, pin.y - anchor.y) / pixelsPerMm
      if (distFromAnchorMm < range.minMm || distFromAnchorMm > range.maxMm) continue
      bestDist = d
      bestId = pin.id
      bestPin = { x: pin.x, y: pin.y }
    }
    if (bestPin && bestId) {
      return { pos: bestPin, snapPinId: bestId, valid: true }
    }
    const freeDistMm = Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) / pixelsPerMm
    return {
      pos: pointer,
      snapPinId: null,
      valid: freeDistMm >= range.minMm && freeDistMm <= range.maxMm,
    }
  }

  function handlePassiveEndpointPointerDown(
    event: React.PointerEvent<SVGCircleElement>,
    instance: ProjectModuleInstance,
    end: 'a' | 'b',
  ) {
    if (event.button !== 0) return
    event.stopPropagation()
    const endpoints = getPassiveEndpoints(instance)
    if (!endpoints) return
    const anchor = end === 'a' ? endpoints.b : endpoints.a
    const dragged = end === 'a' ? endpoints.a : endpoints.b
    setSelectedModuleId(instance.id)
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setPassiveEndpointDrag({
      moduleId: instance.id,
      anchor,
      draggedPos: dragged,
      snapPinId: null,
      valid: true,
    })
  }

  function handlePassiveEndpointPointerMove(event: React.PointerEvent<SVGCircleElement>) {
    if (!passiveEndpointDrag) return
    const coords = getSvgCoordinates(event)
    if (!coords) return
    const instance = (project.modules ?? []).find((entry) => entry.id === passiveEndpointDrag.moduleId)
    const part = instance ? libraryPartIndex.get(instance.libraryPartId) : undefined
    if (!part) return
    const { pos, snapPinId, valid } = snapPassiveEndpoint(part, passiveEndpointDrag.anchor, coords)
    setPassiveEndpointDrag({
      ...passiveEndpointDrag,
      draggedPos: pos,
      snapPinId,
      valid,
    })
  }

  function handlePassiveEndpointPointerUp(event: React.PointerEvent<SVGCircleElement>) {
    if (!passiveEndpointDrag) return
    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const drag = passiveEndpointDrag
    setPassiveEndpointDrag(null)
    // Only commit when the drop landed on a valid pin within the lead-reach
    // range. Otherwise, snap back (no update) so the user doesn't end up with
    // a passive whose contacts don't actually plug into holes.
    if (!drag.snapPinId || !drag.valid) return
    updateModule(drag.moduleId, (instance) => {
      const a = drag.anchor
      const b = drag.draggedPos
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distPx = Math.hypot(dx, dy)
      if (distPx <= 0) return instance
      const distMm = distPx / pixelsPerMm
      return {
        ...instance,
        centerX: (a.x + b.x) / 2,
        centerY: (a.y + b.y) / 2,
        rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
        passiveSpanMm: distMm,
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

  const radius = Math.max(3, Math.min(safeWidth, safeHeight) * 0.004)
  const strokeWidth = Math.max(3, radius * 0.6)
  const handleRadius = Math.max(5, radius * 0.85)
  const midpointRadius = Math.max(4, radius * 0.65)
  const modulePointRadius = Math.max(2.5, radius * 0.7)
  const modulePointAlignThresholdSq = useMemo(
    () => (ALIGNMENT_THRESHOLD_MM * pixelsPerMm) ** 2,
    [pixelsPerMm],
  )

  const effectiveModules = useMemo(() => {
    let result = modules
    if (moduleDragState) {
      const dragCenter = moduleDragState.snappedPosition ?? moduleDragState.position
      result = result.map((instance) =>
        instance.id === moduleDragState.moduleId
          ? { ...instance, centerX: dragCenter.x, centerY: dragCenter.y }
          : instance,
      )
    }
    if (passiveEndpointDrag) {
      const a = passiveEndpointDrag.anchor
      const b = passiveEndpointDrag.draggedPos
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distPx = Math.hypot(dx, dy)
      if (distPx > 0) {
        const distMm = distPx / pixelsPerMm
        result = result.map((instance) =>
          instance.id === passiveEndpointDrag.moduleId
            ? {
                ...instance,
                centerX: (a.x + b.x) / 2,
                centerY: (a.y + b.y) / 2,
                rotationDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
                passiveSpanMm: distMm,
              }
            : instance,
        )
      }
    }
    return result
  }, [modules, moduleDragState, passiveEndpointDrag, pixelsPerMm])

  const alignedPinIds = useMemo(
    () => computeAlignedBreadboardPinIds(effectiveModules, libraryPartIndex, breadboard.points, pixelsPerMm),
    [effectiveModules, libraryPartIndex, breadboard.points, pixelsPerMm],
  )
  const coveredPinIds = useMemo(
    () => computeCoveredBreadboardPinIds(effectiveModules, libraryPartIndex, breadboard.points, pixelsPerMm),
    [effectiveModules, libraryPartIndex, breadboard.points, pixelsPerMm],
  )
  const connectedPinIds = useMemo(
    () => computeElectricallyConnectedPinIds(alignedPinIds, breadboard, project.wires),
    [alignedPinIds, breadboard, project.wires],
  )
  /**
   * Pin holes that are valid landing spots for the passive currently being
   * placed. When no first pin has been chosen yet, every snap-eligible pin
   * is a candidate as long as at least one partner pin lies within reach.
   * Once the first pin is committed, only pins inside the lead-distance
   * range of that pin remain candidates.
   */
  const placementCandidatePinIds = useMemo(() => {
    const set = new Set<string>()
    if (!placement) return set
    const part = libraryPartIndex.get(placement.libraryPartId)
    if (!part) return set
    const range = getPassiveLeadDistanceRangeMm(part)
    const minPx = range.minMm * pixelsPerMm
    const maxPx = range.maxMm * pixelsPerMm
    if (placement.firstPinId) {
      const a = findPoint(breadboard.points, placement.firstPinId)
      if (!a) return set
      for (const p of breadboard.points) {
        if (p.id === a.id) continue
        const d = Math.hypot(p.x - a.x, p.y - a.y)
        if (d >= minPx && d <= maxPx) set.add(p.id)
      }
    } else {
      // First-pin selection: include any pin that has at least one partner in range.
      for (const p of breadboard.points) {
        for (const q of breadboard.points) {
          if (p.id === q.id) continue
          const d = Math.hypot(p.x - q.x, p.y - q.y)
          if (d >= minPx && d <= maxPx) {
            set.add(p.id)
            break
          }
        }
      }
    }
    return set
  }, [placement, libraryPartIndex, breadboard.points, pixelsPerMm])
  /**
   * Of all candidate pins, the single one closest to the current cursor
   * (within ~3 mm) gets an extra-bright highlight so the user knows which
   * hole their click will land in.
   */
  const placementHoverPinId = useMemo<string | null>(() => {
    if (!placement || !placementPointer) return null
    const snapRadiusPx = pixelsPerMm * 3
    let bestId: string | null = null
    let bestDist = snapRadiusPx
    for (const id of placementCandidatePinIds) {
      const p = findPoint(breadboard.points, id)
      if (!p) continue
      const d = Math.hypot(p.x - placementPointer.x, p.y - placementPointer.y)
      if (d < bestDist) {
        bestDist = d
        bestId = p.id
      }
    }
    return bestId
  }, [placement, placementPointer, placementCandidatePinIds, breadboard.points, pixelsPerMm])
  // Rails depict only the breadboard's intrinsic conductive strips; user
  // wires are rendered separately and would otherwise produce long diagonal
  // polylines spanning two unrelated regions of the board.
  const intrinsicElectricalGroups = useMemo(
    () => computeElectricalGroups(breadboard, []),
    [breadboard],
  )
  const electricalGroups = showRails ? intrinsicElectricalGroups : []
  // "Live" rails: any intrinsic rail that contains at least one breadboard
  // hole currently energised by an aligned module pin (transitively, through
  // user wires too). These are always highlighted, even when `Show rails` is
  // off, so the user can see the path of an active connection.
  const liveRailGroups = useMemo(
    () =>
      intrinsicElectricalGroups.filter((group) => {
        for (const pinId of group) {
          if (connectedPinIds.has(pinId)) {
            return true
          }
        }
        return false
      }),
    [intrinsicElectricalGroups, connectedPinIds],
  )
  // Map every breadboard pin that is the endpoint of a user wire to that
  // wire's display color. Used to color the "active path" segment of a rail
  // (from the module pin out to the wire attachment hole) so the eye can
  // follow one continuous wire-colored path through the circuit.
  const wireEndpointColors = useMemo(() => {
    const map = new Map<string, string>()
    for (const wire of project.wires) {
      const color = wire.color ?? '#cc3333'
      if (!map.has(wire.fromPointId)) {
        map.set(wire.fromPointId, color)
      }
      if (!map.has(wire.toPointId)) {
        map.set(wire.toPointId, color)
      }
    }
    return map
  }, [project.wires])

  // Pin holes whose center lies under the body of any wire. We hide these
  // breadboard hole circles so the wire reads like a real solid jumper that
  // physically blocks the view of the hole it's plugged through (and any
  // hole it passes over). Without this, the pin <circle> elements (rendered
  // after the wires) would paint white-with-orange-dot holes back on top of
  // the wire body.
  const wireCoveredPinIds = useMemo(() => {
    const covered = new Set<string>()
    if (project.wires.length === 0 || breadboard.points.length === 0) {
      return covered
    }
    // Match the per-wire body width used in render: max(radius * 3.4, strokeWidth * 1.9).
    const bodyWidth = Math.max(radius * 3.4, strokeWidth * 1.9)
    const halfW = bodyWidth / 2
    const halfWSq = halfW * halfW
    const distSqToSegment = (
      px: number,
      py: number,
      ax: number,
      ay: number,
      bx: number,
      by: number,
    ) => {
      const dx = bx - ax
      const dy = by - ay
      const lenSq = dx * dx + dy * dy
      if (lenSq <= 0) {
        const ddx = px - ax
        const ddy = py - ay
        return ddx * ddx + ddy * ddy
      }
      let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
      if (t < 0) t = 0
      else if (t > 1) t = 1
      const cx = ax + t * dx
      const cy = ay + t * dy
      const ddx = px - cx
      const ddy = py - cy
      return ddx * ddx + ddy * ddy
    }
    for (const segment of wireSegments) {
      const vertices = getWireVertices(segment.wire, segment.fromPoint, segment.toPoint)
      for (let i = 0; i < vertices.length - 1; i += 1) {
        const a = vertices[i]
        const b = vertices[i + 1]
        for (const point of breadboard.points) {
          if (covered.has(point.id)) continue
          if (distSqToSegment(point.x, point.y, a.x, a.y, b.x, b.y) <= halfWSq) {
            covered.add(point.id)
          }
        }
      }
    }
    return covered
  }, [wireSegments, breadboard.points, radius, strokeWidth, project.wires.length])

  return (
    <section className="wire-editor" aria-label="Wire breadboard">
      <header className="pin-editor__header">
        <div className="pin-editor__title-block">
          <p className="image-workspace__eyebrow">Project mode - wire two points</p>
          <p className="image-workspace__status">{status}</p>
          {placement ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 6,
                padding: '6px 10px',
                background: '#fff7d6',
                border: '1px solid #d8b94a',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ flex: 1, fontSize: 13 }}>{placement.message}</span>
              <button
                type="button"
                className="action-button action-button--ghost"
                onClick={cancelPlacement}
              >
                Cancel placement
              </button>
            </div>
          ) : null}
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
            <label className="pin-editor__toggle">
              <input
                type="checkbox"
                checked={showPinLabels}
                onChange={(event) => setShowPinLabels(event.target.checked)}
              />
              Show pin labels
            </label>
            <label className="pin-editor__toggle">
              <input
                type="checkbox"
                checked={showRails}
                onChange={(event) => setShowRails(event.target.checked)}
              />
              Show rails
            </label>
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
            onPointerMove={handleSvgPointerMove}
            onPointerLeave={handleSvgPointerLeave}
            style={placement ? { cursor: 'crosshair' } : undefined}
          >
            <image
              href={breadboard.imagePath}
              width={safeWidth}
              height={safeHeight}
              preserveAspectRatio="none"
            />
            {/*
              Reusable visual assets for the glossy 3D jumper-wire look:
                - wire-editor__silver-cap: vertical metallic gradient applied
                  to the small endpoint pins to mimic shiny tinned metal.
              (We render the wire's drop shadow as an offset darker
              polyline rather than via an SVG <filter>, because the
              default filter region uses objectBoundingBox which collapses
              to zero size for perfectly horizontal/vertical strokes,
              causing the wire to disappear.)
            */}
            <defs>
              <linearGradient
                id="wire-editor__silver-cap"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#f5f7fa" />
                <stop offset="35%" stopColor="#cdd2d8" />
                <stop offset="60%" stopColor="#7d848c" />
                <stop offset="100%" stopColor="#3a3f44" />
              </linearGradient>
            </defs>
            {showRails ? (
              <g className="wire-editor__rails" aria-hidden="true">
                {electricalGroups.map((group, groupIndex) => {
                  if (group.size < 2) {
                    return null
                  }
                  const pts = breadboard.points.filter((p) => group.has(p.id))
                  if (pts.length < 2) {
                    return null
                  }
                  // Sort along the dominant axis so the polyline traces the rail.
                  const xs = pts.map((p) => p.x)
                  const ys = pts.map((p) => p.y)
                  const xRange = Math.max(...xs) - Math.min(...xs)
                  const yRange = Math.max(...ys) - Math.min(...ys)
                  const sorted = [...pts].sort((a, b) =>
                    xRange >= yRange ? a.x - b.x : a.y - b.y,
                  )
                  const groupKey = sorted.map((p) => p.id).join('|') || `g-${groupIndex}`
                  const color = railColorFor(groupKey)
                  const points = sorted.map((p) => `${p.x},${p.y}`).join(' ')
                  return (
                    <polyline
                      key={`rail-${groupIndex}`}
                      points={points}
                      fill="none"
                      stroke={color}
                      strokeWidth={Math.max(2, radius * 1.4)}
                      strokeOpacity={0.35}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                })}
              </g>
            ) : null}
            {/*
              Live rails: a connected module pin energises the entire rail it
              plugs into. We split each rail into two visual zones:
                - "active path" (wire color): from the module pin hole out to
                  the farthest hole that has a wire endpoint. This is the
                  segment of the rail that actually carries the signal to the
                  attached wire, so it reads as one continuous colored path
                  with the wire itself.
                - "stub" (green): the remaining holes on the rail that are
                  electrically the same net but lie beyond the wire
                  attachment. They are still "live" but not part of the
                  current path, so they stay green.
              If the rail has no wire endpoint on it, the entire rail is
              drawn green (it's energised but no wire is yet using it).
            */}
            <g className="wire-editor__live-rails" aria-hidden="true">
              {liveRailGroups.map((group, groupIndex) => {
                if (group.size < 2) {
                  return null
                }
                const pts = breadboard.points.filter((p) => group.has(p.id))
                if (pts.length < 2) {
                  return null
                }
                const xs = pts.map((p) => p.x)
                const ys = pts.map((p) => p.y)
                const xRange = Math.max(...xs) - Math.min(...xs)
                const yRange = Math.max(...ys) - Math.min(...ys)
                const sorted = [...pts].sort((a, b) =>
                  xRange >= yRange ? a.x - b.x : a.y - b.y,
                )
                const baseWidth = Math.max(2.5, radius * 1.5)
                const stubColor = '#22c55e'
                const renderPolyline = (
                  segPts: typeof sorted,
                  color: string,
                  keySuffix: string,
                ) => {
                  if (segPts.length < 2) {
                    return null
                  }
                  const points = segPts.map((p) => `${p.x},${p.y}`).join(' ')
                  return (
                    <polyline
                      key={`live-rail-${groupIndex}-${keySuffix}`}
                      points={points}
                      fill="none"
                      stroke={color}
                      strokeWidth={baseWidth}
                      strokeOpacity={0.85}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                }
                const modulePinIdx: number[] = []
                const wireEndpointIdx: number[] = []
                let activeColor: string | undefined
                for (let i = 0; i < sorted.length; i += 1) {
                  const id = sorted[i].id
                  if (alignedPinIds.has(id)) {
                    modulePinIdx.push(i)
                  }
                  const wireColor = wireEndpointColors.get(id)
                  if (wireColor !== undefined) {
                    wireEndpointIdx.push(i)
                    if (activeColor === undefined) {
                      activeColor = wireColor
                    }
                  }
                }
                // No wire attached to this rail: render the whole rail as a
                // green "live but unused" stub (preserves prior behavior).
                if (wireEndpointIdx.length === 0 || activeColor === undefined) {
                  return (
                    <g key={`live-rail-${groupIndex}`}>
                      {renderPolyline(sorted, stubColor, 'all')}
                    </g>
                  )
                }
                const spanIdx = [...modulePinIdx, ...wireEndpointIdx]
                const activeMin = Math.min(...spanIdx)
                const activeMax = Math.max(...spanIdx)
                const activeSeg = sorted.slice(activeMin, activeMax + 1)
                const leftStub = sorted.slice(0, activeMin + 1)
                const rightStub = sorted.slice(activeMax)
                return (
                  <g key={`live-rail-${groupIndex}`}>
                    {renderPolyline(leftStub, stubColor, 'stub-l')}
                    {renderPolyline(rightStub, stubColor, 'stub-r')}
                    {renderPolyline(activeSeg, activeColor, 'active')}
                  </g>
                )
              })}
            </g>
            {effectiveModules.map((instance) => {
              const part = libraryPartIndex.get(instance.libraryPartId)

              if (!part) {
                return null
              }

              const view =
                part.imageViews.find((entry) => entry.id === instance.viewId) ??
                part.imageViews[0]
              const effectivePpm = pixelsPerMm * (instance.scaleFactor ?? 1)
              const isPassive = part.kind === 'generated-passive' && part.passive
              // For generated passive parts, prefer the actual span recorded
              // when the user placed it between two pins so the rendered leads
              // terminate exactly at those holes.
              const passiveWidthMm =
                isPassive && typeof instance.passiveSpanMm === 'number' && instance.passiveSpanMm > 0
                  ? instance.passiveSpanMm
                  : part.dimensions.widthMm
              const widthPx = (isPassive ? passiveWidthMm : part.dimensions.widthMm) * effectivePpm
              const heightPx = part.dimensions.heightMm * effectivePpm

              if (widthPx <= 0 || heightPx <= 0) {
                return null
              }

              const isDragging = moduleDragState?.moduleId === instance.id
              const isEndpointDragging = passiveEndpointDrag?.moduleId === instance.id
              const center = { x: instance.centerX, y: instance.centerY }
              const isSelected = selectedModuleId === instance.id
              const isSnapping =
                (isDragging && moduleDragState?.snapPinId !== null) ||
                (isEndpointDragging && passiveEndpointDrag?.snapPinId !== null)

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
                  {part.kind === 'generated-passive' && part.passive ? (
                    <g
                      transform={`translate(${center.x - widthPx / 2} ${center.y - heightPx / 2})`}
                    >
                      <GeneratedPassiveGraphic
                        spec={part.passive}
                        pixelsPerMm={effectivePpm}
                        spanMm={passiveWidthMm}
                      />
                    </g>
                  ) : view ? (
                    <image
                      href={view.imagePath}
                      x={center.x - widthPx / 2}
                      y={center.y - heightPx / 2}
                      width={widthPx}
                      height={heightPx}
                      preserveAspectRatio="none"
                    />
                  ) : null}
                  {/*
                    For generated passives the SVG body and silver leads are
                    visually self-contained, so the bounding rectangle is only
                    drawn on hover/selection (very subtle) to avoid implying
                    that the whole rectangle area is electrically connected.
                  */}
                  {isPassive && !isSelected && !isSnapping ? (
                    <rect
                      x={center.x - widthPx / 2}
                      y={center.y - heightPx / 2}
                      width={widthPx}
                      height={heightPx}
                      fill="transparent"
                      stroke="transparent"
                    />
                  ) : (
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
                  )}
                </g>
              )
            })}
            {/*
              Endpoint drag handles for the currently-selected generated
              passive. Drag either silver contact to re-position that lead;
              the opposite contact stays anchored, the body remains its
              physical size, and the leads on both sides recompute so the
              body stays centred between the two pins.
            */}
            {effectiveModules.flatMap((instance) => {
              if (selectedModuleId !== instance.id) return []
              const part = libraryPartIndex.get(instance.libraryPartId)
              if (!part || part.kind !== 'generated-passive' || !part.passive) return []
              const endpoints = getPassiveEndpoints(instance)
              if (!endpoints) return []
              const handleR = Math.max(6, pixelsPerMm * 1.4)
              const isEndpointDragging = passiveEndpointDrag?.moduleId === instance.id
              return (['a', 'b'] as const).map((end) => {
                const pos = end === 'a' ? endpoints.a : endpoints.b
                let stroke = '#1f5fcc'
                let fill = 'rgba(31, 95, 204, 0.15)'
                if (isEndpointDragging && passiveEndpointDrag) {
                  if (passiveEndpointDrag.snapPinId) {
                    stroke = '#1f8e4d'
                    fill = 'rgba(31, 142, 77, 0.30)'
                  } else if (passiveEndpointDrag.valid) {
                    stroke = '#d68f00'
                    fill = 'rgba(255, 196, 0, 0.25)'
                  } else {
                    stroke = '#cc3333'
                    fill = 'rgba(204, 51, 51, 0.25)'
                  }
                }
                return (
                  <circle
                    key={`passive-handle-${instance.id}-${end}`}
                    cx={pos.x}
                    cy={pos.y}
                    r={handleR}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={2.5}
                    style={{ cursor: 'grab' }}
                    onPointerDown={(event) => handlePassiveEndpointPointerDown(event, instance, end)}
                    onPointerMove={handlePassiveEndpointPointerMove}
                    onPointerUp={handlePassiveEndpointPointerUp}
                    onPointerCancel={handlePassiveEndpointPointerUp}
                    aria-label={`Drag ${end === 'a' ? 'left' : 'right'} contact of ${part.name}`}
                  />
                )
              })
            })}
            {effectiveModules.flatMap((instance) => {
              const part = libraryPartIndex.get(instance.libraryPartId)
              if (!part) {
                return []
              }
              const effectivePpm = pixelsPerMm * (instance.scaleFactor ?? 1)
              const widthPx = part.dimensions.widthMm * effectivePpm
              const heightPx = part.dimensions.heightMm * effectivePpm
              if (widthPx <= 0 || heightPx <= 0) {
                return []
              }
              const angleRad = (instance.rotationDeg * Math.PI) / 180
              const cosA = Math.cos(angleRad)
              const sinA = Math.sin(angleRad)
              const activeViewId = instance.viewId ?? part.imageViews[0]?.id
              return part.physicalPoints
                .filter((p) => isSnapPoint(p) && (!activeViewId || getViewForPoint(part, p)?.id === activeViewId))
                .map((physPt) => {
                  const { dx, dy } = getPhysicalPointModuleOffsetPx(physPt, part, effectivePpm)
                  const rotDx = dx * cosA - dy * sinA
                  const rotDy = dx * sinA + dy * cosA
                  const absX = instance.centerX + rotDx
                  const absY = instance.centerY + rotDy
                  let aligned = false
                  for (const bp of breadboard.points) {
                    if ((bp.x - absX) ** 2 + (bp.y - absY) ** 2 <= modulePointAlignThresholdSq) {
                      aligned = true
                      break
                    }
                  }
                  // Yellow when this module pin is in the air, green when it
                  // sits over a breadboard hole (i.e. plugged in).
                  const fillColor = aligned ? '#22c55e' : '#facc15'
                  const strokeColor = aligned ? '#0e2a14' : '#a16207'
                  return (
                    <circle
                      key={`module-pt-${instance.id}-${physPt.id}`}
                      className={`wire-editor__module-point${aligned ? ' wire-editor__module-point--aligned' : ''}`}
                      cx={absX}
                      cy={absY}
                      r={modulePointRadius}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={1}
                      pointerEvents="none"
                      aria-hidden="true"
                    />
                  )
                })
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
              const isLiveWire =
                connectedPinIds.has(wire.fromPointId) || connectedPinIds.has(wire.toPointId)
              const wireUserColor = wire.color ?? '#cc3333'
              // Glossy plastic round-jumper rendering. The wire is a single
              // wide stroke filled with a per-wire linearGradient oriented
              // perpendicular to the wire's direction, so the eye reads a
              // continuous cylindrical shading band across the wire's width
              // (dark edge -> body -> bright gloss stripe -> body -> dark
              // edge). Width is scaled large enough to fully cover the
              // breadboard hole underneath, like a real plugged-in jumper.
              const bodyWidth = Math.max(
                radius * 3.4,
                isPending ? strokeWidth * 2.2 : strokeWidth * 1.9,
              )
              const edgeWidth = bodyWidth * 1.06
              const edgeColor = shadeDarken(wireUserColor, 0.75)
              const midColor = shadeDarken(wireUserColor, 0.15)
              const glossColor = shadeLighten(wireUserColor, 0.65)
              // Perpendicular gradient endpoints. Use first->last vertex as
              // the dominant wire direction (good enough for our short
              // routed wires; multi-segment wires still get a coherent
              // cross-section because the gradient is anchored at the wire's
              // midpoint).
              const v0 = vertices[0]
              const vN = vertices[vertices.length - 1]
              const midX = (v0.x + vN.x) / 2
              const midY = (v0.y + vN.y) / 2
              const dx = vN.x - v0.x
              const dy = vN.y - v0.y
              const len = Math.max(0.0001, Math.hypot(dx, dy))
              // Unit perpendicular vector. Rotated -90deg so the "top" of
              // the wire (gradient origin) is the upper-left side, matching
              // an overhead light source for consistency across all wires.
              const perpX = -dy / len
              const perpY = dx / len
              const halfW = bodyWidth / 2
              const gradientId = `wire-grad-${wire.id}`
              const gx1 = midX + perpX * halfW
              const gy1 = midY + perpY * halfW
              const gx2 = midX - perpX * halfW
              const gy2 = midY - perpY * halfW
              const ariaLabel = `Wire from ${fromPoint.label} to ${toPoint.label}${
                isPending ? ' (click again to delete)' : ''
              }${isLiveWire ? ' (live)' : ''}`
              const capRadius = Math.max(2.4, bodyWidth * 0.42)
              const crimpRadius = capRadius * 0.55
              const endpoints = [v0, vN]
              return (
                <g key={wire.id}>
                  <defs>
                    <linearGradient
                      id={gradientId}
                      gradientUnits="userSpaceOnUse"
                      x1={gx1}
                      y1={gy1}
                      x2={gx2}
                      y2={gy2}
                    >
                      <stop offset="0%" stopColor={edgeColor} />
                      <stop offset="18%" stopColor={midColor} />
                      <stop offset="38%" stopColor={wireUserColor} />
                      <stop offset="50%" stopColor={glossColor} />
                      <stop offset="62%" stopColor={wireUserColor} />
                      <stop offset="82%" stopColor={midColor} />
                      <stop offset="100%" stopColor={edgeColor} />
                    </linearGradient>
                  </defs>
                  {/* offset shadow polyline – mimics a soft drop shadow without
                      using an SVG <filter> (which would collapse for perfectly
                      horizontal or vertical wires whose bbox has zero height
                      or width). */}
                  <polyline
                    points={vertices
                      .map((v) => `${v.x + 1.2},${v.y + 2.2}`)
                      .join(' ')}
                    fill="none"
                    stroke="#000000"
                    strokeOpacity={0.4}
                    strokeWidth={edgeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                    aria-hidden="true"
                  />
                  {/* dark outer rim – guarantees a crisp dark edge even if
                      the gradient endpoints fall slightly inside the stroke
                      (e.g. very short wires). */}
                  <polyline
                    points={points}
                    fill="none"
                    stroke={edgeColor}
                    strokeWidth={edgeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                    aria-hidden="true"
                  />
                  {/* main colored body with cross-section gradient – click
                      target, fully opaque so it covers the holes underneath. */}
                  <polyline
                    className={`wire-editor__wire${isPending ? ' wire-editor__wire--pending' : ''}`}
                    points={points}
                    fill="none"
                    stroke={`url(#${gradientId})`}
                    strokeWidth={bodyWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    role="button"
                    aria-label={ariaLabel}
                    onClick={() => handleWireClick(wire.id)}
                  />
                  {/* thin pure-white specular line – the glossy "wet" sheen
                      catching the brightest light on the cylinder's top. */}
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={Math.max(0.7, bodyWidth * 0.08)}
                    strokeOpacity={0.55}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                    aria-hidden="true"
                  />
                  {/* metallic silver pin caps with crimp band */}
                  {endpoints.map((pt, i) => (
                    <g key={`wire-cap-${wire.id}-${i}`} pointerEvents="none" aria-hidden="true">
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={capRadius}
                        fill={edgeColor}
                        opacity={0.85}
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={crimpRadius}
                        fill="url(#wire-editor__silver-cap)"
                        stroke="#2a2d31"
                        strokeWidth={0.4}
                      />
                      <circle
                        cx={pt.x - crimpRadius * 0.25}
                        cy={pt.y - crimpRadius * 0.35}
                        r={crimpRadius * 0.35}
                        fill="#ffffff"
                        opacity={0.65}
                      />
                    </g>
                  ))}
                </g>
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
              const isAligned = alignedPinIds.has(point.id)
              const isConnected = connectedPinIds.has(point.id)
              const isCovered = coveredPinIds.has(point.id)
              const isPlacementFirst = placement?.firstPinId === point.id
              const isPlacementCandidate = placementCandidatePinIds.has(point.id)
              const isPlacementHover = placementHoverPinId === point.id
              const forcedVisible = isPendingFrom || isSnapTarget || isPlacementFirst || isPlacementCandidate || isPlacementHover
              // When a module pin is plugged into this hole, the module's own
              // green pin dot serves as the visual indicator. Rendering the
              // breadboard hole on top would just paint red over the green.
              if (isAligned && !forcedVisible) {
                return null
              }
              if (isCovered && !forcedVisible) {
                return null
              }
              // A real jumper wire physically blocks the view of any hole it
              // sits over. Hide pin-hole circles whose center lies under the
              // wire body so the rendered wire reads as solid plastic.
              if (wireCoveredPinIds.has(point.id) && !forcedVisible) {
                return null
              }
              const pinRadius = radius

              return (
                <g key={point.id} className="pin-editor__pin-group">
                  {isPlacementCandidate || isPlacementFirst ? (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius * 2.4}
                      fill={isPlacementFirst ? 'rgba(31, 142, 77, 0.35)' : 'rgba(255, 196, 0, 0.28)'}
                      stroke={isPlacementFirst ? '#1f8e4d' : '#d68f00'}
                      strokeWidth={isPlacementFirst ? 2.5 : 1.5}
                      pointerEvents="none"
                      aria-hidden="true"
                    />
                  ) : null}
                  {isPlacementHover && !isPlacementFirst ? (
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius * 3.0}
                      fill="rgba(31, 142, 77, 0.35)"
                      stroke="#1f8e4d"
                      strokeWidth={3}
                      pointerEvents="none"
                      aria-hidden="true"
                    />
                  ) : null}
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
                    className={`pin-editor__pin wire-editor__pin${isPendingFrom ? ' wire-editor__pin--pending-from' : ''}${isAligned ? ' wire-editor__pin--aligned' : ''}${isConnected && !isAligned ? ' wire-editor__pin--connected' : ''}`}
                    cx={point.x}
                    cy={point.y}
                    r={pinRadius}
                    fill={isConnected ? '#facc15' : undefined}
                    stroke={isConnected ? '#a16207' : undefined}
                    role="button"
                    aria-label={`Pin hole ${point.label}${isPendingFrom ? ' (selected as wire start)' : ''}${isAligned ? ' (module pin aligned)' : isConnected ? ' (electrically connected to module pin)' : ''}`}
                    onClick={() => handlePinClick(point.id)}
                  >
                    {showPinLabels ? null : <title>{point.label}</title>}
                  </circle>
                  {showPinLabels ? (
                    <text
                      className="pin-editor__pin-label"
                      x={point.x}
                      y={point.y - pinRadius - 4}
                      textAnchor="middle"
                    >
                      {point.label}
                    </text>
                  ) : null}
                </g>
              )
            })}
            {(() => {
              if (!placement || !placementPointer) return null
              const part = libraryPartIndex.get(placement.libraryPartId)
              if (!part || part.kind !== 'generated-passive' || !part.passive) return null
              const heightPx = part.dimensions.heightMm * pixelsPerMm
              if (heightPx <= 0) return null

              // Snap the cursor end of the ghost to the nearest in-range
              // candidate pin so the user can clearly see which hole the
              // resistor will land in.
              let snappedEnd: { x: number; y: number } = placementPointer
              {
                const snapRadiusPx = pixelsPerMm * 3 // 3 mm
                let bestDist = snapRadiusPx
                for (const id of placementCandidatePinIds) {
                  const p = findPoint(breadboard.points, id)
                  if (!p) continue
                  const d = Math.hypot(p.x - placementPointer.x, p.y - placementPointer.y)
                  if (d < bestDist) {
                    bestDist = d
                    snappedEnd = { x: p.x, y: p.y }
                  }
                }
              }

              let center = snappedEnd
              let rotationDeg = 0
              let widthPx = part.dimensions.widthMm * pixelsPerMm
              if (placement.firstPinId) {
                const a = findPoint(breadboard.points, placement.firstPinId)
                if (a) {
                  center = { x: (a.x + snappedEnd.x) / 2, y: (a.y + snappedEnd.y) / 2 }
                  rotationDeg = (Math.atan2(snappedEnd.y - a.y, snappedEnd.x - a.x) * 180) / Math.PI
                  // Stretch the ghost to the actual pin-to-pin distance so
                  // the leads visually terminate at both endpoints.
                  widthPx = Math.hypot(snappedEnd.x - a.x, snappedEnd.y - a.y)
                }
              }
              if (widthPx <= 0) return null
              const spanMm = widthPx / pixelsPerMm
              return (
                <g
                  className="wire-editor__placement-ghost"
                  transform={`rotate(${rotationDeg} ${center.x} ${center.y})`}
                  pointerEvents="none"
                  style={{ opacity: 0.85 }}
                >
                  <g transform={`translate(${center.x - widthPx / 2} ${center.y - heightPx / 2})`}>
                    <GeneratedPassiveGraphic
                      spec={part.passive}
                      pixelsPerMm={pixelsPerMm}
                      spanMm={spanMm}
                    />
                  </g>
                </g>
              )
            })()}
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
        onSetScale={handleSetModuleScale}
        onAlignToPin={handleAlignModuleToPin}
        onCreatePassive={onCreatePassive}
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
          Track resistors, LEDs, and other parts you place on the breadboard. The entries here are
          notes only — to actually drop a resistor or capacitor on the board, use the
          <strong> Modules</strong> panel above and click <strong>Generate a passive part</strong>.
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
  onSetScale: (moduleId: string, scaleFactor: number) => void
  onAlignToPin: (moduleId: string) => void
  onCreatePassive?: () => void
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
  onSetScale,
  onAlignToPin,
  onCreatePassive,
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
          fit, and align to the nearest pin hole. Generated resistors and capacitors switch into a
          two-pin placement mode and only fit on pin pairs that match their lead spacing. All
          modules render at the breadboard&apos;s physical scale.
        </p>
        {onCreatePassive ? (
          <button
            type="button"
            className="action-button"
            onClick={onCreatePassive}
            disabled={isBusy}
            style={{ alignSelf: 'flex-start', marginTop: 6 }}
          >
            Generate a passive part
          </button>
        ) : null}
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
            {partIndex.get(effectivePartId)?.kind === 'generated-passive'
              ? 'Place between two pins'
              : 'Add module'}
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
                <label className="control-group" htmlFor={`module-scale-${instance.id}`}>
                  <span className="control-group__label">Scale&nbsp;{((instance.scaleFactor ?? 1) * 100).toFixed(0)}%</span>
                  <input
                    id={`module-scale-${instance.id}`}
                    className="control-group__input"
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={Math.round((instance.scaleFactor ?? 1) * 100)}
                    onChange={(event) =>
                      onSetScale(instance.id, Number(event.target.value) / 100)
                    }
                    disabled={isBusy}
                  />
                </label>
                <button
                  type="button"
                  className="action-button action-button--ghost"
                  onClick={() => onSetScale(instance.id, Math.round((instance.scaleFactor ?? 1) * 100 - 1) / 100)}
                  disabled={isBusy || Math.round((instance.scaleFactor ?? 1) * 100) <= 50}
                  aria-label={`Decrease ${displayName} scale by 1%`}
                >
                  − 1%
                </button>
                <button
                  type="button"
                  className="action-button action-button--ghost"
                  onClick={() => onSetScale(instance.id, Math.round((instance.scaleFactor ?? 1) * 100 + 1) / 100)}
                  disabled={isBusy || Math.round((instance.scaleFactor ?? 1) * 100) >= 200}
                  aria-label={`Increase ${displayName} scale by 1%`}
                >
                  + 1%
                </button>
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
