export type Session = {
  id: number
  username: string
  nama_lengkap: string
  role: string
  capabilities: { lihat_peta: boolean; edit_peta: boolean; periksa_masalah_pemetaan: boolean }
  csrf: { name: string; hash: string }
}

export type MapRegion = { id: number; kode: string | null; nama: string; sublokasi: Array<{ id: number; kode: string | null; nama: string }> }
export type MapDraft = { id: number; status: 'draft' | 'siap_diedit'; revisi?: number; width_px?: number; height_px?: number; ukuran_byte?: number }
export type MapDraftInput = { gedung_id: number; kode_lantai: string; nama_lantai: string; urutan_lantai: number; nama_peta: string; lokasi_ids: number[] }

export type MapResolver = {
  peralatan: { id: number; nama_peralatan: string; is_aktif: boolean }
  pilihan: Array<MapSummary & { hubungan: 'penanda' | 'cakupan_lokasi'; penanda?: { id: number; x_ratio: number; y_ratio: number } }>
  default_peta_id: number | null
}

export type MapSummary = {
  id: number
  nama_peta: string
  kode_lantai: string
  nama_lantai: string
  urutan_lantai: number
  revisi: number
  status: 'siap_diedit' | 'terbit'
  checksum_sha256: string | null
  width_px: number | null
  height_px: number | null
  file_url: string | null
  thumbnail_url: string | null
  diubah_pada: string | null
  gedung: { id: number; kode: string; nama: string }
}

export type MapMarker = {
  id: number
  x_ratio: number
  y_ratio: number
  size_ratio: number
  rotation_deg: number
  z_index: number
  catatan: string | null
  lock_version: number
  ikon: { id: number; nama: string; file_url: string }
  peralatan: {
    id: number
    nama_peralatan: string
    scan_code: string | null
    ip_address: string | null
    kategori: string | null
    fasilitas: string | null
    user_status: string
    status: string
    is_aktif: boolean
    foto_url: string | null
    detail_url: string
  }
}

export type MapDetail = {
  peta: MapSummary
  lokasi: Array<{ id: number; kode: string; nama_lokasi: string }>
  penanda: MapMarker[]
}

export type MapIcon = { id: number; kategori_peralatan_id: number | null; nama: string; file_url: string; size_ratio_default: number }
export type MapEquipment = { id: number; nama_peralatan: string; scan_code: string | null; ip_address: string | null; kategori_peralatan_id: number | null; kategori: string | null; fasilitas: string | null; lokasi: string; user_status: string; status: string; is_aktif: boolean; foto_url: string | null }
export type MapEditorData = MapDetail & { ikon: MapIcon[]; peralatan: MapEquipment[] }
export type MarkerSaveInput = {
  revisi: number
  checksum_sha256: string
  penanda: Array<{ id: number | null; peralatan_id: number; ikon_peta_id: number; x_ratio: number; y_ratio: number; size_ratio: number; rotation_deg: number; catatan: string | null; lock_version: number }>
  hapus: Array<{ id: number; lock_version: number }>
}

export function filterMarkers(markers: MapMarker[], filters: { query: string; category: string; facility: string; status: string; userStatus: string }) {
  const needle = filters.query.trim().toLocaleLowerCase('id')
  return markers.filter(({ peralatan }) =>
    (!needle || `${peralatan.nama_peralatan} ${peralatan.scan_code ?? ''}`.toLocaleLowerCase('id').includes(needle))
    && (!filters.category || peralatan.kategori === filters.category)
    && (!filters.facility || peralatan.fasilitas === filters.facility)
    && (!filters.status || peralatan.status === filters.status)
    && (!filters.userStatus || peralatan.user_status === filters.userStatus))
}

export function equipmentStatusTone(peralatan: Pick<MapMarker['peralatan'], 'is_aktif' | 'status' | 'user_status'>) {
  if (!peralatan.is_aktif || peralatan.status.toLocaleLowerCase('id').includes('nonaktif')) return { color: '#66737a', label: 'Nonaktif' }
  const status = peralatan.user_status.toLocaleLowerCase('id')
  if (status.includes('rusak')) return { color: '#c43d3d', label: 'Rusak' }
  if (status.includes('perbaikan')) return { color: '#d98216', label: 'Dalam perbaikan' }
  if (status.includes('standby')) return { color: '#2e75b6', label: 'Standby' }
  if (status.includes('operasi')) return { color: '#258457', label: 'Beroperasi' }
  return { color: '#173b51', label: peralatan.user_status || peralatan.status || 'Status lain' }
}

type Requester = (input: string, init?: RequestInit) => Promise<Response>
let csrf: Session['csrf'] | null = null

export class SessionExpiredError extends Error {}
export class ForbiddenError extends Error {}
export class ConflictError extends Error {}

