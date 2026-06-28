import cron from 'node-cron'
import { getConfig } from './config'
import { runSearch } from './search'

let currentTask: cron.ScheduledTask | null = null

export function startScheduler(): void {
  stopScheduler()
  const schedule = getConfig().search.schedule
  if (!schedule || schedule === 'manual') return

  console.log(`Scheduler active: "${schedule}" (cron)`)

  currentTask = cron.schedule(schedule, async () => {
    console.log(`[${new Date().toISOString()}] Scheduled search starting...`)
    try {
      const result = await runSearch()
      console.log(`[${new Date().toISOString()}] Search done: ${result.newResults} new, ${result.queued} queued for review`)
      if (result.errors.length > 0) {
        console.warn('Search errors:', result.errors.join('; '))
      }
    } catch (err) {
      console.error('Scheduled search failed:', err)
    }
  })
}

export function stopScheduler(): void {
  if (currentTask) { currentTask.stop(); currentTask = null }
}
