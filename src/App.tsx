import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva'
import { ForbiddenError, loadBootstrap, SessionExpiredError, type MapResolver, type Session } from './api'
import { toPixels, toRatio, type RatioPoint } from './coordinates'

const MAP = { width: 1200, height: 720 }
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

type Marker = RatioPoint & { size: number; rotation: number }
type View = { x: number; y: number; scale: number }
type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session; resolver: MapResolver | null }
  | { status: 'unauthenticated' }
  | { status: 'forbidden' }
  | { status: 'error' }

const initialMarker: Marker = { xRatio: 0.44, yRatio: 0.48, size: 58, rotation: 0 }

function createBlueprint() {
  const canvas = document.createElement('canvas')
  canvas.width = MAP.width
  canvas.height = MAP.height
  const context = canvas.getContext('2d')!
  context.fillStyle = '#eaf0f3'
  context.fillRect(0, 0, MAP.width, MAP.height)
  context.strokeStyle = '#b8c7ce'
  context.lineWidth = 1
  for (let x = 0; x <= MAP.width; x += 40) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, MAP.height); context.stroke()
  }
  for (let y = 0; y <= MAP.height; y += 40) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(MAP.width, y); context.stroke()
  }
  context.strokeStyle = '#526b76'
  context.lineWidth = 8
  context.strokeRect(42, 42, 1116, 636)
  context.lineWidth = 5
  ;[[80, 90, 430, 230], [510, 90, 610, 230], [80, 370, 330, 260], [450, 370, 300, 260], [790, 370, 330, 260]].forEach(([x, y, w, h]) => context.strokeRect(x, y, w, h))
  context.fillStyle = '#526b76'
  context.font = '600 24px system-ui'
  context.fillText('RUANG SERVER', 110, 135)
  context.fillText('RUANG OPERASI', 540, 135)
  context.fillText('WORKSHOP', 110, 415)
  context.fillText('GUDANG', 480, 415)
  context.fillText('AREA TEKNISI', 820, 415)
  return canvas
}

function fitView(width: number, height: number): View {
  const scale = Math.min(width / MAP.width, height / MAP.height) * 0.94
  return { x: (width - MAP.width * scale) / 2, y: (height - MAP.height * scale) / 2, scale }
}

