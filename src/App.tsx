import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva'
import {
  ConflictError, deleteMap, equipmentStatusTone, filterMarkers, ForbiddenError, loadBootstrap, loadEditableMaps, loadMapDetail, loadMapEditor, loadMapIcons, loadMapNetworkStatus, loadMaps, networkStatusText, networkStatusTone, publishMap, rankMarkerMatches, resolveScanCode, saveMapMarkers, SessionExpiredError,
  type MapDetail, type MapEditorData, type MapIconLibrary, type MapMarker, type MapResolver, type MapSummary, type NetworkStatus, type Session,
} from './api'
import { constrainView } from './coordinates'
import MapEditorPanel from './MapEditorPanel'
import MapWizard from './MapWizard'
import IconWizard from './IconWizard'
import injourneyLogo from '../logo.png'
import injourneyMiniLogo from '../logo1.jpg'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
type View = { x: number; y: number; scale: number }
type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session; resolver: MapResolver | null }
  | { status: 'unauthenticated' | 'forbidden' | 'error' }

const remoteImageCache = new Map<string, Promise<HTMLImageElement>>()

function loadRemoteImage(url: string) {
  const cached = remoteImageCache.get(url)
  if (cached) return cached
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
  remoteImageCache.set(url, pending)
  pending.catch(() => remoteImageCache.delete(url))
  return pending
}

function fitView(viewport: { width: number; height: number }, map?: MapSummary): View {
  if (!map?.width_px || !map.height_px) return { x: 0, y: 0, scale: 1 }
  const mobile = viewport.width <= 900
  const inset = mobile ? { top: 70, right: 14, bottom: 72, left: 14 } : { top: 80, right: 18, bottom: 18, left: 18 }
  const width = Math.max(1, viewport.width - inset.left - inset.right)
  const height = Math.max(1, viewport.height - inset.top - inset.bottom)
  const scale = Math.min(width / map.width_px, height / map.height_px) * 0.96
  return { x: inset.left + (width - map.width_px * scale) / 2, y: inset.top + (height - map.height_px * scale) / 2, scale }
}

function formatNetworkTime(timestamp: number) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(timestamp * 1000)).replaceAll('/', '-') + ' WITA'
}

function useRemoteImage(url: string | null) {
  const [state, setState] = useState<{ image: HTMLImageElement | null; error: boolean }>({ image: null, error: false })
  useEffect(() => {
    if (!url) { setState({ image: null, error: true }); return }
    let active = true
    setState({ image: null, error: false })
    loadRemoteImage(url).then((image) => active && setState({ image, error: false })).catch(() => active && setState({ image: null, error: true }))
    return () => { active = false }
  }, [url])
  return state
}

const MarkerNode = memo(function MarkerNode({ marker, map, network, selected, draggable = false, onSelect, onMove }: { marker: MapMarker; map: MapSummary; network?: NetworkStatus; selected: boolean; draggable?: boolean; onSelect: () => void; onMove?: (xRatio: number, yRatio: number) => void }) {
  const groupRef = useRef<Konva.Group>(null)
  const icon = useRemoteImage(marker.ikon.file_url)
  const size = Math.max(28, marker.size_ratio * Math.min(map.width_px ?? 0, map.height_px ?? 0)) * (selected ? 1.25 : 1)
  const tone = equipmentStatusTone(marker.peralatan)
  const networkTone = network ? networkStatusTone(network) : null
  const networkText = network ? networkStatusText(network) : ''
  const showNetworkText = !!network && (selected || network.status_ping === 'TIDAK_MERESPONS' || network.status_ping === 'LATENCY_TINGGI')
  const networkFontSize = Math.max(10, size * .17)
  const networkLabelWidth = networkText.length * networkFontSize * .56 + 12
  const networkOnRight = marker.x_ratio < .6
  const networkDotX = (networkOnRight ? 1 : -1) * size * .48
  const networkLabelX = networkOnRight ? size * .66 : -size * .66 - networkLabelWidth
  useEffect(() => {
    if (!groupRef.current) return
    groupRef.current.cache({ pixelRatio: 1 })
    groupRef.current.getLayer()?.batchDraw()
    return () => { groupRef.current?.clearCache() }
  }, [icon.image, network?.latency_ms, network?.status_ping, selected, size, tone.color])
  return <Group ref={groupRef} x={marker.x_ratio * (map.width_px ?? 0)} y={marker.y_ratio * (map.height_px ?? 0)} rotation={marker.rotation_deg} draggable={draggable} onClick={onSelect} onTap={onSelect} onDragEnd={(event) => onMove?.(Math.min(1, Math.max(0, event.target.x() / (map.width_px ?? 1))), Math.min(1, Math.max(0, event.target.y() / (map.height_px ?? 1))))}>
    <Circle radius={size * .62} fill={tone.color} stroke={selected ? '#14757f' : '#fff'} strokeWidth={selected ? 7 : 3} shadowBlur={selected ? 16 : 7} shadowOpacity={.28} />
    {icon.image
      ? <KonvaImage image={icon.image} x={-size / 2} y={-size / 2} width={size} height={size} />
      : <Text text={marker.peralatan.nama_peralatan.slice(0, 2).toUpperCase()} x={-size / 2} y={-size * .13} width={size} align="center" fill="#fff" fontSize={size * .27} fontStyle="bold" />}
    {networkTone && <Group rotation={-marker.rotation_deg}>
      <Circle x={networkDotX} y={size * .45} radius={Math.max(5, size * .11)} fill={networkTone.color} stroke="#fff" strokeWidth={2} shadowBlur={5} shadowOpacity={.25} />
      {showNetworkText && <><Rect x={networkLabelX} y={size * .25} width={networkLabelWidth} height={networkFontSize + 10} cornerRadius={(networkFontSize + 10) / 2} fill="rgba(255,255,255,.94)" stroke="rgba(64,84,91,.18)" strokeWidth={1} shadowBlur={5} shadowOpacity={.16} /><Text text={networkText} x={networkLabelX + 6} y={size * .25 + 5} width={networkLabelWidth - 12} fill="#24363c" fontSize={networkFontSize} fontStyle="bold" /></>}
    </Group>}
  </Group>
}, (previous, next) => previous.marker === next.marker && previous.map === next.map && previous.selected === next.selected && previous.draggable === next.draggable && previous.network?.status_ping === next.network?.status_ping && previous.network?.latency_ms === next.network?.latency_ms)

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

