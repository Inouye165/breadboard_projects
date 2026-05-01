import { describe, expect, it } from 'vitest'

import { createExampleEsp32C3SuperMini, __EXAMPLE_ESP32_SEED_PINS } from './exampleModules'

describe('createExampleEsp32C3SuperMini (generic example fixture)', () => {
  const part = createExampleEsp32C3SuperMini()

  it('has the expected pin counts per side', () => {
    expect(__EXAMPLE_ESP32_SEED_PINS.filter((p) => p.side === 'left')).toHaveLength(8)
    expect(__EXAMPLE_ESP32_SEED_PINS.filter((p) => p.side === 'right')).toHaveLength(8)
    expect(part.logicalPins).toHaveLength(16)
    expect(part.physicalPoints).toHaveLength(16)
  })

  it('marks the 5V pin as 5V power input with 5V tolerance', () => {
    const fiveV = part.logicalPins.find((p) => p.electrical?.silkscreenLabel === '5V')
    expect(fiveV).toBeDefined()
    expect(fiveV!.electrical?.role).toBe('power')
    expect(fiveV!.electrical?.voltageDomain?.nominalV).toBe(5)
    expect(fiveV!.electrical?.voltageDomain?.fiveVTolerant).toBe('yes')
  })

  it('marks the 3.3V pin as 3.3V power output not 5V tolerant', () => {
    const threeV3 = part.logicalPins.find((p) => p.electrical?.silkscreenLabel === '3.3')
    expect(threeV3).toBeDefined()
    expect(threeV3!.electrical?.role).toBe('power')
    expect(threeV3!.electrical?.direction).toBe('power-output')
    expect(threeV3!.electrical?.voltageDomain?.nominalV).toBe(3.3)
    expect(threeV3!.electrical?.voltageDomain?.fiveVTolerant).toBe('no')
  })

  it('marks GPIO pins as 3.3V digital bidirectional with GPIO capability', () => {
    const gpio4 = part.logicalPins.find((p) => p.electrical?.silkscreenLabel === '4')
    expect(gpio4).toBeDefined()
    expect(gpio4!.electrical?.role).toBe('digital')
    expect(gpio4!.electrical?.direction).toBe('bidirectional')
    expect(gpio4!.electrical?.voltageDomain?.logicLevelV).toBe(3.3)
    expect(gpio4!.electrical?.capabilities).toContain('GPIO')
  })

  it('records side and pin number metadata', () => {
    const left = part.logicalPins.filter((p) => p.electrical?.sideLocation === 'left')
    const right = part.logicalPins.filter((p) => p.electrical?.sideLocation === 'right')
    expect(left).toHaveLength(8)
    expect(right).toHaveLength(8)
    const numbers = part.logicalPins.map((p) => p.electrical?.pinNumber).sort((a, b) => (a! - b!))
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  })

  it('uses the schema version and definition tags', () => {
    expect(part.definitionVersion).toBeGreaterThanOrEqual(1)
    expect(part.tags).toContain('microcontroller')
  })
})
