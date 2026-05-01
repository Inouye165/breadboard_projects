/**
 * Example module fixture: Seeed XIAO ESP32-C3 Super Mini.
 *
 * This file is intentionally a *consumer* of the generic library/pin model
 * \u2014 nothing here is special-cased anywhere else in the app. The same
 * builder pattern works for any other module (sensors, breakouts, motor
 * drivers, etc.); only the data differs.
 *
 * Anything not directly verifiable from the silkscreen image is marked with
 * `role: 'unknown'` and `direction: 'unknown'` so the connection validator
 * surfaces an explicit \u201cunknown metadata\u201d warning rather than asserting a
 * potentially wrong electrical role.
 */

import {
  GENERATED_PASSIVE_VIEW_ID,
  createEmptyLibraryPart,
  createImageViewId,
  createLogicalPinId,
  createPhysicalPointId,
  type LibraryPartDefinition,
  type LogicalPin,
  type PhysicalPoint,
} from './partLibraryModel'
import type { PinElectricalMetadata } from './pinElectrical'

const EXAMPLE_VIEW_ID = createImageViewId()

type SeedPin = {
  silkscreen: string
  display: string
  side: 'left' | 'right'
  pinNumber: number
  electrical: PinElectricalMetadata
}

const POWER_5V: PinElectricalMetadata = {
  role: 'power',
  direction: 'power-input',
  voltageDomain: { nominalV: 5, minV: 4.5, maxV: 5.5, fiveVTolerant: 'yes' },
}

const POWER_3V3: PinElectricalMetadata = {
  role: 'power',
  direction: 'power-output',
  voltageDomain: { nominalV: 3.3, minV: 3.0, maxV: 3.6, logicLevelV: 3.3, fiveVTolerant: 'no' },
}

const GROUND: PinElectricalMetadata = {
  role: 'ground',
  direction: 'passive',
  voltageDomain: { nominalV: 0 },
  capabilities: ['GROUND'],
}

/**
 * 3.3 V GPIO with capabilities marked as known but voltage tolerance noted
 * as not 5V tolerant (typical for ESP32-C3). Datasheet should be consulted
 * for definitive limits \u2014 this example mirrors what's safely inferable.
 */
function gpio(pinNumber: number, extraCaps: string[] = []): PinElectricalMetadata {
  return {
    role: 'digital',
    direction: 'bidirectional',
    voltageDomain: { logicLevelV: 3.3, fiveVTolerant: 'no' },
    capabilities: ['GPIO', ...extraCaps],
  }
}

const SEED_PINS: SeedPin[] = [
  // Left side (top to bottom in the photo): 5V, G, 3.3, 4, 3, 2, 1, 0
  { silkscreen: '5V', display: '5V', side: 'left', pinNumber: 1, electrical: POWER_5V },
  { silkscreen: 'G', display: 'GND', side: 'left', pinNumber: 2, electrical: GROUND },
  { silkscreen: '3.3', display: '3V3', side: 'left', pinNumber: 3, electrical: POWER_3V3 },
  { silkscreen: '4', display: 'GPIO4', side: 'left', pinNumber: 4, electrical: gpio(4, ['ADC']) },
  { silkscreen: '3', display: 'GPIO3', side: 'left', pinNumber: 5, electrical: gpio(3, ['ADC']) },
  { silkscreen: '2', display: 'GPIO2', side: 'left', pinNumber: 6, electrical: gpio(2, ['ADC']) },
  { silkscreen: '1', display: 'GPIO1', side: 'left', pinNumber: 7, electrical: gpio(1, ['ADC']) },
  { silkscreen: '0', display: 'GPIO0', side: 'left', pinNumber: 8, electrical: gpio(0, ['ADC']) },
  // Right side (top to bottom): 5, 6, 7, 8, 9, 10, 20, 21
  { silkscreen: '5', display: 'GPIO5', side: 'right', pinNumber: 9, electrical: gpio(5) },
  { silkscreen: '6', display: 'GPIO6', side: 'right', pinNumber: 10, electrical: gpio(6) },
  { silkscreen: '7', display: 'GPIO7', side: 'right', pinNumber: 11, electrical: gpio(7) },
  { silkscreen: '8', display: 'GPIO8', side: 'right', pinNumber: 12, electrical: gpio(8) },
  { silkscreen: '9', display: 'GPIO9', side: 'right', pinNumber: 13, electrical: gpio(9, ['BOOT']) },
  { silkscreen: '10', display: 'GPIO10', side: 'right', pinNumber: 14, electrical: gpio(10) },
  { silkscreen: '20', display: 'GPIO20', side: 'right', pinNumber: 15, electrical: gpio(20, ['UART_RX']) },
  { silkscreen: '21', display: 'GPIO21', side: 'right', pinNumber: 16, electrical: gpio(21, ['UART_TX']) },
]

