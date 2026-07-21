import { describe, it, expect, vi } from 'vitest'
import { extractLessonContent, rewriteComment, rewriteCommentsBatch, setGeminiModel } from './geminiClient'
import { DEFAULT_GEMINI_MODEL } from '../../shared/types'

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
  it('ném lỗi khi HTTP !ok (lỗi không thể thử lại, vd 400)', async () => {
    await expect(extractLessonContent('k', 'x', jsonFetch({}, 400))).rejects.toThrow(/HTTP 400/)
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

describe('setGeminiModel', () => {
  it('đổi model -> endpoint dùng model mới, rồi khôi phục mặc định', async () => {
    try {
      setGeminiModel('gemini-2.0-flash')
      const fetchFn = jsonFetch(okReply('x'))
      await rewriteComment('k', 'An', 'ngoan', 'x', fetchFn)
      const url = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain('gemini-2.0-flash:generateContent')
    } finally {
      setGeminiModel(DEFAULT_GEMINI_MODEL)
    }
  })

  it('giá trị rỗng -> giữ nguyên model hiện tại', async () => {
    setGeminiModel('')
    const fetchFn = jsonFetch(okReply('x'))
    await rewriteComment('k', 'An', 'ngoan', 'x', fetchFn)
    const url = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain(`${DEFAULT_GEMINI_MODEL}:generateContent`)
  })
})

describe('rewriteCommentsBatch (gộp 1 request)', () => {
  it('gửi đúng 1 request cho nhiều HS và ghép kết quả theo thứ tự', async () => {
    const reply = JSON.stringify([
      { i: 1, text: 'Em An tiến bộ.' },
      { i: 2, text: 'Em Bình tích cực.' },
    ])
    const fetchFn = jsonFetch(okReply(reply))
    const out = await rewriteCommentsBatch(
      'k',
      [{ name: 'An', raw: 'ngoan' }, { name: 'Bình', raw: 'ok' }],
      'thân thiện',
      fetchFn,
    )
    expect(out).toEqual(['Em An tiến bộ.', 'Em Bình tích cực.'])
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('bỏ rào ```json và vẫn parse được', async () => {
    const reply = '```json\n[{"i":1,"text":"Em An tốt."}]\n```'
    const out = await rewriteCommentsBatch('k', [{ name: 'An', raw: 'ngoan' }], 'x', jsonFetch(okReply(reply)))
    expect(out).toEqual(['Em An tốt.'])
  })

  it('HS bị Gemini bỏ sót -> giữ nguyên nhận xét thô', async () => {
    const reply = JSON.stringify([{ i: 1, text: 'Em An tốt.' }]) // thiếu i=2
    const out = await rewriteCommentsBatch(
      'k',
      [{ name: 'An', raw: 'ngoan' }, { name: 'Bình', raw: 'nghịch' }],
      'x',
      jsonFetch(okReply(reply)),
    )
    expect(out).toEqual(['Em An tốt.', 'nghịch'])
  })

  it('mảng rỗng -> không gọi mạng', async () => {
    const fetchFn = jsonFetch(okReply('[]'))
    const out = await rewriteCommentsBatch('k', [], 'x', fetchFn)
    expect(out).toEqual([])
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })
})

describe('Gemini tự thử lại khi model quá tải', () => {
  function seqFetch(statuses: number[]): typeof fetch {
    let i = 0
    return vi.fn(async () => {
      const status = statuses[Math.min(i, statuses.length - 1)]
      i++
      const body = status === 200 ? okReply('Em An ngoan.') : { error: { message: 'high demand' } }
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch
  }

  it('503 một lần rồi 200 -> thành công (2 lần gọi)', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = seqFetch([503, 200])
      const p = rewriteComment('k', 'An', 'ngoan', 'x', fetchFn)
      await vi.runAllTimersAsync()
      await expect(p).resolves.toBe('Em An ngoan.')
      expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('503 liên tục -> ném lỗi sau 1 + 3 lần thử', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn = seqFetch([503])
      const p = rewriteComment('k', 'An', 'ngoan', 'x', fetchFn)
      const assertion = expect(p).rejects.toThrow(/quá tải|503/i)
      await vi.runAllTimersAsync()
      await assertion
      expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(4)
    } finally {
      vi.useRealTimers()
    }
  })
})
