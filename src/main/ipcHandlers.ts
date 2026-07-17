import { AppApi, AppConfig, GeminiValidationResult, SchoolClass } from '../shared/types'
import { ConfigStore } from './config/configStore'
import { ClassRepository } from './classes/ClassRepository'

export interface IpcDeps {
  configStore: ConfigStore
  validateGeminiKey: (apiKey: string) => Promise<GeminiValidationResult>
  pickFolder: () => Promise<string | null>
  getRepository: () => Promise<ClassRepository>
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
  }
}
