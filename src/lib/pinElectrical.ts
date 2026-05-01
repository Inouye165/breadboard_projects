/**
 * Generic, data-driven electrical metadata vocabulary for module pins.
 *
 * The values here are intentionally module-agnostic: an ESP32 GPIO, a sensor
 * OUT pin, a JST connector pad, or a passive resistor lead all describe
 * themselves with the same enums. Validation rules in `connectionValidation`
 * read these fields without ever asking "is this an ESP32?".
 *
 * All consumers should treat these enums as "open with safe defaults" — when
 * a value is missing or a string outside the enum is encountered, treat the
 * pin as `unknown` rather than asserting/throwing.
 */

export const PIN_ELECTRICAL_ROLES = [
  'power',
  'ground',
  'signal',
  'analog',
  'digital',
  'communication-bus',
  'passive-terminal',
  'no-connect',
  'reset-boot-control',
  'unknown',
] as const

export type PinElectricalRole = (typeof PIN_ELECTRICAL_ROLES)[number]

export const PIN_DIRECTIONS = [
  'input',
  'output',
  'bidirectional',
  'power-input',
  'power-output',
  'passive',
  'unknown',
] as const

export type PinDirection = (typeof PIN_DIRECTIONS)[number]

export const PIN_SIDE_LOCATIONS = [
  'left',
  'right',
  'top',
  'bottom',
  'front',
  'back',
  'unknown',
] as const

export type PinSideLocation = (typeof PIN_SIDE_LOCATIONS)[number]

export const PIN_PAD_TYPES = [
  'through-hole',
  'header-pin',
  'solder-pad',
  'castellated-pad',
  'screw-terminal',
  'jst-connector',
  'test-pad',
  'unknown',
] as const

export type PinPadType = (typeof PIN_PAD_TYPES)[number]

export const PIN_FIVE_V_TOLERANT_VALUES = ['yes', 'no', 'unknown'] as const
export type PinFiveVTolerant = (typeof PIN_FIVE_V_TOLERANT_VALUES)[number]

/**
 * Capabilities are an open multi-select. The well-known values listed below
 * power most validation rules; arbitrary strings are allowed for
 * forward-compatibility (e.g. "CAN_TX", "I2S_BCLK"). Validation must always
 * tolerate unknown capability strings.
 */
export const PIN_CAPABILITIES = [
  'GPIO',
  'ADC',
  'PWM',
  'I2C_SDA',
  'I2C_SCL',
  'SPI_MOSI',
  'SPI_MISO',
  'SPI_SCK',
  'SPI_CS',
  'UART_TX',
  'UART_RX',
  'TOUCH',
  'DAC',
  'RESET',
  'BOOT',
  'POWER_IN',
  'POWER_OUT',
  'GROUND',
  'SENSOR_OUT',
  'OPEN_DRAIN',
  'OPEN_COLLECTOR',
  'UNKNOWN',
] as const

export type PinCapability = (typeof PIN_CAPABILITIES)[number] | string

/**
 * Voltage domain describes the pin's expected steady-state voltage envelope.
 * Either side may be omitted when not known. `nominalV` is the most useful
 * field for validation (e.g. comparing 5V vs 3.3V rails).
 */
export type PinVoltageDomain = {
  nominalV?: number
  minV?: number
  maxV?: number
  /** Logic-family voltage, e.g. 3.3 for "3.3 V logic". */
  logicLevelV?: number
  fiveVTolerant?: PinFiveVTolerant
}

/**
 * Optional current capability. `sourceMa` / `sinkMa` describe how much
 * current the pin can drive / accept. `limitMa` is a generic budget (used
 * for power pins).
 */
export type PinCurrentLimits = {
  limitMa?: number
  sourceMa?: number
  sinkMa?: number
}

/**
 * Electrical metadata bundle attached to a `LogicalPin`. Every field is
 * optional and is read with a safe fallback by validation, so older modules
 * load without migration.
 */
export type PinElectricalMetadata = {
  role?: PinElectricalRole
  direction?: PinDirection
  voltageDomain?: PinVoltageDomain
  currentLimits?: PinCurrentLimits
  capabilities?: PinCapability[]
  /** e.g. silkscreen "IO4" while display label is "GPIO4". */
  silkscreenLabel?: string
  /** Pin number / order on the module's pinout. */
  pinNumber?: number
  sideLocation?: PinSideLocation
  padType?: PinPadType
  /** Header pitch in millimeters (e.g. 2.54). */
  pitchMm?: number
  /** Free-form aliases users may also see for this pin (e.g. ["IO4", "4"]). */
  aliases?: string[]
  notes?: string
  datasheetUrl?: string
  schematicUrl?: string
}

/** Coerce an unknown value into a known role, falling back to 'unknown'. */
export function coerceRole(value: unknown): PinElectricalRole {
  return typeof value === 'string' && (PIN_ELECTRICAL_ROLES as readonly string[]).includes(value)
    ? (value as PinElectricalRole)
    : 'unknown'
}

/** Coerce an unknown value into a known direction, falling back to 'unknown'. */
export function coerceDirection(value: unknown): PinDirection {
  return typeof value === 'string' && (PIN_DIRECTIONS as readonly string[]).includes(value)
    ? (value as PinDirection)
    : 'unknown'
}

export function coerceFiveVTolerant(value: unknown): PinFiveVTolerant {
  return typeof value === 'string' &&
    (PIN_FIVE_V_TOLERANT_VALUES as readonly string[]).includes(value)
    ? (value as PinFiveVTolerant)
    : 'unknown'
}

export function coerceSideLocation(value: unknown): PinSideLocation {
  return typeof value === 'string' && (PIN_SIDE_LOCATIONS as readonly string[]).includes(value)
    ? (value as PinSideLocation)
    : 'unknown'
}

export function coercePadType(value: unknown): PinPadType {
  return typeof value === 'string' && (PIN_PAD_TYPES as readonly string[]).includes(value)
    ? (value as PinPadType)
    : 'unknown'
}
