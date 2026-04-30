/**
 * Data model + presets + validation for generated passive components
 * (resistors, capacitors). These parts are rendered programmatically as SVG
 * from the spec stored here - no uploaded image is required.
 */

import {
  DEFAULT_PIN_PITCH_MM,
  GENERATED_PASSIVE_VIEW_ID,
  createEmptyLibraryPart,
  createLogicalPinId,
  createPhysicalPointId,
  type LibraryPartDefinition,
  type LogicalPin,
  type PhysicalPoint,
} from './partLibraryModel'

// ---------------------------------------------------------------------------
// Resistor
// ---------------------------------------------------------------------------

export const RESISTOR_UNITS = ['Ω', 'kΩ', 'MΩ'] as const
export type ResistorUnit = (typeof RESISTOR_UNITS)[number]

export const RESISTOR_TOLERANCES = [20, 10, 5, 2, 1, 0.5, 0.25, 0.1] as const
export type ResistorTolerance = (typeof RESISTOR_TOLERANCES)[number]

export const RESISTOR_POWER_RATINGS = ['1/8W', '1/4W', '1/2W', '1W', '2W', '5W'] as const
export type ResistorPowerRating = (typeof RESISTOR_POWER_RATINGS)[number]

export const RESISTOR_MOUNTING_STYLES = ['through-hole-axial', 'smd-chip', 'ceramic-power'] as const
export type ResistorMountingStyle = (typeof RESISTOR_MOUNTING_STYLES)[number]

export const RESISTOR_MATERIALS = [
  'carbon-film',
  'metal-film',
  'wirewound',
  'thick-film-smd',
  'thin-film-smd',
] as const
export type ResistorMaterial = (typeof RESISTOR_MATERIALS)[number]

export const SMD_PACKAGE_SIZES = ['1206', '0805', '0603', '0402', '0201'] as const
export type SmdPackageSize = (typeof SMD_PACKAGE_SIZES)[number]

export type ResistorPhysicalAxial = {
  bodyLengthMm: number
  bodyDiameterMm: number
  leadDiameterMm: number
  leadLengthMm: number
  /** Distance between the two lead-bend points, in mm. */
  leadSpacingMm: number
}

export type ResistorPhysicalSmd = {
  packageSize: SmdPackageSize
  bodyLengthMm: number
  bodyWidthMm: number
}

export type ResistorPhysical =
  | ({ mounting: 'through-hole-axial' } & ResistorPhysicalAxial)
  | ({ mounting: 'smd-chip' } & ResistorPhysicalSmd)
  | ({ mounting: 'ceramic-power' } & ResistorPhysicalAxial)

export type ResistorBands = {
  /** When non-null these override the auto-computed bands. */
  override?: string[] | null
  bandCount: 4 | 5
}

export type ResistorSpec = {
  passiveType: 'resistor'
  displayName: string
  resistance: number
  unit: ResistorUnit
  tolerance: ResistorTolerance
  powerRating: ResistorPowerRating
  maxWorkingVoltageV?: number
  /** ppm/°C */
  temperatureCoefficient?: number
  material: ResistorMaterial
  physical: ResistorPhysical
  bands: ResistorBands
}

// ---------------------------------------------------------------------------
// Capacitor
// ---------------------------------------------------------------------------

export const CAPACITOR_UNITS = ['pF', 'nF', 'µF', 'mF'] as const
export type CapacitorUnit = (typeof CAPACITOR_UNITS)[number]

export const CAPACITOR_TOLERANCES = [20, 10, 5, 2, 1] as const
export type CapacitorTolerance = (typeof CAPACITOR_TOLERANCES)[number]

export const CAPACITOR_VOLTAGE_PRESETS = [6.3, 10, 16, 25, 35, 50, 100, 250] as const

export const CAPACITOR_TYPES = [
  'ceramic-disc',
  'mlcc',
  'electrolytic-radial',
  'electrolytic-axial',
  'tantalum',
  'film',
] as const
export type CapacitorType = (typeof CAPACITOR_TYPES)[number]

export const CAPACITOR_MOUNTING_STYLES = ['through-hole-radial', 'through-hole-axial', 'smd'] as const
export type CapacitorMountingStyle = (typeof CAPACITOR_MOUNTING_STYLES)[number]