function RailIcon({ name }: { name: 'home' | 'map' | 'scan' | 'filter' }) {
  const paths = {
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z" /><path d="M8 3v15M16 6v15" /></>,
    scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path d="M8 12h8" /></>,
    filter: <><path d="M5 7h14M7 12h10M9 17h6" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</g></svg>
}

function ScanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [manual, setManual] = useState('')
  const [message, setMessage] = useState('Arahkan kamera ke QR peralatan.')
  const [busy, setBusy] = useState(false)
  const submit = async (code: string) => {
    if (!code.trim() || busy) return
    setBusy(true); setMessage('Memproses Scan Code…')
    try { window.location.href = await resolveScanCode(code.trim()) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Scan Code gagal diproses.'); setBusy(false) }
  }
  useEffect(() => {
    if (!open) return
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    const scanner = window as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> }
      jsQR?: (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || (!scanner.BarcodeDetector && !scanner.jsQR)) { setMessage('Pemindai kamera tidak tersedia. Masukkan Scan Code secara manual.'); return }
    const detector = scanner.BarcodeDetector ? new scanner.BarcodeDetector({ formats: ['qr_code'] }) : null
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then((value) => {
      stream = value
      if (!videoRef.current) return
      videoRef.current.srcObject = value
      videoRef.current.play()
      const detect = async () => {
        if (stopped || !videoRef.current) return
        if (detector) {
          const result = await detector.detect(videoRef.current).catch(() => [])
          if (result[0]?.rawValue) return submit(result[0].rawValue)
        } else if (videoRef.current.readyState >= 2 && canvasRef.current && scanner.jsQR) {
          const canvas = canvasRef.current
          canvas.width = videoRef.current.videoWidth
          canvas.height = videoRef.current.videoHeight
          const context = canvas.getContext('2d', { willReadFrequently: true })
          context?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
          const frameData = context?.getImageData(0, 0, canvas.width, canvas.height)
          const result = frameData && scanner.jsQR(frameData.data, frameData.width, frameData.height)
          if (result?.data) return submit(result.data)
        }
        frame = requestAnimationFrame(detect)
      }
      frame = requestAnimationFrame(detect)
    }).catch(() => setMessage('Kamera tidak dapat dibuka. Masukkan Scan Code secara manual.'))
    return () => { stopped = true; cancelAnimationFrame(frame); stream?.getTracks().forEach((track) => track.stop()) }
  }, [open])
  if (!open) return null
  return <div className="scan-backdrop" role="presentation"><section className="scan-dialog" role="dialog" aria-modal="true" aria-labelledby="scan-title"><button className="close-detail" onClick={onClose} aria-label="Tutup pemindai">×</button><span className="section-label">IDENTIFIKASI PERALATAN</span><h2 id="scan-title">Scan QR peralatan</h2><video ref={videoRef} playsInline muted /><canvas ref={canvasRef} hidden /><p>{message}</p><form onSubmit={(event) => { event.preventDefault(); submit(manual) }}><label htmlFor="manual-scan">Scan Code manual</label><input id="manual-scan" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Contoh: UPG-EQP-000235" autoComplete="off" /><button className="primary" disabled={busy || !manual.trim()}>{busy ? 'Memproses…' : 'Buka peralatan'}</button></form></section></div>
}

