import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BreadboardCanvas } from './BreadboardCanvas'

describe('BreadboardCanvas', () => {
  it('prompts for a screenshot when no image is provided', () => {
    render(<BreadboardCanvas />)

    expect(
      screen.getByRole('heading', {
        name: /add a breadboard screenshot to begin/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/breadboard upload prompt/i)).toBeInTheDocument()
  })

  it('renders the supplied breadboard image', () => {
    render(<BreadboardCanvas imageSrc="/example-board.png" />)

    expect(screen.getByRole('img', { name: /uploaded breadboard reference/i })).toHaveAttribute(
      'src',
      '/example-board.png',
    )
  })
})