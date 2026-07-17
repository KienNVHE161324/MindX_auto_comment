import { describe, it, expect, vi } from 'vitest'
import { extractLessonContent, rewriteComment } from './geminiClient'

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch
}
function okReply(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] }
}

describe('extractLessonContent', () => {
  it('trả text đã trim khi Gemini phản hồi hợp lệ', async () => {
    const out = await extractLessonContent('k', 'BASE64PDF', jsonFetch(okReply('  Nội dung bài 1  ')))
    expect(out).toBe('Nội dung bài 1')
  })
  it('gửi inline_data PDF trong request body', async () => {
    const fetchFn = jsonFetch(okReply('x'))
    await extractLessonContent('k', 'BASE64PDF', fetchFn)
    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(call[1].body as string)
    const parts = body.contents[0].parts
    expect(parts.some((p: { inline_data?: { data: string } }) => p.inline_data?.data === 'BASE64PDF')).toBe(true)
  })
  it('ném lỗi khi HTTP !ok', async () => {
    await expect(extractLessonContent('k', 'x', jsonFetch({}, 500))).rejects.toThrow(/HTTP 500/)
  })
  it('ném lỗi khi thiếu candidates', async () => {
    await expect(extractLessonContent('k', 'x', jsonFetch({}))).rejects.toThrow(/không trả về/i)
  })
})

describe('rewriteComment', () => {
  it('trả nhận xét đã viết lại', async () => {
    const out = await rewriteComment('k', 'An', 'ngoan', 'nhẹ nhàng', jsonFetch(okReply('Em An ngoan, tích cực.')))
    expect(out).toBe('Em An ngoan, tích cực.')
  })
  it('prompt chứa tên học sinh, nhận xét thô và văn phong', async () => {
    const fetchFn = jsonFetch(okReply('x'))
    await rewriteComment('k', 'An', 'ngoan', 'nghiêm túc', fetchFn)
    const body = JSON.parse((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string)
    const prompt = body.contents[0].parts[0].text as string
    expect(prompt).toContain('An')
    expect(prompt).toContain('ngoan')
    expect(prompt).toContain('nghiêm túc')
  })
})
