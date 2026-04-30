import { useEffect, useMemo, useRef, useState } from 'react'

import {
  createAxisGroupId,
  createRegionId,
  type BreadboardDefinition,
  type ConnectionPoint,
  type DefinitionAxisGroup,
  type DefinitionRegion,
  type DefinitionRegionKind,
  type ScaleCalibration,
} from '../lib/breadboardDefinitionModel'
import {
  computeElectricalGroups,
} from '../lib/modulePinAlignment'
import { dedupAgainstExisting, generatePinGrid, type GridPoint } from '../lib/pinGrid'

type CalibrationStep =
  | { kind: 'idle' }
  | { kind: 'awaiting-first' }
  | { kind: 'awaiting-second'; x1: number; y1: number }
  | { kind: 'awaiting-distance'; x1: number; y1: number; x2: number; y2: number }

type GridStep =
  | { kind: 'idle' }
  | { kind: 'awaiting-first' }
  | { kind: 'awaiting-second'; corner1: { x: number; y: number } }
  | { kind: 'configure'; corner1: { x: number; y: number }; corner2: { x: number; y: number } }

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

function nextRegionName(definition: BreadboardDefinition) {
  const count = (definition.regions?.length ?? 0) + 1
  return `Grid ${count}`
}

function inferRegionKind(
  rows: number,
  cols: number,
  linkRows: boolean,
  linkCols: boolean,
): DefinitionRegionKind {
  // 1xN or 2xN with one axis linked is a classic power rail.
  if (linkCols && !linkRows && rows === 2) return 'power-rail'
  if (linkRows && !linkCols && cols === 2) return 'power-rail'
  if (linkCols && !linkRows) return 'terminal-strip'
  return 'custom-grid'
}

