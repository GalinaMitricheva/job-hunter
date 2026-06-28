import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb, closeDb } from './db'
import { registerProfileHandlers } from './ipc/profile'
import { registerSearchHandlers } from './ipc/search'
import { registerApplicationHandlers } from './ipc/applications'
import { registerSettingsHandlers } from './ipc/settings'
import { startScheduler, stopScheduler } from './services/scheduler'
import { closeBrowser } from './services/linkedin'
import { setTrayRef, getTrayRef, notifyQueueUpdate } from './notify'

let mainWindow: BrowserWindow | null = null

function createAppIcon(size = 32): Electron.NativeImage {
  const buf = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const x = i % size
    const y = Math.floor(i / size)
    const cx = size / 2
    const cy = size / 2
    const r = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    const inCircle = r < cx - 1
    if (inCircle) {
      const g = Math.min(1, r / cx)
      buf[i * 4 + 0] = Math.round(37 + g * 22)
      buf[i * 4 + 1] = Math.round(99 + g * 31)
      buf[i * 4 + 2] = Math.round(235 + g * 11)
      buf[i * 4 + 3] = 255
    } else {
      buf[i * 4 + 3] = 0
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: createAppIcon(256),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#94a3b8',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    notifyQueueUpdate()
  })

  mainWindow.on('close', (e) => {
    if (getTrayRef()) {
      e.preventDefault()
      mainWindow!.hide()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function createTray(): void {
  const icon = createAppIcon(32)
  const tray = new Tray(icon)
  setTrayRef(tray)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Job Hunter Pro',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    {
      label: 'Run Search Now',
      click: () => {
        mainWindow?.webContents.send('trigger:search')
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray.destroy()
        setTrayRef(null)
        mainWindow?.destroy()
        app.quit()
      }
    }
  ])

  tray.setToolTip('Job Hunter Pro')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.jobhunterpro.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  getDb()

  registerProfileHandlers()
  registerSearchHandlers()
  registerApplicationHandlers()
  registerSettingsHandlers()

  const win = createWindow()
  createTray()
  startScheduler(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopScheduler()
    closeBrowser()
    closeDb()
    app.quit()
  }
})

app.on('before-quit', () => {
  stopScheduler()
  closeBrowser()
  closeDb()
})
