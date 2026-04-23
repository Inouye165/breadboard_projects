import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('renders the split workspace shell', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /diagram your hardware project/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /main board/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /project details/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /components/i })).toBeInTheDocument()
  })
})