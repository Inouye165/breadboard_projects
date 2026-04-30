/**
 * SVG rendering for generated passive components. Two entry points:
 *
 *  - `GeneratedPassiveGraphic` returns an `<svg>` `<g>` whose local origin
 *    (0, 0) maps to the top-left of the part's bounding box. It expects to be
 *    placed inside an existing `<svg>` (e.g. the breadboard canvas) and
 *    scales mm → pixels via the supplied `pixelsPerMm`.
 *
 *  - `GeneratedPassivePreview` wraps the graphic in a self-contained `<svg>`
 *    sized to fit `maxWidthPx` × `maxHeightPx` for the editor preview pane.
 */

import type { JSX } from 'react'

import {
  computePassiveGeometry,
  type CapacitorSpec,
  type GeneratedPassiveSpec,
  type ResistorSpec,
} from '../lib/generatedPassive'
import { BAND_HEX, computeResistorBands, type BandColor } from '../lib/resistorColorCode'
import { capacitorEiaCode } from '../lib/capacitorLabel'

type GraphicProps = {
  spec: GeneratedPassiveSpec
  pixelsPerMm: number
}

export function GeneratedPassiveGraphic({ spec, pixelsPerMm }: GraphicProps): JSX.Element {
  return spec.passiveType === 'resistor'
    ? renderResistor(spec, pixelsPerMm)
    : renderCapacitor(spec, pixelsPerMm)
}

type PreviewProps = {
  spec: GeneratedPassiveSpec
  maxWidthPx?: number
  maxHeightPx?: number
  /** Ensure the part renders at least this many pixels per mm (visibility). */
  minPixelsPerMm?: number
}