function StatusScreen({ state, retry }: { state: Exclude<BootstrapState, { status: 'ready' }>; retry: () => void }) {
  const loading = state.status === 'loading'
  const expired = state.status === 'unauthenticated'
  const forbidden = state.status === 'forbidden'

  return (
    <main className="status-screen" aria-busy={loading}>
      <section className="status-card" role={loading ? 'status' : 'alert'}>
        <span className="eyebrow">AIRPORT TECHNOLOGY UPG</span>
        <h1>{loading ? 'Menyiapkan peta interaktif' : expired ? 'Sesi Anda telah berakhir' : forbidden ? 'Akses peta tidak tersedia' : 'Peta belum dapat dimuat'}</h1>
        <p>{loading ? 'Memeriksa sesi aplikasi utama.' : expired ? 'Masuk kembali melalui aplikasi Airport Technology.' : forbidden ? 'Akun ini belum memiliki izin untuk membuka peta.' : 'Periksa koneksi ke server, lalu coba lagi.'}</p>
        {!loading && (expired
          ? <a className="primary-link" href="/login">Masuk kembali</a>
          : forbidden
            ? <a className="primary-link" href="/dashboard">Kembali ke dashboard</a>
          : <button className="secondary" onClick={retry}>Coba lagi</button>)}
      </section>
    </main>
  )
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<Konva.Group>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [viewport, setViewport] = useState({ width: 900, height: 600 })
  const [view, setView] = useState<View>(() => fitView(900, 600))
  const [marker, setMarker] = useState(initialMarker)
  const [selected, setSelected] = useState(true)
  const [showLoad, setShowLoad] = useState(false)
  const [benchmark, setBenchmark] = useState<number | null>(null)
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const blueprint = useMemo(createBlueprint, [])

  useEffect(() => {
    const controller = new AbortController()
    setBootstrap({ status: 'loading' })
    loadBootstrap(window.location.search, fetch, controller.signal)
      .then(({ session, resolver }) => setBootstrap({ status: 'ready', session, resolver }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setBootstrap({ status: error instanceof SessionExpiredError ? 'unauthenticated' : error instanceof ForbiddenError ? 'forbidden' : 'error' })
      })
    return () => controller.abort()
  }, [retryKey])

  const resetView = useCallback(() => setView(fitView(viewport.width, viewport.height)), [viewport])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width))
      const height = Math.max(420, Math.floor(entry.contentRect.height))
      setViewport({ width, height })
      setView(fitView(width, height))
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (selected && markerRef.current && transformerRef.current) {
      transformerRef.current.nodes([markerRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [selected])

  const loadMarkers = useMemo(() => Array.from({ length: 500 }, (_, index) => ({
    x: ((index * 73) % 1160) + 20,
    y: ((index * 47) % 680) + 20,
  })), [])

  const toggleLoad = () => {
    const start = performance.now()
    setShowLoad((current) => !current)
    requestAnimationFrame(() => requestAnimationFrame(() => setBenchmark(performance.now() - start)))
  }

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault()
    const stage = event.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!stage || !pointer) return
    const oldScale = view.scale
    const direction = event.evt.deltaY > 0 ? -1 : 1
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldScale * (direction > 0 ? 1.08 : 1 / 1.08)))
    const mapPoint = { x: (pointer.x - view.x) / oldScale, y: (pointer.y - view.y) / oldScale }
    setView({ x: pointer.x - mapPoint.x * scale, y: pointer.y - mapPoint.y * scale, scale })
  }

  const position = toPixels(marker, MAP.width, MAP.height)

  if (bootstrap.status !== 'ready') {
    return <StatusScreen state={bootstrap} retry={() => setRetryKey((key) => key + 1)} />
  }

  const { session, resolver } = bootstrap

  return (
    <main>
      <header className="topbar">
        <div>
          <span className="eyebrow">AIRPORT TECHNOLOGY UPG</span>
          <h1>Peta Interaktif</h1>
        </div>
        <span className="status"><i /> {session.nama_lengkap} · {session.role}</span>
      </header>

      <section className="workspace" aria-label="Proof of concept editor peta">
        <aside className="sidebar">
          <div>
            <p className="section-label">Denah aktif</p>
            <h2>Gedung Operasional</h2>
            <p className="muted">Lantai 1 · Contoh sintetis tanpa data production</p>
          </div>

          {resolver && (
            <div className="resolver-state" role="status">
              <p className="section-label">Deep-link peralatan</p>
              <strong>{resolver.peralatan.nama_peralatan}</strong>
              <small>{resolver.pilihan.length === 0
                ? 'Belum ditempatkan pada peta.'
                : resolver.pilihan.length === 1
                  ? `Ditemukan di ${resolver.pilihan[0].nama_peta}.`
                  : `${resolver.pilihan.length} peta tersedia; pemilih peta menyusul di tahap viewer.`}</small>
            </div>
          )}

          <div className="equipment-card">
            <span className="equipment-icon">AT</span>
            <div><strong>UPS Ruang Server</strong><small>UPS-001 · Normal</small></div>
          </div>

          <dl className="coordinates">
            <div><dt>X ratio</dt><dd>{marker.xRatio.toFixed(4)}</dd></div>
            <div><dt>Y ratio</dt><dd>{marker.yRatio.toFixed(4)}</dd></div>
            <div><dt>Ukuran</dt><dd>{Math.round(marker.size)} px</dd></div>
            <div><dt>Rotasi</dt><dd>{Math.round(marker.rotation)}°</dd></div>
          </dl>

          <div className="instructions">
            <p className="section-label">Cara mencoba</p>
            <ul>
              <li>Geser ikon untuk mengubah posisi.</li>
              <li>Gunakan handle untuk resize dan rotasi.</li>
              <li>Scroll untuk zoom; geser area kosong untuk pan.</li>
            </ul>
          </div>

          <button className="secondary" onClick={toggleLoad}>{showLoad ? 'Sembunyikan' : 'Uji'} 500 penanda</button>
          {benchmark !== null && <output>Render terukur: {benchmark.toFixed(1)} ms</output>}
        </aside>

        <div className="canvas-panel">
          <div className="canvas-toolbar">
            <button onClick={() => setView((v) => ({ ...v, scale: Math.min(MAX_ZOOM, v.scale * 1.15) }))} aria-label="Perbesar peta">+</button>
            <span>{Math.round(view.scale * 100)}%</span>
            <button onClick={() => setView((v) => ({ ...v, scale: Math.max(MIN_ZOOM, v.scale / 1.15) }))} aria-label="Perkecil peta">−</button>
            <button className="fit" onClick={resetView}>Pas ke layar</button>
          </div>
          <div className="canvas" ref={containerRef}>
            <Stage
              width={viewport.width}
              height={viewport.height}
              x={view.x}
              y={view.y}
              scaleX={view.scale}
              scaleY={view.scale}
              draggable
              onDragEnd={(event) => setView((current) => ({ ...current, x: event.target.x(), y: event.target.y() }))}
              onWheel={handleWheel}
              onPointerDown={(event) => event.target === event.target.getStage() && setSelected(false)}
            >
              <Layer>
                <KonvaImage image={blueprint} width={MAP.width} height={MAP.height} shadowBlur={18} shadowOpacity={0.18} />
                {showLoad && loadMarkers.map((item, index) => <Circle key={index} {...item} radius={5} fill="#d97a34" opacity={0.62} listening={false} />)}
                <Group
                  ref={markerRef}
                  x={position.x}
                  y={position.y}
                  rotation={marker.rotation}
                  draggable
                  onPointerDown={(event) => { event.cancelBubble = true; setSelected(true) }}
                  onDragEnd={(event) => setMarker((current) => ({ ...current, ...toRatio(event.target.x(), event.target.y(), MAP.width, MAP.height) }))}
                  onTransformEnd={() => {
                    const node = markerRef.current
                    if (!node) return
                    const size = Math.max(28, marker.size * Math.max(node.scaleX(), node.scaleY()))
                    node.scaleX(1); node.scaleY(1)
                    setMarker((current) => ({ ...current, size, rotation: node.rotation(), ...toRatio(node.x(), node.y(), MAP.width, MAP.height) }))
                  }}
                >
                  <Circle radius={marker.size / 2} fill="#ee7f31" stroke="#fff" strokeWidth={6} shadowBlur={12} shadowOpacity={0.25} />
                  <Rect x={-marker.size * 0.21} y={-marker.size * 0.17} width={marker.size * 0.42} height={marker.size * 0.34} cornerRadius={4} fill="#173b51" />
                  <Text text="UPS" width={marker.size} x={-marker.size / 2} y={-5} align="center" fill="#fff" fontSize={marker.size * 0.18} fontStyle="bold" />
                </Group>
                {selected && <Transformer ref={transformerRef} rotateEnabled keepRatio enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']} boundBoxFunc={(oldBox, newBox) => newBox.width < 28 ? oldBox : newBox} />}
              </Layer>
            </Stage>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
