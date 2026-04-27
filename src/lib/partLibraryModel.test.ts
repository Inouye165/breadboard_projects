import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PIN_PITCH_MM,
  cloneLibraryPart,
  createEmptyLibraryPart,
  distanceMm,
  generatePinRowMm,
  getPhysicalPointsForLogicalPin,
  getPhysicalPointsForView,
  imagePointToMm,
  mmToImagePoint,
  type LibraryPartDefinition,
  type PartImageCalibration,
} from './partLibraryModel'

function buildSamplePart(): LibraryPartDefinition {
  return createEmptyLibraryPart({
    id: 'library-part-bme280',
    name: 'BME280',
    category: 'sensor',
    dimensions: { widthMm: 11, heightMm: 16 },
    imageViews: [
      {
        id: 'image-view-top',
        label: 'Top',
        side: 'top',
        imageName: 'top.png',
        imagePath: '/__breadboard_local__/parts/bme280/top.png',
        imageWidth: 800,
        imageHeight: 600,
        calibration: {
          corners: {
            topLeft: { x: 100, y: 50 },
            topRight: { x: 700, y: 50 },
            bottomRight: { x: 700, y: 550 },
            bottomLeft: { x: 100, y: 550 },
          },
          widthMm: 11,
          heightMm: 16,
        },
      },
    ],
    logicalPins: [
      { id: 'logical-pin-gnd', name: 'GND', function: 'ground' },
      { id: 'logical-pin-vin', name: 'VIN', function: 'power' },
    ],
    physicalPoints: [
      { id: 'pp-1', viewId: 'image-view-top', kind: 'header-pin', xMm: 1.27, yMm: 1.27, logicalPinId: 'logical-pin-gnd' },
      { id: 'pp-2', viewId: 'image-view-top', kind: 'solder-pad', xMm: 1.27, yMm: 1.27, logicalPinId: 'logical-pin-gnd' },
      { id: 'pp-3', viewId: 'image-view-top', kind: 'header-pin', xMm: 3.81, yMm: 1.27, logicalPinId: 'logical-pin-vin' },
    ],
  })
}

const RECT_CALIBRATION: PartImageCalibration = {
  corners: {
    topLeft: { x: 100, y: 50 },
    topRight: { x: 700, y: 50 },
    bottomRight: { x: 700, y: 550 },
    bottomLeft: { x: 100, y: 550 },
  },
  widthMm: 11,
  heightMm: 16,
}

describe('partLibraryModel', () => {
  it('creates an empty module with safe defaults', () => {
    const part = createEmptyLibraryPart()
    expect(part.category).toBe('module')
    expect(part.dimensions).toEqual({ widthMm: 0, heightMm: 0 })
    expect(part.imageViews).toHaveLength(0)
    expect(part.logicalPins).toHaveLength(0)
    expect(part.physicalPoints).toHaveLength(0)
  })

  it('clones a part deeply, including calibration corners', () => {
    const part = buildSamplePart()
    const clone = cloneLibraryPart(part)

    clone.imageViews[0].calibration!.corners.topLeft.x = 999
    clone.physicalPoints[0].xMm = 99
    clone.logicalPins[0].name = 'CHANGED'

    expect(part.imageViews[0].calibration!.corners.topLeft.x).toBe(100)
    expect(part.physicalPoints[0].xMm).toBe(1.27)
    expect(part.logicalPins[0].name).toBe('GND')
  })

  it('groups physical points by view and by logical pin', () => {
    const part = buildSamplePart()
    expect(getPhysicalPointsForView(part, 'image-view-top')).toHaveLength(3)
    expect(getPhysicalPointsForLogicalPin(part, 'logical-pin-gnd')).toHaveLength(2)
  })
})

