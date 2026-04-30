import { describe, expect, it } from 'vitest'

import { computeResistorBands, resistanceToOhms } from './resistorColorCode'

describe('resistanceToOhms', () => {
  it('keeps ohms as ohms', () => {
    expect(resistanceToOhms(220, 'Ω')).toBe(220)
  })
  it('scales kΩ', () => {
    expect(resistanceToOhms(1, 'kΩ')).toBe(1_000)
  })
  it('scales MΩ', () => {
    expect(resistanceToOhms(1, 'MΩ')).toBe(1_000_000)
  })
})

describe('computeResistorBands (4-band)', () => {
  it('encodes 200 Ω ±5% as red, black, brown, gold', () => {
    expect(computeResistorBands(200, 'Ω', 5, 4)).toEqual(['red', 'black', 'brown', 'gold'])
  })

  it('encodes 1 kΩ ±5% as brown, black, red, gold', () => {
    expect(computeResistorBands(1, 'kΩ', 5, 4)).toEqual(['brown', 'black', 'red', 'gold'])
  })

  it('encodes 1 MΩ ±5% as brown, black, green, gold', () => {
    expect(computeResistorBands(1, 'MΩ', 5, 4)).toEqual(['brown', 'black', 'green', 'gold'])
  })

  it('encodes 4.7 kΩ ±5% as yellow, violet, red, gold', () => {
    expect(computeResistorBands(4.7, 'kΩ', 5, 4)).toEqual(['yellow', 'violet', 'red', 'gold'])
  })

  it('omits the tolerance band for 20%', () => {
    const bands = computeResistorBands(200, 'Ω', 20, 4)
    expect(bands).toHaveLength(3)
    expect(bands).toEqual(['red', 'black', 'brown'])
  })
})

describe('computeResistorBands (5-band)', () => {
  it('encodes 4.7 kΩ ±1% as yellow, violet, black, brown, brown', () => {
    expect(computeResistorBands(4.7, 'kΩ', 1, 5)).toEqual([
      'yellow',
      'violet',
      'black',
      'brown',
      'brown',
    ])
  })
})
