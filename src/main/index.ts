import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { ConfigStore } from './config/configStore'
import { validateGeminiApiKey } from './gemini/geminiClient'
import { createIpcHandlers } from './ipcHandlers'
import { createStorageProvider } from './storage'
import { ClassRepository } from './classes/ClassRepository'
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
  const handlers = createIpcHandlers({ configStore, validateGeminiKey: validateGeminiApiKey, pickFolder, getRepository })

  ipcMain.handle(IPC.getConfig, () => handlers.getConfig())
  ipcMain.handle(IPC.updateConfig, (_e, patch) => handlers.updateConfig(patch))
  ipcMain.handle(IPC.validateGeminiKey, (_e, apiKey: string) => handlers.validateGeminiKey(apiKey))
  ipcMain.handle(IPC.pickFolder, () => handlers.pickFolder())
  ipcMain.handle(IPC.listClasses, () => handlers.listClasses())
  ipcMain.handle(IPC.getClass, (_e, id: string) => handlers.getClass(id))
  ipcMain.handle(IPC.saveClass, (_e, cls) => handlers.saveClass(cls))
  ipcMain.handle(IPC.deleteClass, (_e, id: string) => handlers.deleteClass(id))
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