function DeleteMapDialog({ map, markerCount, busy, error, onClose, onDelete }: { map: MapSummary | null; markerCount: number | null; busy: boolean; error: string; onClose: () => void; onDelete: () => void }) {
  const [confirmation, setConfirmation] = useState('')
  useEffect(() => setConfirmation(''), [map?.id])
  if (!map) return null
  const confirmed = confirmation === map.nama_peta
  return <div className="scan-backdrop" role="presentation"><section className="delete-map-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-map-title">
    <button className="close-detail" onClick={onClose} disabled={busy} aria-label="Tutup dialog hapus peta">×</button>
    <span className="section-label">TINDAKAN PERMANEN</span>
    <h2 id="delete-map-title">Hapus peta?</h2>
    <p><strong>{map.nama_peta}</strong> · {map.gedung.nama} · {map.nama_lantai}</p>
    <p>Peta dan {markerCount ?? 'seluruh'} penempatan peralatannya akan dihapus. Data peralatan, maintenance, ikon bersama, dan peta lain tetap tersimpan.</p>
    <label htmlFor="delete-map-confirmation">Ketik <strong>{map.nama_peta}</strong> untuk mengonfirmasi</label>
    <input id="delete-map-confirmation" autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" />
    {error && <p className="error" role="alert">{error}</p>}
    <footer><button type="button" className="secondary" onClick={onClose} disabled={busy}>Batal</button><button type="button" className="danger-solid" onClick={onDelete} disabled={!confirmed || busy}>{busy ? 'Menghapus…' : 'Hapus peta'}</button></footer>
  </section></div>
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const fittedMapRef = useRef('')
  const searchRef = useRef<HTMLInputElement>(null)
  const pinchRef = useRef<{ distance: number; center: { x: number; y: number }; view: View } | null>(null)
  const focusedDeepLinkRef = useRef('')
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [showWizard, setShowWizard] = useState(() => params.get('wizard') === 'baru')
  const [showIconWizard, setShowIconWizard] = useState(false)
  const [iconLibrary, setIconLibrary] = useState<MapIconLibrary | null>(null)
  const [iconLibraryLoading, setIconLibraryLoading] = useState(false)
  const [iconLibraryError, setIconLibraryError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [activePanel, setActivePanel] = useState<'maps' | 'filters' | null>(null)
  const [editorData, setEditorData] = useState<MapEditorData | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftMarkers, setDraftMarkers] = useState<MapMarker[]>([])
  const [deletedMarkers, setDeletedMarkers] = useState<Array<{ id: number; lock_version: number }>>([])
  const [editorDirty, setEditorDirty] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorError, setEditorError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<MapSummary | null>(null)
  const [deletingMap, setDeletingMap] = useState(false)
  const [deleteMapError, setDeleteMapError] = useState('')
  const [editorReload, setEditorReload] = useState(0)
  const [maps, setMaps] = useState<MapSummary[]>([])
  const [mapsStatus, setMapsStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mapsRetry, setMapsRetry] = useState(0)
  const [activeMapId, setActiveMapId] = useState<number | null>(() => Number(params.get('peta_id')) || null)
  const [detail, setDetail] = useState<MapDetail | null>(null)
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [detailRetry, setDetailRetry] = useState(0)
  const [networkByEquipment, setNetworkByEquipment] = useState<Record<number, NetworkStatus>>({})
  const [networkState, setNetworkState] = useState<'idle' | 'ready' | 'stale'>('idle')
  const [networkUpdatedAt, setNetworkUpdatedAt] = useState<number | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)
  const [query, setQuery] = useState(params.get('cari') ?? '')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIndex, setSearchIndex] = useState(0)
  const [category, setCategory] = useState(params.get('kategori') ?? '')
  const [facility, setFacility] = useState(params.get('fasilitas') ?? '')
  const [jbrd, setJbrd] = useState(params.get('jbrd') ?? '')
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [userStatus, setUserStatus] = useState(params.get('user_status') ?? '')
  const [networkStatus, setNetworkStatus] = useState(params.get('jaringan') ?? '')
  const [viewport, setViewport] = useState({ width: 1, height: 1 })
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
    const load = bootstrap.session.capabilities.edit_peta ? loadEditableMaps : loadMaps
    load(fetch, controller.signal).then((items) => {
      setMaps(items); setMapsStatus('ready')
      setActiveMapId((current) => current ?? bootstrap.resolver?.default_peta_id ?? (bootstrap.resolver && bootstrap.resolver.pilihan.length > 1 ? null : items.find((item) => item.status !== 'draft')?.id ?? items[0]?.id ?? null))
    }).catch(() => !controller.signal.aborted && setMapsStatus('error'))
    return () => controller.abort()
  }, [bootstrap, mapsRetry])

  useEffect(() => {
    if (bootstrap.status !== 'ready') return
    if (activeMapId === null) { setDetail(null); setEditorData(null); setDetailStatus('idle'); return }
    if (maps.find((item) => item.id === activeMapId)?.status === 'draft') { setDetail(null); setEditorData(null); setDetailStatus('idle'); return }
    const controller = new AbortController()
    setDetail(null); setEditorData(null)
    setDetailStatus('loading')
    const load = bootstrap.session.capabilities.edit_peta ? loadMapEditor : loadMapDetail
    load(activeMapId, fetch, controller.signal).then((value) => {
      setDetail(value); setEditorData('ikon' in value && 'peralatan' in value ? value as MapEditorData : null); setDetailStatus('ready')
      setEditing(false); setEditorDirty(false); setDeletedMarkers([]); setEditorError('')
      const equipmentId = bootstrap.status === 'ready' ? bootstrap.resolver?.peralatan.id : null
      setSelectedMarkerId(value.penanda.find((marker) => marker.peralatan.id === equipmentId)?.id ?? null)
    }).catch(() => !controller.signal.aborted && setDetailStatus('error'))
    return () => controller.abort()
  }, [activeMapId, bootstrap, detailRetry, editorReload, maps])

  useEffect(() => {
    if (activeMapId === null || !detail || editing) {
      setNetworkByEquipment({}); setNetworkState('idle'); setNetworkUpdatedAt(null)
      return
    }
    let stopped = false
    let running = false
    let timer = 0
    let intervalMs = 60_000
    let controller: AbortController | null = null
    const schedule = () => {
      window.clearTimeout(timer)
      if (!stopped && !document.hidden) timer = window.setTimeout(() => void refresh().finally(schedule), intervalMs)
    }
    const refresh = async () => {
      if (stopped || document.hidden || running) return
      running = true
      controller = new AbortController()
      try {
        const snapshot = await loadMapNetworkStatus(activeMapId, fetch, controller.signal)
        if (stopped) return
        setNetworkByEquipment(Object.fromEntries(snapshot.status.map((item) => [item.peralatan_id, item])))
        setNetworkUpdatedAt(snapshot.diperbarui_pada)
        setNetworkState('ready')
        intervalMs = Math.max(30, snapshot.interval_detik) * 1000
      } catch (reason) {
        if (!stopped && !(reason instanceof DOMException && reason.name === 'AbortError')) setNetworkState('stale')
      } finally {
        running = false
      }
    }
    const visibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer); controller?.abort()
      } else {
        void refresh().finally(schedule)
      }
    }
    void refresh().finally(schedule)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      stopped = true; window.clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility)
    }
  }, [activeMapId, detail?.peta.id, editing])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setViewport({ width: Math.max(1, Math.floor(entry.contentRect.width)), height: Math.max(1, Math.floor(entry.contentRect.height)) }))
    observer.observe(container)
    return () => observer.disconnect()
  }, [bootstrap.status])
  useEffect(() => {
    const map = detail?.peta
    if (!map || viewport.width <= 1 || viewport.height <= 1) return
    const fitKey = `${map.id}:${map.checksum_sha256 ?? ''}:${map.width_px ?? ''}:${map.height_px ?? ''}`
    if (fittedMapRef.current === fitKey) return
    fittedMapRef.current = fitKey
    setView(fitView(viewport, map))
  }, [viewport, detail?.peta])
  useEffect(() => {
    const next = new URLSearchParams(window.location.search)
    activeMapId ? next.set('peta_id', String(activeMapId)) : next.delete('peta_id')
    query ? next.set('cari', query) : next.delete('cari')
    category ? next.set('kategori', category) : next.delete('kategori')
    facility ? next.set('fasilitas', facility) : next.delete('fasilitas')
    jbrd ? next.set('jbrd', jbrd) : next.delete('jbrd')
    status ? next.set('status', status) : next.delete('status')
    userStatus ? next.set('user_status', userStatus) : next.delete('user_status')
    networkStatus ? next.set('jaringan', networkStatus) : next.delete('jaringan')
    window.history.replaceState(null, '', `${window.location.pathname}${next.size ? `?${next}` : ''}`)
  }, [activeMapId, query, category, facility, jbrd, status, userStatus, networkStatus])

  const displayedMarkers = editing ? draftMarkers : detail?.penanda ?? []
  const filteredMarkers = useMemo(() => {
    const markers = editing ? draftMarkers : filterMarkers(detail?.penanda ?? [], { query, category, facility, jbrd, status, userStatus })
    return !networkStatus || editing ? markers : markers.filter((marker) => (networkByEquipment[marker.peralatan.id]?.status_ping ?? 'NONAKTIF') === networkStatus)
  }, [detail, draftMarkers, editing, query, category, facility, jbrd, status, userStatus, networkStatus, networkByEquipment])
  const categories = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.kategori).filter(Boolean))] as string[], [detail])
  const facilities = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.fasilitas).filter(Boolean))] as string[], [detail])
  const jbrds = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.lokasi).filter((item): item is string => !!item && /jbrd/i.test(item)))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true })), [detail])
  const statuses = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.status).filter(Boolean))] as string[], [detail])
  const userStatuses = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.user_status).filter(Boolean))], [detail])
  const selectedMarker = displayedMarkers.find((marker) => marker.id === selectedMarkerId) ?? null
  const selectedNetwork = selectedMarker ? networkByEquipment[selectedMarker.peralatan.id] : undefined
  const activeMap = maps.find((map) => map.id === activeMapId) ?? null
  const searchSuggestions = useMemo(() => rankMarkerMatches(detail?.penanda ?? [], query).slice(0, 8), [detail, query])

  const bounded = useCallback((next: View) => detail?.peta.width_px && detail.peta.height_px
    ? constrainView(next, { width: detail.peta.width_px, height: detail.peta.height_px }, viewport)
    : next, [detail, viewport])

  const zoom = (factor: number) => setView((current) => {
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * factor))
    const center = { x: viewport.width / 2, y: viewport.height / 2 }
    const mapPoint = { x: (center.x - current.x) / current.scale, y: (center.y - current.y) / current.scale }
    return bounded({ x: center.x - mapPoint.x * scale, y: center.y - mapPoint.y * scale, scale })
  })

  const focusMarker = useCallback((marker: MapMarker) => {
    if (!detail?.peta.width_px || !detail.peta.height_px) return
    const mobile = viewport.width <= 900
    const scale = Math.min(MAX_ZOOM, mobile ? 1 : fitView(viewport, detail.peta).scale * 1.8)
    const center = { x: mobile ? viewport.width / 2 : (viewport.width - 316) / 2, y: mobile ? viewport.height * .34 : viewport.height / 2 }
    setSelectedMarkerId(marker.id)
    setView(bounded({ x: center.x - marker.x_ratio * detail.peta.width_px * scale, y: center.y - marker.y_ratio * detail.peta.height_px * scale, scale }))
  }, [bounded, detail, viewport])

  const chooseSearchResult = (marker: MapMarker) => {
    setQuery(marker.peralatan.nama_peralatan); setSearchOpen(false); focusMarker(marker)
  }

  useEffect(() => {
    if (bootstrap.status !== 'ready' || viewport.width <= 1 || !detail) return
    const equipmentId = bootstrap.resolver?.peralatan.id
    const marker = detail.penanda.find((item) => item.peralatan.id === equipmentId)
    const key = marker ? `${detail.peta.id}:${marker.id}` : ''
    if (!marker || focusedDeepLinkRef.current === key) return
    focusedDeepLinkRef.current = key
    focusMarker(marker)
  }, [bootstrap, detail, focusMarker, viewport])

  const startEditor = () => {
    if (!editorData) return
    setDraftMarkers(editorData.penanda.map((marker) => ({ ...marker })))
    setDeletedMarkers([]); setEditorDirty(false); setEditorError(''); setActivePanel('maps'); setEditing(true)
  }
  const updateDraftMarker = (id: number, patch: Partial<MapMarker>) => {
    setDraftMarkers((items) => items.map((marker) => marker.id === id ? { ...marker, ...patch } : marker))
    setEditorDirty(true)
  }
  const addDraftMarker = (equipmentId: number, iconId: number) => {
    if (!editorData || !detail?.peta.width_px || !detail.peta.height_px) return
    const equipment = editorData.peralatan.find((item) => item.id === equipmentId)
    const icon = editorData.ikon.find((item) => item.id === iconId)
    if (!equipment || !icon) return
    const id = Math.min(0, ...draftMarkers.map((marker) => marker.id)) - 1
    const marker: MapMarker = {
      id, x_ratio: Math.min(1, Math.max(0, (viewport.width / 2 - view.x) / view.scale / detail.peta.width_px)), y_ratio: Math.min(1, Math.max(0, (viewport.height / 2 - view.y) / view.scale / detail.peta.height_px)),
      size_ratio: icon.size_ratio_default, rotation_deg: 0, z_index: draftMarkers.length, catatan: null, lock_version: 0,
      ikon: { id: icon.id, nama: icon.nama, file_url: icon.file_url },
      peralatan: { id: equipment.id, nama_peralatan: equipment.nama_peralatan, scan_code: equipment.scan_code, ip_address: equipment.ip_address, kategori: equipment.kategori, fasilitas: equipment.fasilitas, lokasi: equipment.lokasi, user_status: equipment.user_status, status: equipment.status, is_aktif: equipment.is_aktif, foto_url: equipment.foto_url, detail_url: `/peralatan/${equipment.id}` },
    }
    setDraftMarkers((items) => [...items, marker]); setSelectedMarkerId(id); setEditorDirty(true)
  }
  const deleteDraftMarker = (id: number) => {
    const marker = draftMarkers.find((item) => item.id === id)
    if (marker?.id && marker.id > 0) setDeletedMarkers((items) => [...items, { id: marker.id, lock_version: marker.lock_version }])
    setDraftMarkers((items) => items.filter((item) => item.id !== id)); setSelectedMarkerId(null); setEditorDirty(true)
  }
  const closeEditor = () => {
    if (editorDirty && !window.confirm('Buang perubahan penanda yang belum disimpan?')) return
    setEditing(false); setEditorDirty(false); setEditorError(''); setActivePanel(null)
  }
  const saveEditor = async () => {
    if (!editorData?.peta.checksum_sha256) return setEditorError('Checksum gambar peta tidak tersedia. Muat ulang editor.')
    setEditorSaving(true); setEditorError('')
    try {
      const saved = await saveMapMarkers(editorData.peta.id, {
        revisi: editorData.peta.revisi, checksum_sha256: editorData.peta.checksum_sha256,
        penanda: draftMarkers.map((marker) => ({ id: marker.id > 0 ? marker.id : null, peralatan_id: marker.peralatan.id, ikon_peta_id: marker.ikon.id, x_ratio: marker.x_ratio, y_ratio: marker.y_ratio, size_ratio: marker.size_ratio, rotation_deg: marker.rotation_deg, catatan: marker.catatan, lock_version: marker.lock_version })),
        hapus: deletedMarkers,
      })
      setEditorData(saved); setDetail(saved); setDraftMarkers(saved.penanda); setDeletedMarkers([]); setEditorDirty(false)
    } catch (reason) {
      setEditorError(reason instanceof ConflictError ? `${reason.message} Perubahan lokal belum ditimpa.` : reason instanceof Error ? reason.message : 'Penanda gagal disimpan.')
    } finally { setEditorSaving(false) }
  }
  const publish = async () => {
    if (!editorData || !window.confirm(`Terbitkan ${editorData.peta.nama_peta} agar dapat dilihat pengguna lain?`)) return
    setPublishing(true); setPublishError('')
    try {
      const saved = await publishMap(editorData.peta.id)
      setEditorData(saved); setDetail(saved); setMapsRetry((value) => value + 1)
    } catch (reason) {
      setPublishError(reason instanceof Error ? reason.message : 'Peta gagal diterbitkan.')
    } finally { setPublishing(false) }
  }
  const openIconWizard = async () => {
    setIconLibraryLoading(true); setIconLibraryError('')
    try {
      setIconLibrary(await loadMapIcons()); setShowIconWizard(true)
    } catch (reason) {
      setIconLibraryError(reason instanceof Error ? reason.message : 'Pustaka ikon gagal dimuat.')
    } finally { setIconLibraryLoading(false) }
  }
  const removeMap = async () => {
    if (!deleteTarget) return
    setDeletingMap(true); setDeleteMapError('')
    try {
      await deleteMap(deleteTarget.id, { revisi: deleteTarget.revisi, nama_peta: deleteTarget.nama_peta })
      if (activeMapId === deleteTarget.id) {
        setActiveMapId(null); setDetail(null); setEditorData(null); setSelectedMarkerId(null)
      }
      setDeleteTarget(null); setMapsRetry((value) => value + 1)
    } catch (reason) {
      setDeleteMapError(reason instanceof Error ? reason.message : 'Peta gagal dihapus.')
    } finally { setDeletingMap(false) }
  }

  useEffect(() => {
    if (!editorDirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editorDirty])

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault()
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * (event.evt.deltaY > 0 ? 1 / 1.08 : 1.08)))
    const mapPoint = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale }
    setView(bounded({ x: pointer.x - mapPoint.x * scale, y: pointer.y - mapPoint.y * scale, scale }))
  }

  const handleTouchStart = (event: Konva.KonvaEventObject<TouchEvent>) => {
    if (event.evt.touches.length !== 2) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const [a, b] = Array.from(event.evt.touches)
    pinchRef.current = { distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), center: { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top }, view }
    event.target.getStage()?.stopDrag()
  }

  const handleTouchMove = (event: Konva.KonvaEventObject<TouchEvent>) => {
    const start = pinchRef.current
    if (!start || event.evt.touches.length !== 2) return
    event.evt.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const [a, b] = Array.from(event.evt.touches)
    const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
    const center = { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top }
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.view.scale * distance / Math.max(1, start.distance)))
    const mapPoint = { x: (start.center.x - start.view.x) / start.view.scale, y: (start.center.y - start.view.y) / start.view.scale }
    setView(bounded({ x: center.x - mapPoint.x * scale, y: center.y - mapPoint.y * scale, scale }))
  }

  if (bootstrap.status !== 'ready') return <StatusScreen state={bootstrap} retry={() => setRetryKey((key) => key + 1)} />
  const { session, resolver } = bootstrap
  return <main className={editing ? 'editor-mode' : ''}>
    <section className={`workspace ${activePanel ? 'menu-open' : 'menu-closed'}`} aria-label="Viewer peta peralatan">
      <nav className="command-rail" aria-label="Navigasi peta">
        <a className="rail-home" href="/dashboard" aria-label="Kembali ke aplikasi utama"><img className="rail-logo" src={injourneyMiniLogo} alt="" /><RailIcon name="home" /><span>Beranda</span></a>
        <button className={activePanel === 'maps' ? 'active' : ''} type="button" onClick={() => setActivePanel((value) => value === 'maps' ? null : 'maps')} aria-controls="map-sidebar" aria-expanded={activePanel === 'maps'}><RailIcon name="map" /><span>Peta</span></button>
        <button type="button" onClick={() => setShowScanner(true)}><RailIcon name="scan" /><span>Scan QR</span></button>
        <button className={activePanel === 'filters' ? 'active' : ''} type="button" onClick={() => setActivePanel((value) => value === 'filters' ? null : 'filters')} aria-controls="map-sidebar" aria-expanded={activePanel === 'filters'}><RailIcon name="filter" /><span>Filter</span></button>
        <span className="rail-user" title={`${session.nama_lengkap} · ${session.role}`}>{session.nama_lengkap.slice(0, 2).toUpperCase()}</span>
      </nav>
      <aside id="map-sidebar" className="sidebar" aria-hidden={!activePanel} inert={!activePanel}>
        {!editing && <a className="sidebar-brand" href="/dashboard" aria-label="Kembali ke dashboard Airport Technology"><img src={injourneyLogo} alt="Injourney Airports" /></a>}
        {(activePanel === 'maps' || editing) && <div className="map-panel">
          <div className="panel-heading"><div><span className="section-label">NAVIGASI</span><h2>Peta gedung</h2></div><button className="panel-close" onClick={() => setActivePanel(null)} aria-label="Tutup panel peta">×</button></div>
          <label className="section-label" htmlFor="map-select">Gedung dan lantai</label>
          <select id="map-select" value={activeMapId ?? ''} onChange={(event) => setActiveMapId(Number(event.target.value) || null)} disabled={mapsStatus !== 'ready' || maps.length === 0}>
            <option value="">Pilih peta</option>
            {[...new Set(maps.map((map) => map.gedung.id))].map((buildingId) => { const buildingMaps = maps.filter((map) => map.gedung.id === buildingId); return <optgroup key={buildingId} label={buildingMaps[0].gedung.nama}>{buildingMaps.map((map) => <option key={map.id} value={map.id}>{map.nama_lantai} — {map.nama_peta}{map.status !== 'terbit' ? ' (Draft)' : ''}</option>)}</optgroup> })}
          </select>
          {session.capabilities.edit_peta && <div className="map-actions"><button className="primary" type="button" onClick={() => setShowWizard(true)}>Tambah peta</button>{editorData && !editing && <button className="secondary" type="button" onClick={startEditor}>Edit penanda</button>}<button className="secondary" type="button" disabled={iconLibraryLoading} onClick={() => void openIconWizard()}>{iconLibraryLoading ? 'Memuat ikon…' : 'Kelola ikon'}</button>{editorData?.peta.status === 'siap_diedit' && !editing && <button className="secondary" type="button" disabled={publishing} onClick={publish}>{publishing ? 'Menerbitkan…' : 'Terbitkan peta'}</button>}{activeMap && !editing && <button className="danger-button" type="button" onClick={() => { setDeleteMapError(''); setDeleteTarget(activeMap) }}>Hapus peta</button>}</div>}
          {publishError && <p className="error" role="alert">{publishError}</p>}
          {iconLibraryError && <p className="error" role="alert">{iconLibraryError}</p>}
          {mapsStatus === 'loading' && <p className="muted" role="status">Memuat daftar peta…</p>}
          {mapsStatus === 'error' && <div className="error" role="alert">Daftar peta gagal dimuat.<button onClick={() => setMapsRetry((value) => value + 1)}>Coba lagi</button></div>}
          {mapsStatus === 'ready' && maps.length === 0 && <p className="empty">Belum ada peta yang diterbitkan.</p>}
          {maps.length > 0 && <details className="map-catalog" open><summary>Katalog peta</summary><div>{maps.map((map) => <button key={map.id} className={activeMapId === map.id ? 'active' : ''} onClick={() => setActiveMapId(map.id)} aria-pressed={activeMapId === map.id}>
            {map.thumbnail_url && <img src={map.thumbnail_url} alt="" width="64" height="42" loading="lazy" />}
            <span><strong>{map.nama_peta}</strong><small>{map.gedung.nama} · {map.nama_lantai}</small><em className={`map-status ${map.status}`}>{map.status === 'terbit' ? 'Terbit' : map.status === 'draft' ? 'Draft tanpa denah' : 'Draft siap diedit'}</em></span>
          </button>)}</div></details>}
        </div>}

        {editing && editorData && <MapEditorPanel data={editorData} markers={draftMarkers} selectedId={selectedMarkerId} dirty={editorDirty} saving={editorSaving} error={editorError} onSelect={setSelectedMarkerId} onAdd={addDraftMarker} onUpdate={updateDraftMarker} onDelete={deleteDraftMarker} onSave={saveEditor} onCancel={closeEditor} onReload={() => setEditorReload((value) => value + 1)} />}

        {!editing && activePanel === 'filters' && resolver && <div className="resolver-state" role="status"><p className="section-label">Hasil dari detail peralatan</p><strong>{resolver.peralatan.nama_peralatan}</strong>
          {resolver.pilihan.length === 0 ? <small>Peralatan ini belum ditempatkan pada peta.</small> : resolver.pilihan.length === 1 ? <small>Ditemukan di {resolver.pilihan[0].nama_peta}.</small> : <><small>Pilih salah satu lokasi peralatan:</small><div className="resolver-options">{resolver.pilihan.map((map) => <button key={map.id} onClick={() => setActiveMapId(map.id)} aria-pressed={activeMapId === map.id}>{map.gedung.nama} · {map.nama_lantai}</button>)}</div></>}
        </div>}

        {!editing && activePanel === 'filters' && detail && <div className="filters">
          <fieldset className="category-filter"><legend>Kategori peralatan</legend><div className="filter-actions"><button type="button" onClick={() => setCategory('')}>Pilih semua</button><button type="button" onClick={() => setCategory('__none__')}>Bersihkan</button></div><div className="category-options">{categories.map((item) => {
            const icon = detail.penanda.find((marker) => marker.peralatan.kategori === item)?.ikon
            return <button type="button" key={item} onClick={() => setCategory(category === item ? '' : item)} aria-pressed={category === '' || category === item}>{icon && <img src={icon.file_url} alt="" width="24" height="24" />}<span>{item}</span></button>
          })}</div></fieldset>
          <label htmlFor="facility-filter">Fasilitas</label><select id="facility-filter" value={facility} onChange={(event) => setFacility(event.target.value)}><option value="">Semua fasilitas</option>{facilities.map((item) => <option key={item}>{item}</option>)}</select>
          {jbrds.length > 0 && <><label htmlFor="jbrd-filter">Panel JBRD</label><select id="jbrd-filter" value={jbrd} onChange={(event) => setJbrd(event.target.value)}><option value="">Semua JBRD</option>{jbrds.map((item) => <option key={item}>{item}</option>)}</select></>}
          <label htmlFor="status-filter">Status</label><select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua status</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
          <label htmlFor="user-status-filter">User status</label><select id="user-status-filter" value={userStatus} onChange={(event) => setUserStatus(event.target.value)}><option value="">Semua user status</option>{userStatuses.map((item) => <option key={item}>{item}</option>)}</select>
          <label htmlFor="network-filter">Status jaringan</label><select id="network-filter" value={networkStatus} onChange={(event) => setNetworkStatus(event.target.value)}><option value="">Semua status jaringan</option><option value="ONLINE">Online</option><option value="LATENCY_TINGGI">Latency tinggi</option><option value="TIDAK_MERESPONS">Tidak merespons</option><option value="BELUM_ADA_DATA">Belum ada data</option><option value="NONAKTIF">Monitoring nonaktif</option></select>
          <div className="result-summary" role="status"><span>{filteredMarkers.length} peralatan</span><button onClick={() => { setQuery(''); setCategory(''); setFacility(''); setJbrd(''); setStatus(''); setUserStatus(''); setNetworkStatus('') }}>Reset filter</button></div>
        </div>}

        {!editing && activePanel === 'filters' && <div className="marker-list" aria-label="Daftar peralatan pada peta">
          {filteredMarkers.map((marker) => { const network = networkByEquipment[marker.peralatan.id]; return <button key={marker.id} className={selectedMarkerId === marker.id ? 'active' : ''} onClick={() => focusMarker(marker)} aria-pressed={selectedMarkerId === marker.id}><strong>{marker.peralatan.nama_peralatan}</strong><small>{marker.peralatan.scan_code || 'Tanpa scan code'} · {marker.peralatan.status}</small><small className="marker-network"><i style={{ background: networkStatusTone(network).color }} />{networkStatusText(network)}</small></button> })}
          {detail && filteredMarkers.length === 0 && <p className="empty">Tidak ada peralatan yang cocok. Ubah pencarian atau reset filter.</p>}
        </div>}

      </aside>

      <button type="button" className="sidebar-scrim" onClick={() => setActivePanel(null)} aria-label="Tutup menu peta" />

      <div className="canvas-panel">
      {editing ? <div className="editor-commandbar"><strong>MODE EDITOR</strong><button className="secondary editor-panel-toggle" onClick={() => setActivePanel((value) => value === 'maps' ? null : 'maps')} aria-controls="map-sidebar" aria-expanded={activePanel === 'maps'}>Daftar</button><span>{detail?.peta.gedung.nama} / {detail?.peta.nama_lantai}</span><i /> <small>{editorDirty ? 'Perubahan belum disimpan' : 'Belum ada perubahan'}</small><button className="secondary" onClick={closeEditor} disabled={editorSaving}>Tutup editor</button><button className="primary" onClick={saveEditor} disabled={!editorDirty || editorSaving} title={!editorDirty ? 'Ubah penanda terlebih dahulu' : undefined}>{editorSaving ? 'Menyimpan…' : 'Simpan perubahan'}</button></div> : <div className="canvas-toolbar">
        <div className="search-shell"><label className="map-search"><span aria-hidden="true">⌕</span><input ref={searchRef} id="equipment-search" type="search" role="combobox" aria-autocomplete="list" aria-controls="equipment-suggestions" aria-expanded={searchOpen && !!query.trim()} value={query} onFocus={() => setSearchOpen(true)} onBlur={() => setSearchOpen(false)} onChange={(event) => { setQuery(event.target.value); setSearchIndex(0); setSearchOpen(true) }} onKeyDown={(event) => { if (!searchSuggestions.length) return; if (event.key === 'ArrowDown') { event.preventDefault(); setSearchIndex((value) => (value + 1) % searchSuggestions.length) } else if (event.key === 'ArrowUp') { event.preventDefault(); setSearchIndex((value) => (value - 1 + searchSuggestions.length) % searchSuggestions.length) } else if (event.key === 'Enter') { event.preventDefault(); chooseSearchResult(searchSuggestions[searchIndex] ?? searchSuggestions[0]) } else if (event.key === 'Escape') setSearchOpen(false) }} placeholder="Cari peralatan, scan code, atau ruangan…" /></label>{searchOpen && !!query.trim() && <div id="equipment-suggestions" className="search-suggestions" role="listbox">{searchSuggestions.map((marker, index) => <button key={marker.id} type="button" role="option" aria-selected={index === searchIndex} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSearchResult(marker)}><strong>{marker.peralatan.nama_peralatan}</strong><span>{marker.peralatan.scan_code || 'Tanpa scan code'} · {marker.peralatan.lokasi || marker.peralatan.fasilitas || 'Lokasi belum diisi'}</span></button>)}{searchSuggestions.length === 0 && <p>Tidak ada peralatan yang cocok.</p>}</div>}</div>
        <button className="scan-link" type="button" onClick={() => setShowScanner(true)}><RailIcon name="scan" /> Scan QR</button>
        <select className="toolbar-map-select" aria-label="Pilih gedung dan lantai" value={activeMapId ?? ''} onChange={(event) => setActiveMapId(Number(event.target.value) || null)}><option value="">Pilih peta</option>{maps.map((map) => <option key={map.id} value={map.id}>{map.gedung.nama} · {map.nama_lantai}</option>)}</select>
      </div>}
      <div className="canvas" ref={containerRef} role="img" aria-label={detail ? `Denah ${detail.peta.nama_peta} dengan ${filteredMarkers.length} penanda peralatan` : 'Area denah peta'}>
        {detailStatus === 'idle' && <div className="canvas-message">{activeMap?.status === 'draft' ? 'Draft ini belum memiliki denah. Anda dapat menghapusnya atau menyelesaikan unggahan melalui Tambah peta.' : 'Pilih gedung dan lantai untuk membuka denah.'}</div>}
        {detailStatus === 'loading' && <div className="canvas-message" role="status">Memuat denah dan penanda…</div>}
        {detailStatus === 'error' && <div className="canvas-message error" role="alert">Detail peta gagal dimuat.<button onClick={() => setDetailRetry((value) => value + 1)}>Coba lagi</button></div>}
        {detailStatus === 'ready' && mapImage.error && <div className="canvas-message error" role="alert">Gambar denah tidak tersedia. Data penanda tetap dapat dibuka dari daftar.</div>}
        {!editing && selectedMarker && <article className="equipment-detail floating-detail"><button className="close-detail" onClick={() => setSelectedMarkerId(null)} aria-label="Tutup detail peralatan">×</button><p className="section-label">{equipmentStatusTone(selectedMarker.peralatan).label}</p><h2>{selectedMarker.peralatan.nama_peralatan}</h2><code>{selectedMarker.peralatan.scan_code || 'Tanpa scan code'}</code>{selectedMarker.peralatan.foto_url ? <img className="equipment-photo" src={selectedMarker.peralatan.foto_url} alt={`Foto ${selectedMarker.peralatan.nama_peralatan}`} /> : <div className="photo-placeholder">Belum ada foto peralatan</div>}<dl><div><dt>Kategori</dt><dd>{selectedMarker.peralatan.kategori || '—'}</dd></div><div><dt>Fasilitas</dt><dd>{selectedMarker.peralatan.fasilitas || '—'}</dd></div><div><dt>User status</dt><dd>{selectedMarker.peralatan.user_status}</dd></div><div><dt>IP peralatan</dt><dd>{selectedMarker.peralatan.ip_address || 'Belum diisi'}</dd></div><div className="network-detail"><dt>Status jaringan</dt><dd><i style={{ background: networkStatusTone(selectedNetwork).color }} />{networkStatusText(selectedNetwork)}</dd></div><div><dt>Terakhir diperiksa</dt><dd>{selectedNetwork?.diperiksa_pada ? formatNetworkTime(selectedNetwork.diperiksa_pada) : '—'}</dd></div></dl><a className="primary-link" href={selectedMarker.peralatan.detail_url}>Buka detail &amp; maintenance</a></article>}
        <div className="canvas-controls"><button onClick={() => zoom(1 / 1.15)} aria-label="Perkecil peta">−</button><output>{Math.round(view.scale * 100)}%</output><button onClick={() => zoom(1.15)} aria-label="Perbesar peta">+</button><button onClick={() => setView(fitView(viewport, detail?.peta))}>Fit</button></div>
        {detail && <div className="status-legend" aria-label="Warna status penanda"><span><i className="operating" />Beroperasi</span><span><i className="standby" />Standby</span><span><i className="repair" />Perbaikan</span><span><i className="broken" />Rusak</span><span><i className="inactive" />Nonaktif</span></div>}
        {detail && !editing && <div className={`network-legend ${networkState}`} role="status" aria-live="polite" aria-atomic="true"><span><i className="network-online" />Online</span><span><i className="network-warning" />Latency tinggi</span><span><i className="network-down" />Tidak merespons</span><small>{networkState === 'stale' ? 'Pembaruan tertunda' : networkUpdatedAt ? `Diperbarui ${formatNetworkTime(networkUpdatedAt)}` : 'Memuat status jaringan…'}</small></div>}
        {detail && mapImage.image && <Stage width={viewport.width} height={viewport.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} draggable dragBoundFunc={(position) => bounded({ ...position, scale: view.scale })} onDragEnd={(event) => { if (event.target === event.currentTarget) setView(bounded({ x: event.target.x(), y: event.target.y(), scale: view.scale })) }} onWheel={handleWheel} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={() => { pinchRef.current = null }}><Layer listening={false}><KonvaImage image={mapImage.image} width={detail.peta.width_px ?? mapImage.image.naturalWidth} height={detail.peta.height_px ?? mapImage.image.naturalHeight} shadowBlur={18} shadowOpacity={.18} /></Layer><Layer>{filteredMarkers.map((marker) => <MarkerNode key={marker.id} marker={marker} map={detail.peta} network={!editing ? networkByEquipment[marker.peralatan.id] : undefined} selected={marker.id === selectedMarkerId} draggable={editing} onSelect={() => editing ? setSelectedMarkerId(marker.id) : focusMarker(marker)} onMove={(x_ratio, y_ratio) => updateDraftMarker(marker.id, { x_ratio, y_ratio })} />)}</Layer></Stage>}
      </div></div>
    </section>
    {showWizard && <MapWizard onClose={() => setShowWizard(false)} onCreated={(id) => { setShowWizard(false); setActiveMapId(id); setMapsRetry((value) => value + 1) }} />}
    {showIconWizard && iconLibrary && <IconWizard data={iconLibrary} onClose={() => setShowIconWizard(false)} onCreated={() => { setShowIconWizard(false); setIconLibrary(null); setEditorReload((value) => value + 1) }} />}
    <ScanDialog open={showScanner} onClose={() => setShowScanner(false)} />
    <DeleteMapDialog map={deleteTarget} markerCount={deleteTarget && detail && deleteTarget.id === detail.peta.id ? detail.penanda.length : null} busy={deletingMap} error={deleteMapError} onClose={() => !deletingMap && setDeleteTarget(null)} onDelete={removeMap} />
  </main>
}

export default App
