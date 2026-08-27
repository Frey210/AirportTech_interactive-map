import { describe, expect, it, vi } from 'vitest'
import { filterMarkers, ForbiddenError, loadBootstrap, loadMapDetail, loadMaps, SessionExpiredError, type MapMarker } from './api'

const json = (data: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' },
}))

describe('loadBootstrap', () => {
  it('memakai sesi dan hanya memanggil resolver untuk id numerik', async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => json({ data: { id: 1, username: 'admin', nama_lengkap: 'Admin', role: 'admin', capabilities: {} } }))
      .mockImplementationOnce(() => json({ data: { peralatan: { id: 12 }, pilihan: [], default_peta_id: null } }))

    const result = await loadBootstrap('?peralatan_id=12', request)

    expect(result.resolver?.peralatan.id).toBe(12)
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/peralatan/12/peta', expect.anything())
  })

  it('membedakan sesi berakhir dari gangguan jaringan', async () => {
    await expect(loadBootstrap('', () => json({ error: {} }, 401))).rejects.toBeInstanceOf(SessionExpiredError)
    await expect(loadBootstrap('', () => json({ error: {} }, 403))).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('meminta daftar dan detail peta dari endpoint read-only', async () => {
    const request = vi.fn()
      .mockImplementationOnce(() => json({ data: [{ id: 4 }] }))
      .mockImplementationOnce(() => json({ data: { peta: { id: 4 }, lokasi: [], penanda: [] } }))

    await expect(loadMaps(request)).resolves.toEqual([{ id: 4 }])
    await expect(loadMapDetail(4, request)).resolves.toMatchObject({ peta: { id: 4 } })
    expect(request).toHaveBeenNthCalledWith(1, '/api/v1/peta', expect.anything())
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/peta/4', expect.anything())
  })

  it('menyaring penanda menurut pencarian dan filter aktif', () => {
    const marker = { peralatan: { nama_peralatan: 'UPS Ruang Server', scan_code: 'UPS-001', kategori: 'Kelistrikan', fasilitas: 'Terminal', status: 'Normal', user_status: 'Digunakan' } } as MapMarker
    expect(filterMarkers([marker], { query: 'ups-001', category: 'Kelistrikan', facility: 'Terminal', status: 'Normal', userStatus: 'Digunakan' })).toEqual([marker])
    expect(filterMarkers([marker], { query: 'radio', category: '', facility: '', status: '', userStatus: '' })).toEqual([])
  })
})
