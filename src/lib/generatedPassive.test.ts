import { describe, expect, it } from 'vitest'

import {
  buildPassiveLibraryPart,
  computePassiveGeometry,
  defaultCapacitorSpec,
  defaultResistorSpec,
  validatePassiveSpec,
  type CapacitorSpec,
  type ResistorSpec,
} from './generatedPassive'

describe('computePassiveGeometry', () => {
  it('produces two leads at the configured spacing for axial resistors', () => {
    const spec: ResistorSpec = {
      ...defaultResistorSpec(),
      physical: {
        mounting: 'through-hole-axial',
        bodyLengthMm: 6.3,
        bodyDiameterMm: 2.3,
        leadDiameterMm: 0.6,
        leadLengthMm: 28,
        leadSpacingMm: 7.62,
      },
    }
    const geom = computePassiveGeometry(spec)
    expect(geom.widthMm).toBe(7.62)
    expect(geom.leads).toHaveLength(2)
    expect(geom.leads[0].xMm).toBe(0)
    expect(geom.leads[1].xMm).toBe(7.62)
  })

  it('marks polarized capacitor leads with + and -', () => {
    const spec: CapacitorSpec = {
      ...defaultCapacitorSpec(),
      type: 'electrolytic-radial',
      polarized: true,
      physical: {
        mounting: 'through-hole-radial',
        bodyDiameterMm: 5,
        bodyHeightMm: 11,
        leadSpacingMm: 2.54,
        leadDiameterMm: 0.5,
        leadLengthMm: 12,
      },
    }
    const geom = computePassiveGeometry(spec)
    expect(geom.leads.map((l) => l.polarity)).toEqual(['+', '-'])
  })
})

describe('buildPassiveLibraryPart', () => {
  it('creates a saveable library part without any image views', () => {
    const part = buildPassiveLibraryPart(defaultResistorSpec())
    expect(part.kind).toBe('generated-passive')
    expect(part.category).toBe('passive')
    expect(part.imageViews).toEqual([])
    expect(part.physicalPoints).toHaveLength(2)
    expect(part.logicalPins).toHaveLength(2)
    expect(part.passive?.passiveType).toBe('resistor')
  })

  it('preserves polarity labels for electrolytic capacitors', () => {
    const part = buildPassiveLibraryPart({
      ...defaultCapacitorSpec(),
      type: 'electrolytic-radial',
      polarized: true,
      physical: {
        mounting: 'through-hole-radial',
        bodyDiameterMm: 5,
        bodyHeightMm: 11,
        leadSpacingMm: 2.54,
        leadDiameterMm: 0.5,
        leadLengthMm: 12,
      },
    })
    const leadLabels = part.physicalPoints.map((p) => p.label).sort()
    expect(leadLabels).toEqual(['+', '-'])
    const positivePin = part.logicalPins.find((p) => p.name === '+')
    const negativePin = part.logicalPins.find((p) => p.name === '-')
    expect(positivePin?.function).toBe('positive')
    expect(negativePin?.function).toBe('negative')
  })

  it('round-trips through JSON without losing the passive spec', () => {
    const part = buildPassiveLibraryPart(defaultCapacitorSpec())
    const cloned = JSON.parse(JSON.stringify(part))
    expect(cloned.kind).toBe('generated-passive')
    expect(cloned.passive.passiveType).toBe('capacitor')
    expect(cloned.passive.printedLabel).toBe('104')
  })
})

describe('validatePassiveSpec', () => {
  it('rejects non-positive resistance', () => {
    const issues = validatePassiveSpec({ ...defaultResistorSpec(), resistance: 0 })
    expect(issues.some((i) => i.level === 'error' && /Resistance/.test(i.message))).toBe(true)
  })

  it('rejects non-positive capacitance', () => {
    const issues = validatePassiveSpec({ ...defaultCapacitorSpec(), capacitance: -1 })
    expect(issues.some((i) => i.level === 'error' && /Capacitance/.test(i.message))).toBe(true)
  })

  it('rejects empty display name', () => {
    const issues = validatePassiveSpec({ ...defaultResistorSpec(), displayName: '   ' })
    expect(issues.some((i) => /Display name/.test(i.message))).toBe(true)
  })

  it('warns about underrated resistors', () => {
    const issues = validatePassiveSpec({
      ...defaultResistorSpec(),
      powerRating: '1/8W',
      resistance: 10,
      unit: 'Ω',
    })
    expect(issues.some((i) => i.level === 'warning' && /Power rating/.test(i.message))).toBe(true)
  })

  it('passes a valid resistor', () => {
    const issues = validatePassiveSpec(defaultResistorSpec())
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
  })
})
