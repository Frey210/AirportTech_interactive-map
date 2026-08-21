export type RatioPoint = { xRatio: number; yRatio: number }

export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value))

export const toRatio = (x: number, y: number, width: number, height: number): RatioPoint => {
  if (width <= 0 || height <= 0) throw new RangeError('Ukuran peta harus lebih dari nol')
  return { xRatio: clamp(x / width), yRatio: clamp(y / height) }
}

export const toPixels = ({ xRatio, yRatio }: RatioPoint, width: number, height: number) => ({
  x: clamp(xRatio) * width,
  y: clamp(yRatio) * height,
})

