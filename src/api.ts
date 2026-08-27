export type Session = {
  id: number
  username: string
  nama_lengkap: string
  role: string
  capabilities: { lihat_peta: boolean; edit_peta: boolean; periksa_masalah_pemetaan: boolean }
}

export type MapResolver = {
  peralatan: { id: number; nama_peralatan: string; is_aktif: boolean }
  pilihan: Array<{ id: number; nama_peta: string; nama_lantai: string; hubungan: 'penanda' | 'cakupan_lokasi' }>
  default_peta_id: number | null
}

type Requester = (input: string, init?: RequestInit) => Promise<Response>

export class SessionExpiredError extends Error {}
export class ForbiddenError extends Error {}

async function getData<T>(url: string, request: Requester, signal?: AbortSignal): Promise<T> {
  const response = await request(url, { credentials: 'same-origin', signal })
  if (response.status === 401) throw new SessionExpiredError('Sesi telah berakhir.')
  if (response.status === 403) throw new ForbiddenError('Akses ditolak.')
  if (!response.ok) throw new Error(`Permintaan gagal (${response.status}).`)
  return (await response.json() as { data: T }).data
}

export async function loadBootstrap(search: string, request: Requester = fetch, signal?: AbortSignal) {
  const session = await getData<Session>('/api/v1/me', request, signal)
  const rawId = new URLSearchParams(search).get('peralatan_id')
  const peralatanId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null
  const resolver = peralatanId === null
    ? null
    : await getData<MapResolver>(`/api/v1/peralatan/${peralatanId}/peta`, request, signal)

  return { session, resolver }
}
