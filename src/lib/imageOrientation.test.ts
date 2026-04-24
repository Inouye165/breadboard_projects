import { ensureLandscapeFile, isPortrait } from './imageOrientation'

describe('imageOrientation', () => {
  it('detects portrait dimensions when height exceeds width', () => {
    expect(isPortrait(384, 1096)).toBe(true)
    expect(isPortrait(1200, 600)).toBe(false)
    expect(isPortrait(800, 800)).toBe(false)
  })

  it('returns the original file when the environment cannot decode the image', async () => {
    const original = new File(['not-a-real-image'], 'board.png', { type: 'image/png' })

    await expect(ensureLandscapeFile(original)).resolves.toBe(original)
  })
})
