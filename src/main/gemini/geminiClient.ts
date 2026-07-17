import { GeminiValidationResult } from '../../shared/types'

const MODELS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

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
