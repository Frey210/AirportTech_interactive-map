import { describe, expect, it, vi } from 'vitest'
import { ForbiddenError, loadBootstrap, SessionExpiredError } from './api'

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
})
