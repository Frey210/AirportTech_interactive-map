import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Circle, Group, Image as KonvaImage, Layer, Stage, Text } from 'react-konva'
import {
  ConflictError, equipmentStatusTone, filterMarkers, ForbiddenError, loadBootstrap, loadEditableMaps, loadMapDetail, loadMapEditor, loadMaps, publishMap, resolveScanCode, saveMapMarkers, SessionExpiredError,
  type MapDetail, type MapEditorData, type MapMarker, type MapResolver, type MapSummary, type Session,
} from './api'
import { constrainView } from './coordinates'
import MapEditorPanel from './MapEditorPanel'
import MapWizard from './MapWizard'
import IconWizard from './IconWizard'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
type View = { x: number; y: number; scale: number }
type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; session: Session; resolver: MapResolver | null }
  | { status: 'unauthenticated' | 'forbidden' | 'error' }

function fitView(viewport: { width: number; height: number }, map?: MapSummary): View {
  if (!map?.width_px || !map.height_px) return { x: 0, y: 0, scale: 1 }
  const mobile = viewport.width <= 800
  const inset = mobile ? { top: 70, right: 14, bottom: 72, left: 14 } : { top: 80, right: 18, bottom: 18, left: 18 }
  const width = Math.max(1, viewport.width - inset.left - inset.right)
  const height = Math.max(1, viewport.height - inset.top - inset.bottom)
  const scale = Math.min(width / map.width_px, height / map.height_px) * 0.96
  return { x: inset.left + (width - map.width_px * scale) / 2, y: inset.top + (height - map.height_px * scale) / 2, scale }
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

function MarkerNode({ marker, map, selected, draggable = false, onSelect, onMove }: { marker: MapMarker; map: MapSummary; selected: boolean; draggable?: boolean; onSelect: () => void; onMove?: (xRatio: number, yRatio: number) => void }) {
  const icon = useRemoteImage(marker.ikon.file_url)
  const size = Math.max(28, marker.size_ratio * Math.min(map.width_px ?? 0, map.height_px ?? 0)) * (selected ? 1.25 : 1)
  const tone = equipmentStatusTone(marker.peralatan)
  return <Group x={marker.x_ratio * (map.width_px ?? 0)} y={marker.y_ratio * (map.height_px ?? 0)} rotation={marker.rotation_deg} draggable={draggable} onClick={onSelect} onTap={onSelect} onDragEnd={(event) => onMove?.(Math.min(1, Math.max(0, event.target.x() / (map.width_px ?? 1))), Math.min(1, Math.max(0, event.target.y() / (map.height_px ?? 1))))}>
    <Circle radius={size * .62} fill={tone.color} stroke={selected ? '#14757f' : '#fff'} strokeWidth={selected ? 7 : 3} shadowBlur={selected ? 16 : 7} shadowOpacity={.28} />
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

function RailIcon({ name }: { name: 'map' | 'search' | 'scan' | 'filter' | 'settings' }) {
  const paths = {
    map: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z" /><path d="M8 3v15M16 6v15" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
    scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path d="M8 12h8" /></>,
    filter: <><path d="M5 7h14M7 12h10M9 17h6" /></>,
    settings: <><path d="M12 3 4.5 7.5v9L12 21l7.5-4.5v-9Z" /><circle cx="12" cy="12" r="3" /></>,
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

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const pinchRef = useRef<{ distance: number; center: { x: number; y: number }; view: View } | null>(null)
  const focusedDeepLinkRef = useRef('')
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [showWizard, setShowWizard] = useState(() => params.get('wizard') === 'baru')
  const [showIconWizard, setShowIconWizard] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editorData, setEditorData] = useState<MapEditorData | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftMarkers, setDraftMarkers] = useState<MapMarker[]>([])
  const [deletedMarkers, setDeletedMarkers] = useState<Array<{ id: number; lock_version: number }>>([])
  const [editorDirty, setEditorDirty] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorError, setEditorError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [editorReload, setEditorReload] = useState(0)
  const [maps, setMaps] = useState<MapSummary[]>([])
  const [mapsStatus, setMapsStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mapsRetry, setMapsRetry] = useState(0)
  const [activeMapId, setActiveMapId] = useState<number | null>(() => Number(params.get('peta_id')) || null)
  const [detail, setDetail] = useState<MapDetail | null>(null)
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [detailRetry, setDetailRetry] = useState(0)
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null)
  const [query, setQuery] = useState(params.get('cari') ?? '')
  const [category, setCategory] = useState(params.get('kategori') ?? '')
  const [facility, setFacility] = useState(params.get('fasilitas') ?? '')
  const [status, setStatus] = useState(params.get('status') ?? '')
  const [userStatus, setUserStatus] = useState(params.get('user_status') ?? '')
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
      setActiveMapId((current) => current ?? bootstrap.resolver?.default_peta_id ?? (bootstrap.resolver && bootstrap.resolver.pilihan.length > 1 ? null : items[0]?.id ?? null))
    }).catch(() => !controller.signal.aborted && setMapsStatus('error'))
    return () => controller.abort()
  }, [bootstrap, mapsRetry])

  useEffect(() => {
    if (bootstrap.status !== 'ready') return
    if (activeMapId === null) { setDetail(null); setDetailStatus('idle'); return }
    const controller = new AbortController()
    setDetailStatus('loading')
    const load = bootstrap.session.capabilities.edit_peta ? loadMapEditor : loadMapDetail
    load(activeMapId, fetch, controller.signal).then((value) => {
      setDetail(value); setEditorData('ikon' in value && 'peralatan' in value ? value as MapEditorData : null); setDetailStatus('ready')
      setEditing(false); setEditorDirty(false); setDeletedMarkers([]); setEditorError('')
      const equipmentId = bootstrap.status === 'ready' ? bootstrap.resolver?.peralatan.id : null
      setSelectedMarkerId(value.penanda.find((marker) => marker.peralatan.id === equipmentId)?.id ?? null)
    }).catch(() => !controller.signal.aborted && setDetailStatus('error'))
    return () => controller.abort()
  }, [activeMapId, bootstrap, detailRetry, editorReload])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setViewport({ width: Math.max(1, Math.floor(entry.contentRect.width)), height: Math.max(1, Math.floor(entry.contentRect.height)) }))
    observer.observe(container)
    return () => observer.disconnect()
  }, [bootstrap.status])
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

  const displayedMarkers = editing ? draftMarkers : detail?.penanda ?? []
  const filteredMarkers = useMemo(() => {
    return editing ? draftMarkers : filterMarkers(detail?.penanda ?? [], { query, category, facility, status, userStatus })
  }, [detail, draftMarkers, editing, query, category, facility, status, userStatus])
  const categories = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.kategori).filter(Boolean))] as string[], [detail])
  const facilities = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.fasilitas).filter(Boolean))] as string[], [detail])
  const statuses = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.status).filter(Boolean))] as string[], [detail])
  const userStatuses = useMemo(() => [...new Set((detail?.penanda ?? []).map((item) => item.peralatan.user_status).filter(Boolean))], [detail])
  const selectedMarker = displayedMarkers.find((marker) => marker.id === selectedMarkerId) ?? null

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
    const mobile = viewport.width <= 800
    const scale = Math.min(MAX_ZOOM, mobile ? 1 : fitView(viewport, detail.peta).scale * 1.8)
    const center = { x: mobile ? viewport.width / 2 : (viewport.width - 316) / 2, y: mobile ? viewport.height * .34 : viewport.height / 2 }
    setSelectedMarkerId(marker.id)
    setView(bounded({ x: center.x - marker.x_ratio * detail.peta.width_px * scale, y: center.y - marker.y_ratio * detail.peta.height_px * scale, scale }))
  }, [bounded, detail, viewport])

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
    setDeletedMarkers([]); setEditorDirty(false); setEditorError(''); setMenuOpen(true); setEditing(true)
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
      peralatan: { id: equipment.id, nama_peralatan: equipment.nama_peralatan, scan_code: equipment.scan_code, ip_address: equipment.ip_address, kategori: equipment.kategori, fasilitas: equipment.fasilitas, user_status: equipment.user_status, status: equipment.status, is_aktif: equipment.is_aktif, foto_url: equipment.foto_url, detail_url: `/peralatan/${equipment.id}` },
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
    setEditing(false); setEditorDirty(false); setEditorError(''); setMenuOpen(false)
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
  const zoomed = detail ? view.scale > fitView(viewport, detail.peta).scale * 1.08 : false
  return <main className={editing ? 'editor-mode' : ''}>
    <section className={`workspace ${menuOpen ? 'menu-open' : 'menu-closed'}`} aria-label="Viewer peta peralatan">
      <nav className="command-rail" aria-label="Navigasi peta">
        <a className="rail-brand" href="/dashboard" aria-label="Kembali ke dashboard">AT</a>
        <button className="active" type="button" onClick={() => setMenuOpen((value) => !value)} aria-controls="map-sidebar" aria-expanded={menuOpen} aria-label="Buka pengaturan peta"><RailIcon name="map" /></button>
        <button type="button" onClick={() => searchRef.current?.focus()} aria-label="Cari peralatan"><RailIcon name="search" /></button>
        <button type="button" onClick={() => setShowScanner(true)} aria-label="Scan QR peralatan"><RailIcon name="scan" /></button>
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Buka filter peralatan"><RailIcon name="filter" /></button>
        {session.capabilities.edit_peta && <button type="button" onClick={() => editorData && setShowIconWizard(true)} disabled={!editorData} aria-label="Kelola ikon peta"><RailIcon name="settings" /></button>}
        <span className="rail-user" title={`${session.nama_lengkap} · ${session.role}`}>{session.nama_lengkap.slice(0, 2).toUpperCase()}</span>
      </nav>
      <aside id="map-sidebar" className="sidebar" aria-hidden={!menuOpen} inert={!menuOpen}>
        <div>
          <label className="section-label" htmlFor="map-select">Gedung dan lantai</label>
          <select id="map-select" value={activeMapId ?? ''} onChange={(event) => setActiveMapId(Number(event.target.value) || null)} disabled={mapsStatus !== 'ready' || maps.length === 0}>
            <option value="">Pilih peta</option>
            {[...new Set(maps.map((map) => map.gedung.id))].map((buildingId) => { const buildingMaps = maps.filter((map) => map.gedung.id === buildingId); return <optgroup key={buildingId} label={buildingMaps[0].gedung.nama}>{buildingMaps.map((map) => <option key={map.id} value={map.id}>{map.nama_lantai} — {map.nama_peta}{map.status === 'siap_diedit' ? ' (Draft)' : ''}</option>)}</optgroup> })}
          </select>
          {session.capabilities.edit_peta && <button className="new-map" type="button" onClick={() => setShowWizard(true)}>+ Tambah peta</button>}
          {session.capabilities.edit_peta && editorData && !editing && <button className="new-map" type="button" onClick={startEditor}>Edit penanda</button>}
          {session.capabilities.edit_peta && editorData && !editing && <button className="new-map" type="button" onClick={() => setShowIconWizard(true)}>Kelola ikon</button>}
          {session.capabilities.edit_peta && editorData?.peta.status === 'siap_diedit' && !editing && <button className="new-map" type="button" disabled={publishing} onClick={publish}>{publishing ? 'Menerbitkan…' : 'Terbitkan peta'}</button>}
          {publishError && <p className="error" role="alert">{publishError}</p>}
          {mapsStatus === 'loading' && <p className="muted" role="status">Memuat daftar peta…</p>}
          {mapsStatus === 'error' && <div className="error" role="alert">Daftar peta gagal dimuat.<button onClick={() => setMapsRetry((value) => value + 1)}>Coba lagi</button></div>}
          {mapsStatus === 'ready' && maps.length === 0 && <p className="empty">Belum ada peta yang diterbitkan.</p>}
          {maps.length > 0 && <details className="map-catalog"><summary>Lihat katalog peta</summary><div>{maps.map((map) => <button key={map.id} className={activeMapId === map.id ? 'active' : ''} onClick={() => setActiveMapId(map.id)} aria-pressed={activeMapId === map.id}>
            {map.thumbnail_url && <img src={map.thumbnail_url} alt="" width="64" height="42" loading="lazy" />}
            <span><strong>{map.nama_peta}</strong><small>{map.gedung.nama} · {map.nama_lantai}{map.diubah_pada ? ` · ${new Intl.DateTimeFormat('id-ID').format(new Date(map.diubah_pada))}` : ''}</small></span>
          </button>)}</div></details>}
        </div>

        {editing && editorData && <MapEditorPanel data={editorData} markers={draftMarkers} selectedId={selectedMarkerId} dirty={editorDirty} saving={editorSaving} error={editorError} onSelect={setSelectedMarkerId} onAdd={addDraftMarker} onUpdate={updateDraftMarker} onDelete={deleteDraftMarker} onSave={saveEditor} onCancel={closeEditor} onReload={() => setEditorReload((value) => value + 1)} />}

        {!editing && resolver && <div className="resolver-state" role="status"><p className="section-label">Hasil dari detail peralatan</p><strong>{resolver.peralatan.nama_peralatan}</strong>
          {resolver.pilihan.length === 0 ? <small>Peralatan ini belum ditempatkan pada peta.</small> : resolver.pilihan.length === 1 ? <small>Ditemukan di {resolver.pilihan[0].nama_peta}.</small> : <><small>Pilih salah satu lokasi peralatan:</small><div className="resolver-options">{resolver.pilihan.map((map) => <button key={map.id} onClick={() => setActiveMapId(map.id)} aria-pressed={activeMapId === map.id}>{map.gedung.nama} · {map.nama_lantai}</button>)}</div></>}
        </div>}

        {!editing && detail && <div className="filters">
          <fieldset className="category-filter"><legend>Kategori peralatan</legend><div className="filter-actions"><button type="button" onClick={() => setCategory('')}>Pilih semua</button><button type="button" onClick={() => setCategory('__none__')}>Bersihkan</button></div><div className="category-options">{categories.map((item) => {
            const icon = detail.penanda.find((marker) => marker.peralatan.kategori === item)?.ikon
            return <button type="button" key={item} onClick={() => setCategory(category === item ? '' : item)} aria-pressed={category === '' || category === item}>{icon && <img src={icon.file_url} alt="" width="24" height="24" />}<span>{item}</span></button>
          })}</div></fieldset>
          <label htmlFor="facility-filter">Fasilitas</label><select id="facility-filter" value={facility} onChange={(event) => setFacility(event.target.value)}><option value="">Semua fasilitas</option>{facilities.map((item) => <option key={item}>{item}</option>)}</select>
          <label htmlFor="status-filter">Status</label><select id="status-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Semua status</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
          <label htmlFor="user-status-filter">User status</label><select id="user-status-filter" value={userStatus} onChange={(event) => setUserStatus(event.target.value)}><option value="">Semua user status</option>{userStatuses.map((item) => <option key={item}>{item}</option>)}</select>
          <div className="result-summary" role="status"><span>{filteredMarkers.length} peralatan</span><button onClick={() => { setQuery(''); setCategory(''); setFacility(''); setStatus(''); setUserStatus('') }}>Reset filter</button></div>
        </div>}

        {!editing && <div className="marker-list" aria-label="Daftar peralatan pada peta">
          {filteredMarkers.map((marker) => <button key={marker.id} className={selectedMarkerId === marker.id ? 'active' : ''} onClick={() => focusMarker(marker)} aria-pressed={selectedMarkerId === marker.id}><strong>{marker.peralatan.nama_peralatan}</strong><small>{marker.peralatan.scan_code || 'Tanpa scan code'} · {marker.peralatan.status}</small></button>)}
          {detail && filteredMarkers.length === 0 && <p className="empty">Tidak ada peralatan yang cocok. Ubah pencarian atau reset filter.</p>}
        </div>}

      </aside>

      <button type="button" className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Tutup menu peta" />

      <div className="canvas-panel">
      {editing ? <div className="editor-commandbar"><strong>MODE EDITOR</strong><span>{detail?.peta.gedung.nama} / {detail?.peta.nama_lantai}</span><i /> <small>{editorDirty ? 'Perubahan belum disimpan' : 'Semua perubahan tersimpan'}</small><button className="secondary" onClick={closeEditor} disabled={editorSaving}>Tutup editor</button><button className="primary" onClick={saveEditor} disabled={!editorDirty || editorSaving}>{editorSaving ? 'Menyimpan…' : 'Simpan perubahan'}</button></div> : <div className="canvas-toolbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-controls="map-sidebar" aria-label="Tampilkan menu peta">☰</button>
        <label className="map-search"><span aria-hidden="true">⌕</span><input ref={searchRef} id="equipment-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari peralatan, scan code, atau ruangan…" /></label>
        <button className="scan-link" type="button" onClick={() => setShowScanner(true)}><RailIcon name="scan" /> Scan QR</button>
        <select className="toolbar-map-select" aria-label="Pilih gedung dan lantai" value={activeMapId ?? ''} onChange={(event) => setActiveMapId(Number(event.target.value) || null)}><option value="">Pilih peta</option>{maps.map((map) => <option key={map.id} value={map.id}>{map.gedung.nama} · {map.nama_lantai}</option>)}</select>
      </div>}
      <div className="canvas" ref={containerRef} role="img" aria-label={detail ? `Denah ${detail.peta.nama_peta} dengan ${filteredMarkers.length} penanda peralatan` : 'Area denah peta'}>
        {detailStatus === 'idle' && <div className="canvas-message">Pilih gedung dan lantai untuk membuka denah.</div>}
        {detailStatus === 'loading' && <div className="canvas-message" role="status">Memuat denah dan penanda…</div>}
        {detailStatus === 'error' && <div className="canvas-message error" role="alert">Detail peta gagal dimuat.<button onClick={() => setDetailRetry((value) => value + 1)}>Coba lagi</button></div>}
        {detailStatus === 'ready' && mapImage.error && <div className="canvas-message error" role="alert">Gambar denah tidak tersedia. Data penanda tetap dapat dibuka dari daftar.</div>}
        {zoomed && <div className="pan-hint" role="status">Geser peta untuk melihat area lain</div>}
        {!editing && selectedMarker && <article className="equipment-detail floating-detail"><button className="close-detail" onClick={() => setSelectedMarkerId(null)} aria-label="Tutup detail peralatan">×</button><p className="section-label">{equipmentStatusTone(selectedMarker.peralatan).label}</p><h2>{selectedMarker.peralatan.nama_peralatan}</h2><code>{selectedMarker.peralatan.scan_code || 'Tanpa scan code'}</code>{selectedMarker.peralatan.foto_url ? <img className="equipment-photo" src={selectedMarker.peralatan.foto_url} alt={`Foto ${selectedMarker.peralatan.nama_peralatan}`} /> : <div className="photo-placeholder">Belum ada foto peralatan</div>}<dl><div><dt>Kategori</dt><dd>{selectedMarker.peralatan.kategori || '—'}</dd></div><div><dt>Fasilitas</dt><dd>{selectedMarker.peralatan.fasilitas || '—'}</dd></div><div><dt>User status</dt><dd>{selectedMarker.peralatan.user_status}</dd></div><div><dt>IP peralatan</dt><dd>{selectedMarker.peralatan.ip_address || 'Belum diisi'}</dd></div></dl><a className="primary-link" href={selectedMarker.peralatan.detail_url}>Buka detail &amp; maintenance</a></article>}
        <div className="canvas-controls"><button onClick={() => zoom(1 / 1.15)} aria-label="Perkecil peta">−</button><output>{Math.round(view.scale * 100)}%</output><button onClick={() => zoom(1.15)} aria-label="Perbesar peta">+</button><button onClick={() => setView(fitView(viewport, detail?.peta))}>Fit</button></div>
        {detail && <div className="status-legend" aria-label="Warna status penanda"><span><i className="operating" />Beroperasi</span><span><i className="standby" />Standby</span><span><i className="repair" />Perbaikan</span><span><i className="broken" />Rusak</span><span><i className="inactive" />Nonaktif</span></div>}
        {detail && mapImage.image && <Stage width={viewport.width} height={viewport.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} draggable dragBoundFunc={(position) => bounded({ ...position, scale: view.scale })} onDragEnd={(event) => { if (event.target === event.currentTarget) setView(bounded({ x: event.target.x(), y: event.target.y(), scale: view.scale })) }} onWheel={handleWheel} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={() => { pinchRef.current = null }}><Layer listening={false}><KonvaImage image={mapImage.image} width={detail.peta.width_px ?? mapImage.image.naturalWidth} height={detail.peta.height_px ?? mapImage.image.naturalHeight} shadowBlur={18} shadowOpacity={.18} /></Layer><Layer>{filteredMarkers.map((marker) => <MarkerNode key={marker.id} marker={marker} map={detail.peta} selected={marker.id === selectedMarkerId} draggable={editing} onSelect={() => editing ? setSelectedMarkerId(marker.id) : focusMarker(marker)} onMove={(x_ratio, y_ratio) => updateDraftMarker(marker.id, { x_ratio, y_ratio })} />)}</Layer></Stage>}
      </div></div>
    </section>
    {showWizard && <MapWizard onClose={() => setShowWizard(false)} onCreated={(id) => { setShowWizard(false); setActiveMapId(id); setMapsRetry((value) => value + 1) }} />}
    {showIconWizard && editorData && <IconWizard data={editorData} onClose={() => setShowIconWizard(false)} onCreated={() => { setShowIconWizard(false); setEditorReload((value) => value + 1) }} />}
    <ScanDialog open={showScanner} onClose={() => setShowScanner(false)} />
  </main>
}

export default App
