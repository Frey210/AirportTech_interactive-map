import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createMapDraft, loadMapRegions, uploadMapImage, type MapDraftInput, type MapRegion } from './api'

const MAX_BYTES = 12 * 1024 * 1024
const MAX_SIDE = 8192
const MAX_PIXELS = 40_000_000
const STEPS = ['Gedung', 'Lantai', 'Cakupan', 'Denah', 'Konfirmasi']

export async function inspectMapFile(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_BYTES) {
    throw new Error('Gunakan JPEG, PNG, atau WebP maksimal 12 MiB.')
  }
  const image = await createImageBitmap(file)
  const result = { width: image.width, height: image.height }
  image.close()
  if (max(result.width, result.height) > MAX_SIDE || result.width * result.height > MAX_PIXELS) {
    throw new Error('Gambar maksimal 8192 px pada sisi terpanjang dan 40 megapiksel.')
  }
  return result
}

const max = Math.max

export default function MapWizard({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: number) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [regions, setRegions] = useState<MapRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [input, setInput] = useState<MapDraftInput>({ gedung_id: 0, kode_lantai: '', nama_lantai: '', urutan_lantai: 0, nama_peta: '', lokasi_ids: [] })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [error, setError] = useState('')
  const [draftId, setDraftId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const selectedRegion = useMemo(() => regions.find((item) => item.id === input.gedung_id), [regions, input.gedung_id])

  useEffect(() => {
    dialog.current?.showModal()
    const controller = new AbortController()
    loadMapRegions(fetch, controller.signal).then(setRegions).catch(() => setError('Wilayah gagal dimuat. Tutup lalu coba lagi.')).finally(() => setLoading(false))
    return () => controller.abort()
  }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const next = () => {
    setError('')
    if (step === 0 && !selectedRegion) return setError('Pilih gedung terlebih dahulu.')
    if (step === 1 && (!input.kode_lantai.trim() || !input.nama_lantai.trim() || !input.nama_peta.trim())) return setError('Kode, nama lantai, dan nama peta wajib diisi.')
    if (step === 2 && input.lokasi_ids.length === 0) return setError('Pilih minimal satu lokasi yang dicakup peta.')
    if (step === 3 && (!file || !dimensions)) return setError('Pilih gambar denah yang valid.')
    setStep((current) => current + 1)
  }

  const chooseFile = async (selected?: File) => {
    setFile(null); setDimensions(null); setPreview(''); setError('')
    if (!selected) return
    try {
      setDimensions(await inspectMapFile(selected)); setFile(selected); setPreview(URL.createObjectURL(selected))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gambar tidak dapat dibaca.')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (step < 4) return next()
    if (!file) return
    setSubmitting(true); setError('')
    let savedDraftId = draftId
    try {
      savedDraftId ??= (await createMapDraft(input)).id
      setDraftId(savedDraftId)
      const uploaded = await uploadMapImage(savedDraftId, file)
      if (uploaded.width_px && uploaded.height_px) setDimensions({ width: uploaded.width_px, height: uploaded.height_px })
      setDone(true)
    } catch (reason) {
      setError(`${reason instanceof Error ? reason.message : 'Peta gagal disimpan.'}${savedDraftId ? ' Draft tetap tersimpan; coba unggah lagi.' : ''}`)
    } finally {
      setSubmitting(false)
    }
  }

  return <dialog ref={dialog} className="map-wizard" onCancel={onClose} aria-labelledby="wizard-title">
    <form onSubmit={submit}>
      <header><div><span className="eyebrow">PENGATURAN PETA BARU</span><h2 id="wizard-title">{done ? 'Denah siap diedit' : STEPS[step]}</h2></div><button type="button" className="close-detail" onClick={onClose} aria-label="Tutup wizard">×</button></header>
      {!done && <ol className="wizard-steps" aria-label={`Langkah ${step + 1} dari ${STEPS.length}`}>{STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}</ol>}
      {error && <p className="error" role="alert" tabIndex={-1}>{error}</p>}

      {done ? <section className="wizard-done"><strong>Draft peta #{draftId} berhasil dibuat.</strong><p>Ukuran koordinat dikunci pada {dimensions?.width} × {dimensions?.height} px. Peta siap masuk ke editor penanda.</p></section>
      : <section className="wizard-body" aria-busy={loading || submitting}>
        {step === 0 && <label>Gedung<select autoFocus value={input.gedung_id || ''} disabled={loading} onChange={(event) => setInput({ ...input, gedung_id: Number(event.target.value), lokasi_ids: [] })}><option value="">Pilih gedung</option>{regions.map((item) => <option key={item.id} value={item.id}>{item.kode ? `${item.kode} — ` : ''}{item.nama}</option>)}</select></label>}
        {step === 1 && <div className="wizard-grid"><label>Kode lantai<input autoFocus maxLength={30} value={input.kode_lantai} onChange={(event) => setInput({ ...input, kode_lantai: event.target.value.toUpperCase() })} placeholder="Contoh: L1" /></label><label>Urutan lantai<input type="number" min={-99} max={999} value={input.urutan_lantai} onChange={(event) => setInput({ ...input, urutan_lantai: Number(event.target.value) })} /></label><label>Nama lantai<input maxLength={100} value={input.nama_lantai} onChange={(event) => setInput({ ...input, nama_lantai: event.target.value })} placeholder="Lantai 1" /></label><label>Nama peta<input maxLength={150} value={input.nama_peta} onChange={(event) => setInput({ ...input, nama_peta: event.target.value })} placeholder="Denah operasional lantai 1" /></label></div>}
        {step === 2 && <fieldset className="coverage"><legend>Lokasi yang tercakup di {selectedRegion?.nama}</legend>{selectedRegion?.sublokasi.length ? selectedRegion.sublokasi.map((item) => <label key={item.id}><input type="checkbox" checked={input.lokasi_ids.includes(item.id)} onChange={(event) => setInput({ ...input, lokasi_ids: event.target.checked ? [...input.lokasi_ids, item.id] : input.lokasi_ids.filter((id) => id !== item.id) })} /> <span>{item.nama}</span></label>) : <p className="empty">Gedung ini belum memiliki sublokasi aktif.</p>}</fieldset>}
        {step === 3 && <label className="file-drop">Gambar denah<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} /><span>JPEG, PNG, atau WebP · maksimal 12 MiB, 8192 px, dan 40 MP</span>{preview && <img src={preview} alt="Pratinjau denah terpilih" />}{file && dimensions && <strong>{file.name} · {dimensions.width} × {dimensions.height} px · {(file.size / 1024 / 1024).toFixed(1)} MiB</strong>}</label>}
        {step === 4 && <dl className="wizard-summary"><div><dt>Gedung</dt><dd>{selectedRegion?.nama}</dd></div><div><dt>Lantai</dt><dd>{input.kode_lantai} · {input.nama_lantai}</dd></div><div><dt>Cakupan</dt><dd>{input.lokasi_ids.length} lokasi</dd></div><div><dt>Denah</dt><dd>{file?.name}<br />{dimensions?.width} × {dimensions?.height} px</dd></div></dl>}
      </section>}

      <footer>{done ? <button type="button" className="primary" onClick={() => draftId ? onCreated?.(draftId) : onClose()}>Buka editor</button> : <><button type="button" className="secondary" onClick={step === 0 ? onClose : () => { setError(''); setStep(step - 1) }} disabled={submitting}>{step === 0 ? 'Batal' : 'Kembali'}</button><button type="submit" className="primary" disabled={loading || submitting}>{submitting ? 'Menyimpan…' : step === 4 ? (draftId ? 'Coba unggah lagi' : 'Buat peta') : 'Lanjut'}</button></>}</footer>
    </form>
  </dialog>
}
