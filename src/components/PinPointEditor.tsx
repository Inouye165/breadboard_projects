import { useRef, useState } from 'react'

import type { BreadboardDefinition, ConnectionPoint, ScaleCalibration } from '../lib/breadboardDefinitionModel'

type CalibrationStep =
  | { kind: 'idle' }
  | { kind: 'awaiting-first' }
  | { kind: 'awaiting-second'; x1: number; y1: number }
  | { kind: 'awaiting-distance'; x1: number; y1: number; x2: number; y2: number }

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
  const [calibrationStep, setCalibrationStep] = useState<CalibrationStep>({ kind: 'idle' })
  const [calibrationDistance, setCalibrationDistance] = useState('')
  const [calibrationUnit, setCalibrationUnit] = useState<'mm' | 'in'>('in')
  const safeWidth = imageWidth > 0 ? imageWidth : 1
  const safeHeight = imageHeight > 0 ? imageHeight : 1

  if (trackedDefinitionId !== definition.id) {
    setTrackedDefinitionId(definition.id)
    setPendingRemovalId(null)
    setCalibrationStep({ kind: 'idle' })
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

    onChange({ ...definition, scaleCalibration: calibration })
    setCalibrationStep({ kind: 'idle' })
    setCalibrationDistance('')
  }

  function handleClearCalibration() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { scaleCalibration: _removed, ...rest } = definition
    onChange(rest as BreadboardDefinition)
    setCalibrationStep({ kind: 'idle' })
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
        {calibrationStep.kind === 'awaiting-first'
          ? 'Click the first reference point on the breadboard image.'
          : calibrationStep.kind === 'awaiting-second'
          ? 'Click the second reference point. (Click the first point again to restart.)'
          : calibrationStep.kind === 'awaiting-distance'
          ? 'Enter the real-world distance between the two points below and click Apply.'
          : 'Click the image to drop a pin hole. Click an existing pin once to select it, then click again to remove it. These points will be selectable later when wiring the breadboard.'}
      </p>
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
          >
            <image
              href={imagePath}
              width={safeWidth}
              height={safeHeight}
              preserveAspectRatio="none"
            />
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
