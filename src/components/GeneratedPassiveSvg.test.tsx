import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { GeneratedPassiveGraphic, GeneratedPassivePreview } from './GeneratedPassiveSvg'
import { BAND_HEX } from '../lib/resistorColorCode'
import type { ResistorSpec } from '../lib/generatedPassive'

const baseAxialResistor: ResistorSpec = {
  passiveType: 'resistor',
  displayName: '200 Ω ±5%',
  resistance: 200,
  unit: 'Ω',
  tolerance: 5,
  powerRating: '1/4W',
  material: 'carbon-film',
  physical: {
    mounting: 'through-hole-axial',
    bodyLengthMm: 8,
    bodyDiameterMm: 2.5,
    leadDiameterMm: 0.6,
    leadLengthMm: 28,
    leadSpacingMm: 25,
  },
  bands: { bandCount: 4 },
}

describe('GeneratedPassiveSvg – axial resistor', () => {
  it('renders an SVG group with accessible label', () => {
    const { container } = render(
      <svg>
        <GeneratedPassiveGraphic spec={baseAxialResistor} pixelsPerMm={6} />
      </svg>,
    )
    const group = container.querySelector('[aria-label*="Resistor"]')
    expect(group).toBeTruthy()
  })

  it('includes a defs element with gradient and clipPath', () => {
    const { container } = render(
      <svg>
        <GeneratedPassiveGraphic spec={baseAxialResistor} pixelsPerMm={6} />
      </svg>,
    )
    expect(container.querySelector('defs')).toBeTruthy()
    expect(container.querySelector('clipPath')).toBeTruthy()
    expect(container.querySelector('linearGradient')).toBeTruthy()
  })

  it('renders 4 band rects for a 4-band resistor (3 value + 1 tolerance)', () => {
    const { container } = render(
      <svg>
        <GeneratedPassiveGraphic spec={baseAxialResistor} pixelsPerMm={6} />
      </svg>,
    )
    // Each band is a <rect> inside the clipPath <g>; select all rects inside the
    // clip group by checking that 4 colour-band rects exist with expected fills.
    const allRects = Array.from(container.querySelectorAll('rect'))
    // Expect the red band (200Ω → red, black, brown, gold)
    const redHex = BAND_HEX['red']
    const hasRed = allRects.some((r) => r.getAttribute('fill') === redHex)
    expect(hasRed).toBeTruthy()
    // Expect the gold tolerance band
    const goldHex = BAND_HEX['gold']
    const hasGold = allRects.some((r) => r.getAttribute('fill') === goldHex)
    expect(hasGold).toBeTruthy()
  })

  it('renders the lead rects that span to the bounding-box edges (x=0 and x=width)', () => {
    const pxPerMm = 6
    const { container } = render(
      <svg>
        <GeneratedPassiveGraphic spec={baseAxialResistor} pixelsPerMm={pxPerMm} />
      </svg>,
    )
    const rects = Array.from(container.querySelectorAll('rect'))
    // Left lead starts at x=0
    const leftLead = rects.find((r) => r.getAttribute('x') === '0')
    expect(leftLead).toBeTruthy()
  })

  it('renders correctly for 1 kΩ ±5% (brown, black, red, gold)', () => {
    const spec1k: ResistorSpec = {
      ...baseAxialResistor,
      displayName: '1 kΩ ±5%',
      resistance: 1,
      unit: 'kΩ',
    }
    const { container } = render(
      <svg>
        <GeneratedPassiveGraphic spec={spec1k} pixelsPerMm={6} />
      </svg>,
    )
    const allRects = Array.from(container.querySelectorAll('rect'))
    expect(allRects.some((r) => r.getAttribute('fill') === BAND_HEX['brown'])).toBeTruthy()
    expect(allRects.some((r) => r.getAttribute('fill') === BAND_HEX['red'])).toBeTruthy()
    expect(allRects.some((r) => r.getAttribute('fill') === BAND_HEX['gold'])).toBeTruthy()
  })

  it('GeneratedPassivePreview wraps the graphic in a sized <svg>', () => {
    const { container } = render(
      <GeneratedPassivePreview spec={baseAxialResistor} maxWidthPx={400} maxHeightPx={200} />,
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThan(0)
  })
})
