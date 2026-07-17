import { GeminiValidationResult } from '../../shared/types'

const MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MODEL = 'gemini-2.0-flash'
const GENERATE_ENDPOINT = `${MODELS_ENDPOINT}/${GEMINI_MODEL}:generateContent`

export interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

async function callGemini(
  apiKey: string,
  parts: GeminiPart[],
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(`${GENERATE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  })
  if (!res.ok) {
    throw new Error(`Gemini lỗi HTTP ${res.status}.`)
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (typeof text !== 'string') {
    throw new Error('Gemini không trả về nội dung.')
  }
  return text.trim()
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
  const prompt =
    `Viết lại nhận xét sau cho học sinh "${studentName}" theo văn phong: ${styleHint}. ` +
    'Giữ đúng ý gốc, không thêm thông tin bịa, độ dài khoảng 1-2 câu. Chỉ trả về câu nhận xét đã viết lại.\n' +
    `Nhận xét gốc: "${raw}"`
  return callGemini(apiKey, [{ text: prompt }], fetchFn)
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
