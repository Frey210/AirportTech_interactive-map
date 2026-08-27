import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Circle, Group, Image as KonvaImage, Layer, Stage, Text } from 'react-konva'
import {
  ConflictError, filterMarkers, ForbiddenError, loadBootstrap, loadEditableMaps, loadMapDetail, loadMapEditor, loadMaps, saveMapMarkers, SessionExpiredError,
  type MapDetail, type MapEditorData, type MapMarker, type MapResolver, type MapSummary, type Session,
} from './api'
import { constrainView } from './coordinates'
import MapEditorPanel from './MapEditorPanel'
import MapWizard from './MapWizard'

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

function MarkerNode({ marker, map, selected, draggable = false, onSelect, onMove }: { marker: MapMarker; map: MapSummary; selected: boolean; draggable?: boolean; onSelect: () => void; onMove?: (xRatio: number, yRatio: number) => void }) {
  const icon = useRemoteImage(marker.ikon.file_url)
  const size = Math.max(28, marker.size_ratio * Math.min(map.width_px ?? 0, map.height_px ?? 0))
  return <Group x={marker.x_ratio * (map.width_px ?? 0)} y={marker.y_ratio * (map.height_px ?? 0)} rotation={marker.rotation_deg} draggable={draggable} onClick={onSelect} onTap={onSelect} onDragEnd={(event) => onMove?.(Math.min(1, Math.max(0, event.target.x() / (map.width_px ?? 1))), Math.min(1, Math.max(0, event.target.y() / (map.height_px ?? 1))))}>
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
  const [showWizard, setShowWizard] = useState(() => params.get('wizard') === 'baru')
  const [editorData, setEditorData] = useState<MapEditorData | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftMarkers, setDraftMarkers] = useState<MapMarker[]>([])
  const [deletedMarkers, setDeletedMarkers] = useState<Array<{ id: number; lock_version: number }>>([])
  const [editorDirty, setEditorDirty] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)
  const [editorError, setEditorError] = useState('')
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
    const scale = Math.min(MAX_ZOOM, Math.max(1, fitView(viewport, detail.peta).scale))
    setSelectedMarkerId(marker.id)
    setView(bounded({ x: viewport.width / 2 - marker.x_ratio * detail.peta.width_px * scale, y: viewport.height / 2 - marker.y_ratio * detail.peta.height_px * scale, scale }))
  }, [bounded, detail, viewport])

  const startEditor = () => {
    if (!editorData) return
    setDraftMarkers(editorData.penanda.map((marker) => ({ ...marker })))
    setDeletedMarkers([]); setEditorDirty(false); setEditorError(''); setEditing(true)
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
      peralatan: { id: equipment.id, nama_peralatan: equipment.nama_peralatan, scan_code: equipment.scan_code, kategori: equipment.kategori, fasilitas: null, user_status: '', status: 'Aktif', is_aktif: true, detail_url: `/peralatan/${equipment.id}` },
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
    setEditing(false); setEditorDirty(false); setEditorError('')
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

  useEffect(() => {
    if (!editorDirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editorDirty])

  useEffect(() => {
    if (selectedMarker) focusMarker(selectedMarker)
  }, [detail?.peta.id]) // Fokus deep-link sekali saat peta berubah.

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault()
    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.scale * (event.evt.deltaY > 0 ? 1 / 1.08 : 1.08)))
    const mapPoint = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale }
    setView(bounded({ x: pointer.x - mapPoint.x * scale, y: pointer.y - mapPoint.y * scale, scale }))
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
            {[...new Set(maps.map((map) => map.gedung.id))].map((buildingId) => { const buildingMaps = maps.filter((map) => map.gedung.id === buildingId); return <optgroup key={buildingId} label={buildingMaps[0].gedung.nama}>{buildingMaps.map((map) => <option key={map.id} value={map.id}>{map.nama_lantai} — {map.nama_peta}{map.status === 'siap_diedit' ? ' (Draft)' : ''}</option>)}</optgroup> })}
          </select>
          {session.capabilities.edit_peta && <button className="new-map" type="button" onClick={() => setShowWizard(true)}>+ Tambah peta</button>}
          {session.capabilities.edit_peta && editorData && !editing && <button className="new-map" type="button" onClick={startEditor}>Edit penanda</button>}
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
          <label htmlFor="equipment-search">Cari peralatan</label><input id="equipment-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nama atau scan code" />
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

        {!editing && selectedMarker && <article className="equipment-detail"><button className="close-detail" onClick={() => setSelectedMarkerId(null)} aria-label="Tutup detail peralatan">×</button><p className="section-label">Detail terpilih</p><h2>{selectedMarker.peralatan.nama_peralatan}</h2><p>{selectedMarker.peralatan.kategori || 'Tanpa kategori'} · {selectedMarker.peralatan.fasilitas || 'Tanpa fasilitas'}</p><dl><div><dt>Status</dt><dd>{selectedMarker.peralatan.status}</dd></div><div><dt>User status</dt><dd>{selectedMarker.peralatan.user_status}</dd></div></dl><a className="primary-link" href={selectedMarker.peralatan.detail_url}>Buka detail dan maintenance</a></article>}
      </aside>

      <div className="canvas-panel"><div className="canvas-toolbar">
        {detail && <span className="map-title">{detail.peta.gedung.nama} · {detail.peta.nama_lantai}</span>}
        {editing && <strong className="editing-badge">Editor aktif</strong>}
        <button onClick={() => zoom(1.15)} aria-label="Perbesar peta">+</button><span>{Math.round(view.scale * 100)}%</span><button onClick={() => zoom(1 / 1.15)} aria-label="Perkecil peta">−</button><button className="fit" onClick={() => setView(fitView(viewport, detail?.peta))}>Pas ke layar</button>
      </div><div className="canvas" ref={containerRef} role="img" aria-label={detail ? `Denah ${detail.peta.nama_peta} dengan ${filteredMarkers.length} penanda peralatan` : 'Area denah peta'}>
        {detailStatus === 'idle' && <div className="canvas-message">Pilih gedung dan lantai untuk membuka denah.</div>}
        {detailStatus === 'loading' && <div className="canvas-message" role="status">Memuat denah dan penanda…</div>}
        {detailStatus === 'error' && <div className="canvas-message error" role="alert">Detail peta gagal dimuat.<button onClick={() => setDetailRetry((value) => value + 1)}>Coba lagi</button></div>}
        {detailStatus === 'ready' && mapImage.error && <div className="canvas-message error" role="alert">Gambar denah tidak tersedia. Data penanda tetap dapat dibuka dari daftar.</div>}
        {detail && mapImage.image && <Stage width={viewport.width} height={viewport.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale} draggable dragBoundFunc={(position) => bounded({ ...position, scale: view.scale })} onDragEnd={(event) => { if (event.target === event.currentTarget) setView(bounded({ x: event.target.x(), y: event.target.y(), scale: view.scale })) }} onWheel={handleWheel}><Layer listening={false}><KonvaImage image={mapImage.image} width={detail.peta.width_px ?? mapImage.image.naturalWidth} height={detail.peta.height_px ?? mapImage.image.naturalHeight} shadowBlur={18} shadowOpacity={.18} /></Layer><Layer>{filteredMarkers.map((marker) => <MarkerNode key={marker.id} marker={marker} map={detail.peta} selected={marker.id === selectedMarkerId} draggable={editing} onSelect={() => editing ? setSelectedMarkerId(marker.id) : focusMarker(marker)} onMove={(x_ratio, y_ratio) => updateDraftMarker(marker.id, { x_ratio, y_ratio })} />)}</Layer></Stage>}
      </div></div>
    </section>
    {showWizard && <MapWizard onClose={() => setShowWizard(false)} onCreated={(id) => { setShowWizard(false); setActiveMapId(id); setMapsRetry((value) => value + 1) }} />}
  </main>
}

export default App
