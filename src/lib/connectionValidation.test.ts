import { describe, expect, it } from 'vitest'

import {
  evaluateNet,
  validateCandidateWire,
  type AttachedLogicalPin,
  type ValidationContext,
} from './connectionValidation'
import type { PinElectricalMetadata } from './pinElectrical'
import { createEmptyBreadboardDefinition } from './breadboardDefinitionModel'
import { createEmptyBreadboardProject } from './breadboardProjectModel'

function makeAttached(
  partName: string,
  pinName: string,
  electrical: PinElectricalMetadata,
): AttachedLogicalPin {
  return {
    partId: `${partName}-id`,
    partName,
    logicalPinId: `${partName}-${pinName}`,
    pinName,
    electrical,
  }
}

describe('evaluateNet (rule engine)', () => {
  it('flags a power-to-ground short as an error', () => {
    const findings = evaluateNet(
      new Set(['p1', 'p2']),
      [
        makeAttached('Battery', '5V', { role: 'power', direction: 'power-output' }),
        makeAttached('Battery', 'GND', { role: 'ground', direction: 'passive' }),
      ],
    )
    expect(findings.some((f) => f.ruleId === 'POWER_GROUND_SHORT' && f.severity === 'error')).toBe(true)
  })

  it('blocks a 5V supply on a 3.3V signal that is not 5V tolerant', () => {
    const findings = evaluateNet(
      new Set(['p1', 'p2']),
      [
        makeAttached('Battery', '5V', {
          role: 'power',
          direction: 'power-output',
          voltageDomain: { nominalV: 5 },
        }),
        makeAttached('MCU', 'GPIO4', {
          role: 'digital',
          direction: 'bidirectional',
          voltageDomain: { logicLevelV: 3.3, fiveVTolerant: 'no' },
        }),
      ],
    )
    expect(findings.some((f) => f.ruleId === 'OVER_VOLTAGE_SIGNAL')).toBe(true)
  })

  it('does not block a 5V supply on a 5V tolerant signal pin', () => {
    const findings = evaluateNet(
      new Set(['p1', 'p2']),
      [
        makeAttached('Battery', '5V', {
          role: 'power',
          direction: 'power-output',
          voltageDomain: { nominalV: 5 },
        }),
        makeAttached('MCU', 'TolerantPin', {
          role: 'digital',
          direction: 'bidirectional',
          voltageDomain: { logicLevelV: 3.3, fiveVTolerant: 'yes' },
        }),
      ],
    )
    expect(findings.find((f) => f.ruleId === 'OVER_VOLTAGE_SIGNAL')).toBeUndefined()
  })

  it('warns when a signal pin is tied to a power rail', () => {
    const findings = evaluateNet(
      new Set(['p1', 'p2']),
      [
        makeAttached('Reg', '3V3', {
          role: 'power',
          direction: 'power-output',
          voltageDomain: { nominalV: 3.3 },
        }),
        makeAttached('Sensor', 'OUT', {
          role: 'signal',
          direction: 'output',
          voltageDomain: { logicLevelV: 3.3 },
        }),
      ],
    )
    expect(findings.some((f) => f.ruleId === 'SIGNAL_ON_POWER_RAIL' && f.severity === 'warning')).toBe(true)
  })

  it('warns about two push-pull outputs on the same net', () => {
    const findings = evaluateNet(
      new Set(['p1', 'p2']),
      [
        makeAttached('A', 'OUT', { role: 'digital', direction: 'output' }),
        makeAttached('B', 'OUT', { role: 'digital', direction: 'output' }),
      ],
    )
    expect(findings.some((f) => f.ruleId === 'OUTPUT_OUTPUT_CONFLICT' && f.severity === 'warning')).toBe(true)
  })

  it('does not flag two open-drain outputs as a conflict', () => {
    const findings = evaluateNet(
      new Set(['p1', 'p2']),
      [
        makeAttached('A', 'SDA', {
          role: 'digital',
          direction: 'output',
          capabilities: ['OPEN_DRAIN'],
        }),
        makeAttached('B', 'SDA', {
          role: 'digital',
          direction: 'output',
          capabilities: ['OPEN_DRAIN'],
        }),
      ],
    )
    expect(findings.find((f) => f.ruleId === 'OUTPUT_OUTPUT_CONFLICT')).toBeUndefined()
  })

  it('blocks no-connect pins from being wired to anything', () => {
    const findings = evaluateNet(
      new Set(['p1', 'p2']),
      [
        makeAttached('IC', 'NC', { role: 'no-connect' }),
        makeAttached('Battery', '5V', { role: 'power', direction: 'power-output' }),
      ],
    )
    expect(findings.some((f) => f.ruleId === 'NO_CONNECT_USED' && f.severity === 'error')).toBe(true)
  })

  it('warns (not blocks) on unknown pin metadata when no other rule fires', () => {
    const findings = evaluateNet(
      new Set(['p1', 'p2']),
      [
        makeAttached('Mystery', 'X', {}),
        makeAttached('Mystery', 'Y', {}),
      ],
    )
    expect(findings.find((f) => f.severity === 'error')).toBeUndefined()
    expect(findings.some((f) => f.ruleId === 'UNKNOWN_METADATA' && f.severity === 'warning')).toBe(true)
  })
})

describe('validateCandidateWire', () => {
  it('rejects a wire from a pin to itself with SELF_WIRE error', () => {
    const breadboard = createEmptyBreadboardDefinition({ name: 'BB' })
    const project = createEmptyBreadboardProject({
      name: 'P',
      breadboardDefinitionId: breadboard.id,
    })
    const context: ValidationContext = {
      project,
      breadboard,
      libraryPartIndex: new Map(),
      pixelsPerMm: 10,
    }
    const findings = validateCandidateWire(context, {
      fromPointId: 'pin-a',
      toPointId: 'pin-a',
    })
    expect(findings.some((f) => f.ruleId === 'SELF_WIRE' && f.severity === 'error')).toBe(true)
  })
})
