import { describe, expect, it, vi } from 'vitest'
import { ConflictError, createMapDraft, equipmentStatusTone, filterMarkers, ForbiddenError, loadBootstrap, loadMapDetail, loadMaps, saveMapMarkers, SessionExpiredError, uploadMapIcon, type MapMarker } from './api'

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

  it('mengirim token CSRF saat membuat draft peta', async () => {
    await loadBootstrap('', () => json({ data: { id: 1, username: 'admin', nama_lengkap: 'Admin', role: 'admin', capabilities: {}, csrf: { name: 'csrf_test_name', hash: 'aman' } } }))
    const request = vi.fn((_url: string, _init?: RequestInit) => json({ data: { id: 9, status: 'draft' }, csrf: { name: 'csrf_test_name', hash: 'baru' } }, 201))

    await expect(createMapDraft({ gedung_id: 1, kode_lantai: 'L1', nama_lantai: 'Lantai 1', urutan_lantai: 1, nama_peta: 'Denah', lokasi_ids: [2] }, request)).resolves.toMatchObject({ id: 9 })
    expect(JSON.parse((request.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ csrf_test_name: 'aman', gedung_id: 1 })
  })

  it('membedakan konflik lock version saat menyimpan penanda', async () => {
    await loadBootstrap('', () => json({ data: { id: 1, username: 'admin', nama_lengkap: 'Admin', role: 'admin', capabilities: {}, csrf: { name: 'csrf_test_name', hash: 'aman' } } }))
    const request = vi.fn((_url: string, _init?: RequestInit) => json({ error: { message: 'Versi lama.' }, csrf: { name: 'csrf_test_name', hash: 'baru' } }, 409))

    await expect(saveMapMarkers(7, { revisi: 1, checksum_sha256: 'abc', penanda: [], hapus: [] }, request)).rejects.toBeInstanceOf(ConflictError)
  })

  it('memberi warna penanda sesuai status operasional', () => {
    expect(equipmentStatusTone({ is_aktif: true, status: 'Aktif', user_status: 'Beroperasi' })).toMatchObject({ color: '#258457' })
    expect(equipmentStatusTone({ is_aktif: true, status: 'Aktif', user_status: 'Rusak' })).toMatchObject({ color: '#c43d3d' })
    expect(equipmentStatusTone({ is_aktif: false, status: 'Nonaktif', user_status: 'Beroperasi' })).toMatchObject({ color: '#66737a' })
  })

  it('mengunggah ikon sebagai FormData beserta CSRF', async () => {
    await loadBootstrap('', () => json({ data: { id: 1, username: 'admin', nama_lengkap: 'Admin', role: 'admin', capabilities: {}, csrf: { name: 'csrf_test_name', hash: 'aman' } } }))
    const request = vi.fn((_url: string, _init?: RequestInit) => json({ data: { id: 3, nama: 'CCTV', file_url: '/cctv.png', kategori_peralatan_id: 2, size_ratio_default: .04 } }, 201))
    await uploadMapIcon({ nama_ikon: 'CCTV', kategori_peralatan_id: 2, size_ratio_default: .04 }, new File(['ikon'], 'cctv.png', { type: 'image/png' }), request)
    const body = (request.mock.calls[0][1] as RequestInit).body as FormData
    expect(request.mock.calls[0][0]).toBe('/api/v1/peta/ikon')
    expect(body.get('nama_ikon')).toBe('CCTV')
    expect(body.get('csrf_test_name')).toBe('aman')
  })
})
