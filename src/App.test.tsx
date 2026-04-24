import { render, screen } from '@testing-library/react'

import App from './App'

describe('App', () => {
  it('renders the split workspace shell', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /diagram your hardware project/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /main board/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /project details/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /saved boards/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /choose image/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /choose folder/i })).toBeTruthy()
  })
})