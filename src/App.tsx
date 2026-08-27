import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Circle, Group, Image as KonvaImage, Layer, Stage, Text } from 'react-konva'
import {
  filterMarkers, ForbiddenError, loadBootstrap, loadMapDetail, loadMaps, SessionExpiredError,
  type MapDetail, type MapMarker, type MapResolver, type MapSummary, type Session,
} from './api'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
type View = { x: number; y: number; scale: number }
type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session; resolver: MapResolver | null }
  | { status: 'unauthenticated' | 'forbidden' | 'error' }

function fitView(viewport: { width: number; height: number }, map?: MapSummary): View {
  if (!map?.width_px || !map.height_px) return { x: 0, y: 0, scale: 1 }
  const scale = Math.min(viewport.width / map.width_px, viewport.height / map.height_px) * 0.94
  return { x: (viewport.width - map.width_px * scale) / 2, y: (viewport.height - map.height_px * scale) / 2, scale }
}

function useRemoteImage(url: string | null) {
  const [state, setState] = useState<{ image: HTMLImageElement | null; error: boolean }>({ image: null, error: false })
  useEffect(() => {
    if (!url) { setState({ image: null, error: true }); return }
    setState({ image: null, error: false })
    const image = new Image()
    image.onload = () => setState({ image, error: false })
    image.onerror = () => setState({ image: null, error: true })
    image.src = url
    return () => { image.onload = null; image.onerror = null }
  }, [url])
  return state
}

function MarkerNode({ marker, map, selected, onSelect }: { marker: MapMarker; map: MapSummary; selected: boolean; onSelect: () => void }) {
  const icon = useRemoteImage(marker.ikon.file_url)
  const size = Math.max(28, marker.size_ratio * Math.min(map.width_px ?? 0, map.height_px ?? 0))
  return <Group x={marker.x_ratio * (map.width_px ?? 0)} y={marker.y_ratio * (map.height_px ?? 0)} rotation={marker.rotation_deg} onClick={onSelect} onTap={onSelect}>
    <Circle radius={size * .62} fill={selected ? '#f6a45f' : '#173b51'} stroke="#fff" strokeWidth={selected ? 6 : 3} shadowBlur={selected ? 16 : 7} shadowOpacity={.28} />
    {icon.image
      ? <KonvaImage image={icon.image} x={-size / 2} y={-size / 2} width={size} height={size} />
      : <Text text={marker.peralatan.nama_peralatan.slice(0, 2).toUpperCase()} x={-size / 2} y={-size * .13} width={size} align="center" fill="#fff" fontSize={size * .27} fontStyle="bold" />}
  </Group>
}

