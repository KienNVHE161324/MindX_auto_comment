import {
  AppApi, AppConfig, GeminiValidationResult, SchoolClass, SessionContent,
  LmsPostParams, LmsPostResult, LmsContentTarget, LmsSyncAllResult,
} from '../shared/types'
import { ConfigStore } from './config/configStore'
import { ClassRepository } from './classes/ClassRepository'
import { ContentRepository } from './content/ContentRepository'

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
  lmsSyncAll: (params: { existingCodes: string[]; contentTargets: LmsContentTarget[] }) => Promise<LmsSyncAllResult>
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
    lmsSyncAll: (params) => deps.lmsSyncAll(params),
  }
}
