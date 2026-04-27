export function getHorizontalDisplayDimensions(width: number, height: number) {
  if (width >= height) {
    return {
      width,
      height,
      shouldRotate: false,
    }
  }

  return {
    width: height,
    height: width,
    shouldRotate: true,
  }
}