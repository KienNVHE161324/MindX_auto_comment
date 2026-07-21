import { GeminiValidationResult } from '../../shared/types'

const MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MODEL = 'gemini-flash-latest'
const GENERATE_ENDPOINT = `${MODELS_ENDPOINT}/${GEMINI_MODEL}:generateContent`

export interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

// Các mã lỗi tạm thời (model quá tải / rate limit / lỗi máy chủ) — nên thử lại.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 3

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

async function callGemini(
  apiKey: string,
  parts: GeminiPart[],
  fetchFn: typeof fetch = fetch,
  baseDelayMs = 600,
): Promise<string> {
  let lastError = 'Không rõ lỗi'

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetchFn(`${GENERATE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    })

    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (typeof text !== 'string') {
        throw new Error('Gemini không trả về nội dung.')
      }
      return text.trim()
    }

    let detail = ''
    try {
      const errBody = (await res.json()) as { error?: { message?: string } }
      if (errBody.error?.message) detail = ` — ${errBody.error.message}`
    } catch { /* bỏ qua nếu body không phải JSON */ }

    // Còn lượt thử và lỗi thuộc loại tạm thời → chờ (exponential backoff) rồi thử lại.
    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
      lastError = `HTTP ${res.status}${detail}`
      await sleep(baseDelayMs * 2 ** attempt)
      continue
    }

    if (res.status === 429) {
      throw new Error(`Gemini 429 (quota/rate limit)${detail}`)
    }
    if (res.status === 503) {
      throw new Error(`Gemini đang quá tải (503) — đã thử lại ${MAX_RETRIES} lần vẫn lỗi. Thử lại sau ít phút.${detail}`)
    }
    throw new Error(`Gemini lỗi HTTP ${res.status}${detail}`)
  }

  throw new Error(`Gemini lỗi sau ${MAX_RETRIES} lần thử: ${lastError}`)
}

export function extractLessonContent(
  apiKey: string,
  pdfBase64: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const prompt =
    'Đây là tài liệu PDF của một buổi học. Hãy trích đúng phần NỘI DUNG CHÍNH của buổi học, ' +
    'giữ nguyên ý, trình bày gọn theo gạch đầu dòng bằng tiếng Việt. Chỉ trả về nội dung bài học, không thêm lời dẫn.'
  return callGemini(
    apiKey,
    [{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } }],
    fetchFn,
  )
}

export function rewriteComment(
  apiKey: string,
  studentName: string,
  raw: string,
  styleHint: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  // Tách dữ liệu người dùng (tên, nhận xét thô) khỏi phần chỉ dẫn bằng nhãn + dấu phân cách,
  // không nội suy vào trong dấu nháy để tránh phá ranh giới prompt / prompt-injection.
  const prompt =
    'Bạn là trợ lý giúp giáo viên viết lại nhận xét học sinh cho khách quan, đúng mực.\n' +
    `Văn phong yêu cầu: ${styleHint}\n` +
    'Giữ đúng ý gốc, KHÔNG thêm thông tin bịa, độ dài khoảng 1-2 câu. ' +
    'Chỉ trả về câu nhận xét đã viết lại, không thêm lời dẫn.\n' +
    `Tên học sinh: ${studentName}\n` +
    'Nhận xét thô của giáo viên (giữa hai dấu phân cách):\n' +
    '---\n' +
    raw +
    '\n---'
  return callGemini(apiKey, [{ text: prompt }], fetchFn)
}

/**
 * Viết lại nhận xét cho NHIỀU học sinh trong 1 request (tiết kiệm token: chỉ dẫn gửi 1 lần).
 * Trả về mảng cùng độ dài & thứ tự với `items`; HS nào Gemini bỏ sót thì giữ nguyên nhận xét thô.
 */
export async function rewriteCommentsBatch(
  apiKey: string,
  items: { name: string; raw: string }[],
  styleHint: string,
  fetchFn: typeof fetch = fetch,
): Promise<string[]> {
  if (items.length === 0) return []

  const list = items.map((it, i) => `${i + 1}. ${it.name} — ${it.raw}`).join('\n')
  const prompt =
    'Bạn là trợ lý giúp giáo viên viết lại nhận xét học sinh cho khách quan, đúng mực.\n' +
    `Văn phong yêu cầu: ${styleHint}\n` +
    'Với MỖI học sinh dưới đây, viết lại nhận xét: giữ đúng ý gốc, KHÔNG thêm thông tin bịa, độ dài 1-2 câu.\n' +
    'CHỈ trả về một mảng JSON hợp lệ, mỗi phần tử dạng {"i": <số thứ tự>, "text": "<nhận xét đã viết lại>"}, ' +
    'đúng thứ tự, KHÔNG kèm giải thích, KHÔNG bọc trong ```.\n' +
    'Danh sách (mỗi dòng: "số. Tên — nhận xét thô"):\n' +
    '---\n' +
    list +
    '\n---'

  const reply = await callGemini(apiKey, [{ text: prompt }], fetchFn)
  const parsed = parseBatchReply(reply)

  // Ghép theo chỉ số i (1-based). Thiếu → giữ nguyên raw.
  return items.map((it, idx) => {
    const found = parsed.find(p => p.i === idx + 1)
    return found?.text?.trim() || it.raw
  })
}

function parseBatchReply(reply: string): { i: number; text: string }[] {
  // Gỡ rào ```json ... ``` nếu model lỡ bọc.
  const cleaned = reply.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try {
    const arr = JSON.parse(cleaned) as unknown
    if (Array.isArray(arr)) {
      return arr
        .filter((x): x is { i: number; text: string } =>
          typeof x === 'object' && x !== null && typeof (x as { i?: unknown }).i === 'number',
        )
        .map(x => ({ i: x.i, text: String((x as { text?: unknown }).text ?? '') }))
    }
  } catch { /* rơi xuống fallback */ }
  return []
}

export async function validateGeminiApiKey(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeminiValidationResult> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key đang trống.' }
  }
  try {
    const res = await fetchFn(`${MODELS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`)
    if (res.ok) return { valid: true }
    if (res.status === 400 || res.status === 403) {
      return { valid: false, error: 'API key không hợp lệ.' }
    }
    return { valid: false, error: `Lỗi máy chủ Gemini (HTTP ${res.status}).` }
  } catch (err) {
    return { valid: false, error: `Lỗi kết nối: ${(err as Error).message}` }
  }
}
