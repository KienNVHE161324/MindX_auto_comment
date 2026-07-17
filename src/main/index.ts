import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import { ConfigStore } from './config/configStore'
import { validateGeminiApiKey } from './gemini/geminiClient'
import { createIpcHandlers } from './ipcHandlers'
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
  const handlers = createIpcHandlers({ configStore, validateGeminiKey: validateGeminiApiKey, pickFolder })

  ipcMain.handle(IPC.getConfig, () => handlers.getConfig())
  ipcMain.handle(IPC.updateConfig, (_e, patch) => handlers.updateConfig(patch))
  ipcMain.handle(IPC.validateGeminiKey, (_e, apiKey: string) => handlers.validateGeminiKey(apiKey))
  ipcMain.handle(IPC.pickFolder, () => handlers.pickFolder())
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
