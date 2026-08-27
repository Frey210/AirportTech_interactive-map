import { useMemo, useState } from 'react'
import type { MapEditorData, MapMarker } from './api'

type Props = {
  data: MapEditorData
  markers: MapMarker[]
  selectedId: number | null
  dirty: boolean
  saving: boolean
  error: string
  onSelect: (id: number) => void
  onAdd: (equipmentId: number, iconId: number) => void
  onUpdate: (id: number, patch: Partial<MapMarker>) => void
  onDelete: (id: number) => void
  onSave: () => void
  onCancel: () => void
  onReload: () => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export default function MapEditorPanel({ data, markers, selectedId, dirty, saving, error, onSelect, onAdd, onUpdate, onDelete, onSave, onCancel, onReload }: Props) {
  const [equipmentId, setEquipmentId] = useState(0)
  const used = useMemo(() => new Set(markers.map((marker) => marker.peralatan.id)), [markers])
  const candidates = data.peralatan.filter((item) => !used.has(item.id))
  const equipment = data.peralatan.find((item) => item.id === equipmentId)
  const defaultIcon = data.ikon.find((icon) => icon.kategori_peralatan_id === equipment?.kategori_peralatan_id) ?? data.ikon[0]
  const selected = markers.find((marker) => marker.id === selectedId)

  return <div className="editor-panel">
    <div className="editor-heading"><div><span className="section-label">MODE EDITOR</span><strong>{dirty ? 'Perubahan belum disimpan' : 'Semua perubahan tersimpan'}</strong></div><span className={dirty ? 'dirty-dot' : 'saved-dot'} aria-hidden="true" /></div>
    {error && <div className="error" role="alert">{error}<button type="button" onClick={onReload}>Muat ulang data</button></div>}

    <section><label htmlFor="editor-equipment">Tambah peralatan</label><select id="editor-equipment" value={equipmentId || ''} onChange={(event) => setEquipmentId(Number(event.target.value))}><option value="">Pilih peralatan dalam cakupan</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.nama_peralatan} · {item.lokasi}</option>)}</select><button className="new-map" type="button" disabled={!equipment || !defaultIcon} onClick={() => { if (equipment && defaultIcon) { onAdd(equipment.id, defaultIcon.id); setEquipmentId(0) } }}>Tambahkan di tengah peta</button><small>Alternatif keyboard/sentuh untuk menempatkan penanda tanpa drag.</small></section>

    <div className="marker-list editor-markers" aria-label="Penanda dalam editor">{markers.map((marker) => <button type="button" key={marker.id} className={marker.id === selectedId ? 'active' : ''} onClick={() => onSelect(marker.id)} aria-pressed={marker.id === selectedId}><strong>{marker.peralatan.nama_peralatan}</strong><small>{Math.round(marker.x_ratio * 1000) / 10}% · {Math.round(marker.y_ratio * 1000) / 10}%</small></button>)}{markers.length === 0 && <p className="empty">Belum ada penanda. Pilih peralatan lalu tambahkan ke tengah peta.</p>}</div>

    {selected && <section className="marker-inspector"><span className="section-label">INSPEKTOR PENANDA</span><h2>{selected.peralatan.nama_peralatan}</h2><fieldset className="icon-palette"><legend>Ikon</legend>{data.ikon.map((icon) => <button type="button" key={icon.id} onClick={() => onUpdate(selected.id, { ikon: { id: icon.id, nama: icon.nama, file_url: icon.file_url } })} aria-pressed={selected.ikon.id === icon.id}><img src={icon.file_url} alt="" width="28" height="28" /><span>{icon.nama}</span></button>)}</fieldset><div className="inspector-grid"><label>Posisi X (%)<input type="number" min="0" max="100" step="0.1" value={Math.round(selected.x_ratio * 1000) / 10} onChange={(event) => onUpdate(selected.id, { x_ratio: clamp(Number(event.target.value) / 100, 0, 1) })} /></label><label>Posisi Y (%)<input type="number" min="0" max="100" step="0.1" value={Math.round(selected.y_ratio * 1000) / 10} onChange={(event) => onUpdate(selected.id, { y_ratio: clamp(Number(event.target.value) / 100, 0, 1) })} /></label><label>Ukuran (%)<input type="number" min="0.5" max="20" step="0.5" value={Math.round(selected.size_ratio * 1000) / 10} onChange={(event) => onUpdate(selected.id, { size_ratio: clamp(Number(event.target.value) / 100, .005, .2) })} /></label><label>Rotasi (°)<input type="number" step="1" value={Math.round(selected.rotation_deg)} onChange={(event) => onUpdate(selected.id, { rotation_deg: Number(event.target.value) })} /></label></div><div className="nudge-controls" aria-label="Geser penanda dengan tombol"><button type="button" onClick={() => onUpdate(selected.id, { y_ratio: clamp(selected.y_ratio - .005, 0, 1) })}>↑ Atas</button><button type="button" onClick={() => onUpdate(selected.id, { x_ratio: clamp(selected.x_ratio - .005, 0, 1) })}>← Kiri</button><button type="button" onClick={() => onUpdate(selected.id, { x_ratio: clamp(selected.x_ratio + .005, 0, 1) })}>Kanan →</button><button type="button" onClick={() => onUpdate(selected.id, { y_ratio: clamp(selected.y_ratio + .005, 0, 1) })}>↓ Bawah</button></div><label>Catatan<textarea maxLength={500} value={selected.catatan ?? ''} onChange={(event) => onUpdate(selected.id, { catatan: event.target.value })} /></label><button className="danger-button" type="button" onClick={() => onDelete(selected.id)}>Hapus penanda</button></section>}

    <div className="editor-actions"><button type="button" className="secondary" onClick={onCancel} disabled={saving}>Tutup editor</button><button type="button" className="primary" onClick={onSave} disabled={!dirty || saving}>{saving ? 'Menyimpan…' : 'Simpan perubahan'}</button></div>
  </div>
}
