/**
 * Resistor color code utilities. Encodes resistance + tolerance into the
 * standard 4- or 5-band color sequence used on through-hole axial resistors.
 *
 * Reference: IEC 60062.
 */

import type { ResistorTolerance, ResistorUnit } from './generatedPassive'

export type BandColor =
  | 'black'
  | 'brown'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'violet'
  | 'gray'
  | 'white'
  | 'gold'
  | 'silver'
  | 'pink'

export const BAND_HEX: Record<BandColor, string> = {
  black: '#000000',
  brown: '#7a4a1f',
  red: '#d42c2c',
  orange: '#f08000',
  yellow: '#f4d03f',
  green: '#2e8b57',
  blue: '#1f5fcc',
  violet: '#7a3fc6',
  gray: '#808080',
  white: '#fafafa',
  gold: '#d4af37',
  silver: '#c0c0c0',
  pink: '#ff8fb1',
}

const DIGIT_TO_COLOR: BandColor[] = [
  'black', // 0
  'brown', // 1
  'red', // 2
  'orange', // 3
  'yellow', // 4
  'green', // 5
  'blue', // 6
  'violet', // 7
  'gray', // 8
  'white', // 9
]

const TOLERANCE_TO_COLOR: Record<number, BandColor> = {
  1: 'brown',
  2: 'red',
  0.5: 'green',
  0.25: 'blue',
  0.1: 'violet',
  5: 'gold',
  10: 'silver',
  20: 'black', // No band conventionally; use black as a sentinel that we omit.
}

/** Convert a value+unit to ohms. */
export function resistanceToOhms(value: number, unit: ResistorUnit): number {
  switch (unit) {
    case 'Ω':
      return value
    case 'kΩ':
      return value * 1_000
    case 'MΩ':
      return value * 1_000_000
  }
}

/**
 * Compute the color bands for a resistor.
 *
 * For 4-band resistors: [digit1, digit2, multiplier, tolerance]
 * For 5-band resistors: [digit1, digit2, digit3, multiplier, tolerance]
 *
 * 20% tolerance traditionally has no fourth band. We omit it from the result
 * in that case (returning a 3-element array for 4-band style).
 */
export function computeResistorBands(
  value: number,
  unit: ResistorUnit,
  tolerance: ResistorTolerance,
  bandCount: 4 | 5 = 4,
): BandColor[] {
  const ohms = resistanceToOhms(value, unit)
  if (!(ohms > 0)) {
    return []
  }

  const digitCount = bandCount === 5 ? 3 : 2
  // Normalise to "<digitCount>-digit integer × 10^multiplier".
  let multiplier = 0
  // Increase precision when the rounding lost information (e.g. 4.7 Ω).
  // We do this by scaling up first.
  let scale = 1
  while (Math.abs(ohms * scale - Math.round(ohms * scale)) > 1e-6 && scale < 1e6) {
    scale *= 10
    multiplier -= 1
  }
  let digits = Math.round(ohms * scale)
  while (digits >= Math.pow(10, digitCount)) {
    digits = Math.round(digits / 10)
    multiplier += 1
  }
  while (digits > 0 && digits < Math.pow(10, digitCount - 1)) {
    digits *= 10
    multiplier -= 1
  }

  const bands: BandColor[] = []
  const digitStr = digits.toString().padStart(digitCount, '0')
  for (const ch of digitStr) {
    bands.push(DIGIT_TO_COLOR[Number(ch)])
  }
  bands.push(multiplierColor(multiplier))

  if (tolerance !== 20) {
    const toleranceColor = TOLERANCE_TO_COLOR[tolerance]
    if (toleranceColor) {
      bands.push(toleranceColor)
    }
  }

  return bands
}

function multiplierColor(power: number): BandColor {
  switch (power) {
    case -2:
      return 'silver'
    case -1:
      return 'gold'
    case 0:
      return 'black'
    case 1:
      return 'brown'
    case 2:
      return 'red'
    case 3:
      return 'orange'
    case 4:
      return 'yellow'
    case 5:
      return 'green'
    case 6:
      return 'blue'
    case 7:
      return 'violet'
    case 8:
      return 'gray'
    case 9:
      return 'white'
    default:
      // Out-of-range multipliers fall back to black (no scaling). Callers can
      // override the band sequence manually when modelling exotic parts.
      return 'black'
  }
}
