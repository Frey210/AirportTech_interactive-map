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

export type MapView = { x: number; y: number; scale: number }

export function constrainView(view: MapView, map: { width: number; height: number }, viewport: { width: number; height: number }, margin = 80): MapView {
  const bound = (position: number, content: number, available: number) => content <= available - margin * 2
    ? (available - content) / 2
    : Math.min(margin, Math.max(available - margin - content, position))

  return {
    ...view,
    x: bound(view.x, map.width * view.scale, viewport.width),
    y: bound(view.y, map.height * view.scale, viewport.height),
  }
}
