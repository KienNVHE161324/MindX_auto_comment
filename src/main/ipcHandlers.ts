import { AppApi, AppConfig, GeminiValidationResult } from '../shared/types'
import { ConfigStore } from './config/configStore'

export interface IpcDeps {
  configStore: ConfigStore
  validateGeminiKey: (apiKey: string) => Promise<GeminiValidationResult>
  pickFolder: () => Promise<string | null>
}

export function createIpcHandlers(deps: IpcDeps): AppApi {
  return {
    getConfig: () => deps.configStore.load(),
    updateConfig: (patch: Partial<AppConfig>) => deps.configStore.update(patch),
    validateGeminiKey: (apiKey: string) => deps.validateGeminiKey(apiKey),
    pickFolder: () => deps.pickFolder(),
  }
}