export function GeneratedPassivePreview({
  spec,
  maxWidthPx = 360,
  maxHeightPx = 200,
  minPixelsPerMm = 6,
}: PreviewProps): JSX.Element {
  const geometry = computePassiveGeometry(spec)
  const padMm = 4
  const widthMm = geometry.widthMm + padMm * 2
  const heightMm = geometry.heightMm + padMm * 2
  const fitScale = Math.min(maxWidthPx / widthMm, maxHeightPx / heightMm)
  const pixelsPerMm = Math.max(minPixelsPerMm, fitScale)
  const widthPx = widthMm * pixelsPerMm
  const heightPx = heightMm * pixelsPerMm

  return (
    <svg
      role="img"
      aria-label={`Preview of ${spec.displayName}`}
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      style={{ background: '#fafaf6', borderRadius: 8 }}
    >
      <g transform={`translate(${padMm * pixelsPerMm} ${padMm * pixelsPerMm})`}>
        <GeneratedPassiveGraphic spec={spec} pixelsPerMm={pixelsPerMm} />
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Resistor rendering
// ---------------------------------------------------------------------------

function renderResistor(spec: ResistorSpec, pxPerMm: number): JSX.Element {
  const geom = computePassiveGeometry(spec)
  const width = geom.widthMm * pxPerMm
  const height = geom.heightMm * pxPerMm

  if (spec.physical.mounting === 'smd-chip') {
    const bodyW = width
    const bodyH = height
    const padW = bodyW * 0.18
    return (
      <g aria-label={`SMD resistor ${spec.displayName}`}>
        <rect x={0} y={0} width={padW} height={bodyH} fill="#bcbcbc" />
        <rect x={bodyW - padW} y={0} width={padW} height={bodyH} fill="#bcbcbc" />
        <rect x={padW} y={0} width={bodyW - 2 * padW} height={bodyH} fill="#1f1f1f" />
        <text
          x={bodyW / 2}
          y={bodyH / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={Math.max(6, bodyH * 0.5)}
          fontFamily="monospace"
        >
          {smdResistorCode(spec)}
        </text>
      </g>
    )
  }

  // Through-hole axial / ceramic-power: body centered, leads to each end.
  const phys = spec.physical
  const bodyLengthPx = phys.bodyLengthMm * pxPerMm
  const bodyDiameterPx = phys.bodyDiameterMm * pxPerMm
  const bodyX = (width - bodyLengthPx) / 2
  const bodyY = (height - bodyDiameterPx) / 2
  const leadStrokeWidth = Math.max(1, phys.leadDiameterMm * pxPerMm)
  const ceramic = phys.mounting === 'ceramic-power'
  const bodyFill = ceramic ? '#e6e1cf' : '#dcb98a'
  const bodyStroke = ceramic ? '#7a6a3c' : '#7a4a1f'

  const bands =
    spec.bands.override && spec.bands.override.length > 0
      ? (spec.bands.override as BandColor[])
      : computeResistorBands(spec.resistance, spec.unit, spec.tolerance, spec.bands.bandCount)

  // Distribute color bands along the body (skipping a small inset on the
  // ends). Tolerance band is rendered slightly further from the rest.
  const bandWidthPx = Math.max(1, bodyLengthPx * 0.06)
  const insetPx = bodyLengthPx * 0.12
  const usableLengthPx = bodyLengthPx - insetPx * 2
  const valueBands = bands.length >= 4 ? bands.slice(0, bands.length - 1) : bands
  const toleranceBand = bands.length >= 4 ? bands[bands.length - 1] : null
  const valueBandPositions = valueBands.map((_, index) => {
    if (valueBands.length === 1) return insetPx + usableLengthPx * 0.3
    return insetPx + (usableLengthPx * 0.55 * index) / Math.max(1, valueBands.length - 1)
  })
  const tolerancePosition = bodyLengthPx - insetPx - bandWidthPx

  return (
    <g aria-label={`Resistor ${spec.displayName}`}>
      {/* Leads */}
      <line
        x1={0}
        y1={height / 2}
        x2={bodyX}
        y2={height / 2}
        stroke="#9aa0a6"
        strokeWidth={leadStrokeWidth}
        strokeLinecap="round"
      />
      <line
        x1={bodyX + bodyLengthPx}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="#9aa0a6"
        strokeWidth={leadStrokeWidth}
        strokeLinecap="round"
      />
      {/* Body */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyLengthPx}
        height={bodyDiameterPx}
        rx={bodyDiameterPx / 2}
        ry={bodyDiameterPx / 2}
        fill={bodyFill}
        stroke={bodyStroke}
        strokeWidth={1}
      />
      {/* Value bands */}
      {valueBands.map((color, index) => (
        <rect
          key={`band-${index}`}
          x={bodyX + valueBandPositions[index]}
          y={bodyY}
          width={bandWidthPx}
          height={bodyDiameterPx}
          fill={BAND_HEX[color]}
        />
      ))}
      {/* Tolerance band */}
      {toleranceBand ? (
        <rect
          x={bodyX + tolerancePosition}
          y={bodyY}
          width={bandWidthPx}
          height={bodyDiameterPx}
          fill={BAND_HEX[toleranceBand]}
        />
      ) : null}
    </g>
  )
}

function smdResistorCode(spec: ResistorSpec): string {
  // EIA-96 / 3-digit / 4-digit codes are non-trivial; for now use the simple
  // 3-digit "two significant digits + multiplier" convention used on most
  // 5%-class chip resistors.
  const ohms =
    spec.unit === 'kΩ'
      ? spec.resistance * 1_000
      : spec.unit === 'MΩ'
        ? spec.resistance * 1_000_000
        : spec.resistance
  if (!(ohms > 0)) return ''
  if (ohms < 10) return `${ohms}`.replace('.', 'R')
  let digits = Math.round(ohms)
  let exponent = 0
  while (digits >= 100) {
    digits = Math.round(digits / 10)
    exponent += 1
  }
  return `${digits}${exponent}`
}

// ---------------------------------------------------------------------------
// Capacitor rendering
// ---------------------------------------------------------------------------

function renderCapacitor(spec: CapacitorSpec, pxPerMm: number): JSX.Element {
  const geom = computePassiveGeometry(spec)
  const width = geom.widthMm * pxPerMm
  const height = geom.heightMm * pxPerMm
  const phys = spec.physical
  const label = spec.printedLabel ?? capacitorEiaCode(spec.capacitance, spec.unit)

  if (phys.mounting === 'smd') {
    const padW = width * 0.18
    return (
      <g aria-label={`SMD capacitor ${spec.displayName}`}>
        <rect x={0} y={0} width={padW} height={height} fill="#bcbcbc" />
        <rect x={width - padW} y={0} width={padW} height={height} fill="#bcbcbc" />
        <rect x={padW} y={0} width={width - 2 * padW} height={height} fill="#cf9b53" />
        {spec.polarized ? (
          <rect x={padW} y={0} width={(width - 2 * padW) * 0.18} height={height} fill="#7a3300" />
        ) : null}
      </g>
    )
  }

  if (phys.mounting === 'through-hole-axial') {
    const bodyLengthPx = phys.bodyLengthMm * pxPerMm
    const bodyDiameterPx = phys.bodyDiameterMm * pxPerMm
    const bodyX = (width - bodyLengthPx) / 2
    const bodyY = (height - bodyDiameterPx) / 2
    return (
      <g aria-label={`Axial capacitor ${spec.displayName}`}>
        <line x1={0} y1={height / 2} x2={bodyX} y2={height / 2} stroke="#9aa0a6" strokeWidth={2} strokeLinecap="round" />
        <line x1={bodyX + bodyLengthPx} y1={height / 2} x2={width} y2={height / 2} stroke="#9aa0a6" strokeWidth={2} strokeLinecap="round" />
        <rect
          x={bodyX}
          y={bodyY}
          width={bodyLengthPx}
          height={bodyDiameterPx}
          rx={bodyDiameterPx / 2}
          ry={bodyDiameterPx / 2}
          fill={spec.polarized ? '#1d1d1d' : '#cf9b53'}
          stroke="#444"
        />
        {spec.polarized ? (
          <rect x={bodyX} y={bodyY} width={bodyLengthPx * 0.2} height={bodyDiameterPx} fill="#aaa" />
        ) : null}
        {label ? (
          <text
            x={bodyX + bodyLengthPx / 2}
            y={bodyY + bodyDiameterPx / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={spec.polarized ? '#fff' : '#3a2200'}
            fontSize={Math.max(6, bodyDiameterPx * 0.45)}
          >
            {label}
          </text>
        ) : null}
      </g>
    )
  }

  if (phys.mounting === 'ceramic-disc') {
    const discPx = phys.discDiameterMm * pxPerMm
    const cx = width / 2
    const cy = discPx / 2
    const leadX1 = cx - (phys.leadSpacingMm * pxPerMm) / 2
    const leadX2 = cx + (phys.leadSpacingMm * pxPerMm) / 2
    return (
      <g aria-label={`Ceramic disc capacitor ${spec.displayName}`}>
        <line x1={leadX1} y1={discPx} x2={leadX1} y2={height} stroke="#9aa0a6" strokeWidth={2} strokeLinecap="round" />
        <line x1={leadX2} y1={discPx} x2={leadX2} y2={height} stroke="#9aa0a6" strokeWidth={2} strokeLinecap="round" />
        <ellipse cx={cx} cy={cy} rx={discPx / 2} ry={discPx / 2.4} fill="#d68a3a" stroke="#7a4a1f" />
        {label ? (
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#3a2200"
            fontSize={Math.max(6, discPx * 0.28)}
          >
            {label}
          </text>
        ) : null}
      </g>
    )
  }

  // through-hole-radial (electrolytic / film / tantalum)
  const bodyDiameterPx = phys.bodyDiameterMm * pxPerMm
  const bodyHeightPx = phys.bodyHeightMm * pxPerMm
  const cx = width / 2
  const bodyX = cx - bodyDiameterPx / 2
  const leadX1 = cx - (phys.leadSpacingMm * pxPerMm) / 2
  const leadX2 = cx + (phys.leadSpacingMm * pxPerMm) / 2
  const isFilm = spec.type === 'film'
  const fill = isFilm
    ? '#d4cd8e'
    : spec.type === 'tantalum'
      ? '#c75a2a'
      : '#1f3870'
  const stripeFill = '#d6d6d6'

  return (
    <g aria-label={`Radial capacitor ${spec.displayName}`}>
      <line x1={leadX1} y1={bodyHeightPx} x2={leadX1} y2={height} stroke="#9aa0a6" strokeWidth={2} strokeLinecap="round" />
      <line x1={leadX2} y1={bodyHeightPx} x2={leadX2} y2={height} stroke="#9aa0a6" strokeWidth={2} strokeLinecap="round" />
      <rect
        x={bodyX}
        y={0}
        width={bodyDiameterPx}
        height={bodyHeightPx}
        rx={isFilm ? 4 : bodyDiameterPx * 0.15}
        ry={isFilm ? 4 : bodyDiameterPx * 0.15}
        fill={fill}
        stroke="#222"
      />
      {spec.polarized ? (
        <>
          <rect
            x={bodyX + bodyDiameterPx * 0.6}
            y={0}
            width={bodyDiameterPx * 0.4}
            height={bodyHeightPx}
            fill={stripeFill}
            opacity={0.85}
          />
          <text
            x={bodyX + bodyDiameterPx * 0.8}
            y={bodyHeightPx / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#222"
            fontSize={Math.max(6, bodyDiameterPx * 0.4)}
          >
            -
          </text>
          {/* Mark + lead with a small symbol just above the lead exit. */}
          <text
            x={leadX1}
            y={bodyHeightPx + Math.max(8, bodyDiameterPx * 0.25)}
            textAnchor="middle"
            fill="#222"
            fontSize={Math.max(6, bodyDiameterPx * 0.3)}
          >
            +
          </text>
        </>
      ) : null}
      {label ? (
        <text
          x={bodyX + bodyDiameterPx * 0.35}
          y={bodyHeightPx / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={spec.polarized ? '#fff' : '#222'}
          fontSize={Math.max(6, bodyDiameterPx * 0.28)}
        >
          {label}
        </text>
      ) : null}
    </g>
  )
}
