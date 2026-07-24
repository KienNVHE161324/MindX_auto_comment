export type StorageBackend = 'local' | 'supabase'

export interface AppConfig {
  storageBackend: StorageBackend
  localFolderPath: string | null
  geminiApiKey: string | null
  /** Model Gemini dùng để sinh nội dung (đổi khi hết quota 1 model). */
  geminiModel: string
  zaloMessageTemplate: string
  commentStyleHint: string
  lmsEmail: string | null
  lmsPassword: string | null
}

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest'

export interface GeminiValidationResult {
  valid: boolean
  error?: string
}

export interface Student {
  id: string
  name: string
  note?: string
  /** true khi HS đã nghỉ học dài hạn — loại khỏi cả Zalo lẫn LMS ở mọi buổi. */
  droppedOut?: boolean
}

export interface ClassSession {
  id: string
  /** ISO 8601 datetime của buổi học, vd "2026-07-20T18:00:00" */
  dateTime: string
  label?: string
}

export interface AutoSendConfig {
  time: string
  lmsEnabled: boolean
  zaloEnabled: boolean
}

/** Dạng dữ liệu đã lưu trước khi tách công tắc LMS/Zalo. */
export interface LegacyAutoSendConfig {
  enabled: boolean
  time: string
}

export interface SchoolClass {
  id: string
  code: string
  name: string
  students: Student[]
  sessions: ClassSession[]
  autoSend?: AutoSendConfig
}

export interface StudentComment {
  studentId: string
  raw: string
  polished: string
}

export interface SessionContent {
  id: string
  classId: string
  sessionId: string
  lessonContent: string
  homework: string
  comments: StudentComment[]
  absentStudentIds?: string[]
  /** HS được LMS xác nhận CÓ đi học buổi này (kể cả khi post nhận xét bị lỗi kỹ thuật). */
  attendedStudentIds?: string[]
  /** Học sinh đã được LMS xác nhận lưu nhận xét thành công. */
  lmsPostedStudentIds?: string[]
  /** true khi đã gửi lên LMS thành công (có HS được nhận xét, không lỗi) */
  postedToLms?: boolean
  /** ISO timestamp khi tin Zalo đã được gửi tự động (ghi file/gửi thật) */
  zaloSentAt?: string
}

export type ZaloSendResult =
  | { status: 'sent' }
  | { status: 'login-required'; message: string }

export interface ZaloSendSessionRequest {
  classId: string
  sessionId: string
}

export interface ZaloSendSessionResult {
  status: 'sent' | 'already-sent' | 'login-required' | 'blocked'
  message: string
  content: SessionContent
}

export type AutoSendChannel = 'lms' | 'zalo'

export interface AutoSendCatchUpItem {
  classId: string
  classCode: string
  className: string
  sessionId: string
  sessionDateTime: string
  channels: AutoSendChannel[]
}

export interface AutoSendCatchUpResult {
  classId: string
  classCode: string
  sessionId: string
  status: 'success' | 'skipped' | 'error'
  completedChannels: AutoSendChannel[]
  message: string
}

export const DEFAULT_ZALO_TEMPLATE = `@All Em xin gửi nhận xét buổi học của các học sinh lớp {ten_lop} ngày {ngay_buoi_hoc} ạ
Nội dung bài học:
{noi_dung_bai_hoc}
Nhận xét từng học sinh:
{danh_sach_nhan_xet}
Bài tập về nhà:
{bai_tap_ve_nha}
Cảm ơn phụ huynh và các con!`

export const DEFAULT_COMMENT_STYLE_HINT =
  'nhẹ nhàng, khách quan, đúng mực, đúng văn phong giáo viên'

export const DEFAULT_CONFIG: AppConfig = {
  storageBackend: 'local',
  localFolderPath: null,
  geminiApiKey: null,
  geminiModel: DEFAULT_GEMINI_MODEL,
  zaloMessageTemplate: DEFAULT_ZALO_TEMPLATE,
  commentStyleHint: DEFAULT_COMMENT_STYLE_HINT,
  lmsEmail: null,
  lmsPassword: null,
}

// ─── LMS automation types ───────────────────────────────────────────────────

