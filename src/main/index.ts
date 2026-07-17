import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ConfigStore } from './config/configStore'
import { validateGeminiApiKey, extractLessonContent, rewriteComment } from './gemini/geminiClient'
import { createIpcHandlers } from './ipcHandlers'
import { createStorageProvider } from './storage'
import { ClassRepository } from './classes/ClassRepository'
import { ContentRepository } from './content/ContentRepository'
import { LmsAutomator } from './automation/LmsAutomator'
import { IPC } from '../shared/types'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

// Singleton automator — browser stays open across IPC calls
const lmsAutomator = new LmsAutomator(
  join(app.getPath('userData'), 'lms-browser'),
)

function registerIpc(): void {
  const configStore = new ConfigStore(app.getPath('userData'))
  const pickFolder = async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  }
  const getRepository = async (): Promise<ClassRepository> => {
    const cfg = await configStore.load()
    return new ClassRepository(createStorageProvider(cfg))
  }
  const getContentRepository = async (): Promise<ContentRepository> => {
    const cfg = await configStore.load()
    return new ContentRepository(createStorageProvider(cfg))
  }
  const requireApiKey = async (): Promise<string> => {
    const cfg = await configStore.load()
    if (!cfg.geminiApiKey) throw new Error('Chưa cấu hình API key Gemini trong tab Cấu hình.')
    return cfg.geminiApiKey
  }
  const extractPdf = async (): Promise<string> => {
    const apiKey = await requireApiKey()
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('Chưa chọn file PDF.')
    }
    const bytes = await fs.readFile(result.filePaths[0])
    return extractLessonContent(apiKey, bytes.toString('base64'))
  }
  const rewrite = async (studentName: string, raw: string): Promise<string> => {
    const cfg = await configStore.load()
    if (!cfg.geminiApiKey) throw new Error('Chưa cấu hình API key Gemini trong tab Cấu hình.')
    return rewriteComment(cfg.geminiApiKey, studentName, raw, cfg.commentStyleHint)
  }
  const handlers = createIpcHandlers({
    configStore,
    validateGeminiKey: validateGeminiApiKey,
    pickFolder,
    getRepository,
    getContentRepository,
    extractPdf,
    rewrite,
    lmsOpenBrowser: () => lmsAutomator.openBrowser(),
    lmsPostSession: (params) => lmsAutomator.postSession(params),
    lmsSyncClasses: () => lmsAutomator.syncClasses(),
  })

  ipcMain.handle(IPC.getConfig, () => handlers.getConfig())
  ipcMain.handle(IPC.updateConfig, (_e, patch) => handlers.updateConfig(patch))
  ipcMain.handle(IPC.validateGeminiKey, (_e, apiKey: string) => handlers.validateGeminiKey(apiKey))
  ipcMain.handle(IPC.pickFolder, () => handlers.pickFolder())
  ipcMain.handle(IPC.listClasses, () => handlers.listClasses())
  ipcMain.handle(IPC.getClass, (_e, id: string) => handlers.getClass(id))
  ipcMain.handle(IPC.saveClass, (_e, cls) => handlers.saveClass(cls))
  ipcMain.handle(IPC.deleteClass, (_e, id: string) => handlers.deleteClass(id))
  ipcMain.handle(IPC.getContent, (_e, sessionId: string) => handlers.getContent(sessionId))
  ipcMain.handle(IPC.saveContent, (_e, content) => handlers.saveContent(content))
  ipcMain.handle(IPC.extractLessonFromPdf, () => handlers.extractLessonFromPdf())
  ipcMain.handle(IPC.rewriteComment, (_e, name: string, raw: string) => handlers.rewriteComment(name, raw))
  ipcMain.handle(IPC.lmsOpenBrowser, () => handlers.lmsOpenBrowser())
  ipcMain.handle(IPC.lmsPostSession, (_e, params) => handlers.lmsPostSession(params))
  ipcMain.handle(IPC.lmsSyncClasses, () => handlers.lmsSyncClasses())
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void lmsAutomator.close()
})
