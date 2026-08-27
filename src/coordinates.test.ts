import { describe, expect, it } from 'vitest'
import { constrainView, toPixels, toRatio } from './coordinates'

describe('koordinat peta', () => {
  it('tetap sama setelah konversi piksel ke rasio dan kembali ke piksel', () => {
    const ratio = toRatio(375, 240, 1200, 720)
    expect(toPixels(ratio, 1200, 720)).toEqual({ x: 375, y: 240 })
  })

  it('membatasi posisi di dalam peta', () => {
    expect(toRatio(-10, 900, 1200, 720)).toEqual({ xRatio: 0, yRatio: 1 })
  })

  it('menolak dimensi peta yang tidak valid', () => {
    expect(() => toRatio(1, 1, 0, 720)).toThrow(RangeError)
  })

  it('menjaga sebagian peta tetap terlihat saat digeser', () => {
    expect(constrainView({ x: -2000, y: 2000, scale: 1 }, { width: 1200, height: 700 }, { width: 900, height: 600 }))
      .toEqual({ x: -380, y: 80, scale: 1 })
  })
})
