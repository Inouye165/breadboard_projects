import { fireEvent, render, screen, within } from '@testing-library/react'
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
    const { container } = render(
      <BreadboardCanvas imageSrc="/example-board.png" imageName="main-board" onImageSelected={vi.fn()} />,
    )
    const view = within(container)

    expect(view.getByLabelText(/part editor/i)).toBeInTheDocument()
    expect(view.getByRole('button', { name: /replace image/i })).toBeInTheDocument()
    expect(view.getByRole('button', { name: /(show|hide) points/i })).toBeInTheDocument()
    expect(view.getByRole('button', { name: /save part definition/i })).toBeInTheDocument()
    expect(view.getByLabelText(/part kind/i)).toHaveValue('breadboard')
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

  it('supports switching to manual placement for non-breadboard parts', () => {
    render(
      <BreadboardCanvas imageSrc="/example-board.png" imageName="module-board" onImageSelected={vi.fn()} />,
    )

    fireEvent.change(screen.getByLabelText(/part kind/i), {
      target: { value: 'module' },
    })

    expect(screen.getByRole('button', { name: /add point/i })).toBeInTheDocument()
    expect(screen.getByText(/ready for manual point placement/i)).toBeInTheDocument()
  })
})