export interface LmsPostParams {
  classCode: string
  sessionDate: string  // 'YYYY-MM-DD'
  lessonContent: string
  homework: string
  /** Chỉ truyền HS có mặt + có nội dung nhận xét */
  comments: { studentName: string; text: string }[]
}

export interface LmsPostResult {
  posted: string[]   // tên HS đã được nhận xét
  skipped: string[]  // tên HS nghỉ hoặc không có nội dung
  absentStudentNames: string[]  // tên HS được LMS xác nhận nghỉ
  attendedStudentNames: string[]  // tên HS đi học (không nghỉ), bất kể post thành công hay lỗi
  error?: string
}

export interface LmsPostSessionAndSaveRequest {
  params: LmsPostParams
  content: SessionContent
  students: Student[]
}

export interface LmsPostSessionAndSaveResult {
  postResult: LmsPostResult
  content: SessionContent
}

export interface LmsScrapedClass {
  lmsCode: string
  name: string
  sessions: { date: string; time?: string }[]  // date 'YYYY-MM-DD', time 'HH:mm' (giờ bắt đầu, nếu LMS có)
  students: { name: string }[]
}

export interface LmsSyncResult {
  classes: LmsScrapedClass[]
}

export interface LmsContentTarget {
  classCode: string
  sessionId: string
  sessionDate: string  // 'YYYY-MM-DD'
}

export interface LmsContentResult {
  classCode: string
  sessionDate: string  // 'YYYY-MM-DD'
  lessonContent: string
  homework: string
  students: { name: string; attended: boolean; comment: string }[]
}

export interface LmsSyncAllResult {
  newClasses: LmsScrapedClass[]
  contentResults: LmsContentResult[]
  skippedClasses: string[]
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

export const IPC = {
  getConfig: 'config:get',
  updateConfig: 'config:update',
  validateGeminiKey: 'gemini:validateKey',
  pickFolder: 'dialog:pickFolder',
  listClasses: 'class:list',
  getClass: 'class:get',
  saveClass: 'class:save',
  deleteClass: 'class:delete',
  getContent: 'content:get',
  saveContent: 'content:save',
  extractLessonFromPdf: 'gemini:extractPdf',
  rewriteComment: 'gemini:rewrite',
  rewriteCommentsBatch: 'gemini:rewriteBatch',
  lmsOpenBrowser: 'lms:openBrowser',
  lmsPostSession: 'lms:postSession',
  lmsPostSessionAndSave: 'lms:postSessionAndSave',
  lmsSyncAll: 'lms:syncAll',
  zaloSendSession: 'zalo:sendSession',
  autoSendGetCatchUp: 'autoSend:getCatchUp',
  autoSendRunCatchUp: 'autoSend:runCatchUp',
} as const

export interface AppApi {
  getConfig(): Promise<AppConfig>
  updateConfig(patch: Partial<AppConfig>): Promise<AppConfig>
  validateGeminiKey(apiKey: string): Promise<GeminiValidationResult>
  pickFolder(): Promise<string | null>
  listClasses(): Promise<SchoolClass[]>
  getClass(id: string): Promise<SchoolClass | null>
  saveClass(cls: SchoolClass): Promise<void>
  deleteClass(id: string): Promise<void>
  getContent(sessionId: string): Promise<SessionContent | null>
  saveContent(content: SessionContent): Promise<void>
  extractLessonFromPdf(): Promise<string>
  rewriteComment(studentName: string, raw: string): Promise<string>
  /** Viết lại nhận xét cho nhiều HS trong 1 request. Trả về mảng cùng thứ tự với đầu vào. */
  rewriteCommentsBatch(items: { name: string; raw: string }[]): Promise<string[]>
  lmsOpenBrowser(): Promise<{ loggedIn: boolean }>
  lmsPostSession(params: LmsPostParams): Promise<LmsPostResult>
  lmsPostSessionAndSave(
    request: LmsPostSessionAndSaveRequest,
  ): Promise<LmsPostSessionAndSaveResult>
  lmsSyncAll(params: { existingCodes: string[]; contentTargets: LmsContentTarget[] }): Promise<LmsSyncAllResult>
  zaloSendSession(request: ZaloSendSessionRequest): Promise<ZaloSendSessionResult>
  getAutoSendCatchUp(): Promise<AutoSendCatchUpItem[]>
  runAutoSendCatchUp(): Promise<AutoSendCatchUpResult[]>
}
