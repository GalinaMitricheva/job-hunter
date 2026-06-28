import cron from 'node-cron'
import { BrowserWindow, Notification } from 'electron'
import { getDb } from '../db'
import { runSearch } from '../ipc/search'

let currentTask: cron.ScheduledTask | null = null
let nextRunAt: Date | null = null

function getCronExprAndInterval(schedule: string, time: string): { cronExpr: string; intervalMs: number } | null {
  switch (schedule) {
    case '3h':  return { cronExpr: '0 */3 * * *',  intervalMs: 3  * 60 * 60 * 1000 }
    case '6h':  return { cronExpr: '0 */6 * * *',  intervalMs: 6  * 60 * 60 * 1000 }
    case '12h': return { cronExpr: '0 */12 * * *', intervalMs: 12 * 60 * 60 * 1000 }
    case 'daily': {
      const [hour, minute] = (time || '08:00').split(':')
      return { cronExpr: `${minute || 0} ${hour || 8} * * *`, intervalMs: 24 * 60 * 60 * 1000 }
    }
    default: return null
  }
}

export function startScheduler(win: BrowserWindow): void {
  stopScheduler()
  const db = getDb()
  const settings = db.prepare('SELECT search_schedule, search_schedule_time FROM settings WHERE id = 1').get() as any

  if (!settings || settings.search_schedule === 'manual') return

  const config = getCronExprAndInterval(settings.search_schedule, settings.search_schedule_time)
  if (!config) return

  nextRunAt = new Date(Date.now() + config.intervalMs)

  currentTask = cron.schedule(config.cronExpr, async () => {
    nextRunAt = new Date(Date.now() + config.intervalMs)
    try {
      win.webContents.send('search:started')
      const result = await runSearch()
      win.webContents.send('search:completed', result)

      const settings = db.prepare('SELECT notification_threshold FROM settings WHERE id = 1').get() as any
      const threshold = settings?.notification_threshold ?? 60
      const highRelevance = (result.newResults || []).filter((r: any) => r.relevance_score >= threshold)

      if (highRelevance.length > 0) {
        new Notification({
          title: 'Job Hunter Pro',
          body: `Found ${highRelevance.length} high-relevance job${highRelevance.length > 1 ? 's' : ''}!`
        }).show()
      }
    } catch (err) {
      console.error('Scheduled search error:', err)
    }
  })
}

export function stopScheduler(): void {
  if (currentTask) {
    currentTask.stop()
    currentTask = null
  }
  nextRunAt = null
}

export function restartScheduler(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    startScheduler(win)
  } else {
    stopScheduler()
  }
}

export function getNextRunTime(): string | null {
  return nextRunAt ? nextRunAt.toISOString() : null
}
