import { ipcMain, safeStorage, dialog, shell } from 'electron'
import { getDb, getDataDir } from '../db'
import { checkOllamaConnection } from '../services/ollama'
import { createWriteStream, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import archiver from 'archiver'
import unzipper from 'unzipper'
import { restartScheduler } from '../services/scheduler'
import { notifySettingsSaved } from '../notify'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => {
    const db = getDb()
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any
    if (!settings) return null
    return {
      ...settings,
      company_urls: JSON.parse(settings.company_urls || '[]'),
      linkedin_password_encrypted: undefined,
      has_linkedin_credentials: !!(settings.linkedin_email && settings.linkedin_password_encrypted)
    }
  })

  ipcMain.handle('settings:save', (_, data) => {
    const db = getDb()
    db.prepare(`
      UPDATE settings SET
        ollama_url=?, ollama_model=?, search_schedule=?, search_schedule_time=?,
        company_urls=?, cv_template=?, headless_browser=?, notification_threshold=?,
        updated_at=datetime('now')
      WHERE id=1
    `).run(
      data.ollama_url,
      data.ollama_model,
      data.search_schedule,
      data.search_schedule_time,
      JSON.stringify(data.company_urls || []),
      data.cv_template,
      data.headless_browser ? 1 : 0,
      data.notification_threshold
    )
    restartScheduler()
    notifySettingsSaved()
    return { success: true }
  })

  ipcMain.handle('settings:save-linkedin', (_, { email, password }) => {
    const db = getDb()
    const encryptedBuf = safeStorage.encryptString(password)
    const encrypted = encryptedBuf.toString('base64')
    db.prepare('UPDATE settings SET linkedin_email=?, linkedin_password_encrypted=? WHERE id=1')
      .run(email, encrypted)
    return { success: true }
  })

  ipcMain.handle('settings:clear-linkedin', () => {
    const db = getDb()
    db.prepare('UPDATE settings SET linkedin_email=NULL, linkedin_password_encrypted=NULL WHERE id=1').run()
    return { success: true }
  })

  ipcMain.handle('ollama:check', async () => {
    return checkOllamaConnection()
  })

  ipcMain.handle('ollama:models', async () => {
    const result = await checkOllamaConnection()
    return result.models
  })

  ipcMain.handle('settings:backup', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Save Backup',
      defaultPath: `job-hunter-backup-${new Date().toISOString().split('T')[0]}.zip`,
      filters: [{ name: 'ZIP files', extensions: ['zip'] }]
    })

    if (result.canceled || !result.filePath) return { cancelled: true }

    const dataDir = getDataDir()
    const cvsDir = join(dataDir, 'cvs')
    const screenshotsDir = join(dataDir, 'screenshots')

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(result.filePath!)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', resolve)
      archive.on('error', reject)
      archive.pipe(output)
      // Include the db file directly from the data dir
      const dbPath = join(dataDir, 'job-hunter.db')
      if (existsSync(dbPath)) archive.file(dbPath, { name: 'job-hunter.db' })
      if (existsSync(cvsDir)) archive.directory(cvsDir, 'cvs')
      if (existsSync(screenshotsDir)) archive.directory(screenshotsDir, 'screenshots')
      archive.finalize()
    })

    return { success: true, path: result.filePath }
  })

  ipcMain.handle('settings:restore', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Restore from Backup',
      filters: [{ name: 'ZIP files', extensions: ['zip'] }],
      properties: ['openFile']
    })

    if (result.canceled || !result.filePaths.length) return { cancelled: true }

    const zipPath = result.filePaths[0]
    const dataDir = getDataDir()

    const confirm = await dialog.showMessageBox({
      type: 'warning',
      title: 'Restore Backup',
      message: 'This will overwrite your current data with the backup. Are you sure?',
      buttons: ['Restore', 'Cancel'],
      defaultId: 1,
      cancelId: 1
    })

    if (confirm.response !== 0) return { cancelled: true }

    const fs = require('fs')
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: dataDir }))
        .on('close', resolve)
        .on('error', reject)
    })

    return { success: true }
  })

  ipcMain.handle('settings:open-data-folder', () => {
    shell.openPath(getDataDir())
    return { success: true }
  })

  ipcMain.handle('settings:get-data-path', () => {
    return getDataDir()
  })
}
