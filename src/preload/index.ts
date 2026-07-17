import { contextBridge, ipcRenderer } from 'electron'
import { AppApi, IPC } from '../shared/types'

const api: AppApi = {
  getConfig: () => ipcRenderer.invoke(IPC.getConfig),
  updateConfig: (patch) => ipcRenderer.invoke(IPC.updateConfig, patch),
  validateGeminiKey: (apiKey) => ipcRenderer.invoke(IPC.validateGeminiKey, apiKey),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
}

contextBridge.exposeInMainWorld('api', api)
