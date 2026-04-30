/**
 * Capacitor label utilities. Generates printed code labels (EIA "104"
 * encoding) and human-friendly value strings.
 */

import type { CapacitorUnit } from './generatedPassive'

/** Convert a value+unit to picofarads. */
export function capacitanceToPicofarads(value: number, unit: CapacitorUnit): number {
  switch (unit) {
    case 'pF':
      return value
    case 'nF':
      return value * 1_000
    case 'µF':
      return value * 1_000_000
    case 'mF':
      return value * 1_000_000_000
  }
}

/**
 * Encode a capacitance in the standard 3-digit EIA code:
 * two significant digits + multiplier (power of 10) in pF.
 *
 *   100 nF  -> 100,000 pF -> "104"
 *    10 nF  ->  10,000 pF -> "103"
 *    22 pF  ->     22 pF  -> "22p" (no exponent needed)
 *   4.7 nF  ->   4700 pF  -> "472"
 */
export function capacitorEiaCode(value: number, unit: CapacitorUnit): string {
  const pf = capacitanceToPicofarads(value, unit)
  if (!(pf > 0)) {
    return ''
  }

  // For values < 100 pF the convention is to spell them out (e.g. 22p, 4p7)
  // rather than using a 3-digit code, because the multiplier would have to be
  // negative.
  if (pf < 100) {
    if (Number.isInteger(pf)) {
      return `${pf}p`
    }
    const integerPart = Math.floor(pf)
    const fractional = Math.round((pf - integerPart) * 10)
    return `${integerPart}p${fractional}`
  }

  // Find significant digits and exponent so that pf = digits * 10^exp,
  // with digits being a 2-digit integer (10..99).
  let digits = Math.round(pf)
  let exponent = 0
  while (digits >= 100) {
    digits = Math.round(digits / 10)
    exponent += 1
  }
  return `${digits}${exponent}`
}

/** "100nF", "10µF", "22pF" - human label generated from the value/unit. */
export function capacitorHumanLabel(value: number, unit: CapacitorUnit): string {
  if (!(value > 0)) {
    return ''
  }
  // Trim trailing zeros from a clean numeric format.
  const numeric = Number.isInteger(value) ? `${value}` : `${value}`.replace(/0+$/, '').replace(/\.$/, '')
  return `${numeric}${unit}`
}