export type CapacitorPhysicalRadial = {
  bodyDiameterMm: number
  bodyHeightMm: number
  leadSpacingMm: number
  leadDiameterMm: number
  leadLengthMm: number
}

export type CapacitorPhysicalAxial = {
  bodyLengthMm: number
  bodyDiameterMm: number
  leadLengthMm: number
}

export type CapacitorPhysicalSmd = {
  packageSize: SmdPackageSize
  bodyLengthMm: number
  bodyWidthMm: number
}

export type CapacitorPhysicalDisc = {
  discDiameterMm: number
  leadSpacingMm: number
  leadLengthMm: number
}

export type CapacitorPhysical =
  | ({ mounting: 'through-hole-radial' } & CapacitorPhysicalRadial)
  | ({ mounting: 'through-hole-axial' } & CapacitorPhysicalAxial)
  | ({ mounting: 'smd' } & CapacitorPhysicalSmd)
  | ({ mounting: 'ceramic-disc' } & CapacitorPhysicalDisc)

export type CapacitorSpec = {
  passiveType: 'capacitor'
  displayName: string
  capacitance: number
  unit: CapacitorUnit
  voltageRatingV: number
  tolerance: CapacitorTolerance
  polarized: boolean
  type: CapacitorType
  esrOhms?: number
  temperatureRatingC?: number
  physical: CapacitorPhysical
  /** Printed code label (e.g. "104"). Auto-generated, but editable. */
  printedLabel?: string
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type GeneratedPassiveSpec = ResistorSpec | CapacitorSpec

export type PassiveType = GeneratedPassiveSpec['passiveType']

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function defaultResistorSpec(): ResistorSpec {
  return {
    passiveType: 'resistor',
    displayName: '220 Ω 1/4W',
    resistance: 220,
    unit: 'Ω',
    tolerance: 5,
    powerRating: '1/4W',
    material: 'metal-film',
    physical: {
      mounting: 'through-hole-axial',
      bodyLengthMm: 6.3,
      bodyDiameterMm: 2.3,
      leadDiameterMm: 0.6,
      leadLengthMm: 28,
      leadSpacingMm: 7.62, // 3 breadboard holes
    },
    bands: { bandCount: 4 },
  }
}

export function defaultCapacitorSpec(): CapacitorSpec {
  return {
    passiveType: 'capacitor',
    displayName: '100nF ceramic',
    capacitance: 100,
    unit: 'nF',
    voltageRatingV: 50,
    tolerance: 10,
    polarized: false,
    type: 'ceramic-disc',
    physical: {
      mounting: 'ceramic-disc',
      discDiameterMm: 5,
      leadSpacingMm: 2.54,
      leadLengthMm: 10,
    },
    printedLabel: '104',
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export type ResistorPreset = { id: string; label: string; spec: () => ResistorSpec }
export type CapacitorPreset = { id: string; label: string; spec: () => CapacitorSpec }

export const RESISTOR_PRESETS: ResistorPreset[] = [
  {
    id: 'axial-1-4w-metal-film',
    label: '1/4W axial metal film (6.3 × 2.3 mm)',
    spec: () => ({
      ...defaultResistorSpec(),
      powerRating: '1/4W',
      material: 'metal-film',
      physical: {
        mounting: 'through-hole-axial',
        bodyLengthMm: 6.3,
        bodyDiameterMm: 2.3,
        leadDiameterMm: 0.6,
        leadLengthMm: 28,
        leadSpacingMm: 7.62,
      },
    }),
  },
  {
    id: 'axial-1-2w-metal-film',
    label: '1/2W axial metal film (9 × 3.2 mm)',
    spec: () => ({
      ...defaultResistorSpec(),
      powerRating: '1/2W',
      material: 'metal-film',
      physical: {
        mounting: 'through-hole-axial',
        bodyLengthMm: 9,
        bodyDiameterMm: 3.2,
        leadDiameterMm: 0.7,
        leadLengthMm: 28,
        leadSpacingMm: 12.7,
      },
    }),
  },
  {
    id: 'smd-0805',
    label: 'SMD 0805',
    spec: () => ({
      ...defaultResistorSpec(),
      material: 'thick-film-smd',
      physical: { mounting: 'smd-chip', packageSize: '0805', bodyLengthMm: 2.0, bodyWidthMm: 1.25 },
    }),
  },
  {
    id: 'smd-0603',
    label: 'SMD 0603',
    spec: () => ({
      ...defaultResistorSpec(),
      material: 'thick-film-smd',
      physical: { mounting: 'smd-chip', packageSize: '0603', bodyLengthMm: 1.6, bodyWidthMm: 0.8 },
    }),
  },
]

export const CAPACITOR_PRESETS: CapacitorPreset[] = [
  {
    id: 'ceramic-disc-2p54',
    label: 'Ceramic disc, 2.54 mm lead spacing',
    spec: () => ({
      ...defaultCapacitorSpec(),
      type: 'ceramic-disc',
      physical: { mounting: 'ceramic-disc', discDiameterMm: 5, leadSpacingMm: 2.54, leadLengthMm: 10 },
    }),
  },
  {
    id: 'ceramic-disc-5p08',
    label: 'Ceramic disc, 5.08 mm lead spacing',
    spec: () => ({
      ...defaultCapacitorSpec(),
      type: 'ceramic-disc',
      physical: { mounting: 'ceramic-disc', discDiameterMm: 8, leadSpacingMm: 5.08, leadLengthMm: 10 },
    }),
  },
  {
    id: 'electrolytic-5x11',
    label: 'Electrolytic radial, 5 × 11 mm, 2.54 mm spacing',
    spec: () => ({
      ...defaultCapacitorSpec(),
      type: 'electrolytic-radial',
      polarized: true,
      capacitance: 10,
      unit: 'µF',
      voltageRatingV: 25,
      printedLabel: '10µF 25V',
      physical: {
        mounting: 'through-hole-radial',
        bodyDiameterMm: 5,
        bodyHeightMm: 11,
        leadSpacingMm: 2.54,
        leadDiameterMm: 0.5,
        leadLengthMm: 12,
      },
    }),
  },
  {
    id: 'electrolytic-6p3x11',
    label: 'Electrolytic radial, 6.3 × 11 mm, 2.54 mm spacing',
    spec: () => ({
      ...defaultCapacitorSpec(),
      type: 'electrolytic-radial',
      polarized: true,
      capacitance: 47,
      unit: 'µF',
      voltageRatingV: 25,
      printedLabel: '47µF 25V',
      physical: {
        mounting: 'through-hole-radial',
        bodyDiameterMm: 6.3,
        bodyHeightMm: 11,
        leadSpacingMm: 2.54,
        leadDiameterMm: 0.5,
        leadLengthMm: 12,
      },
    }),
  },
  {
    id: 'mlcc-0805',
    label: 'SMD 0805 MLCC',
    spec: () => ({
      ...defaultCapacitorSpec(),
      type: 'mlcc',
      physical: { mounting: 'smd', packageSize: '0805', bodyLengthMm: 2.0, bodyWidthMm: 1.25 },
    }),
  },
  {
    id: 'mlcc-0603',
    label: 'SMD 0603 MLCC',
    spec: () => ({
      ...defaultCapacitorSpec(),
      type: 'mlcc',
      physical: { mounting: 'smd', packageSize: '0603', bodyLengthMm: 1.6, bodyWidthMm: 0.8 },
    }),
  },
]

// ---------------------------------------------------------------------------
// Geometry: bounding box + lead positions
// ---------------------------------------------------------------------------

export type LeadPosition = { name: string; xMm: number; yMm: number; polarity?: '+' | '-' }
export type PassiveGeometry = { widthMm: number; heightMm: number; leads: LeadPosition[] }

/**
 * Compute overall bounding box (in mm) and lead positions for a passive part.
 * The origin (0,0) is the top-left of the bounding box. Leads are placed at
 * the breadboard-facing tips of the part so they snap to holes correctly.
 */
export function computePassiveGeometry(spec: GeneratedPassiveSpec): PassiveGeometry {
  if (spec.passiveType === 'resistor') {
    const r = spec.physical
    if (r.mounting === 'smd-chip') {
      const w = Math.max(r.bodyLengthMm, 0.1)
      const h = Math.max(r.bodyWidthMm, 0.1)
      return {
        widthMm: w,
        heightMm: h,
        leads: [
          { name: 'A', xMm: 0, yMm: h / 2 },
          { name: 'B', xMm: w, yMm: h / 2 },
        ],
      }
    }
    // Axial through-hole / ceramic-power: leads exit each end horizontally and
    // bend down 90° to a configurable spacing.
    const spacing = Math.max(r.leadSpacingMm, r.bodyLengthMm)
    const widthMm = spacing
    const heightMm = Math.max(r.bodyDiameterMm, 1)
    return {
      widthMm,
      heightMm,
      leads: [
        { name: 'A', xMm: 0, yMm: heightMm / 2 },
        { name: 'B', xMm: widthMm, yMm: heightMm / 2 },
      ],
    }
  }

  // Capacitor
  const c = spec.physical
  if (c.mounting === 'smd') {
    const w = Math.max(c.bodyLengthMm, 0.1)
    const h = Math.max(c.bodyWidthMm, 0.1)
    return {
      widthMm: w,
      heightMm: h,
      leads: spec.polarized
        ? [
            { name: '+', xMm: 0, yMm: h / 2, polarity: '+' },
            { name: '-', xMm: w, yMm: h / 2, polarity: '-' },
          ]
        : [
            { name: 'A', xMm: 0, yMm: h / 2 },
            { name: 'B', xMm: w, yMm: h / 2 },
          ],
    }
  }
  if (c.mounting === 'through-hole-axial') {
    const widthMm = Math.max(c.bodyLengthMm + 2 * c.leadLengthMm, c.bodyLengthMm)
    const heightMm = Math.max(c.bodyDiameterMm, 1)
    return {
      widthMm,
      heightMm,
      leads: spec.polarized
        ? [
            { name: '+', xMm: 0, yMm: heightMm / 2, polarity: '+' },
            { name: '-', xMm: widthMm, yMm: heightMm / 2, polarity: '-' },
          ]
        : [
            { name: 'A', xMm: 0, yMm: heightMm / 2 },
            { name: 'B', xMm: widthMm, yMm: heightMm / 2 },
          ],
    }
  }
  if (c.mounting === 'ceramic-disc') {
    const widthMm = Math.max(c.discDiameterMm, c.leadSpacingMm)
    const heightMm = c.discDiameterMm + c.leadLengthMm
    const x1 = widthMm / 2 - c.leadSpacingMm / 2
    const x2 = widthMm / 2 + c.leadSpacingMm / 2
    return {
      widthMm,
      heightMm,
      leads: [
        { name: 'A', xMm: x1, yMm: heightMm },
        { name: 'B', xMm: x2, yMm: heightMm },
      ],
    }
  }
  // through-hole-radial
  const widthMm = Math.max(c.bodyDiameterMm, c.leadSpacingMm)
  const heightMm = c.bodyHeightMm + c.leadLengthMm
  const x1 = widthMm / 2 - c.leadSpacingMm / 2
  const x2 = widthMm / 2 + c.leadSpacingMm / 2
  return {
    widthMm,
    heightMm,
    leads: spec.polarized
      ? [
          { name: '+', xMm: x1, yMm: heightMm, polarity: '+' },
          { name: '-', xMm: x2, yMm: heightMm, polarity: '-' },
        ]
      : [
          { name: 'A', xMm: x1, yMm: heightMm },
          { name: 'B', xMm: x2, yMm: heightMm },
        ],
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type PassiveValidationIssue = { level: 'error' | 'warning'; message: string }

export function validatePassiveSpec(spec: GeneratedPassiveSpec): PassiveValidationIssue[] {
  const issues: PassiveValidationIssue[] = []
  if (!spec.displayName || spec.displayName.trim().length === 0) {
    issues.push({ level: 'error', message: 'Display name is required.' })
  }

  if (spec.passiveType === 'resistor') {
    if (!(spec.resistance > 0)) {
      issues.push({ level: 'error', message: 'Resistance must be a positive number.' })
    }
    if (spec.physical.mounting === 'smd-chip') {
      // SMD parts must not declare through-hole leads. Our type system already
      // prevents this, but guard at runtime in case data was hand-edited.
      const dims = spec.physical
      if (!(dims.bodyLengthMm > 0) || !(dims.bodyWidthMm > 0)) {
        issues.push({ level: 'error', message: 'SMD body dimensions must be positive.' })
      }
    } else {
      const dims = spec.physical
      if (!(dims.bodyLengthMm > 0) || !(dims.bodyDiameterMm > 0)) {
        issues.push({ level: 'error', message: 'Body dimensions must be positive.' })
      }
      if (!(dims.leadSpacingMm >= DEFAULT_PIN_PITCH_MM)) {
        issues.push({
          level: 'warning',
          message: `Lead spacing is below the standard 2.54 mm breadboard pitch.`,
        })
      }
    }
    // Naive power-rating sanity check: warn if rating looks far too small
    // for typical use. We can't infer current without a circuit, so just flag
    // very small ratings combined with a low resistance.
    const watts = parsePowerRatingWatts(spec.powerRating)
    if (watts && watts < 0.2 && spec.resistance < 50) {
      issues.push({
        level: 'warning',
        message: `Power rating ${spec.powerRating} may be too small for low-resistance use.`,
      })
    }
  } else {
    if (!(spec.capacitance > 0)) {
      issues.push({ level: 'error', message: 'Capacitance must be a positive number.' })
    }
    if (!(spec.voltageRatingV > 0)) {
      issues.push({ level: 'error', message: 'Voltage rating must be positive.' })
    }
    if (spec.physical.mounting === 'smd') {
      const dims = spec.physical
      if (!(dims.bodyLengthMm > 0) || !(dims.bodyWidthMm > 0)) {
        issues.push({ level: 'error', message: 'SMD body dimensions must be positive.' })
      }
    }
    if (spec.polarized) {
      const geom = computePassiveGeometry(spec)
      const hasPlus = geom.leads.some((l) => l.polarity === '+')
      const hasMinus = geom.leads.some((l) => l.polarity === '-')
      if (!hasPlus || !hasMinus) {
        issues.push({
          level: 'error',
          message: 'Polarized capacitors must clearly mark + and - leads.',
        })
      }
    }
  }

  return issues
}

function parsePowerRatingWatts(rating: ResistorPowerRating): number | null {
  switch (rating) {
    case '1/8W':
      return 0.125
    case '1/4W':
      return 0.25
    case '1/2W':
      return 0.5
    case '1W':
      return 1
    case '2W':
      return 2
    case '5W':
      return 5
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Building a LibraryPartDefinition from a passive spec
// ---------------------------------------------------------------------------

/**
 * Project the spec's lead positions into `logicalPins` and `physicalPoints`
 * so the existing breadboard placement / snapping pipeline can consume the
 * generated part with no special-case code paths.
 */
export function buildPassiveLibraryPart(
  spec: GeneratedPassiveSpec,
  draft: { id?: string; existing?: LibraryPartDefinition } = {},
): LibraryPartDefinition {
  const geometry = computePassiveGeometry(spec)
  const existing = draft.existing
  const existingLeadIds = new Map<string, { logicalId: string; physicalId: string }>()
  if (existing) {
    for (const point of existing.physicalPoints) {
      const label = point.label ?? ''
      if (label && point.logicalPinId) {
        existingLeadIds.set(label, { logicalId: point.logicalPinId, physicalId: point.id })
      }
    }
  }

  const logicalPins: LogicalPin[] = []
  const physicalPoints: PhysicalPoint[] = []
  for (const lead of geometry.leads) {
    const reused = existingLeadIds.get(lead.name)
    const logicalId = reused?.logicalId ?? createLogicalPinId()
    const physicalId = reused?.physicalId ?? createPhysicalPointId()
    logicalPins.push({
      id: logicalId,
      name: lead.name,
      function: lead.polarity === '+' ? 'positive' : lead.polarity === '-' ? 'negative' : undefined,
    })
    physicalPoints.push({
      id: physicalId,
      viewId: GENERATED_PASSIVE_VIEW_ID,
      kind: 'header-pin',
      xMm: lead.xMm,
      yMm: lead.yMm,
      label: lead.name,
      logicalPinId: logicalId,
      throughHole: spec.passiveType === 'resistor'
        ? spec.physical.mounting !== 'smd-chip'
        : spec.physical.mounting !== 'smd',
    })
  }

  const base = existing
    ? { ...existing }
    : createEmptyLibraryPart({
        id: draft.id,
        name: spec.displayName,
        category: 'passive',
        kind: 'generated-passive',
      })

  return {
    ...base,
    name: spec.displayName,
    category: 'passive',
    kind: 'generated-passive',
    dimensions: {
      widthMm: geometry.widthMm,
      heightMm: geometry.heightMm,
      thicknessMm: base.dimensions.thicknessMm,
    },
    imageViews: [],
    logicalPins,
    physicalPoints,
    passive: spec,
    updatedAt: new Date().toISOString(),
  }
}