async function getData<T>(url: string, request: Requester, signal?: AbortSignal): Promise<T> {
  const response = await request(url, { credentials: 'same-origin', signal })
  if (response.status === 401) throw new SessionExpiredError('Sesi telah berakhir.')
  if (response.status === 403) throw new ForbiddenError('Akses ditolak.')
  if (!response.ok) throw new Error(`Permintaan gagal (${response.status}).`)
  return (await response.json() as { data: T }).data
}

export async function loadBootstrap(search: string, request: Requester = fetch, signal?: AbortSignal) {
  const session = await getData<Session>('/api/v1/me', request, signal)
  csrf = session.csrf
  const rawId = new URLSearchParams(search).get('peralatan_id')
  const peralatanId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null
  const resolver = peralatanId === null
    ? null
    : await getData<MapResolver>(`/api/v1/peralatan/${peralatanId}/peta`, request, signal)

  return { session, resolver }
}

export const loadMaps = (request: Requester = fetch, signal?: AbortSignal) =>
  getData<MapSummary[]>('/api/v1/peta', request, signal)

export const loadMapDetail = (id: number, request: Requester = fetch, signal?: AbortSignal) =>
  getData<MapDetail>(`/api/v1/peta/${id}`, request, signal)

export const loadEditableMaps = (request: Requester = fetch, signal?: AbortSignal) =>
  getData<MapSummary[]>('/api/v1/peta/editor', request, signal)

export const loadMapEditor = (id: number, request: Requester = fetch, signal?: AbortSignal) =>
  getData<MapEditorData>(`/api/v1/peta/${id}/editor`, request, signal)

export const loadMapRegions = (request: Requester = fetch, signal?: AbortSignal) =>
  getData<MapRegion[]>('/api/v1/peta/referensi/wilayah', request, signal)

async function mutate<T>(url: string, body: object | FormData, request: Requester): Promise<T> {
  if (!csrf) throw new Error('Token keamanan belum tersedia. Muat ulang halaman.')
  const form = body instanceof FormData
  if (form) body.append(csrf.name, csrf.hash)
  const response = await request(url, {
    method: 'POST', credentials: 'same-origin',
    headers: form ? undefined : { 'Content-Type': 'application/json' },
    body: form ? body : JSON.stringify({ ...body, [csrf.name]: csrf.hash }),
  })
  const payload = await response.json() as { data?: T; csrf?: Session['csrf']; error?: { message?: string } }
  if (payload.csrf) csrf = payload.csrf
  if (response.status === 409) throw new ConflictError(payload.error?.message || 'Data telah berubah.')
  if (!response.ok || !payload.data) throw new Error(payload.error?.message || `Permintaan gagal (${response.status}).`)
  return payload.data
}

export const createMapDraft = (input: MapDraftInput, request: Requester = fetch) =>
  mutate<MapDraft>('/api/v1/peta', input, request)

export const uploadMapImage = (id: number, file: File, request: Requester = fetch) => {
  const body = new FormData()
  body.append('gambar', file)
  return mutate<MapDraft>(`/api/v1/peta/${id}/gambar`, body, request)
}

export const uploadMapIcon = (input: { nama_ikon: string; kategori_peralatan_id: number | null; size_ratio_default: number }, file: File, request: Requester = fetch) => {
  const body = new FormData()
  body.append('nama_ikon', input.nama_ikon)
  if (input.kategori_peralatan_id !== null) body.append('kategori_peralatan_id', String(input.kategori_peralatan_id))
  body.append('size_ratio_default', String(input.size_ratio_default))
  body.append('gambar', file)
  return mutate<MapIcon>('/api/v1/peta/ikon', body, request)
}

export const saveMapMarkers = (id: number, input: MarkerSaveInput, request: Requester = fetch) =>
  mutate<MapEditorData>(`/api/v1/peta/${id}/penanda`, input, request)

export const publishMap = (id: number, request: Requester = fetch) =>
  mutate<MapEditorData>(`/api/v1/peta/${id}/terbitkan`, {}, request)

export async function resolveScanCode(code: string, request: Requester = fetch) {
  if (!csrf) throw new Error('Token keamanan belum tersedia. Muat ulang halaman.')
  const body = new URLSearchParams({ scan_code: code, [csrf.name]: csrf.hash })
  const response = await request('/scan/resolve', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body })
  const payload = await response.json() as { ok?: boolean; redirect_url?: string; message?: string; csrf_hash?: string }
  if (payload.csrf_hash) csrf = { ...csrf, hash: payload.csrf_hash }
  if (!response.ok || !payload.ok || !payload.redirect_url) throw new Error(payload.message || 'Scan Code tidak ditemukan.')
  return payload.redirect_url
}