describe('image <-> mm calibration math', () => {
  it('maps the four mm corners to the four image corners', () => {
    expect(mmToImagePoint(RECT_CALIBRATION, { xMm: 0, yMm: 0 })).toEqual({ x: 100, y: 50 })
    expect(mmToImagePoint(RECT_CALIBRATION, { xMm: 11, yMm: 0 })).toEqual({ x: 700, y: 50 })
    expect(mmToImagePoint(RECT_CALIBRATION, { xMm: 11, yMm: 16 })).toEqual({ x: 700, y: 550 })
    expect(mmToImagePoint(RECT_CALIBRATION, { xMm: 0, yMm: 16 })).toEqual({ x: 100, y: 550 })
  })

  it('maps an interior mm point through the bilinear mapping', () => {
    const center = mmToImagePoint(RECT_CALIBRATION, { xMm: 5.5, yMm: 8 })
    expect(center.x).toBeCloseTo(400, 5)
    expect(center.y).toBeCloseTo(300, 5)
  })

  it('round-trips a mm point through image space back to mm', () => {
    const original = { xMm: 3.7, yMm: 11.25 }
    const image = mmToImagePoint(RECT_CALIBRATION, original)
    const recovered = imagePointToMm(RECT_CALIBRATION, image)
    expect(recovered.xMm).toBeCloseTo(original.xMm, 5)
    expect(recovered.yMm).toBeCloseTo(original.yMm, 5)
  })

  it('round-trips with a non-rectangular (perspective) calibration quad', () => {
    const skewed: PartImageCalibration = {
      corners: {
        topLeft: { x: 120, y: 40 },
        topRight: { x: 690, y: 70 },
        bottomRight: { x: 720, y: 540 },
        bottomLeft: { x: 90, y: 560 },
      },
      widthMm: 11,
      heightMm: 16,
    }

    for (const sample of [
      { xMm: 0, yMm: 0 },
      { xMm: 11, yMm: 0 },
      { xMm: 11, yMm: 16 },
      { xMm: 0, yMm: 16 },
      { xMm: 5.5, yMm: 8 },
      { xMm: 1.27, yMm: 14.73 },
    ]) {
      const image = mmToImagePoint(skewed, sample)
      const recovered = imagePointToMm(skewed, image)
      expect(recovered.xMm).toBeCloseTo(sample.xMm, 4)
      expect(recovered.yMm).toBeCloseTo(sample.yMm, 4)
    }
  })

  it('places the top-left corner at (0, 0) mm when the image corner is clicked', () => {
    const recovered = imagePointToMm(RECT_CALIBRATION, { x: 100, y: 50 })
    expect(recovered.xMm).toBeCloseTo(0, 5)
    expect(recovered.yMm).toBeCloseTo(0, 5)
  })
})

describe('generatePinRowMm', () => {
  it('returns one point at the start when count is 1', () => {
    const points = generatePinRowMm({ xMm: 1, yMm: 2 }, { xMm: 5, yMm: 6 }, 1)
    expect(points).toEqual([{ xMm: 1, yMm: 2 }])
  })

  it('returns an empty array when count is 0 or negative', () => {
    expect(generatePinRowMm({ xMm: 0, yMm: 0 }, { xMm: 1, yMm: 0 }, 0)).toEqual([])
    expect(generatePinRowMm({ xMm: 0, yMm: 0 }, { xMm: 1, yMm: 0 }, -3)).toEqual([])
  })

  it('spaces pins evenly from start to end inclusive', () => {
    const points = generatePinRowMm({ xMm: 0, yMm: 0 }, { xMm: 10, yMm: 0 }, 5)
    expect(points).toHaveLength(5)
    expect(points[0]).toEqual({ xMm: 0, yMm: 0 })
    expect(points[4]).toEqual({ xMm: 10, yMm: 0 })
    expect(points[1].xMm).toBeCloseTo(2.5, 5)
    expect(points[2].xMm).toBeCloseTo(5, 5)
  })

  it('produces the standard 2.54 mm pin pitch when start/end are spaced for it', () => {
    const start = { xMm: 0, yMm: 0 }
    const end = { xMm: DEFAULT_PIN_PITCH_MM * 7, yMm: 0 }
    const points = generatePinRowMm(start, end, 8)

    expect(points).toHaveLength(8)
    for (let index = 1; index < points.length; index += 1) {
      const gap = distanceMm(points[index - 1], points[index])
      expect(gap).toBeCloseTo(DEFAULT_PIN_PITCH_MM, 5)
    }
  })

  it('supports a diagonal pin row', () => {
    const points = generatePinRowMm({ xMm: 1, yMm: 1 }, { xMm: 4, yMm: 5 }, 3)
    expect(points[0]).toEqual({ xMm: 1, yMm: 1 })
    expect(points[1].xMm).toBeCloseTo(2.5, 5)
    expect(points[1].yMm).toBeCloseTo(3, 5)
    expect(points[2]).toEqual({ xMm: 4, yMm: 5 })
  })
})
