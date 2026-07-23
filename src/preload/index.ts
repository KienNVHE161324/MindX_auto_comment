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
  rewriteCommentsBatch: (items) => ipcRenderer.invoke(IPC.rewriteCommentsBatch, items),
  lmsOpenBrowser: () => ipcRenderer.invoke(IPC.lmsOpenBrowser),
  lmsPostSession: (params) => ipcRenderer.invoke(IPC.lmsPostSession, params),
  lmsPostSessionAndSave: (request) => ipcRenderer.invoke(IPC.lmsPostSessionAndSave, request),
  lmsSyncAll: (params) => ipcRenderer.invoke(IPC.lmsSyncAll, params),
  zaloSendSession: (request) => ipcRenderer.invoke(IPC.zaloSendSession, request),
  getAutoSendCatchUp: () => ipcRenderer.invoke(IPC.autoSendGetCatchUp),
  runAutoSendCatchUp: () => ipcRenderer.invoke(IPC.autoSendRunCatchUp),
}

contextBridge.exposeInMainWorld('api', api)
