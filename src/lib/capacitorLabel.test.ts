import { describe, expect, it } from 'vitest'

import { capacitanceToPicofarads, capacitorEiaCode, capacitorHumanLabel } from './capacitorLabel'

describe('capacitanceToPicofarads', () => {
  it('keeps pF as pF', () => {
    expect(capacitanceToPicofarads(22, 'pF')).toBe(22)
  })
  it('scales nF', () => {
    expect(capacitanceToPicofarads(100, 'nF')).toBe(100_000)
  })
  it('scales µF', () => {
    expect(capacitanceToPicofarads(10, 'µF')).toBe(10_000_000)
  })
})

describe('capacitorEiaCode', () => {
  it('encodes 100 nF as 104', () => {
    expect(capacitorEiaCode(100, 'nF')).toBe('104')
  })
  it('encodes 10 nF as 103', () => {
    expect(capacitorEiaCode(10, 'nF')).toBe('103')
  })
  it('encodes 4.7 nF as 472', () => {
    expect(capacitorEiaCode(4.7, 'nF')).toBe('472')
  })
  it('encodes 22 pF as 22p', () => {
    expect(capacitorEiaCode(22, 'pF')).toBe('22p')
  })
  it('encodes 1 µF as 105', () => {
    expect(capacitorEiaCode(1, 'µF')).toBe('105')
  })
  it('returns empty for non-positive values', () => {
    expect(capacitorEiaCode(0, 'nF')).toBe('')
    expect(capacitorEiaCode(-1, 'nF')).toBe('')
  })
})

describe('capacitorHumanLabel', () => {
  it('formats common values', () => {
    expect(capacitorHumanLabel(100, 'nF')).toBe('100nF')
    expect(capacitorHumanLabel(10, 'µF')).toBe('10µF')
  })
})