function StatusScreen({ state, retry }: { state: Exclude<BootstrapState, { status: 'ready' }>; retry: () => void }) {
  const loading = state.status === 'loading'
  const expired = state.status === 'unauthenticated'
  const forbidden = state.status === 'forbidden'
  return <main className="status-screen" aria-busy={loading}><section className="status-card" role={loading ? 'status' : 'alert'}>
    <span className="eyebrow">AIRPORT TECHNOLOGY UPG</span>
    <h1>{loading ? 'Menyiapkan peta interaktif' : expired ? 'Sesi Anda telah berakhir' : forbidden ? 'Akses peta tidak tersedia' : 'Peta belum dapat dimuat'}</h1>
    <p>{loading ? 'Memeriksa sesi aplikasi utama.' : expired ? 'Masuk kembali melalui aplikasi Airport Technology.' : forbidden ? 'Akun ini belum memiliki izin untuk membuka peta.' : 'Periksa koneksi ke server, lalu coba lagi.'}</p>
    {!loading && (expired ? <a className="primary-link" href="/login">Masuk kembali</a> : forbidden ? <a className="primary-link" href="/dashboard">Kembali ke dashboard</a> : <button className="secondary" onClick={retry}>Coba lagi</button>)}
  </section></main>
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [maps, setMaps] = useState<MapSummary[]>([])
  const [mapsStatus, setMapsStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [activeMapId, setActiveMapId] = useState<number | null>(() => Number(params.get('peta_id')) || null)
  const [detail, setDetail] = useState<MapDetail | null>(null)
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)
  const [query, setQuery] = useState(params.get('cari') ?? '')
  const [category, setCategory] = useState(params.get('kategori') ?? '')
  const [facility, setFacility] = useState(params.get('fasilitas') ?? '')
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [userStatus, setUserStatus] = useState(params.get('user_status') ?? '')
  const [viewport, setViewport] = useState({ width: 900, height: 600 })
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const mapImage = useRemoteImage(detail?.peta.file_url ?? null)

  useEffect(() => {
    const controller = new AbortController()
    setBootstrap({ status: 'loading' })
    loadBootstrap(window.location.search, fetch, controller.signal)
      .then(({ session, resolver }) => setBootstrap({ status: 'ready', session, resolver }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setBootstrap({ status: error instanceof SessionExpiredError ? 'unauthenticated' : error instanceof ForbiddenError ? 'forbidden' : 'error' })
      })
    return () => controller.abort()
  }, [retryKey])

  useEffect(() => {
    if (bootstrap.status !== 'ready') return
    const controller = new AbortController()
    setMapsStatus('loading')
    loadMaps(fetch, controller.signal).then((items) => {
      setMaps(items); setMapsStatus('ready')
      setActiveMapId((current) => current ?? bootstrap.resolver?.default_peta_id ?? (bootstrap.resolver && bootstrap.resolver.pilihan.length > 1 ? null : items[0]?.id ?? null))
    }).catch(() => !controller.signal.aborted && setMapsStatus('error'))
    return () => controller.abort()
  }, [bootstrap])

  useEffect(() => {
    if (activeMapId === null) { setDetail(null); setDetailStatus('idle'); return }
    const controller = new AbortController()
    setDetailStatus('loading')
    loadMapDetail(activeMapId, fetch, controller.signal).then((value) => {
      setDetail(value); setDetailStatus('ready')
      const equipmentId = bootstrap.status === 'ready' ? bootstrap.resolver?.peralatan.id : null
      setSelectedMarkerId(value.penanda.find((marker) => marker.peralatan.id === equipmentId)?.id ?? null)
    }).catch(() => !controller.signal.aborted && setDetailStatus('error'))
    return () => controller.abort()
  }, [activeMapId, bootstrap])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setViewport({ width: Math.max(320, Math.floor(entry.contentRect.width)), height: Math.max(420, Math.floor(entry.contentRect.height)) }))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  useEffect(() => setView(fitView(viewport, detail?.peta)), [viewport, detail?.peta])
  useEffect(() => {
    const next = new URLSearchParams(window.location.search)
    activeMapId ? next.set('peta_id', String(activeMapId)) : next.delete('peta_id')
    query ? next.set('cari', query) : next.delete('cari')
    category ? next.set('kategori', category) : next.delete('kategori')
    facility ? next.set('fasilitas', facility) : next.delete('fasilitas')
    status ? next.set('status', status) : next.delete('status')
    userStatus ? next.set('user_status', userStatus) : next.delete('user_status')
    window.history.replaceState(null, '', `${window.location.pathname}${next.size ? `?${next}` : ''}`)
  }, [activeMapId, query, category, facility, status, userStatus])

  const filteredMarkers = useMemo(() => {
    return filterMarkers(detail?.penanda ?? [], { query, category, facility, status, userStatus })
  }, [detail, query, category, facility, status, userStatus])
  const categories = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.kategori).filter(Boolean))] as string[], [detail])
  const facilities = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.fasilitas).filter(Boolean))] as string[], [detail])
  const statuses = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.status).filter(Boolean))] as string[], [detail])
  const userStatuses = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.user_status).filter(Boolean))], [detail])
  const selectedMarker = detail?.penanda.find((marker) => marker.id === selectedMarkerId) ?? null

  const focusMarker = useCallback((marker: MapMarker) => {
    if (!detail?.peta.width_px || !detail.peta.height_px) return
    const scale = Math.min(MAX_ZOOM, Math.max(1, fitView(viewport, detail.peta).scale))
    setSelectedMarkerId(marker.id)
    setView({ x: viewport.width / 2 - marker.x_ratio * detail.peta.width_px * scale, y: viewport.height / 2 - marker.y_ratio * detail.peta.height_px * scale, scale })
  }, [detail, viewport])

  useEffect(() => {
    if (selectedMarker) focusMarker(selectedMarker)
  }, [detail?.peta.id]) // Fokus deep-link sekali saat peta berubah.

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault()
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * (event.evt.deltaY > 0 ? 1 / 1.08 : 1.08)))
    const mapPoint = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale }
    setView({ x: pointer.x - mapPoint.x * scale, y: pointer.y - mapPoint.y * scale, scale })
  }

  if (bootstrap.status !== 'ready') return <StatusScreen state={bootstrap} retry={() => setRetryKey((key) => key + 1)} />
  const { session, resolver } = bootstrap
  return <main>
    <header className="topbar"><div><span className="eyebrow">AIRPORT TECHNOLOGY UPG</span><h1>Peta Interaktif</h1></div><span className="status"><i /> {session.nama_lengkap} · {session.role}</span></header>
    <section className="workspace" aria-label="Viewer peta peralatan">
      <aside className="sidebar">
        <div>
          <label className="section-label" htmlFor="map-select">Gedung dan lantai</label>
          <select id="map-select" value={activeMapId ?? ''} onChange={(event) => setActiveMapId(Number(event.target.value) || null)} disabled={mapsStatus !== 'ready' || maps.length === 0}>
            <option value="">Pilih peta</option>
            {[...new Set(maps.map((map) => map.gedung.id))].map((buildingId) => { const buildingMaps = maps.filter((map) => map.gedung.id === buildingId); return <optgroup key={buildingId} label={buildingMaps[0].gedung.nama}>{buildingMaps.map((map) => <option key={map.id} value={map.id}>{map.nama_lantai} — {map.nama_peta}</option>)}</optgroup> })}
          </select>
          {mapsStatus === 'loading' && <p className="muted" role="status">Memuat daftar peta…</p>}
          {mapsStatus === 'error' && <p className="error" role="alert">Daftar peta gagal dimuat. Muat ulang halaman untuk mencoba lagi.</p>}
          {mapsStatus === 'ready' && maps.length === 0 && <p className="empty">Belum ada peta yang diterbitkan.</p>}
        </div>

        {resolver && <div className="resolver-state" role="status"><p className="section-label">Hasil dari detail peralatan</p><strong>{resolver.peralatan.nama_peralatan}</strong>
          {resolver.pilihan.length === 0 ? <small>Peralatan ini belum ditempatkan pada peta.</small> : resolver.pilihan.length === 1 ? <small>Ditemukan di {resolver.pilihan[0].nama_peta}.</small> : <><small>Pilih salah satu lokasi peralatan:</small><div className="resolver-options">{resolver.pilihan.map((map) => <button key={map.id} onClick={() => setActiveMapId(map.id)} aria-pressed={activeMapId === map.id}>{map.gedung.nama} · {map.nama_lantai}</button>)}</div></>}
        </div>}

        {detail && <div className="filters">
          <label htmlFor="equipment-search">Cari peralatan</label><input id="equipment-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nama atau scan code" />
          <label htmlFor="category-filter">Kategori</label><select id="category-filter" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Semua kategori</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
          <label htmlFor="facility-filter">Fasilitas</label><select id="facility-filter" value={facility} onChange={(event) => setFacility(event.target.value)}><option value="">Semua fasilitas</option>{facilities.map((item) => <option key={item}>{item}</option>)}</select>
          <label htmlFor="status-filter">Status</label><select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua status</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
          <label htmlFor="user-status-filter">User status</label><select id="user-status-filter" value={userStatus} onChange={(event) => setUserStatus(event.target.value)}><option value="">Semua user status</option>{userStatuses.map((item) => <option key={item}>{item}</option>)}</select>
          <div className="result-summary" role="status"><span>{filteredMarkers.length} peralatan</span><button onClick={() => { setQuery(''); setCategory(''); setFacility(''); setStatus(''); setUserStatus('') }}>Reset filter</button></div>
        </div>}

        <div className="marker-list" aria-label="Daftar peralatan pada peta">
          {filteredMarkers.map((marker) => <button key={marker.id} className={selectedMarkerId === marker.id ? 'active' : ''} onClick={() => focusMarker(marker)} aria-pressed={selectedMarkerId === marker.id}><strong>{marker.peralatan.nama_peralatan}</strong><small>{marker.peralatan.scan_code || 'Tanpa scan code'} · {marker.peralatan.status}</small></button>)}
          {detail && filteredMarkers.length === 0 && <p className="empty">Tidak ada peralatan yang cocok. Ubah pencarian atau reset filter.</p>}
        </div>

        {selectedMarker && <article className="equipment-detail"><p className="section-label">Detail terpilih</p><h2>{selectedMarker.peralatan.nama_peralatan}</h2><p>{selectedMarker.peralatan.kategori || 'Tanpa kategori'} · {selectedMarker.peralatan.fasilitas || 'Tanpa fasilitas'}</p><dl><div><dt>Status</dt><dd>{selectedMarker.peralatan.status}</dd></div><div><dt>User status</dt><dd>{selectedMarker.peralatan.user_status}</dd></div></dl><a className="primary-link" href={selectedMarker.peralatan.detail_url}>Buka detail peralatan</a></article>}
      </aside>

      <div className="canvas-panel"><div className="canvas-toolbar">
        {detail && <span className="map-title">{detail.peta.gedung.nama} · {detail.peta.nama_lantai}</span>}
        <button onClick={() => setView((value) => ({ ...value, scale: Math.min(MAX_ZOOM, value.scale * 1.15) }))} aria-label="Perbesar peta">+</button><span>{Math.round(view.scale * 100)}%</span><button onClick={() => setView((value) => ({ ...value, scale: Math.max(MIN_ZOOM, value.scale / 1.15) }))} aria-label="Perkecil peta">−</button><button className="fit" onClick={() => setView(fitView(viewport, detail?.peta))}>Pas ke layar</button>
      </div><div className="canvas" ref={containerRef} role="img" aria-label={detail ? `Denah ${detail.peta.nama_peta} dengan ${filteredMarkers.length} penanda peralatan` : 'Area denah peta'}>
        {detailStatus === 'idle' && <div className="canvas-message">Pilih gedung dan lantai untuk membuka denah.</div>}
        {detailStatus === 'loading' && <div className="canvas-message" role="status">Memuat denah dan penanda…</div>}
        {detailStatus === 'error' && <div className="canvas-message error" role="alert">Detail peta gagal dimuat. Pilih ulang peta untuk mencoba lagi.</div>}
        {detailStatus === 'ready' && mapImage.error && <div className="canvas-message error" role="alert">Gambar denah tidak tersedia. Data penanda tetap dapat dibuka dari daftar.</div>}
        {detail && mapImage.image && <Stage width={viewport.width} height={viewport.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} draggable onDragEnd={(event) => setView((value) => ({ ...value, x: event.target.x(), y: event.target.y() }))} onWheel={handleWheel}><Layer><KonvaImage image={mapImage.image} width={detail.peta.width_px ?? mapImage.image.naturalWidth} height={detail.peta.height_px ?? mapImage.image.naturalHeight} shadowBlur={18} shadowOpacity={.18} />{filteredMarkers.map((marker) => <MarkerNode key={marker.id} marker={marker} map={detail.peta} selected={marker.id === selectedMarkerId} onSelect={() => focusMarker(marker)} />)}</Layer></Stage>}
      </div></div>
    </section>
  </main>
}

export default App
