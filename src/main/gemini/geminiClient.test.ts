import { describe, it, expect, vi } from 'vitest'
import { validateGeminiApiKey } from './geminiClient'

function fakeFetch(status: number): typeof fetch {
  return vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch
}

describe('validateGeminiApiKey', () => {
  it('key rỗng → không hợp lệ, không gọi mạng', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const res = await validateGeminiApiKey('', fetchFn)
    expect(res.valid).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('HTTP 200 → hợp lệ', async () => {
    const res = await validateGeminiApiKey('good-key', fakeFetch(200))
    expect(res.valid).toBe(true)
  })

  it('HTTP 400 → key sai', async () => {
    const res = await validateGeminiApiKey('bad', fakeFetch(400))
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/không hợp lệ/i)
  })

  it('HTTP 403 → key sai', async () => {
    const res = await validateGeminiApiKey('bad', fakeFetch(403))
    expect(res.valid).toBe(false)
  })

  it('HTTP 500 → lỗi máy chủ', async () => {
    const res = await validateGeminiApiKey('k', fakeFetch(500))
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/máy chủ/i)
  })

  it('fetch ném lỗi mạng → báo lỗi kết nối', async () => {
    const fetchFn = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const res = await validateGeminiApiKey('k', fetchFn)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/kết nối/i)
  })

  it('gửi key qua query param đã encode', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    await validateGeminiApiKey('a b&c', fetchFn)
    const calledUrl = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('key=a%20b%26c')
  })
})