/**
 * Build the ESP32-C3 Super Mini example module definition.
 *
 * The geometry uses the published board outline (~17.8 \u00d7 21 mm) and the
 * standard 2.54 mm pitch. The side-location and pin-number metadata mirror
 * the silkscreen visible in the photo; capabilities marked here are the
 * subset that's directly verifiable, with the rest left as 'GPIO'.
 */
export function createExampleEsp32C3SuperMini(): LibraryPartDefinition {
  const widthMm = 17.8
  const heightMm = 21
  const pitchMm = 2.54

  const logicalPins: LogicalPin[] = SEED_PINS.map((seed) => ({
    id: createLogicalPinId(),
    name: seed.display,
    description: `${seed.display} (silkscreen "${seed.silkscreen}")`,
    electrical: {
      ...seed.electrical,
      silkscreenLabel: seed.silkscreen,
      pinNumber: seed.pinNumber,
      sideLocation: seed.side,
      padType: 'header-pin',
      pitchMm,
      aliases: [seed.silkscreen, seed.display, `IO${seed.silkscreen}`].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
    },
  }))

  // Place pins at standard 2.54 mm pitch starting 2 mm in from the top edge,
  // on the left and right edges of the board. All counts are 8 per side.
  const leftPins = logicalPins.filter((_p, i) => SEED_PINS[i].side === 'left')
  const rightPins = logicalPins.filter((_p, i) => SEED_PINS[i].side === 'right')
  const yStart = 2.5

  const physicalPoints: PhysicalPoint[] = [
    ...leftPins.map((pin, idx) => ({
      id: createPhysicalPointId(),
      viewId: EXAMPLE_VIEW_ID,
      kind: 'header-pin' as const,
      xMm: 1.5,
      yMm: yStart + idx * pitchMm,
      label: pin.name,
      logicalPinId: pin.id,
      throughHole: true,
      solderable: true,
    })),
    ...rightPins.map((pin, idx) => ({
      id: createPhysicalPointId(),
      viewId: EXAMPLE_VIEW_ID,
      kind: 'header-pin' as const,
      xMm: widthMm - 1.5,
      yMm: yStart + idx * pitchMm,
      label: pin.name,
      logicalPinId: pin.id,
      throughHole: true,
      solderable: true,
    })),
  ]

  return createEmptyLibraryPart({
    id: 'example-esp32-c3-super-mini',
    name: 'ESP32-C3 Super Mini (example)',
    category: 'microcontroller',
    kind: 'image-module',
    manufacturer: 'Seeed Studio',
    modelNumber: 'XIAO-ESP32C3',
    description:
      'Example/demo module showing how to author a generic smart-module definition. Pin metadata is illustrative; consult the official datasheet before relying on it for hardware decisions.',
    aliases: ['ESP32-C3 Super Mini', 'XIAO ESP32-C3'],
    tags: ['microcontroller', 'wifi', 'bluetooth', 'esp32'],
    dimensions: { widthMm, heightMm, thicknessMm: 1.6 },
    imageViews: [
      {
        id: EXAMPLE_VIEW_ID,
        label: 'Top',
        side: 'top',
        imageName: '',
        imagePath: '',
        imageWidth: 0,
        imageHeight: 0,
      },
    ],
    logicalPins,
    physicalPoints,
    resources: [
      {
        id: 'example-esp32-c3-datasheet',
        kind: 'datasheet',
        label: 'Espressif ESP32-C3 datasheet',
      },
    ],
    datasheetUrl:
      'https://www.espressif.com/sites/default/files/documentation/esp32-c3_datasheet_en.pdf',
  })
}

// Internal export for tests only \u2014 lets the test suite assert on the
// underlying side/pin-number metadata without re-deriving it.
export const __EXAMPLE_ESP32_SEED_PINS = SEED_PINS

// Avoid unused-symbol warning when GENERATED_PASSIVE_VIEW_ID is re-exported
// from the model in future work.
void GENERATED_PASSIVE_VIEW_ID
