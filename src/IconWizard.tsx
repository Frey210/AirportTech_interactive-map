import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadMapIcon, type MapEditorData } from './api'

export default function IconWizard({ data, onClose, onCreated }: { data: MapEditorData; onClose: () => void; onCreated: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const categories = useMemo(() => [...new Map(data.peralatan.filter((item) => item.kategori_peralatan_id).map((item) => [item.kategori_peralatan_id!, item.kategori || `Kategori ${item.kategori_peralatan_id}`])).entries()], [data])
  const [name, setName] = useState('')
  const [category, setCategory] = useState<number | null>(null)
  const [size, setSize] = useState(4)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { dialog.current?.showModal() }, [])
  const submit = async () => {
    if (!name.trim() || !file) return setError('Nama dan gambar ikon wajib diisi.')
    if (file.size > 1024 * 1024) return setError('Ukuran file ikon maksimal 1 MiB.')
    setSaving(true); setError('')
    try {
      const bitmap = await createImageBitmap(file)
      const valid = bitmap.width >= 16 && bitmap.height >= 16 && Math.max(bitmap.width, bitmap.height) <= 512
      bitmap.close()
      if (!valid) throw new Error('Dimensi ikon harus 16–512 piksel.')
      await uploadMapIcon({ nama_ikon: name.trim(), kategori_peralatan_id: category, size_ratio_default: size / 100 }, file)
      onCreated()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ikon gagal disimpan.')
    } finally { setSaving(false) }
  }

  return <dialog ref={dialog} className="map-wizard icon-wizard" onCancel={(event) => { event.preventDefault(); onClose() }}>
    <form method="dialog" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <header><div><span className="section-label">PENGELOLAAN IKON</span><h2>Tambah variasi ikon</h2></div><button type="button" className="close-detail" onClick={onClose} aria-label="Tutup pengelolaan ikon">×</button></header>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="wizard-body icon-fields">
        <label>Nama ikon<input autoFocus maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: CCTV dome" /></label>
        <label>Kategori peralatan<select value={category ?? ''} onChange={(event) => setCategory(event.target.value ? Number(event.target.value) : null)}><option value="">Semua kategori</option>{categories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Ukuran default ({size}%)<input type="range" min="0.5" max="20" step="0.5" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
        <label className="file-drop">Gambar ikon<input type="file" required accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span>PNG, JPEG, atau WebP · 16–512 px · maks. 1 MiB</span>{file && <strong>{file.name}</strong>}</label>
      </div>
      <footer><button type="button" className="secondary" onClick={onClose}>Batal</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan ikon'}</button></footer>
    </form>
  </dialog>
}
