import { useMemo, useRef, useState } from 'react'

import {
  DEFAULT_PIN_PITCH_MM,
  PART_CATEGORIES,
  PHYSICAL_POINT_KINDS,
  createImageViewId,
  createLogicalPinId,
  createPhysicalPointId,
  findImageView,
  generatePinRowMm,
  imagePointToMm,
  mmToImagePoint,
  type CalibrationCorners,
  type ImagePoint,
  type ImageViewSide,
  type LibraryPartDefinition,
  type LogicalPin,
  type MmPoint,
  type PartCategory,
  type PartImageCalibration,
  type PartImageView,
  type PhysicalPoint,
  type PhysicalPointKind,
} from '../lib/partLibraryModel'
import { uploadLibraryPartImage } from '../lib/partLibraryApi'

type ModuleWorkspaceProps = {
  part: LibraryPartDefinition
  isBusy?: boolean
  status: string
  onChange: (next: LibraryPartDefinition) => void
  onSave: () => void
  onBack: () => void
}

type StageMode = 'calibrate' | 'point' | 'pin-row'

type CornerKey = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'

const CORNER_ORDER: { key: CornerKey; label: string }[] = [
  { key: 'topLeft', label: 'Top-left' },
  { key: 'topRight', label: 'Top-right' },
  { key: 'bottomRight', label: 'Bottom-right' },
  { key: 'bottomLeft', label: 'Bottom-left' },
]

const POINT_KIND_LABELS: Record<PhysicalPointKind, string> = {
  'header-pin': 'Header pin',
  'solder-pad': 'Solder pad',
  'test-pad': 'Test pad',
  'mount-hole': 'Mount hole',
  connector: 'Connector',
  'component-marker': 'Component marker',
}

function defaultCorners(view: PartImageView): CalibrationCorners {
  const w = view.imageWidth || 1
  const h = view.imageHeight || 1
  return {
    topLeft: { x: w * 0.1, y: h * 0.1 },
    topRight: { x: w * 0.9, y: h * 0.1 },
    bottomRight: { x: w * 0.9, y: h * 0.9 },
    bottomLeft: { x: w * 0.1, y: h * 0.9 },
  }
}

function withTimestamp(part: LibraryPartDefinition): LibraryPartDefinition {
  return { ...part, updatedAt: new Date().toISOString() }
}

function readFileAsImage(
  file: File,
): Promise<{ dimensions: { width: number; height: number } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'))
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        reject(new Error('Could not read file.'))
        return
      }
      const image = new Image()
      image.onerror = () => reject(new Error('Could not decode image.'))
      image.onload = () => {
        resolve({ dimensions: { width: image.naturalWidth, height: image.naturalHeight } })
      }
      image.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