function rowLabel(rowIndex: number) {
  // A, B, ... Z, AA, AB ... (sufficient for typical breadboards).
  if (rowIndex < 26) return String.fromCharCode(65 + rowIndex)
  const high = Math.floor(rowIndex / 26) - 1
  const low = rowIndex % 26
  return `${String.fromCharCode(65 + high)}${String.fromCharCode(65 + low)}`
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
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>({ kind: 'idle' })
  const [calibrationDistance, setCalibrationDistance] = useState('')
  const [calibrationUnit, setCalibrationUnit] = useState<'mm' | 'in'>('in')
  const [gridStep, setGridStep] = useState<GridStep>({ kind: 'idle' })
  const [gridRows, setGridRows] = useState(5)
  const [gridCols, setGridCols] = useState(63)
  const [gridLinkRows, setGridLinkRows] = useState(false)
  const [gridLinkCols, setGridLinkCols] = useState(true)
  const [showPinLabels, setShowPinLabels] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [linkSelection, setLinkSelection] = useState<Set<string>>(new Set())
  const [eraseMode, setEraseMode] = useState(false)
  const [eraseRect, setEraseRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [eraseDragging, setEraseDragging] = useState(false)
  const [linkRect, setLinkRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [linkDragging, setLinkDragging] = useState(false)
  const [copyMode, setCopyMode] = useState(false)
  const [copyRect, setCopyRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [copyDragging, setCopyDragging] = useState(false)
  const [copyPins, setCopyPins] = useState<Array<{ dx: number; dy: number }> | null>(null)
  const [copyCursor, setCopyCursor] = useState<{ x: number; y: number } | null>(null)
  const [transformMode, setTransformMode] = useState(false)
  const [transformRect, setTransformRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [transformDragging, setTransformDragging] = useState(false)
  const [transformState, setTransformState] = useState<{
    selectedIds: Set<string>
    cx: number
    cy: number
    tx: number
    ty: number
    rotDeg: number
    scaleX: number
    scaleY: number
  } | null>(null)
  const [undoStack, setUndoStack] = useState<BreadboardDefinition[]>([])
  const [redoStack, setRedoStack] = useState<BreadboardDefinition[]>([])
  const [showCommands, setShowCommands] = useState(false)
  const undoHandlerRef = useRef<() => void>(() => {})
  const redoHandlerRef = useRef<() => void>(() => {})
  const transformKeyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {})
  const safeWidth = imageWidth > 0 ? imageWidth : 1
  const safeHeight = imageHeight > 0 ? imageHeight : 1

  if (trackedDefinitionId !== definition.id) {
    setTrackedDefinitionId(definition.id)
    setPendingRemovalId(null)
    setCalibrationStep({ kind: 'idle' })
    setGridStep({ kind: 'idle' })
    setLinkMode(false)
    setLinkSelection(new Set())
    setUndoStack([])
    setRedoStack([])
    setCopyMode(false)
    setCopyRect(null)
    setCopyDragging(false)
    setCopyPins(null)
    setCopyCursor(null)
  }

  function pushChange(nextDefinition: BreadboardDefinition) {
    setUndoStack((prev) => [...prev.slice(-49), definition])
    setRedoStack([])
    onChange(nextDefinition)
  }

  function handleUndo() {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack((r) => [...r, definition])
    setUndoStack((u) => u.slice(0, -1))
    onChange(prev)
  }

  function handleRedo() {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack((u) => [...u, definition])
    setRedoStack((r) => r.slice(0, -1))
    onChange(next)
  }

  undoHandlerRef.current = handleUndo
  redoHandlerRef.current = handleRedo
  transformKeyHandlerRef.current = handleTransformKey

  const gridPreview = useMemo(() => {
    if (gridStep.kind !== 'configure') return null
    return generatePinGrid({
      corner1: gridStep.corner1,
      corner2: gridStep.corner2,
      rows: gridRows,
      cols: gridCols,
    })
  }, [gridStep, gridRows, gridCols])

  const railsOverlay = useMemo(
    () => computeElectricalGroups(definition, []),
    [definition],
  )

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

    if (target?.dataset?.pinPointId && !eraseMode && !(copyMode && copyPins !== null) && !transformMode) {
      // Pin click handled separately (including link mode individual-pin toggle).
      return
    }

    const coordinates = getStageCoordinates(event)

    if (!coordinates) {
      return
    }

    // Link mode: drag a rectangle to batch-add pins to the link selection.
    if (linkMode) {
      event.currentTarget.setPointerCapture(event.pointerId)
      setLinkDragging(true)
      setLinkRect({ x1: coordinates.x, y1: coordinates.y, x2: coordinates.x, y2: coordinates.y })
      return
    }

    // Transform area mode: drag a rectangle to select pins, then nudge/rotate/scale with keys.
    if (transformMode) {
      if (transformState !== null) return
      event.currentTarget.setPointerCapture(event.pointerId)
      setTransformDragging(true)
      setTransformRect({ x1: coordinates.x, y1: coordinates.y, x2: coordinates.x, y2: coordinates.y })
      return
    }

    // Copy area mode: drag to select, then click to stamp.
    if (copyMode) {
      if (copyPins === null) {
        event.currentTarget.setPointerCapture(event.pointerId)
        setCopyDragging(true)
        setCopyRect({ x1: coordinates.x, y1: coordinates.y, x2: coordinates.x, y2: coordinates.y })
      } else {
        handlePlaceCopy(coordinates.x, coordinates.y)
      }
      return
    }

    // Erase area mode: drag a rectangle to remove enclosed pins.
    if (eraseMode) {
      event.currentTarget.setPointerCapture(event.pointerId)
      setEraseDragging(true)
      setEraseRect({ x1: coordinates.x, y1: coordinates.y, x2: coordinates.x, y2: coordinates.y })
      return
    }

    // Calibration mode intercepts clicks instead of placing pin holes.
    if (calibrationStep.kind === 'awaiting-first') {
      setCalibrationStep({ kind: 'awaiting-second', x1: coordinates.x, y1: coordinates.y })
      return
    }

    if (calibrationStep.kind === 'awaiting-second') {
      setCalibrationStep({
        kind: 'awaiting-distance',
        x1: calibrationStep.x1,
        y1: calibrationStep.y1,
        x2: coordinates.x,
        y2: coordinates.y,
      })
      setCalibrationDistance('')
      return
    }

    if (calibrationStep.kind === 'awaiting-distance') {
      // Re-click during distance entry restarts point selection.
      setCalibrationStep({ kind: 'awaiting-first' })
      return
    }

    // Grid-fill mode intercepts clicks to capture two corners.
    if (gridStep.kind === 'awaiting-first') {
      setGridStep({ kind: 'awaiting-second', corner1: coordinates })
      return
    }

    if (gridStep.kind === 'awaiting-second') {
      setGridStep({
        kind: 'configure',
        corner1: gridStep.corner1,
        corner2: coordinates,
      })
      return
    }

    if (gridStep.kind === 'configure') {
      // Re-click during configuration restarts corner selection.
      setGridStep({ kind: 'awaiting-first' })
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

    pushChange({
      ...definition,
      points: [...definition.points, newPoint],
    })
  }

  function handleApplyCalibration() {
    if (calibrationStep.kind !== 'awaiting-distance') {
      return
    }

    const rawValue = Number.parseFloat(calibrationDistance)

    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      return
    }

    const realDistanceMm = calibrationUnit === 'in' ? rawValue * 25.4 : rawValue
    const calibration: ScaleCalibration = {
      x1: calibrationStep.x1,
      y1: calibrationStep.y1,
      x2: calibrationStep.x2,
      y2: calibrationStep.y2,
      realDistanceMm,
    }

    pushChange({ ...definition, scaleCalibration: calibration })
    setCalibrationStep({ kind: 'idle' })
    setCalibrationDistance('')
  }

  function handleClearCalibration() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { scaleCalibration: _removed, ...rest } = definition
    pushChange(rest as BreadboardDefinition)
    setCalibrationStep({ kind: 'idle' })
  }

  function handlePinClick(pointId: string) {
    if (linkMode) {
      setLinkSelection((prev) => {
        const next = new Set(prev)
        if (next.has(pointId)) {
          next.delete(pointId)
        } else {
          next.add(pointId)
        }
        return next
      })
      return
    }

    if (pendingRemovalId === pointId) {
      pushChange({
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

    pushChange({
      ...definition,
      points: [],
      regions: definition.regions && definition.regions.length > 0 ? [] : definition.regions,
    })
  }

  function startGridFill() {
    setCalibrationStep({ kind: 'idle' })
    setGridStep({ kind: 'awaiting-first' })
    setEraseMode(false)
    setEraseRect(null)
    cancelCopyMode()
    setTransformMode(false)
    setTransformRect(null)
    setTransformDragging(false)
    setTransformState(null)
  }

  function cancelGridFill() {
    setGridStep({ kind: 'idle' })
  }

  function handleApplyGrid() {
    if (gridStep.kind !== 'configure' || !gridPreview) return

    const pitches = [gridPreview.rowPitch, gridPreview.colPitch].filter((p) => p > 0)
    const tolerance = pitches.length > 0 ? Math.min(...pitches) / 2 : 0

    const dedup = dedupAgainstExisting(
      definition.points,
      gridPreview.points,
      tolerance,
      (p) => ({ x: p.x, y: p.y }),
      (p) => p.id,
    )

    const regionId = createRegionId()
    const rowGroups: DefinitionAxisGroup[] = gridLinkRows
      ? gridPreview.rows.map((_, rowIndex) => ({
          id: createAxisGroupId(),
          label: rowLabel(rowIndex),
          pointIds: [],
        }))
      : []
    const colGroups: DefinitionAxisGroup[] = gridLinkCols
      ? gridPreview.rows[0].map((_, colIndex) => ({
          id: createAxisGroupId(),
          label: String(colIndex + 1),
          pointIds: [],
        }))
      : []

    let labelCursor = Number.parseInt(nextPointLabel(dedup.kept), 10)
    if (!Number.isFinite(labelCursor) || labelCursor < 1) labelCursor = 1

    const newPoints: ConnectionPoint[] = gridPreview.points.map((gp: GridPoint) => {
      const id = createPointId()
      const point: ConnectionPoint = {
        id,
        label: String(labelCursor++),
        x: gp.x,
        y: gp.y,
        kind: 'breadboard-hole',
        snapSource: 'grid-fill',
      }
      if (gridLinkRows || gridLinkCols) {
        point.regionId = regionId
      }
      if (gridLinkRows) {
        point.rowId = rowGroups[gp.rowIndex].id
        rowGroups[gp.rowIndex].pointIds.push(id)
      }
      if (gridLinkCols) {
        point.columnId = colGroups[gp.colIndex].id
        colGroups[gp.colIndex].pointIds.push(id)
      }
      return point
    })

    const allPoints = [...dedup.kept, ...newPoints]

    let nextRegions = definition.regions ?? []
    if (dedup.removedIds.length > 0 && nextRegions.length > 0) {
      const removed = new Set(dedup.removedIds)
      nextRegions = nextRegions
        .map((region) => ({
          ...region,
          pointIds: region.pointIds.filter((id) => !removed.has(id)),
          rows: region.rows.map((g) => ({
            ...g,
            pointIds: g.pointIds.filter((id) => !removed.has(id)),
          })),
          columns: region.columns.map((g) => ({
            ...g,
            pointIds: g.pointIds.filter((id) => !removed.has(id)),
          })),
        }))
        .filter((region) => region.pointIds.length > 0)
    }

    if (gridLinkRows || gridLinkCols) {
      const region: DefinitionRegion = {
        id: regionId,
        name: nextRegionName(definition),
        kind: inferRegionKind(gridRows, gridCols, gridLinkRows, gridLinkCols),
        pointIds: newPoints.map((p) => p.id),
        rows: rowGroups,
        columns: colGroups,
      }
      nextRegions = [...nextRegions, region]
    }

    pushChange({
      ...definition,
      points: allPoints,
      regions: nextRegions.length > 0 ? nextRegions : definition.regions,
    })
    setGridStep({ kind: 'idle' })
  }

  function handleNameChange(name: string) {
    onChange({
      ...definition,
      name,
    })
  }

  function startLinkMode() {
    setCalibrationStep({ kind: 'idle' })
    setGridStep({ kind: 'idle' })
    setPendingRemovalId(null)
    setLinkSelection(new Set())
    setLinkMode(true)
    setEraseMode(false)
    setEraseRect(null)
    cancelCopyMode()
    setTransformMode(false)
    setTransformRect(null)
    setTransformDragging(false)
    setTransformState(null)
  }

  function cancelLinkMode() {
    setLinkMode(false)
    setLinkSelection(new Set())
    setLinkRect(null)
    setLinkDragging(false)
  }

  function startEraseMode() {
    setCalibrationStep({ kind: 'idle' })
    setGridStep({ kind: 'idle' })
    setLinkMode(false)
    setLinkSelection(new Set())
    setPendingRemovalId(null)
    setEraseMode(true)
    setEraseRect(null)
    cancelCopyMode()
    setTransformMode(false)
    setTransformRect(null)
    setTransformDragging(false)
    setTransformState(null)
  }

  function cancelEraseMode() {
    setEraseMode(false)
    setEraseRect(null)
    setEraseDragging(false)
  }

  function startCopyMode() {
    setCalibrationStep({ kind: 'idle' })
    setGridStep({ kind: 'idle' })
    setLinkMode(false)
    setLinkSelection(new Set())
    setEraseMode(false)
    setEraseRect(null)
    setTransformMode(false)
    setTransformRect(null)
    setTransformDragging(false)
    setTransformState(null)
    setCopyMode(true)
    setCopyRect(null)
    setCopyDragging(false)
    setCopyPins(null)
    setCopyCursor(null)
  }

  function cancelCopyMode() {
    setCopyMode(false)
    setCopyRect(null)
    setCopyDragging(false)
    setCopyPins(null)
    setCopyCursor(null)
  }

  function handlePlaceCopy(x: number, y: number) {
    if (!copyPins) return
    let labelCursor = Number.parseInt(nextPointLabel(definition.points), 10)
    if (!Number.isFinite(labelCursor) || labelCursor < 1) labelCursor = 1
    const newPoints: ConnectionPoint[] = copyPins.map((pin) => ({
      id: createPointId(),
      label: String(labelCursor++),
      x: x + pin.dx,
      y: y + pin.dy,
      kind: 'breadboard-hole',
      snapSource: 'manual',
    }))
    pushChange({
      ...definition,
      points: [...definition.points, ...newPoints],
    })
  }

  function getTransformedPoint(
    p: { x: number; y: number },
    ts: { cx: number; cy: number; tx: number; ty: number; rotDeg: number; scaleX: number; scaleY: number },
  ) {
    const cosA = Math.cos((ts.rotDeg * Math.PI) / 180)
    const sinA = Math.sin((ts.rotDeg * Math.PI) / 180)
    const dx = (p.x - ts.cx) * ts.scaleX
    const dy = (p.y - ts.cy) * ts.scaleY
    return {
      x: ts.cx + ts.tx + dx * cosA - dy * sinA,
      y: ts.cy + ts.ty + dx * sinA + dy * cosA,
    }
  }

  function startTransformMode() {
    setCalibrationStep({ kind: 'idle' })
    setGridStep({ kind: 'idle' })
    setLinkMode(false)
    setLinkSelection(new Set())
    setEraseMode(false)
    setEraseRect(null)
    setCopyMode(false)
    setCopyRect(null)
    setCopyDragging(false)
    setCopyPins(null)
    setCopyCursor(null)
    setTransformMode(true)
    setTransformRect(null)
    setTransformDragging(false)
    setTransformState(null)
  }

  function cancelTransformMode() {
    setTransformMode(false)
    setTransformRect(null)
    setTransformDragging(false)
    setTransformState(null)
  }

  function handleApplyTransform() {
    if (transformState === null) return
    const ts = transformState
    const nextPoints = definition.points.map((p) => {
      if (!ts.selectedIds.has(p.id)) return p
      const { x, y } = getTransformedPoint(p, ts)
      return { ...p, x, y }
    })
    pushChange({ ...definition, points: nextPoints })
    setTransformState(null)
  }

  function handleTransformKey(event: KeyboardEvent) {
    if (!transformMode) return
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelTransformMode()
      return
    }
    if (transformState === null) return
    const nudge = event.shiftKey ? 5 : 1
    const rotStep = event.shiftKey ? 1 : 0.1
    const scaleStep = event.shiftKey ? 0.01 : 0.001
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setTransformState((s) => (s ? { ...s, tx: s.tx - nudge } : s))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setTransformState((s) => (s ? { ...s, tx: s.tx + nudge } : s))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setTransformState((s) => (s ? { ...s, ty: s.ty - nudge } : s))
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setTransformState((s) => (s ? { ...s, ty: s.ty + nudge } : s))
    } else if (event.key === '[') {
      event.preventDefault()
      setTransformState((s) => (s ? { ...s, rotDeg: s.rotDeg - rotStep } : s))
    } else if (event.key === ']') {
      event.preventDefault()
      setTransformState((s) => (s ? { ...s, rotDeg: s.rotDeg + rotStep } : s))
    } else if (event.key === '=' || event.key === '+') {
      event.preventDefault()
      setTransformState((s) => s ? { ...s, scaleX: Math.min(5, s.scaleX + scaleStep), scaleY: Math.min(5, s.scaleY + scaleStep) } : s)
    } else if (event.key === '-' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      setTransformState((s) => s ? { ...s, scaleX: Math.max(0.1, s.scaleX - scaleStep), scaleY: Math.max(0.1, s.scaleY - scaleStep) } : s)
    } else if (event.key === '.') {
      event.preventDefault()
      setTransformState((s) => s ? { ...s, scaleX: Math.min(5, s.scaleX + scaleStep) } : s)
    } else if (event.key === ',') {
      event.preventDefault()
      setTransformState((s) => s ? { ...s, scaleX: Math.max(0.1, s.scaleX - scaleStep) } : s)
    } else if (event.key === '>') {
      event.preventDefault()
      setTransformState((s) => s ? { ...s, scaleY: Math.min(5, s.scaleY + scaleStep) } : s)
    } else if (event.key === '<') {
      event.preventDefault()
      setTransformState((s) => s ? { ...s, scaleY: Math.max(0.1, s.scaleY - scaleStep) } : s)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      handleApplyTransform()
    }
  }

  function handleErasePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!eraseDragging && !copyDragging && !transformDragging && !linkDragging && !(copyMode && copyPins !== null)) return
    const coordinates = getStageCoordinates(event)
    if (!coordinates) return
    if (linkDragging) {
      setLinkRect((prev) => (prev ? { ...prev, x2: coordinates.x, y2: coordinates.y } : null))
      return
    }
    if (eraseDragging) {
      setEraseRect((prev) => (prev ? { ...prev, x2: coordinates.x, y2: coordinates.y } : null))
      return
    }
    if (copyDragging) {
      setCopyRect((prev) => (prev ? { ...prev, x2: coordinates.x, y2: coordinates.y } : null))
      return
    }
    if (transformDragging) {
      setTransformRect((prev) => (prev ? { ...prev, x2: coordinates.x, y2: coordinates.y } : null))
      return
    }
    setCopyCursor(coordinates)
  }

  function handleErasePointerUp() {
    if (linkDragging && linkRect) {
      setLinkDragging(false)
      setLinkRect(null)
      const minX = Math.min(linkRect.x1, linkRect.x2)
      const maxX = Math.max(linkRect.x1, linkRect.x2)
      const minY = Math.min(linkRect.y1, linkRect.y2)
      const maxY = Math.max(linkRect.y1, linkRect.y2)
      const enclosed = definition.points.filter(
        (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY,
      )
      if (enclosed.length > 0) {
        setLinkSelection((prev) => {
          const next = new Set(prev)
          enclosed.forEach((p) => next.add(p.id))
          return next
        })
      }
      return
    }
    if (transformDragging && transformRect) {
      setTransformDragging(false)
      setTransformRect(null)
      const minX = Math.min(transformRect.x1, transformRect.x2)
      const maxX = Math.max(transformRect.x1, transformRect.x2)
      const minY = Math.min(transformRect.y1, transformRect.y2)
      const maxY = Math.max(transformRect.y1, transformRect.y2)
      const selected = definition.points.filter(
        (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY,
      )
      if (selected.length > 0) {
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        setTransformState({
          selectedIds: new Set(selected.map((p) => p.id)),
          cx,
          cy,
          tx: 0,
          ty: 0,
          rotDeg: 0,
          scaleX: 1,
          scaleY: 1,
        })
      }
      return
    }
    if (copyDragging && copyRect) {
      setCopyDragging(false)
      const minX = Math.min(copyRect.x1, copyRect.x2)
      const maxX = Math.max(copyRect.x1, copyRect.x2)
      const minY = Math.min(copyRect.y1, copyRect.y2)
      const maxY = Math.max(copyRect.y1, copyRect.y2)
      const selected = definition.points.filter(
        (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY,
      )
      setCopyRect(null)
      if (selected.length > 0) {
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        setCopyPins(selected.map((p) => ({ dx: p.x - cx, dy: p.y - cy })))
      }
      return
    }
    if (!eraseDragging || !eraseRect) return
    setEraseDragging(false)
    const minX = Math.min(eraseRect.x1, eraseRect.x2)
    const maxX = Math.max(eraseRect.x1, eraseRect.x2)
    const minY = Math.min(eraseRect.y1, eraseRect.y2)
    const maxY = Math.max(eraseRect.y1, eraseRect.y2)
    const toRemove = new Set(
      definition.points
        .filter((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
        .map((p) => p.id),
    )
    setEraseRect(null)
    if (toRemove.size === 0) return
    const nextRegions = pruneSelectedFromExistingGroups(definition.regions, toRemove)
    pushChange({
      ...definition,
      points: definition.points.filter((p) => !toRemove.has(p.id)),
      regions: nextRegions,
    })
  }

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo.
  // Arrow / [ ] + - keys when in transform mode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      transformKeyHandlerRef.current(event)
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoHandlerRef.current()
      } else if (event.key === 'y' || (event.key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redoHandlerRef.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function pruneSelectedFromExistingGroups(
    regions: DefinitionRegion[] | undefined,
    selected: Set<string>,
  ): DefinitionRegion[] | undefined {
    if (!regions || regions.length === 0) {
      return regions
    }
    const pruned = regions
      .map((region) => ({
        ...region,
        pointIds: region.pointIds.filter((id) => !selected.has(id)),
        rows: region.rows
          .map((g) => ({ ...g, pointIds: g.pointIds.filter((id) => !selected.has(id)) }))
          .filter((g) => g.pointIds.length > 0),
        columns: region.columns
          .map((g) => ({ ...g, pointIds: g.pointIds.filter((id) => !selected.has(id)) }))
          .filter((g) => g.pointIds.length > 0),
      }))
      .filter(
        (region) =>
          region.pointIds.length > 0 || region.rows.length > 0 || region.columns.length > 0,
      )
    return pruned
  }

  function handleLinkSelectedAsRail() {
    if (linkSelection.size < 2) {
      return
    }
    const selectedIds = new Set(linkSelection)
    const regionId = createRegionId()
    const rowId = createAxisGroupId()
    const orderedSelected = definition.points
      .filter((p) => selectedIds.has(p.id))
      .map((p) => p.id)
    const newRegion: DefinitionRegion = {
      id: regionId,
      name: nextRegionName(definition),
      kind: 'custom-grid',
      pointIds: orderedSelected,
      rows: [{ id: rowId, label: 'Net', pointIds: orderedSelected }],
      columns: [],
    }
    const prunedRegions = pruneSelectedFromExistingGroups(definition.regions, selectedIds)
    const nextPoints = definition.points.map((point) => {
      if (!selectedIds.has(point.id)) {
        return point
      }
      return {
        ...point,
        regionId,
        rowId,
        // Drop any prior columnId so the new manual rail is the source of truth.
        columnId: undefined,
      }
    })
    pushChange({
      ...definition,
      points: nextPoints,
      regions: [...(prunedRegions ?? []), newRegion],
    })
    setLinkSelection(new Set())
  }

  function handleUnlinkSelected() {
    if (linkSelection.size === 0) {
      return
    }
    const selectedIds = new Set(linkSelection)
    const prunedRegions = pruneSelectedFromExistingGroups(definition.regions, selectedIds)
    const nextPoints = definition.points.map((point) => {
      if (!selectedIds.has(point.id)) {
        return point
      }
      return {
        ...point,
        regionId: undefined,
        rowId: undefined,
        columnId: undefined,
      }
    })
    pushChange({
      ...definition,
      points: nextPoints,
      regions: prunedRegions,
    })
    setLinkSelection(new Set())
  }

  function handleLinkTransformSelected() {
    if (!transformState || transformState.selectedIds.size < 2) return
    const selectedIds = transformState.selectedIds
    const regionId = createRegionId()
    const rowId = createAxisGroupId()
    const orderedSelected = definition.points
      .filter((p) => selectedIds.has(p.id))
      .map((p) => p.id)
    const newRegion: DefinitionRegion = {
      id: regionId,
      name: nextRegionName(definition),
      kind: 'custom-grid',
      pointIds: orderedSelected,
      rows: [{ id: rowId, label: 'Net', pointIds: orderedSelected }],
      columns: [],
    }
    const prunedRegions = pruneSelectedFromExistingGroups(definition.regions, selectedIds)
    const nextPoints = definition.points.map((point) => {
      if (!selectedIds.has(point.id)) return point
      return { ...point, regionId, rowId, columnId: undefined }
    })
    pushChange({
      ...definition,
      points: nextPoints,
      regions: [...(prunedRegions ?? []), newRegion],
    })
    // Keep transformState active so the user can still apply positional changes.
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
              onClick={handleUndo}
              disabled={isBusy || undoStack.length === 0}
              title="Undo (Ctrl+Z)"
              aria-label="Undo last action"
            >
              ↩ Undo
            </button>
            <button
              type="button"
              className="action-button action-button--ghost"
              onClick={handleRedo}
              disabled={isBusy || redoStack.length === 0}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              ↪ Redo
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
              className={`action-button${calibrationStep.kind !== 'idle' ? '' : ' action-button--ghost'}`}
              onClick={() =>
                calibrationStep.kind === 'idle'
                  ? setCalibrationStep({ kind: 'awaiting-first' })
                  : setCalibrationStep({ kind: 'idle' })
              }
              disabled={isBusy}
              aria-pressed={calibrationStep.kind !== 'idle'}
            >
              {calibrationStep.kind !== 'idle' ? 'Cancel scale' : 'Set scale'}
            </button>
            <button
              type="button"
              className={`action-button${gridStep.kind !== 'idle' ? '' : ' action-button--ghost'}`}
              onClick={() => (gridStep.kind === 'idle' ? startGridFill() : cancelGridFill())}
              disabled={isBusy}
              aria-pressed={gridStep.kind !== 'idle'}
            >
              {gridStep.kind !== 'idle' ? 'Cancel grid' : 'Grid fill'}
            </button>
            <button
              type="button"
              className={`action-button${linkMode ? '' : ' action-button--ghost'}`}
              onClick={() => (linkMode ? cancelLinkMode() : startLinkMode())}
              disabled={isBusy}
              aria-pressed={linkMode}
            >
              {linkMode ? 'Cancel link' : 'Link pins'}
            </button>
            <button
              type="button"
              className={`action-button${eraseMode ? '' : ' action-button--ghost'}`}
              onClick={() => (eraseMode ? cancelEraseMode() : startEraseMode())}
              disabled={isBusy}
              aria-pressed={eraseMode}
            >
              {eraseMode ? 'Cancel erase' : 'Erase area'}
            </button>
            <button
              type="button"
              className={`action-button${copyMode ? '' : ' action-button--ghost'}`}
              onClick={() => (copyMode ? cancelCopyMode() : startCopyMode())}
              disabled={isBusy}
              aria-pressed={copyMode}
            >
              {copyMode ? (copyPins !== null ? 'Cancel stamp' : 'Cancel copy') : 'Copy area'}
            </button>
            <button
              type="button"
              className={`action-button${transformMode ? '' : ' action-button--ghost'}`}
              onClick={() => (transformMode ? cancelTransformMode() : startTransformMode())}
              disabled={isBusy}
              aria-pressed={transformMode}
            >
              {transformMode
                ? transformState !== null
                  ? 'Cancel move'
                  : 'Cancel select'
                : 'Move area'}
            </button>
            <button
              type="button"
              className="action-button action-button--ghost"
              onClick={() => setShowCommands(true)}
              disabled={isBusy}
              aria-label="Show all commands"
              title="Show all commands"
            >
              ⌘ Commands
            </button>
            <button
              type="button"
              className="action-button"
              onClick={onSaveAndFinish}
              disabled={isBusy}
            >
              Save breadboard
            </button>
            <label className="pin-editor__toggle">
              <input
                type="checkbox"
                checked={showPinLabels}
                onChange={(event) => setShowPinLabels(event.target.checked)}
              />
              Show pin labels
            </label>
          </div>
        </div>
      </header>
      <p className="pin-editor__hint">
        {calibrationStep.kind === 'awaiting-first'
          ? 'Click the first reference point on the breadboard image.'
          : calibrationStep.kind === 'awaiting-second'
          ? 'Click the second reference point. (Click the first point again to restart.)'
          : calibrationStep.kind === 'awaiting-distance'
          ? 'Enter the real-world distance between the two points below and click Apply.'
          : gridStep.kind === 'awaiting-first'
          ? 'Grid fill: click the first corner of the rectangle to populate.'
          : gridStep.kind === 'awaiting-second'
          ? 'Grid fill: click the opposite corner.'
          : gridStep.kind === 'configure'
          ? 'Adjust rows, columns, and linking below, then Apply. Click the canvas to re-pick corners.'
          : linkMode
          ? 'Link pins: click any pin holes to toggle them in the selection, then Link as rail to connect them electrically. Use Unlink to remove the selection from any rails.'
          : eraseMode
          ? 'Erase area: drag a rectangle over pin holes to remove them all at once.'
          : copyMode && copyPins === null
          ? 'Copy area: drag a rectangle to select the pin holes to copy.'
          : copyMode && copyPins !== null
          ? `Copy area: ${copyPins.length} pin${copyPins.length === 1 ? '' : 's'} copied — click anywhere on the canvas to stamp them. You can stamp multiple times.`
          : transformMode && transformState === null
          ? 'Move area: drag a rectangle to select the pin holes to transform.'
          : transformMode && transformState !== null
          ? `Move area: ${transformState.selectedIds.size} pin${transformState.selectedIds.size === 1 ? '' : 's'} selected — Arrow keys to nudge (Shift = 5×), [ / ] to rotate ±0.1° (Shift = ±1°), + / − to scale both ±0.1% (Shift = ±1%), , / . for X-only, < / > for Y-only. Enter to apply, Esc to cancel.`
          : 'Click the image to drop a pin hole. Click an existing pin once to select it, then click again to remove it. These points will be selectable later when wiring the breadboard.'}
      </p>
      {linkMode ? (
        <div className="pin-editor__calibration-form" role="group" aria-label="Link selected pins">
          <p className="pin-editor__hint" aria-live="polite">
            {linkSelection.size} pin{linkSelection.size === 1 ? '' : 's'} selected
          </p>
          <button
            type="button"
            className="action-button"
            onClick={handleLinkSelectedAsRail}
            disabled={linkSelection.size < 2}
          >
            Link as rail
          </button>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={handleUnlinkSelected}
            disabled={linkSelection.size === 0}
          >
            Unlink selected
          </button>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={() => setLinkSelection(new Set())}
            disabled={linkSelection.size === 0}
          >
            Clear selection
          </button>
        </div>
      ) : null}
      {calibrationStep.kind === 'awaiting-distance' ? (
        <div className="pin-editor__calibration-form" role="group" aria-label="Set scale distance">
          <label className="control-group" htmlFor="calibration-distance">
            <span className="control-group__label">Distance between points</span>
            <input
              id="calibration-distance"
              className="control-group__input"
              type="number"
              min="0.01"
              step="any"
              value={calibrationDistance}
              onChange={(event) => setCalibrationDistance(event.target.value)}
              placeholder={calibrationUnit === 'in' ? 'e.g. 6.0' : 'e.g. 152.4'}
              aria-label="Distance value"
            />
          </label>
          <label className="control-group" htmlFor="calibration-unit">
            <span className="control-group__label">Unit</span>
            <select
              id="calibration-unit"
              className="control-group__input"
              value={calibrationUnit}
              onChange={(event) => setCalibrationUnit(event.target.value as 'mm' | 'in')}
            >
              <option value="in">inches</option>
              <option value="mm">mm</option>
            </select>
          </label>
          <button
            type="button"
            className="action-button"
            onClick={handleApplyCalibration}
            disabled={Number.parseFloat(calibrationDistance) <= 0 || !calibrationDistance}
          >
            Apply
          </button>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={() => setCalibrationStep({ kind: 'awaiting-first' })}
          >
            Re-pick points
          </button>
        </div>
      ) : null}
      {gridStep.kind === 'configure' ? (
        <div className="pin-editor__calibration-form" role="group" aria-label="Grid fill options">
          <label className="control-group">
            <span className="control-group__label">Rows</span>
            <input
              className="control-group__input"
              type="number"
              min={1}
              step={1}
              value={gridRows}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10)
                setGridRows(Number.isFinite(next) && next >= 1 ? next : 1)
              }}
            />
          </label>
          <label className="control-group">
            <span className="control-group__label">Columns</span>
            <input
              className="control-group__input"
              type="number"
              min={1}
              step={1}
              value={gridCols}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10)
                setGridCols(Number.isFinite(next) && next >= 1 ? next : 1)
              }}
            />
          </label>
          <label className="control-group control-group--inline">
            <input
              type="checkbox"
              checked={gridLinkRows}
              onChange={(event) => setGridLinkRows(event.target.checked)}
            />
            <span>Link rows (rail)</span>
          </label>
          <label className="control-group control-group--inline">
            <input
              type="checkbox"
              checked={gridLinkCols}
              onChange={(event) => setGridLinkCols(event.target.checked)}
            />
            <span>Link columns (rail)</span>
          </label>
          {gridPreview ? (
            <p className="pin-editor__hint" aria-live="polite">
              {gridPreview.points.length} points · row pitch{' '}
              {gridPreview.rowPitch.toFixed(1)} px · col pitch{' '}
              {gridPreview.colPitch.toFixed(1)} px
              {definition.scaleCalibration
                ? (() => {
                    const cal = definition.scaleCalibration!
                    const pxDistance = Math.hypot(cal.x2 - cal.x1, cal.y2 - cal.y1) || 1
                    const mmPerPx = cal.realDistanceMm / pxDistance
                    const colMm = gridPreview.colPitch * mmPerPx
                    const rowMm = gridPreview.rowPitch * mmPerPx
                    return ` (≈ ${(colMm / 25.4).toFixed(3)} in cols, ${(rowMm / 25.4).toFixed(3)} in rows)`
                  })()
                : ''}
            </p>
          ) : null}
          <button
            type="button"
            className="action-button"
            onClick={handleApplyGrid}
            disabled={!gridPreview || gridPreview.points.length === 0}
          >
            Apply grid
          </button>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={() => setGridStep({ kind: 'awaiting-first' })}
          >
            Re-pick corners
          </button>
        </div>
      ) : null}
      {transformMode && transformState !== null ? (
        <div className="pin-editor__calibration-form" role="group" aria-label="Move selected pins">
          <p className="pin-editor__hint" aria-live="polite">
            {transformState.selectedIds.size} pin{transformState.selectedIds.size === 1 ? '' : 's'} selected
            {transformState.tx !== 0 || transformState.ty !== 0
              ? ` · offset (${transformState.tx.toFixed(1)}, ${transformState.ty.toFixed(1)}) px`
              : ''}
            {transformState.rotDeg !== 0 ? ` · rotation ${transformState.rotDeg.toFixed(2)}°` : ''}
            {transformState.scaleX !== 1 || transformState.scaleY !== 1
              ? transformState.scaleX === transformState.scaleY
                ? ` · scale ${(transformState.scaleX * 100).toFixed(1)}%`
                : ` · scaleX ${(transformState.scaleX * 100).toFixed(1)}% · scaleY ${(transformState.scaleY * 100).toFixed(1)}%`
              : ''}
          </p>
          <button
            type="button"
            className="action-button"
            onClick={handleApplyTransform}
            disabled={isBusy}
          >
            Apply (Enter)
          </button>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={handleLinkTransformSelected}
            disabled={isBusy || !transformState || transformState.selectedIds.size < 2}
            title="Link the selected pins as an electrical rail"
          >
            Link as rail
          </button>
          <button
            type="button"
            className="action-button action-button--ghost"
            onClick={cancelTransformMode}
            disabled={isBusy}
          >
            Cancel (Esc)
          </button>
        </div>
      ) : null}
      {definition.scaleCalibration ? (
        <p className="pin-editor__calibration-status" aria-live="polite">
          Scale set:{' '}
          {(definition.scaleCalibration.realDistanceMm / 25.4).toFixed(3)} in /{' '}
          {definition.scaleCalibration.realDistanceMm.toFixed(2)} mm over{' '}
          {Math.round(
            Math.hypot(
              definition.scaleCalibration.x2 - definition.scaleCalibration.x1,
              definition.scaleCalibration.y2 - definition.scaleCalibration.y1,
            ),
          )}{' '}
          px &nbsp;
          <button
            type="button"
            className="action-button action-button--ghost action-button--inline"
            onClick={handleClearCalibration}
            disabled={isBusy}
          >
            Clear
          </button>
        </p>
      ) : null}
      <section className="image-workspace__stage-shell">
        <div
          className={`image-stage${calibrationStep.kind !== 'idle' ? ' image-stage--calibrating' : ''}`}
          aria-label="Breadboard pin hole stage"
        >
          <svg
            ref={svgRef}
            className="image-stage__svg pin-editor__svg"
            viewBox={`0 0 ${safeWidth} ${safeHeight}`}
            role="img"
            aria-label={`Breadboard pin hole canvas with ${definition.points.length} pins`}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleErasePointerMove}
            onPointerUp={handleErasePointerUp}
          >
            <image
              href={imagePath}
              width={safeWidth}
              height={safeHeight}
              preserveAspectRatio="none"
            />
            <g className="pin-editor__rails" aria-hidden="true">
              {railsOverlay.map((group, groupIndex) => {
                if (group.size < 2) {
                  return null
                }
                const pts = definition.points.filter((p) => group.has(p.id))
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
                const groupKey = sorted.map((p) => p.id).join('|') || `g-${groupIndex}`
                let hash = 0
                for (let i = 0; i < groupKey.length; i += 1) {
                  hash = (hash * 31 + groupKey.charCodeAt(i)) >>> 0
                }
                const palette = ['#1f5fcc', '#cc3333', '#1f8e4d', '#e08a00', '#7a3fc6', '#0a8a8a', '#b8338a', '#5a6f00']
                const color = palette[hash % palette.length]
                const pointsAttr = sorted.map((p) => `${p.x},${p.y}`).join(' ')
                return (
                  <polyline
                    key={`rail-${groupIndex}`}
                    points={pointsAttr}
                    fill="none"
                    stroke={color}
                    strokeWidth={Math.max(2, Math.min(safeWidth, safeHeight) * 0.005)}
                    strokeOpacity={0.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )
              })}
            </g>
            {/* Saved calibration line */}
            {definition.scaleCalibration && calibrationStep.kind === 'idle' ? (
              <g className="pin-editor__calibration-overlay" aria-hidden="true">
                <line
                  x1={definition.scaleCalibration.x1}
                  y1={definition.scaleCalibration.y1}
                  x2={definition.scaleCalibration.x2}
                  y2={definition.scaleCalibration.y2}
                  stroke="#f59e0b"
                  strokeWidth={3}
                  strokeDasharray="8 4"
                />
                <circle cx={definition.scaleCalibration.x1} cy={definition.scaleCalibration.y1} r={8} fill="#f59e0b" fillOpacity={0.85} />
                <circle cx={definition.scaleCalibration.x2} cy={definition.scaleCalibration.y2} r={8} fill="#f59e0b" fillOpacity={0.85} />
              </g>
            ) : null}
            {/* Active calibration in-progress overlay */}
            {calibrationStep.kind === 'awaiting-second' || calibrationStep.kind === 'awaiting-distance' ? (
              <g className="pin-editor__calibration-overlay pin-editor__calibration-overlay--active" aria-hidden="true">
                {calibrationStep.kind === 'awaiting-distance' ? (
                  <line
                    x1={calibrationStep.x1}
                    y1={calibrationStep.y1}
                    x2={calibrationStep.x2}
                    y2={calibrationStep.y2}
                    stroke="#3b82f6"
                    strokeWidth={3}
                    strokeDasharray="8 4"
                  />
                ) : null}
                <circle
                  cx={calibrationStep.x1}
                  cy={calibrationStep.y1}
                  r={9}
                  fill="#3b82f6"
                  fillOpacity={0.85}
                />
                {calibrationStep.kind === 'awaiting-distance' ? (
                  <circle
                    cx={calibrationStep.x2}
                    cy={calibrationStep.y2}
                    r={9}
                    fill="#3b82f6"
                    fillOpacity={0.85}
                  />
                ) : null}
              </g>
            ) : null}
            {/* Grid-fill in-progress overlay */}
            {gridStep.kind === 'awaiting-second' ? (
              <circle
                cx={gridStep.corner1.x}
                cy={gridStep.corner1.y}
                r={9}
                fill="#10b981"
                fillOpacity={0.85}
                aria-hidden="true"
              />
            ) : null}
            {gridStep.kind === 'configure' && gridPreview ? (
              <g className="pin-editor__grid-overlay" aria-hidden="true">
                <rect
                  x={Math.min(gridStep.corner1.x, gridStep.corner2.x)}
                  y={Math.min(gridStep.corner1.y, gridStep.corner2.y)}
                  width={Math.abs(gridStep.corner2.x - gridStep.corner1.x)}
                  height={Math.abs(gridStep.corner2.y - gridStep.corner1.y)}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
                {gridPreview.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(4, Math.min(safeWidth, safeHeight) * 0.006)}
                    fill="#10b981"
                    fillOpacity={0.6}
                  />
                ))}
              </g>
            ) : null}
            {linkMode && linkRect ? (
              <rect
                x={Math.min(linkRect.x1, linkRect.x2)}
                y={Math.min(linkRect.y1, linkRect.y2)}
                width={Math.abs(linkRect.x2 - linkRect.x1)}
                height={Math.abs(linkRect.y2 - linkRect.y1)}
                fill="rgba(31, 95, 204, 0.1)"
                stroke="#1f5fcc"
                strokeWidth={2}
                strokeDasharray="6 3"
                pointerEvents="none"
                aria-hidden="true"
              />
            ) : null}
            {eraseMode && eraseRect ? (
              <rect
                x={Math.min(eraseRect.x1, eraseRect.x2)}
                y={Math.min(eraseRect.y1, eraseRect.y2)}
                width={Math.abs(eraseRect.x2 - eraseRect.x1)}
                height={Math.abs(eraseRect.y2 - eraseRect.y1)}
                fill="rgba(239, 68, 68, 0.2)"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="6 3"
                pointerEvents="none"
                aria-hidden="true"
              />
            ) : null}
            {copyMode && copyRect !== null ? (
              <rect
                x={Math.min(copyRect.x1, copyRect.x2)}
                y={Math.min(copyRect.y1, copyRect.y2)}
                width={Math.abs(copyRect.x2 - copyRect.x1)}
                height={Math.abs(copyRect.y2 - copyRect.y1)}
                fill="rgba(139, 92, 246, 0.15)"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="6 3"
                pointerEvents="none"
                aria-hidden="true"
              />
            ) : null}
            {copyMode && copyPins !== null && copyCursor !== null ? (
              <g aria-hidden="true" pointerEvents="none">
                {copyPins.map((pin, i) => (
                  <circle
                    key={i}
                    cx={copyCursor.x + pin.dx}
                    cy={copyCursor.y + pin.dy}
                    r={Math.max(3, Math.min(safeWidth, safeHeight) * 0.004)}
                    fill="#8b5cf6"
                    fillOpacity={0.55}
                    stroke="#6d28d9"
                    strokeWidth={1}
                  />
                ))}
              </g>
            ) : null}
            {transformMode && transformRect !== null ? (
              <rect
                x={Math.min(transformRect.x1, transformRect.x2)}
                y={Math.min(transformRect.y1, transformRect.y2)}
                width={Math.abs(transformRect.x2 - transformRect.x1)}
                height={Math.abs(transformRect.y2 - transformRect.y1)}
                fill="rgba(20, 184, 166, 0.1)"
                stroke="#14b8a6"
                strokeWidth={2}
                strokeDasharray="6 3"
                pointerEvents="none"
                aria-hidden="true"
              />
            ) : null}
            {transformMode && transformState !== null ? (
              <g aria-hidden="true" pointerEvents="none">
                {definition.points
                  .filter((p) => transformState.selectedIds.has(p.id))
                  .map((p, i) => {
                    const tp = getTransformedPoint(p, transformState)
                    const r = Math.max(3, Math.min(safeWidth, safeHeight) * 0.004)
                    return (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r={r + 2} fill="none" stroke="#14b8a6" strokeWidth={2} strokeOpacity={0.6} />
                        <circle cx={tp.x} cy={tp.y} r={r} fill="#3b82f6" fillOpacity={0.75} stroke="#1e40af" strokeWidth={1} />
                      </g>
                    )
                  })}
              </g>
            ) : null}
            {definition.points.map((point) => {
              const isPending = pendingRemovalId === point.id
              const isLinkSelected = linkMode && linkSelection.has(point.id)
              const radius = Math.max(3, Math.min(safeWidth, safeHeight) * 0.004)

              return (
                <g key={point.id} className="pin-editor__pin-group">
                  <circle
                    data-pin-point-id={point.id}
                    className={`pin-editor__pin${isPending ? ' pin-editor__pin--pending' : ''}${isLinkSelected ? ' pin-editor__pin--link-selected' : ''}`}
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    fill={isLinkSelected ? '#1f5fcc' : undefined}
                    stroke={isLinkSelected ? '#0a2d6b' : undefined}
                    role="button"
                    aria-label={`Pin hole ${point.label}${isPending ? ' (click again to remove)' : ''}${isLinkSelected ? ' (selected for linking)' : ''}`}
                    onPointerDown={(event) => {
                      if (eraseMode) return
                      if (copyMode) return
                      if (transformMode) return
                      event.stopPropagation()
                      handlePinClick(point.id)
                    }}
                  >
                    {showPinLabels ? null : <title>{point.label}</title>}
                  </circle>
                  {showPinLabels ? (
                    <text
                      className="pin-editor__pin-label"
                      x={point.x}
                      y={point.y - radius - 4}
                      textAnchor="middle"
                    >
                      {point.label}
                    </text>
                  ) : null}
                </g>
              )
            })}
          </svg>
        </div>
      </section>

      {showCommands && (
        <div
          className="cmd-palette"
          role="dialog"
          aria-modal="true"
          aria-label="Commands"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setShowCommands(false) } }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCommands(false) }}
        >
          <div className="cmd-palette__dialog">
            <div className="cmd-palette__header">
              <h2 className="cmd-palette__title">Commands</h2>
              <button type="button" className="cmd-palette__close" onClick={() => setShowCommands(false)} aria-label="Close commands">✕</button>
            </div>
            <div className="cmd-palette__body">

              <div className="cmd-palette__group">
                <p className="cmd-palette__group-label">General</p>
                <button type="button" className="cmd-palette__item" disabled={undoStack.length === 0} onClick={() => { setShowCommands(false); handleUndo() }}>
                  <span className="cmd-palette__item-label">Undo</span>
                  <span className="cmd-palette__shortcuts"><kbd className="cmd-palette__key">Ctrl</kbd><kbd className="cmd-palette__key">Z</kbd></span>
                </button>
                <button type="button" className="cmd-palette__item" disabled={redoStack.length === 0} onClick={() => { setShowCommands(false); handleRedo() }}>
                  <span className="cmd-palette__item-label">Redo</span>
                  <span className="cmd-palette__shortcuts"><kbd className="cmd-palette__key">Ctrl</kbd><kbd className="cmd-palette__key">Y</kbd></span>
                </button>
                <button type="button" className="cmd-palette__item" disabled={isBusy || definition.points.length === 0} onClick={() => { setShowCommands(false); handleClearAll() }}>
                  <span className="cmd-palette__item-label">Clear all pins</span>
                </button>
                <button type="button" className="cmd-palette__item" disabled={isBusy} onClick={() => { setShowCommands(false); onSaveAndFinish() }}>
                  <span className="cmd-palette__item-label">Save breadboard</span>
                </button>
                <button type="button" className="cmd-palette__item" disabled={isBusy} onClick={() => { setShowCommands(false); onBack() }}>
                  <span className="cmd-palette__item-label">Back to alignment</span>
                </button>
              </div>

              <div className="cmd-palette__group">
                <p className="cmd-palette__group-label">Modes</p>
                <button
                  type="button"
                  className={`cmd-palette__item${calibrationStep.kind !== 'idle' ? ' cmd-palette__item--active' : ''}`}
                  onClick={() => { setShowCommands(false); calibrationStep.kind === 'idle' ? setCalibrationStep({ kind: 'awaiting-first' }) : setCalibrationStep({ kind: 'idle' }) }}
                >
                  <span className="cmd-palette__item-label">{calibrationStep.kind !== 'idle' ? '✓ Set scale — cancel' : 'Set scale'}</span>
                </button>
                <button
                  type="button"
                  className={`cmd-palette__item${gridStep.kind !== 'idle' ? ' cmd-palette__item--active' : ''}`}
                  onClick={() => { setShowCommands(false); gridStep.kind === 'idle' ? startGridFill() : cancelGridFill() }}
                >
                  <span className="cmd-palette__item-label">{gridStep.kind !== 'idle' ? '✓ Grid fill — cancel' : 'Grid fill'}</span>
                </button>
                <button
                  type="button"
                  className={`cmd-palette__item${linkMode ? ' cmd-palette__item--active' : ''}`}
                  onClick={() => { setShowCommands(false); linkMode ? cancelLinkMode() : startLinkMode() }}
                >
                  <span className="cmd-palette__item-label">{linkMode ? '✓ Link pins — cancel' : 'Link pins'}</span>
                </button>
                <button
                  type="button"
                  className={`cmd-palette__item${eraseMode ? ' cmd-palette__item--active' : ''}`}
                  onClick={() => { setShowCommands(false); eraseMode ? cancelEraseMode() : startEraseMode() }}
                >
                  <span className="cmd-palette__item-label">{eraseMode ? '✓ Erase area — cancel' : 'Erase area'}</span>
                </button>
                <button
                  type="button"
                  className={`cmd-palette__item${copyMode ? ' cmd-palette__item--active' : ''}`}
                  onClick={() => { setShowCommands(false); copyMode ? cancelCopyMode() : startCopyMode() }}
                >
                  <span className="cmd-palette__item-label">{copyMode ? '✓ Copy area — cancel' : 'Copy area'}</span>
                </button>
                <button
                  type="button"
                  className={`cmd-palette__item${transformMode ? ' cmd-palette__item--active' : ''}`}
                  onClick={() => { setShowCommands(false); transformMode ? cancelTransformMode() : startTransformMode() }}
                >
                  <span className="cmd-palette__item-label">{transformMode ? '✓ Move / transform area — cancel' : 'Move / transform area'}</span>
                </button>
              </div>

              {transformMode && transformState !== null && (
                <div className="cmd-palette__group">
                  <p className="cmd-palette__group-label">Transform — {transformState.selectedIds.size} pin{transformState.selectedIds.size === 1 ? '' : 's'} selected</p>
                  <button type="button" className="cmd-palette__item" disabled={isBusy || transformState.selectedIds.size < 2} onClick={() => { setShowCommands(false); handleLinkTransformSelected() }}>
                    <span className="cmd-palette__item-label">Link selected as rail</span>
                  </button>
                  <button type="button" className="cmd-palette__item" disabled={isBusy} onClick={() => { setShowCommands(false); handleApplyTransform() }}>
                    <span className="cmd-palette__item-label">Apply transform</span>
                    <span className="cmd-palette__shortcuts"><kbd className="cmd-palette__key">Enter</kbd></span>
                  </button>
                  <button type="button" className="cmd-palette__item" onClick={() => { setShowCommands(false); cancelTransformMode() }}>
                    <span className="cmd-palette__item-label">Cancel transform</span>
                    <span className="cmd-palette__shortcuts"><kbd className="cmd-palette__key">Esc</kbd></span>
                  </button>
                  <div className="cmd-palette__item cmd-palette__item--hint">
                    <span className="cmd-palette__item-label">Nudge position</span>
                    <span className="cmd-palette__shortcuts"><kbd className="cmd-palette__key">↑↓←→</kbd><span className="cmd-palette__item-note">Shift ×5</span></span>
                  </div>
                  <div className="cmd-palette__item cmd-palette__item--hint">
                    <span className="cmd-palette__item-label">Rotate ±0.1°</span>
                    <span className="cmd-palette__shortcuts"><kbd className="cmd-palette__key">[</kbd><kbd className="cmd-palette__key">]</kbd><span className="cmd-palette__item-note">Shift ±1°</span></span>
                  </div>
                  <div className="cmd-palette__item cmd-palette__item--hint">
                    <span className="cmd-palette__item-label">Scale both axes ±0.1%</span>
                    <span className="cmd-palette__shortcuts"><kbd className="cmd-palette__key">+</kbd><kbd className="cmd-palette__key">−</kbd><span className="cmd-palette__item-note">Shift ±1%</span></span>
                  </div>
                  <div className="cmd-palette__item cmd-palette__item--hint">
                    <span className="cmd-palette__item-label">Scale X only ±0.1%</span>
                    <span className="cmd-palette__shortcuts"><kbd className="cmd-palette__key">.</kbd><kbd className="cmd-palette__key">,</kbd></span>
                  </div>
                  <div className="cmd-palette__item cmd-palette__item--hint">
                    <span className="cmd-palette__item-label">Scale Y only ±0.1%</span>
                    <span className="cmd-palette__shortcuts"><kbd className="cmd-palette__key">&gt;</kbd><kbd className="cmd-palette__key">&lt;</kbd></span>
                  </div>
                </div>
              )}

              {linkMode && (
                <div className="cmd-palette__group">
                  <p className="cmd-palette__group-label">Link mode — {linkSelection.size} pin{linkSelection.size === 1 ? '' : 's'} selected</p>
                  <button type="button" className="cmd-palette__item" disabled={linkSelection.size < 2} onClick={() => { setShowCommands(false); handleLinkSelectedAsRail() }}>
                    <span className="cmd-palette__item-label">Link selected as rail</span>
                  </button>
                  <button type="button" className="cmd-palette__item" disabled={linkSelection.size === 0} onClick={() => { setShowCommands(false); handleUnlinkSelected() }}>
                    <span className="cmd-palette__item-label">Unlink selected</span>
                  </button>
                  <button type="button" className="cmd-palette__item" disabled={linkSelection.size === 0} onClick={() => { setShowCommands(false); setLinkSelection(new Set()) }}>
                    <span className="cmd-palette__item-label">Clear link selection</span>
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </section>
  )
}
