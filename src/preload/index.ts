import { contextBridge, ipcRenderer } from 'electron'
import { AppApi, IPC } from '../shared/types'

const api: AppApi = {
  getConfig: () => ipcRenderer.invoke(IPC.getConfig),
  updateConfig: (patch) => ipcRenderer.invoke(IPC.updateConfig, patch),
  validateGeminiKey: (apiKey) => ipcRenderer.invoke(IPC.validateGeminiKey, apiKey),
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder),
  listClasses: () => ipcRenderer.invoke(IPC.listClasses),
  getClass: (id) => ipcRenderer.invoke(IPC.getClass, id),
  saveClass: (cls) => ipcRenderer.invoke(IPC.saveClass, cls),
  deleteClass: (id) => ipcRenderer.invoke(IPC.deleteClass, id),
  getContent: (sessionId) => ipcRenderer.invoke(IPC.getContent, sessionId),
  saveContent: (content) => ipcRenderer.invoke(IPC.saveContent, content),
  extractLessonFromPdf: () => ipcRenderer.invoke(IPC.extractLessonFromPdf),
  rewriteComment: (studentName, raw) => ipcRenderer.invoke(IPC.rewriteComment, studentName, raw),
  lmsOpenBrowser: () => ipcRenderer.invoke(IPC.lmsOpenBrowser),
  lmsPostSession: (params) => ipcRenderer.invoke(IPC.lmsPostSession, params),
  lmsSyncClasses: () => ipcRenderer.invoke(IPC.lmsSyncClasses),
}

contextBridge.exposeInMainWorld('api', api)
