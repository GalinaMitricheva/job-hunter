import { BrowserWindow, Tray } from 'electron'
import { getDb } from './db'

let trayRef: Tray | null = null

export function setTrayRef(t: Tray | null): void {
  trayRef = t
}

export function getTrayRef(): Tray | null {
  return trayRef
}

export function notifySettingsSaved(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('settings:saved')
  }
}

export function notifyQueueUpdate(): void {
  const db = getDb()
  const count = (db.prepare("SELECT COUNT(*) as c FROM applications WHERE status='pending_review'").get() as any)?.c || 0

  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('queue:count-updated', count)
  }

  if (trayRef) {
    const label = count > 0 ? `Job Hunter Pro — ${count} pending review` : 'Job Hunter Pro'
    trayRef.setToolTip(label)
    try { trayRef.setTitle(count > 0 ? `${count}` : '') } catch {}
  }
}
