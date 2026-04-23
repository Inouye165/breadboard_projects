import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BreadboardCanvas } from './BreadboardCanvas'

describe('BreadboardCanvas', () => {
  it('prompts for a screenshot when no image is provided', () => {
    render(<BreadboardCanvas onImageSelected={vi.fn()} />)

    expect(
      screen.getByRole('heading', {
        name: /add a breadboard screenshot to begin/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/breadboard upload prompt/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /choose image/i })).toBeInTheDocument()
  })

  it('renders the supplied breadboard image', () => {
    render(
      <BreadboardCanvas imageSrc="/example-board.png" onImageSelected={vi.fn()} />,
    )

    expect(screen.getByRole('img', { name: /uploaded breadboard reference/i })).toHaveAttribute(
      'src',
      '/example-board.png',
    )
    expect(screen.getByRole('button', { name: /replace image/i })).toBeInTheDocument()
  })

  it('forwards a selected file from the fallback input', () => {
    const onImageSelected = vi.fn()

    const { container } = render(<BreadboardCanvas onImageSelected={onImageSelected} />)

    const input = container.querySelector('input[type="file"]')
    const file = new File(['image'], 'board.png', { type: 'image/png' })

    expect(input).not.toBeNull()

    fireEvent.change(input!, { target: { files: [file] } })

    expect(onImageSelected).toHaveBeenCalledWith(file)
  })
})