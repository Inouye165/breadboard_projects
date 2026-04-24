export type AlignmentPoint = {
  x: number
  y: number
}

export type ImageAlignment = {
  rotationDegrees: number
  referencePoints: [AlignmentPoint, AlignmentPoint] | null
}

export type SavedWorkspace = {
  imagePath: string
  imageName: string
  alignment: ImageAlignment
}

export function createDefaultAlignment(): ImageAlignment {
  return {
    rotationDegrees: 0,
    referencePoints: null,
  }
}

export function calculateLineAngleDegrees(start: AlignmentPoint, end: AlignmentPoint) {
  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI
}

export function calculateHorizontalAlignmentRotation(
  start: AlignmentPoint,
  end: AlignmentPoint,
) {
  return -calculateLineAngleDegrees(start, end)
}

export function createHorizontalAlignment(start: AlignmentPoint, end: AlignmentPoint): ImageAlignment {
  return {
    rotationDegrees: calculateHorizontalAlignmentRotation(start, end),
    referencePoints: [start, end],
  }
}