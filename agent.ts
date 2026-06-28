#!/usr/bin/env node
/**
 * Job Hunter Agent — CLI entry point
 *
 * Commands:
 *   profile [file]  Parse a CV file and/or quiz for missing info
 *   search          Run a job search session right now
 *   review          Start the review UI at localhost:3000
 *   start           Start scheduler + review UI together (normal daily use)
 */

const command = process.argv[2]

async function main(): Promise<void> {
  switch (command) {
    case 'profile':
      await runProfile()
      break
    case 'search':
      await runSearchCmd()
      break
    case 'review':
      runReviewCmd()
      break
    case 'start':
      runStartCmd()
      break
    default:
      printHelp()
      process.exit(command ? 1 : 0)
  }
}

async function runProfile(): Promise<void> {
  const { importCVFile } = await import('./src/profile/parser')
  const { runProfileQuiz } = await import('./src/profile/quiz')

  const filePath = process.argv[3]
  if (filePath) {
    console.log(`Importing CV: ${filePath}`)
    const { missingFields } = await importCVFile(filePath)
    if (missingFields.length > 0) {
      console.log(`\nLLM flagged these fields as missing or unclear: ${missingFields.join(', ')}`)
    }
    await runProfileQuiz(true, missingFields)
  } else {
    await runProfileQuiz(false) // quiz everything
  }
}

async function runSearchCmd(): Promise<void> {
  const { runSearch } = await import('./src/search')
  console.log('Starting search session...')
  const result = await runSearch()
  console.log(`\nSearch complete:`)
  console.log(`  Found:  ${result.totalFound} postings`)
  console.log(`  New:    ${result.newResults} (not seen before)`)
  console.log(`  Queued: ${result.queued} applications ready for review`)
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.join('\n          ')}`)
  }
  console.log(`\nOpen http://localhost:${getReviewPort()} to review.`)
  process.exit(0)
}

function runReviewCmd(): void {
  const { startReviewServer } = require('./src/server')
  startReviewServer()
}

function runStartCmd(): void {
  const { startReviewServer } = require('./src/server')
  const { startScheduler } = require('./src/scheduler')
  startReviewServer()
  startScheduler()
  console.log('Agent running. Press Ctrl+C to stop.')
}

function getReviewPort(): number {
  try {
    const { getConfig } = require('./src/config')
    return (getConfig() as { reviewPort: number }).reviewPort || 3000
  } catch { return 3000 }
}

function printHelp(): void {
  console.log(`
Job Hunter Agent

Usage:
  node agent.ts <command> [options]

Commands:
  profile [file]   Import a CV file (.pdf, .docx, .txt) and quiz for missing info.
                   Omit the file to re-run the full profile quiz.
  search           Run a job search session immediately.
  review           Start the review UI at http://localhost:3000.
  start            Start the scheduler + review UI (normal daily use).

Examples:
  node agent.ts profile my-cv.pdf
  node agent.ts search
  node agent.ts start
`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
