export type StorageBackend = 'local' | 'supabase'

export interface AppConfig {
  storageBackend: StorageBackend
  localFolderPath: string | null
  geminiApiKey: string | null
  zaloMessageTemplate: string
}

export interface GeminiValidationResult {
  valid: boolean
  error?: string
}

export const DEFAULT_ZALO_TEMPLATE = `@All Em xin gửi nhận xét buổi học của các học sinh lớp {ten_lop} ngày {ngay_buoi_hoc} ạ
Nội dung bài học:
{noi_dung_bai_hoc}
Nhận xét từng học sinh:
{danh_sach_nhan_xet}
Bài tập về nhà:
{bai_tap_ve_nha}
Cảm ơn phụ huynh và các con!`

export const DEFAULT_CONFIG: AppConfig = {
  storageBackend: 'local',
  localFolderPath: null,
  geminiApiKey: null,
  zaloMessageTemplate: DEFAULT_ZALO_TEMPLATE,
}

export const IPC = {
  getConfig: 'config:get',
  updateConfig: 'config:update',
  validateGeminiKey: 'gemini:validateKey',
  pickFolder: 'dialog:pickFolder',
} as const

export interface AppApi {
  getConfig(): Promise<AppConfig>
  updateConfig(patch: Partial<AppConfig>): Promise<AppConfig>
  validateGeminiKey(apiKey: string): Promise<GeminiValidationResult>
  pickFolder(): Promise<string | null>
}
