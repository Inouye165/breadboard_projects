import {
  calculateHorizontalAlignmentRotation,
  calculateLineAngleDegrees,
  createHorizontalAlignment,
} from './imageAlignment'

describe('imageAlignment', () => {
  it('calculates the angle between two points', () => {
    expect(calculateLineAngleDegrees({ x: 10, y: 10 }, { x: 30, y: 30 })).toBeCloseTo(45)
    expect(calculateLineAngleDegrees({ x: 40, y: 20 }, { x: 10, y: 20 })).toBeCloseTo(180)
  })

  it('returns the inverse rotation needed to make a line horizontal', () => {
    expect(
      calculateHorizontalAlignmentRotation({ x: 10, y: 10 }, { x: 30, y: 30 }),
    ).toBeCloseTo(-45)
    expect(
      calculateHorizontalAlignmentRotation({ x: 10, y: 30 }, { x: 30, y: 10 }),
    ).toBeCloseTo(45)
  })

  it('captures the selected alignment points and computed rotation', () => {
    expect(
      createHorizontalAlignment({ x: 12, y: 20 }, { x: 52, y: 40 }),
    ).toEqual({
      rotationDegrees: -26.56505117707799,
      referencePoints: [
        { x: 12, y: 20 },
        { x: 52, y: 40 },
      ],
    })
  })
})