export function ModuleWorkspace({
  part,
  isBusy = false,
  status,
  onChange,
  onSave,
  onBack,
}: ModuleWorkspaceProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeViewId, setActiveViewId] = useState<string>(() => part.imageViews[0]?.id ?? '')
  const [stageMode, setStageMode] = useState<StageMode>('calibrate')
  const [activeCornerIndex, setActiveCornerIndex] = useState(0)
  const [pendingPointKind, setPendingPointKind] = useState<PhysicalPointKind>('header-pin')
  const [pendingLogicalPinId, setPendingLogicalPinId] = useState<string>('')
  const [pinRowAnchors, setPinRowAnchors] = useState<MmPoint[]>([])
  const [pinRowCount, setPinRowCount] = useState(8)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const effectiveViewId = part.imageViews.find((v) => v.id === activeViewId)?.id ?? part.imageViews[0]?.id ?? ''
  const activeView = effectiveViewId ? findImageView(part, effectiveViewId) : undefined
  const calibration = activeView?.calibration

  const pointsForView = useMemo(
    () => part.physicalPoints.filter((point) => point.viewId === effectiveViewId),
    [part.physicalPoints, effectiveViewId],
  )

  function pushPart(next: LibraryPartDefinition) {
    onChange(withTimestamp(next))
  }

  // ---- Basic info ---------------------------------------------------------

  function handleNameChange(value: string) {
    pushPart({ ...part, name: value })
  }

  function handleCategoryChange(value: PartCategory) {
    pushPart({ ...part, category: value })
  }

  function handleManufacturerChange(value: string) {
    pushPart({ ...part, manufacturer: value })
  }

  function handleModelNumberChange(value: string) {
    pushPart({ ...part, modelNumber: value })
  }

  function handleDimensionChange(field: 'widthMm' | 'heightMm' | 'thicknessMm', raw: string) {
    const numeric = raw === '' ? undefined : Number(raw)
    const value = typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : undefined
    const dimensions = { ...part.dimensions }
    if (field === 'thicknessMm') {
      if (value === undefined) {
        delete dimensions.thicknessMm
      } else {
        dimensions.thicknessMm = value
      }
    } else {
      dimensions[field] = value ?? 0
    }
    let nextPart = { ...part, dimensions }

    // Keep calibration widthMm/heightMm in sync with dimensions when set.
    if (field !== 'thicknessMm' && activeView?.calibration) {
      nextPart = {
        ...nextPart,
        imageViews: nextPart.imageViews.map((view) =>
          view.id === activeView.id && view.calibration
            ? {
                ...view,
                calibration: {
                  ...view.calibration,
                  widthMm: dimensions.widthMm,
                  heightMm: dimensions.heightMm,
                },
              }
            : view,
        ),
      }
    }
    pushPart(nextPart)
  }

  // ---- Image upload -------------------------------------------------------

  async function handleImageUpload(file: File, side: ImageViewSide, label: string) {
    setUploadError(null)
    try {
      const { dimensions } = await readFileAsImage(file)
      const uploaded = await uploadLibraryPartImage(part.id, file, {
        side,
        label,
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
      })
      const existingForSide = part.imageViews.find((view) => view.side === side)
      const newView: PartImageView = {
        id: existingForSide?.id ?? createImageViewId(),
        label,
        side,
        imageName: uploaded.imageName,
        imagePath: uploaded.imagePath,
        imageWidth: uploaded.imageWidth || dimensions.width,
        imageHeight: uploaded.imageHeight || dimensions.height,
        calibration: existingForSide?.calibration,
      }
      const remaining = part.imageViews.filter(
        (view) => view.id !== newView.id && view.side !== side,
      )
      pushPart({ ...part, imageViews: [...remaining, newView] })
      setActiveViewId(newView.id)
      setStageMode('calibrate')
      setActiveCornerIndex(0)
    } catch {
      setUploadError(`Could not upload the ${side} image.`)
    }
  }

  // ---- Calibration --------------------------------------------------------

  function ensureCalibration(view: PartImageView): PartImageCalibration {
    return view.calibration ?? {
      corners: defaultCorners(view),
      widthMm: part.dimensions.widthMm,
      heightMm: part.dimensions.heightMm,
    }
  }

  function setCalibrationCorner(view: PartImageView, key: CornerKey, point: ImagePoint) {
    const calibration = ensureCalibration(view)
    const next: PartImageCalibration = {
      ...calibration,
      corners: { ...calibration.corners, [key]: point },
      widthMm: part.dimensions.widthMm || calibration.widthMm,
      heightMm: part.dimensions.heightMm || calibration.heightMm,
    }
    pushPart({
      ...part,
      imageViews: part.imageViews.map((existing) =>
        existing.id === view.id ? { ...existing, calibration: next } : existing,
      ),
    })
  }

  function imageCoordsFromEvent(event: React.MouseEvent<HTMLDivElement>, view: PartImageView): ImagePoint | null {
    const stage = stageRef.current
    if (!stage) return null
    const rect = stage.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const u = (event.clientX - rect.left) / rect.width
    const v = (event.clientY - rect.top) / rect.height
    return { x: u * view.imageWidth, y: v * view.imageHeight }
  }

  function handleStageClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!activeView) return
    const target = event.target as HTMLElement | null
    if (target?.dataset?.physicalPointId) return

    const imagePoint = imageCoordsFromEvent(event, activeView)
    if (!imagePoint) return

    if (stageMode === 'calibrate') {
      const corner = CORNER_ORDER[activeCornerIndex]
      if (!corner) return
      setCalibrationCorner(activeView, corner.key, imagePoint)
      setActiveCornerIndex((index) => Math.min(CORNER_ORDER.length - 1, index + 1))
      return
    }

    if (!calibration) return
    const mm = imagePointToMm(calibration, imagePoint)

    if (stageMode === 'point') {
      const newPoint: PhysicalPoint = {
        id: createPhysicalPointId(),
        viewId: activeView.id,
        kind: pendingPointKind,
        xMm: mm.xMm,
        yMm: mm.yMm,
        logicalPinId: pendingLogicalPinId || undefined,
        solderable: pendingPointKind === 'solder-pad' || pendingPointKind === 'header-pin' || undefined,
        throughHole: pendingPointKind === 'header-pin' || pendingPointKind === 'mount-hole' || undefined,
      }
      pushPart({ ...part, physicalPoints: [...part.physicalPoints, newPoint] })
      return
    }

    if (stageMode === 'pin-row') {
      const next = [...pinRowAnchors, mm].slice(-2)
      setPinRowAnchors(next)
    }
  }

  function handleRemovePoint(pointId: string) {
    pushPart({ ...part, physicalPoints: part.physicalPoints.filter((p) => p.id !== pointId) })
  }

  function handleCommitPinRow() {
    if (pinRowAnchors.length < 2 || !activeView) return
    const generated = generatePinRowMm(pinRowAnchors[0], pinRowAnchors[1], pinRowCount)
    const newPoints: PhysicalPoint[] = generated.map((mm) => ({
      id: createPhysicalPointId(),
      viewId: activeView.id,
      kind: pendingPointKind,
      xMm: mm.xMm,
      yMm: mm.yMm,
      logicalPinId: pendingLogicalPinId || undefined,
      solderable: pendingPointKind === 'solder-pad' || pendingPointKind === 'header-pin' || undefined,
      throughHole: pendingPointKind === 'header-pin' || pendingPointKind === 'mount-hole' || undefined,
    }))
    pushPart({ ...part, physicalPoints: [...part.physicalPoints, ...newPoints] })
    setPinRowAnchors([])
  }

  function handleResetPinRow() {
    setPinRowAnchors([])
  }

  // ---- Logical pins -------------------------------------------------------

  function handleAddLogicalPin() {
    const newPin: LogicalPin = {
      id: createLogicalPinId(),
      name: `PIN${part.logicalPins.length + 1}`,
    }
    pushPart({ ...part, logicalPins: [...part.logicalPins, newPin] })
  }

  function handleLogicalPinChange(pinId: string, updater: (pin: LogicalPin) => LogicalPin) {
    pushPart({
      ...part,
      logicalPins: part.logicalPins.map((pin) => (pin.id === pinId ? updater(pin) : pin)),
    })
  }

  function handleRemoveLogicalPin(pinId: string) {
    pushPart({
      ...part,
      logicalPins: part.logicalPins.filter((pin) => pin.id !== pinId),
      physicalPoints: part.physicalPoints.map((point) =>
        point.logicalPinId === pinId ? { ...point, logicalPinId: undefined } : point,
      ),
    })
  }

  // ---- Render -------------------------------------------------------------

  const cornerStatus = `Calibrating: click ${CORNER_ORDER[activeCornerIndex]?.label ?? 'done'} corner.`
  const stageHelp =
    stageMode === 'calibrate'
      ? cornerStatus
      : stageMode === 'point'
        ? 'Click on the image to add a physical point at that mm position.'
        : `Pin row: click first pin, then last pin (${pinRowAnchors.length}/2).`

  return (
    <section className="library-part-editor module-workspace" aria-label="Module workspace">
      <header className="library-part-editor__header">
        <div>
          <p className="image-workspace__eyebrow">Modules &amp; sensors</p>
          <h1 className="library-part-editor__title">{part.name || 'Untitled module'}</h1>
          <p className="image-workspace__status">{status}</p>
          {uploadError ? <p role="alert" className="library-part-editor__error">{uploadError}</p> : null}
        </div>
        <div className="library-part-editor__actions">
          <button type="button" className="action-button action-button--ghost" onClick={onBack} disabled={isBusy}>
            Back
          </button>
          <button type="button" className="action-button" onClick={onSave} disabled={isBusy}>
            Save module
          </button>
        </div>
      </header>

      <div className="library-part-editor__grid">
        <section aria-label="Basic info" className="library-part-editor__panel">
          <h2>Basic info</h2>
          <label>
            Name
            <input type="text" value={part.name} onChange={(event) => handleNameChange(event.target.value)} />
          </label>
          <label>
            Category
            <select value={part.category} onChange={(event) => handleCategoryChange(event.target.value as PartCategory)}>
              {PART_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>
          <label>
            Manufacturer
            <input
              type="text"
              value={part.manufacturer ?? ''}
              onChange={(event) => handleManufacturerChange(event.target.value)}
            />
          </label>
          <label>
            Model number
            <input
              type="text"
              value={part.modelNumber ?? ''}
              onChange={(event) => handleModelNumberChange(event.target.value)}
            />
          </label>
        </section>

        <section aria-label="Real dimensions" className="library-part-editor__panel">
          <h2>Real dimensions (mm)</h2>
          <label>
            Width
            <input
              type="number"
              min={0}
              step={0.1}
              value={part.dimensions.widthMm}
              onChange={(event) => handleDimensionChange('widthMm', event.target.value)}
            />
          </label>
          <label>
            Height
            <input
              type="number"
              min={0}
              step={0.1}
              value={part.dimensions.heightMm}
              onChange={(event) => handleDimensionChange('heightMm', event.target.value)}
            />
          </label>
          <label>
            Thickness (optional)
            <input
              type="number"
              min={0}
              step={0.1}
              value={part.dimensions.thicknessMm ?? ''}
              onChange={(event) => handleDimensionChange('thicknessMm', event.target.value)}
            />
          </label>
          <p className="library-part-editor__hint">
            Header pin pitch is {DEFAULT_PIN_PITCH_MM} mm (0.1&quot;).
          </p>
        </section>

        <section aria-label="Logical pins" className="library-part-editor__panel">
          <div className="library-part-editor__panel-header">
            <h2>Logical pins</h2>
            <button type="button" className="action-button action-button--ghost" onClick={handleAddLogicalPin}>
              Add pin
            </button>
          </div>
          {part.logicalPins.length === 0 ? (
            <p>No logical pins yet. Add VIN, GND, OUT, SDA, SCL, etc.</p>
          ) : (
            <ul className="library-part-editor__list">
              {part.logicalPins.map((pin) => (
                <li key={pin.id}>
                  <input
                    aria-label={`Logical pin ${pin.id} name`}
                    type="text"
                    value={pin.name}
                    onChange={(event) =>
                      handleLogicalPinChange(pin.id, (current) => ({ ...current, name: event.target.value }))
                    }
                  />
                  <input
                    aria-label={`Logical pin ${pin.id} function`}
                    type="text"
                    placeholder="function"
                    value={pin.function ?? ''}
                    onChange={(event) =>
                      handleLogicalPinChange(pin.id, (current) => ({
                        ...current,
                        function: event.target.value || undefined,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="action-button action-button--ghost"
                    onClick={() => handleRemoveLogicalPin(pin.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-label="Calibrated image stage"
          className="library-part-editor__panel library-part-editor__panel--wide"
        >
          <div className="library-part-editor__panel-header">
            <h2>Top image &amp; calibration</h2>
            <div className="library-part-editor__upload-row">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Upload top image"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const [file] = Array.from(event.target.files ?? [])
                  event.target.value = ''
                  if (file) {
                    void handleImageUpload(file, 'top', 'Top')
                  }
                }}
              />
              <button
                type="button"
                className="action-button action-button--ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                {activeView ? 'Replace top image' : 'Upload top image'}
              </button>
            </div>
          </div>

          <div className="library-part-editor__point-controls" role="toolbar" aria-label="Stage mode">
            <button
              type="button"
              className={`action-button${stageMode === 'calibrate' ? '' : ' action-button--ghost'}`}
              onClick={() => {
                setStageMode('calibrate')
                setActiveCornerIndex(0)
              }}
            >
              1. Calibrate corners
            </button>
            <button
              type="button"
              className={`action-button${stageMode === 'point' ? '' : ' action-button--ghost'}`}
              onClick={() => setStageMode('point')}
              disabled={!calibration}
            >
              2. Place points
            </button>
            <button
              type="button"
              className={`action-button${stageMode === 'pin-row' ? '' : ' action-button--ghost'}`}
              onClick={() => {
                setStageMode('pin-row')
                setPinRowAnchors([])
              }}
              disabled={!calibration}
            >
              3. Pin row helper
            </button>
          </div>

          {stageMode !== 'calibrate' ? (
            <div className="library-part-editor__point-controls">
              <label>
                Point kind
                <select
                  value={pendingPointKind}
                  onChange={(event) => setPendingPointKind(event.target.value as PhysicalPointKind)}
                >
                  {PHYSICAL_POINT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{POINT_KIND_LABELS[kind]}</option>
                  ))}
                </select>
              </label>
              <label>
                Logical pin
                <select value={pendingLogicalPinId} onChange={(event) => setPendingLogicalPinId(event.target.value)}>
                  <option value="">(none)</option>
                  {part.logicalPins.map((pin) => (
                    <option key={pin.id} value={pin.id}>{pin.name}</option>
                  ))}
                </select>
              </label>
              {stageMode === 'pin-row' ? (
                <>
                  <label>
                    Pin count
                    <input
                      type="number"
                      min={2}
                      step={1}
                      value={pinRowCount}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setPinRowCount(Number.isFinite(next) && next >= 2 ? next : 2)
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="action-button"
                    onClick={handleCommitPinRow}
                    disabled={pinRowAnchors.length < 2}
                  >
                    Generate row
                  </button>
                  <button type="button" className="action-button action-button--ghost" onClick={handleResetPinRow}>
                    Reset row
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          <p className="library-part-editor__hint">{stageHelp}</p>

          {activeView ? (
            <div
              ref={stageRef}
              className="library-part-editor__stage"
              role="button"
              tabIndex={0}
              aria-label={`Module image stage (${stageMode})`}
              onClick={handleStageClick}
              style={{
                position: 'relative',
                display: 'inline-block',
                cursor: 'crosshair',
                userSelect: 'none',
                maxWidth: '100%',
              }}
            >
              <img
                src={activeView.imagePath}
                alt={`${activeView.label} of ${part.name}`}
                style={{ display: 'block', maxWidth: '100%' }}
              />
              {calibration ? (
                <CalibrationOverlay view={activeView} calibration={calibration} />
              ) : null}
              {calibration && stageMode !== 'calibrate'
                ? pointsForView.map((point) => {
                    const px = mmToImagePoint(calibration, { xMm: point.xMm, yMm: point.yMm })
                    const left = (px.x / activeView.imageWidth) * 100
                    const top = (px.y / activeView.imageHeight) * 100
                    const linkedPin = part.logicalPins.find((pin) => pin.id === point.logicalPinId)
                    return (
                      <button
                        key={point.id}
                        type="button"
                        data-physical-point-id={point.id}
                        aria-label={`Physical point ${point.id} (${point.kind}${linkedPin ? `, ${linkedPin.name}` : ''})`}
                        title={`${POINT_KIND_LABELS[point.kind]}${linkedPin ? ` - ${linkedPin.name}` : ''} @ ${point.xMm.toFixed(2)}, ${point.yMm.toFixed(2)} mm`}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleRemovePoint(point.id)
                        }}
                        style={{
                          position: 'absolute',
                          left: `${left}%`,
                          top: `${top}%`,
                          transform: 'translate(-50%, -50%)',
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          border: '2px solid #fff',
                          background: linkedPin ? '#1f9d55' : '#dd6b20',
                          boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      />
                    )
                  })
                : null}
              {calibration && stageMode === 'pin-row'
                ? pinRowAnchors.map((mm, index) => {
                    const px = mmToImagePoint(calibration, mm)
                    const left = (px.x / activeView.imageWidth) * 100
                    const top = (px.y / activeView.imageHeight) * 100
                    return (
                      <span
                        key={`anchor-${index}`}
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: `${left}%`,
                          top: `${top}%`,
                          transform: 'translate(-50%, -50%)',
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          border: '2px dashed #4299e1',
                          background: 'rgba(66, 153, 225, 0.25)',
                        }}
                      />
                    )
                  })
                : null}
            </div>
          ) : (
            <p>Upload a top image to start calibrating.</p>
          )}

          {calibration ? (
            <p className="library-part-editor__hint">
              Calibrated: {calibration.widthMm} mm × {calibration.heightMm} mm.
              Points on this view: {pointsForView.length}.
            </p>
          ) : null}
        </section>
      </div>
    </section>
  )
}

function CalibrationOverlay({
  view,
  calibration,
}: {
  view: PartImageView
  calibration: PartImageCalibration
}) {
  const widthMm = calibration.widthMm
  const heightMm = calibration.heightMm
  if (widthMm <= 0 || heightMm <= 0) return null

  const cornerEntries = CORNER_ORDER.map(({ key }) => calibration.corners[key])
  const polylinePoints = [...cornerEntries, cornerEntries[0]]
    .map((p) => `${(p.x / view.imageWidth) * 100},${(p.y / view.imageHeight) * 100}`)
    .join(' ')

  const gridLines: { x1: number; y1: number; x2: number; y2: number; key: string }[] = []
  const stepMm = DEFAULT_PIN_PITCH_MM
  for (let mm = 0; mm <= widthMm + 1e-6; mm += stepMm) {
    const top = mmToImagePoint(calibration, { xMm: mm, yMm: 0 })
    const bottom = mmToImagePoint(calibration, { xMm: mm, yMm: heightMm })
    gridLines.push({
      key: `vx-${mm.toFixed(3)}`,
      x1: (top.x / view.imageWidth) * 100,
      y1: (top.y / view.imageHeight) * 100,
      x2: (bottom.x / view.imageWidth) * 100,
      y2: (bottom.y / view.imageHeight) * 100,
    })
  }
  for (let mm = 0; mm <= heightMm + 1e-6; mm += stepMm) {
    const left = mmToImagePoint(calibration, { xMm: 0, yMm: mm })
    const right = mmToImagePoint(calibration, { xMm: widthMm, yMm: mm })
    gridLines.push({
      key: `hy-${mm.toFixed(3)}`,
      x1: (left.x / view.imageWidth) * 100,
      y1: (left.y / view.imageHeight) * 100,
      x2: (right.x / view.imageWidth) * 100,
      y2: (right.y / view.imageHeight) * 100,
    })
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      <polyline
        points={polylinePoints}
        fill="rgba(66, 153, 225, 0.08)"
        stroke="#4299e1"
        strokeWidth="0.4"
        vectorEffect="non-scaling-stroke"
      />
      {gridLines.map((line) => (
        <line
          key={line.key}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="rgba(66, 153, 225, 0.35)"
          strokeWidth="0.2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {CORNER_ORDER.map(({ key }) => {
        const pixel = calibration.corners[key]
        return (
          <circle
            key={key}
            cx={(pixel.x / view.imageWidth) * 100}
            cy={(pixel.y / view.imageHeight) * 100}
            r={0.6}
            fill="#fff"
            stroke="#2b6cb0"
            strokeWidth="0.3"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
  )
}
