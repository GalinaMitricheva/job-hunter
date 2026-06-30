#!/usr/bin/env node
/**
 * Job Hunter Agent — CLI entry point
 *
 * Commands:
 *   profile [file]  Parse a CV file and/or quiz for missing info
 *   search          Run a job search session right now
 *   review          Start the review UI at localhost:3000
 *   start           Start scheduler + review UI together (normal daily use)
 *   eval [--count N] [--out file]  Export scored jobs for Claude-as-judge eval
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
    case 'eval':
      await runEvalCmd()
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
    await importCVFile(filePath)
    console.log('\nReview the extracted values below. Press Enter to accept, or type a correction.\n')
    await runProfileQuiz(false)
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

async function runEvalCmd(): Promise<void> {
  const { exportEvalData } = await import('./src/eval/index')
  const args = process.argv.slice(3)
  const countIdx = args.indexOf('--count')
  const count = countIdx !== -1 ? parseInt(args[countIdx + 1], 10) : 50
  const outIdx = args.indexOf('--out')
  const outPath = outIdx !== -1 ? args[outIdx + 1] : undefined

  const filePath = exportEvalData(isNaN(count) ? 50 : count, outPath)
  const data = JSON.parse(require('fs').readFileSync(filePath, 'utf-8'))

  console.log(`\nEval data exported to: ${filePath}`)
  console.log(`  Jobs exported: ${data.jobs.length}`)
  console.log(`  Threshold:     ${data.profile.fit_score_threshold}`)
  console.log(`  Passed by agent (score >= threshold): ${data.jobs.filter((j: { agent_score: number }) => j.agent_score >= data.profile.fit_score_threshold).length}`)
  console.log(`  Filtered by agent (score < threshold): ${data.jobs.filter((j: { agent_score: number }) => j.agent_score < data.profile.fit_score_threshold).length}`)
  console.log(`\nTo run the eval, open your Claude Code session and say:`)
  console.log(`  "Run the eval on eval-input.json"`)
  process.exit(0)
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
  eval             Export scored jobs for Claude-as-judge evaluation.
                   Options: --count N (default 50), --out path/to/file.json

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
