import {
  AppApi, AppConfig, GeminiValidationResult, SchoolClass, SessionContent,
  LmsPostParams, LmsPostResult, LmsContentTarget, LmsSyncAllResult,
  AutoSendCatchUpItem, AutoSendCatchUpResult,
  ZaloSendResult, ZaloSendSessionResult,
} from '../shared/types'
import { ConfigStore } from './config/configStore'
import { ClassRepository } from './classes/ClassRepository'
import { ContentRepository } from './content/ContentRepository'
import { mergeAbsentStudentNames } from '../shared/lmsSync'
import { buildZaloMessage } from '../shared/autoSend'
import { ZALO_TEST_SEARCH_TERM } from './automation/ZaloDesktopAutomator'

export interface IpcDeps {
  configStore: ConfigStore
  validateGeminiKey: (apiKey: string) => Promise<GeminiValidationResult>
  pickFolder: () => Promise<string | null>
  getRepository: () => Promise<ClassRepository>
  getContentRepository: () => Promise<ContentRepository>
  extractPdf: () => Promise<string>
  rewrite: (studentName: string, raw: string) => Promise<string>
  rewriteBatch: (items: { name: string; raw: string }[]) => Promise<string[]>
  lmsOpenBrowser: () => Promise<{ loggedIn: boolean }>
  lmsPostSession: (params: LmsPostParams) => Promise<LmsPostResult>
  runLmsPostExclusive<T>(
    operation: (
      postSession: (params: LmsPostParams) => Promise<LmsPostResult>,
    ) => Promise<T>,
  ): Promise<T>
  lmsSyncAll: (params: { existingCodes: string[]; contentTargets: LmsContentTarget[] }) => Promise<LmsSyncAllResult>
  sendZaloMessage: (input: { searchTerm: string; message: string }) => Promise<ZaloSendResult>
  now: () => Date
  getAutoSendCatchUp: () => AutoSendCatchUpItem[]
  runAutoSendCatchUp: () => Promise<AutoSendCatchUpResult[]>
}

function mergeStoredMetadata(
  draft: SessionContent,
  stored: SessionContent | null,
): SessionContent {
  if (!stored) return draft
  const merged = { ...draft }
  const metadataKeys = [
    'absentStudentIds',
    'postedToLms',
    'zaloSentAt',
  ] as const
  for (const key of metadataKeys) {
    if (stored[key] === undefined) delete merged[key]
    else Object.assign(merged, { [key]: stored[key] })
  }
  return merged
}

export function createIpcHandlers(deps: IpcDeps): AppApi {
  return {
    getConfig: () => deps.configStore.load(),
    updateConfig: (patch: Partial<AppConfig>) => deps.configStore.update(patch),
    validateGeminiKey: (apiKey: string) => deps.validateGeminiKey(apiKey),
    pickFolder: () => deps.pickFolder(),
    listClasses: async () => (await deps.getRepository()).list(),
    getClass: async (id: string) => (await deps.getRepository()).get(id),
    saveClass: async (cls: SchoolClass) => (await deps.getRepository()).save(cls),
    deleteClass: async (id: string) => (await deps.getRepository()).delete(id),
    getContent: async (sessionId: string) => (await deps.getContentRepository()).get(sessionId),
    saveContent: async (content: SessionContent) => (await deps.getContentRepository()).save(content),
    extractLessonFromPdf: () => deps.extractPdf(),
    rewriteComment: (studentName: string, raw: string) => deps.rewrite(studentName, raw),
    rewriteCommentsBatch: (items) => deps.rewriteBatch(items),
    lmsOpenBrowser: () => deps.lmsOpenBrowser(),
    lmsPostSession: (params: LmsPostParams) => deps.lmsPostSession(params),
    lmsPostSessionAndSave: request => deps.runLmsPostExclusive(async postSession => {
      const repository = await deps.getContentRepository()
      const stored = await repository.get(request.content.sessionId)
      const current = mergeStoredMetadata(request.content, stored)
      if (current.postedToLms) {
        return {
          postResult: { posted: [], skipped: [], absentStudentNames: [] },
          content: current,
        }
      }

      const postResult = await postSession(request.params)
      const absentStudentIds = mergeAbsentStudentNames(
        request.students,
        current.absentStudentIds ?? [],
        postResult.absentStudentNames,
      )
      const didPost = !postResult.error && postResult.posted.length > 0
      const absenceChanged = absentStudentIds.length !== (current.absentStudentIds ?? []).length
      if (!didPost && !absenceChanged) return { postResult, content: current }

      const updated: SessionContent = {
        ...current,
        absentStudentIds,
        ...(didPost ? { postedToLms: true } : {}),
      }
      await repository.save(updated)
      const persisted = await repository.get(updated.sessionId)
      return { postResult, content: persisted ?? updated }
    }),
    lmsSyncAll: (params) => deps.lmsSyncAll(params),
    zaloSendSession: async request => {
      const classRepository = await deps.getRepository()
      const cls = await classRepository.get(request.classId)
      if (!cls) throw new Error('Không tìm thấy lớp để gửi Zalo.')

      const session = cls.sessions.find(item => item.id === request.sessionId)
      if (!session) throw new Error('Không tìm thấy buổi học để gửi Zalo.')

      const contentRepository = await deps.getContentRepository()
      const content = await contentRepository.get(request.sessionId)
      if (!content) throw new Error('Buổi học chưa có nội dung để gửi Zalo.')
      if (content.zaloSentAt) {
        return {
          status: 'already-sent',
          message: 'Buổi này đã gửi Zalo.',
          content,
        } satisfies ZaloSendSessionResult
      }

      const config = await deps.configStore.load()
      const message = buildZaloMessage(
        cls,
        session,
        content,
        config.zaloMessageTemplate,
      )
      const sendResult = await deps.sendZaloMessage({
        searchTerm: ZALO_TEST_SEARCH_TERM,
        message,
      })
      if (sendResult.status === 'login-required') {
        return { ...sendResult, content }
      }

      const zaloSentAt = deps.now().toISOString()
      const persisted = await contentRepository.updateMetadata(
        request.sessionId,
        { zaloSentAt },
      )
      const updated = persisted ?? { ...content, zaloSentAt }
      return {
        status: 'sent',
        message: 'Đã gửi Zalo.',
        content: updated,
      }
    },
    getAutoSendCatchUp: async () => deps.getAutoSendCatchUp(),
    runAutoSendCatchUp: () => deps.runAutoSendCatchUp(),
  }
}
