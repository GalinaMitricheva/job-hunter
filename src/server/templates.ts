export function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Job Hunter</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #1a1a1a; background: #f5f5f5; }
  nav { background: #1a1a2e; color: white; padding: 12px 24px; display: flex; align-items: center; gap: 24px; }
  nav a { color: #ccd; text-decoration: none; font-size: 13px; }
  nav a:hover { color: white; }
  nav .brand { font-weight: 700; font-size: 15px; color: white; }
  .container { max-width: 1100px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; margin-bottom: 20px; }
  h2 { font-size: 16px; margin-bottom: 12px; color: #333; }
  .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .meta { color: #666; font-size: 12px; margin-bottom: 8px; }
  .score { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .score.high { background: #d1fae5; color: #065f46; }
  .score.mid  { background: #fef3c7; color: #92400e; }
  .score.low  { background: #fee2e2; color: #991b1b; }
  .btn { display: inline-block; padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; text-decoration: none; }
  .btn-green  { background: #059669; color: white; }
  .btn-green:hover  { background: #047857; }
  .btn-red    { background: #dc2626; color: white; }
  .btn-red:hover    { background: #b91c1c; }
  .btn-gray   { background: #e5e7eb; color: #374151; }
  .btn-gray:hover   { background: #d1d5db; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .cv-preview { border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; max-height: 400px; overflow-y: auto; font-size: 11px; background: #fafafa; }
  .cover-letter { white-space: pre-wrap; font-size: 13px; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; max-height: 300px; overflow-y: auto; }
  .actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; align-items: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-pending { background: #eff6ff; color: #1d4ed8; }
  .badge-submitted { background: #d1fae5; color: #065f46; }
  .badge-skipped { background: #f3f4f6; color: #6b7280; }
  .badge-manual { background: #fef3c7; color: #92400e; }
  textarea.edit-cover { width: 100%; height: 200px; font-size: 13px; line-height: 1.6; padding: 10px; border: 1px solid #d1d5db; border-radius: 4px; resize: vertical; }
  .empty { color: #9ca3af; text-align: center; padding: 48px 0; }
  .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { background: white; border-radius: 8px; padding: 14px 20px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .stat-value { font-size: 24px; font-weight: 700; }
  .stat-label { font-size: 12px; color: #6b7280; }
  .reasoning { font-size: 12px; color: #555; font-style: italic; margin-top: 4px; }
  form { display: inline; }
</style>
</head>
<body>
<nav>
  <span class="brand">Job Hunter</span>
  <a href="/">Queue</a>
  <a href="/history">History</a>
</nav>
<div class="container">
${body}
</div>
</body>
</html>`
}

export function scoreClass(score: number): string {
  if (score >= 80) return 'high'
  if (score >= 60) return 'mid'
  return 'low'
}
