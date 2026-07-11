import Anthropic from '@anthropic-ai/sdk'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { spawn } from 'child_process'
import { getConfig, type LlmProvider } from '../config'

// Some tasks (rating, tailoring) may want a different model than others.
// Only the OpenRouter provider varies its model by task; other providers ignore it.
export type LlmTask = 'rating' | 'tailoring'

export interface LlmOptions {
  task?: LlmTask
}

export async function llmComplete(prompt: string, system?: string, opts?: LlmOptions): Promise<string> {
  const cfg = getConfig()
  try {
    return await callProvider(cfg.llm.provider, prompt, system, opts)
  } catch (err) {
    const fallback = cfg.llm.fallbackProvider
    if (fallback && fallback !== cfg.llm.provider) {
      console.warn(`[llm] ${cfg.llm.provider} failed (${(err as Error).message.slice(0, 140)}); falling back to ${fallback}`)
      return await callProvider(fallback, prompt, system, opts)
    }
    throw err
  }
}

function callProvider(provider: LlmProvider, prompt: string, system: string | undefined, opts?: LlmOptions): Promise<string> {
  const cfg = getConfig()
  switch (provider) {
    case 'claude':
      return claudeComplete(prompt, system, cfg.llm.model)
    case 'claude-cli':
      return claudeCliComplete(prompt, system, cfg.llm.claudeCliCommand || 'claude', cfg.llm.claudeCliModel)
    case 'openrouter': {
      const model = opts?.task === 'tailoring'
        ? (cfg.llm.openrouterTailoringModel || cfg.llm.openrouterRatingModel)
        : (cfg.llm.openrouterRatingModel || cfg.llm.openrouterTailoringModel)
      return openrouterComplete(prompt, system, cfg.llm.openrouterBaseUrl, cfg.llm.openrouterApiKey, model)
    }
    case 'ollama':
      return ollamaComplete(prompt, system, cfg.llm.ollamaBaseUrl, cfg.llm.ollamaModel, cfg.llm.ollamaTimeoutSec ?? 600)
    default:
      return Promise.reject(new Error(`Unknown LLM provider: ${provider}`))
  }
}

async function claudeComplete(prompt: string, system: string | undefined, model: string): Promise<string> {
  const apiKey = getConfig().llm.claudeApiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('No Claude API key found. Set llm.claudeApiKey in config.json.')
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model,
    max_tokens: 2048,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }]
  })
  const block = msg.content[0]
  return block.type === 'text' ? block.text : ''
}

// Runs a prompt through headless Claude Code (`claude -p`), which authenticates
// with the user's Claude Pro/Max subscription rather than the paid API. The
// prompt (and any system text) go via stdin to avoid command-line length and
// quoting limits — especially important on Windows. ANTHROPIC_API_KEY is
// stripped from the child env so the CLI uses the subscription, not API billing.
function claudeCliComplete(
  prompt: string,
  system: string | undefined,
  command: string,
  model: string,
  timeoutSec = 120
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json']
    if (model) args.push('--model', model)

    const childEnv = { ...process.env }
    delete childEnv.ANTHROPIC_API_KEY

    const child = spawn(command, args, {
      env: childEnv,
      // Windows resolves `claude.cmd`/shims only through a shell. All args here
      // are simple flag tokens (no user text), so this is safe from injection.
      shell: process.platform === 'win32',
    })

    let out = ''
    let errOut = ''
    let settled = false
    const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn() } }

    const timer = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error(`Claude CLI timed out after ${timeoutSec}s`)))
    }, timeoutSec * 1000)

    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { errOut += d.toString() })

    child.on('error', (e) => finish(() =>
      reject(new Error(`Failed to launch Claude CLI '${command}': ${e.message}. Is Claude Code installed and on PATH?`))
    ))

    child.on('close', (code) => finish(() => {
      if (code !== 0) {
        reject(new Error(`Claude CLI exited ${code}: ${(errOut || out).slice(0, 300)}`))
        return
      }
      try {
        // `--output-format json` yields a result envelope: { type, subtype, is_error, result, ... }
        const env = JSON.parse(out) as { is_error?: boolean; subtype?: string; result?: string }
        if (env.is_error || typeof env.result !== 'string') {
          reject(new Error(`Claude CLI error (${env.subtype ?? 'unknown'}): ${String(env.result ?? '').slice(0, 200)}`))
          return
        }
        resolve(env.result)
      } catch (e) {
        reject(new Error(`Could not parse Claude CLI output: ${(e as Error).message}\n${out.slice(0, 200)}`))
      }
    }))

    child.stdin.on('error', () => { /* ignore EPIPE if the child exits early */ })
    child.stdin.write(system ? `${system}\n\n${prompt}` : prompt)
    child.stdin.end()
  })
}

function ollamaComplete(
  prompt: string,
  system: string | undefined,
  baseUrl: string,
  model: string,
  timeoutSec: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    // stream: true keeps the socket alive as tokens arrive, avoiding idle timeouts
    // num_predict: -1 = no token limit; without this small models truncate mid-JSON
    const payload = JSON.stringify({ model, prompt, stream: true, options: { num_predict: -1 }, ...(system ? { system } : {}) })
    const url = new URL('/api/generate', baseUrl)
    let tokensSeen = 0
    let result = ''

    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: timeoutSec * 1000
      },
      (res) => {
        let buf = ''
        res.on('data', (chunk: Buffer) => {
          buf += chunk.toString()
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const obj = JSON.parse(line) as { response?: string; done?: boolean }
              if (obj.response) { result += obj.response; tokensSeen++ }
              if (obj.done) { resolve(result); return }
            } catch { /* partial line, ignore */ }
          }
        })
        res.on('end', () => resolve(result))
      }
    )

    // socket timeout resets on each received chunk, so streaming prevents it firing mid-generation
    req.on('timeout', () => {
      req.destroy()
      const hint = tokensSeen === 0
        ? 'Ollama never responded — is it running? Consider a smaller model (e.g. gemma3:1b, qwen2.5:1.5b)'
        : `Ollama stopped mid-generation after ${tokensSeen} tokens`
      reject(new Error(hint))
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// Errors that carry retry intent from a single OpenRouter attempt.
interface RetryableError extends Error { retryable?: boolean; retryAfterMs?: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// OpenRouter exposes an OpenAI-compatible /chat/completions endpoint.
// Implemented with raw https (like ollamaComplete) to avoid an extra SDK dependency.
// Free models are frequently "rate-limited upstream" (429), so retry transient
// failures with backoff before giving up to the caller's fallback.
async function openrouterComplete(
  prompt: string,
  system: string | undefined,
  baseUrl: string,
  apiKey: string,
  model: string,
  timeoutSec = 120,
  maxRetries = 3
): Promise<string> {
  if (!apiKey) throw new Error('No OpenRouter API key found. Set llm.openrouterApiKey in config.json.')
  if (!model) throw new Error('No OpenRouter model configured. Set llm.openrouterRatingModel / openrouterTailoringModel in config.json.')

  let lastErr: RetryableError | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await openrouterAttempt(prompt, system, baseUrl, apiKey, model, timeoutSec)
    } catch (e) {
      lastErr = e as RetryableError
      if (!lastErr.retryable || attempt === maxRetries) throw lastErr
      // Honor server-provided Retry-After when present, else exponential backoff (1s, 2s, 4s...).
      const backoff = lastErr.retryAfterMs ?? 1000 * 2 ** attempt
      await sleep(backoff)
    }
  }
  throw lastErr ?? new Error('OpenRouter request failed')
}

function openrouterAttempt(
  prompt: string,
  system: string | undefined,
  baseUrl: string,
  apiKey: string,
  model: string,
  timeoutSec: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ]
    const payload = JSON.stringify({ model, messages })
    // baseUrl carries a path ("/api/v1"), so append relatively rather than with an absolute-path URL.
    const url = new URL(baseUrl.replace(/\/+$/, '') + '/chat/completions')

    const fail = (message: string, retryable = false, retryAfterMs?: number) => {
      const err: RetryableError = new Error(message)
      err.retryable = retryable
      if (retryAfterMs !== undefined) err.retryAfterMs = retryAfterMs
      reject(err)
    }

    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${apiKey}`,
          // OpenRouter recommends these to identify the app; harmless if absent.
          'HTTP-Referer': 'https://github.com/GalinaMitricheva/job-hunter',
          'X-Title': 'Job Hunter Agent',
        },
        timeout: timeoutSec * 1000
      },
      (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => {
          const status = res.statusCode ?? 0
          if (status === 429) {
            const retryAfter = Number(res.headers['retry-after'])
            fail(
              `OpenRouter rate limited (429). Free models allow ~20 req/min, 200 req/day. Body: ${body.slice(0, 200)}`,
              true,
              Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined
            )
            return
          }
          // 5xx are transient upstream/gateway errors — worth retrying.
          if (status >= 500) { fail(`OpenRouter error ${status}: ${body.slice(0, 300)}`, true); return }
          if (status < 200 || status >= 300) { fail(`OpenRouter error ${status}: ${body.slice(0, 300)}`); return }
          try {
            const obj = JSON.parse(body) as {
              choices?: Array<{ message?: { content?: string } }>
              error?: { message?: string; code?: number }
            }
            // Some errors return 200 with an { error } payload.
            if (obj.error) { fail(`OpenRouter error: ${obj.error.message ?? 'unknown'}`, obj.error.code === 429); return }
            const content = obj.choices?.[0]?.message?.content
            if (typeof content !== 'string') { fail(`OpenRouter returned no content: ${body.slice(0, 200)}`); return }
            resolve(content)
          } catch (e) {
            fail(`Could not parse OpenRouter response: ${(e as Error).message}\n${body.slice(0, 200)}`)
          }
        })
      }
    )

    // Network-level failures are transient — allow a retry.
    req.on('timeout', () => { req.destroy(); fail(`OpenRouter request timed out after ${timeoutSec}s`, true) })
    req.on('error', (e) => fail(e.message, true))
    req.write(payload)
    req.end()
  })
}

export async function llmJson<T>(prompt: string, system?: string, opts?: LlmOptions): Promise<T> {
  const raw = await llmComplete(prompt, system, opts)
  return parseJsonFromLlm<T>(raw)
}

function parseJsonFromLlm<T>(raw: string): T {
  // Extract the outermost {...} block
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error(`No JSON object found in LLM response:\n${raw.slice(0, 200)}`)
  let candidate = raw.slice(start, end + 1)

  // 1. Try as-is
  try { return JSON.parse(candidate) as T } catch { /* fall through */ }

  // 2. Strip JS-style and Python-style comments
  candidate = candidate.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  // Strip # comments that appear outside string values (after a comma, quote, or bracket)
  candidate = candidate.replace(/([:,\[{]\s*(?:"[^"]*")?\s*)#[^\n]*/g, '$1')

  // 3. Escape literal control characters inside string values
  candidate = candidate.replace(/"((?:[^"\\]|\\.)*)"/g, (_m, content: string) =>
    '"' + content.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"'
  )

  // 4. Remove trailing commas before } or ]
  candidate = candidate.replace(/,(\s*[}\]])/g, '$1')

  // 5. Try again
  try { return JSON.parse(candidate) as T } catch { /* fall through */ }

  // 6. If still truncated, attempt to close open structures
  candidate = closeOpenJson(candidate)
  try { return JSON.parse(candidate) as T } catch (e) {
    throw new Error(`Could not parse LLM JSON output: ${(e as Error).message}\nRaw excerpt:\n${raw.slice(0, 300)}`)
  }
}

function closeOpenJson(s: string): string {
  const stack: string[] = []
  let inString = false
  let escape = false
  // Last position after a fully-completed property (after ',' or opening '{'/']')
  // Rolling back here drops the incomplete key:value pair entirely
  let lastCompleteEnd = 0

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']')
      lastCompleteEnd = i + 1  // right after opening bracket is safe
    } else if (ch === '}' || ch === ']') {
      stack.pop()
      lastCompleteEnd = i + 1
    } else if (ch === ',') {
      lastCompleteEnd = i + 1  // after comma = previous property fully written
    }
    // Intentionally NOT updating on ':' — that would leave "key":} with no value
  }

  if (inString) {
    // Roll back to the last complete property boundary, dropping the truncated one
    s = s.slice(0, lastCompleteEnd).trimEnd().replace(/,\s*$/, '')
  }

  return s + stack.reverse().join('')
}

export async function scoreJobRelevance(
  jobTitle: string,
  jobDescription: string,
  profileSummary: string,
  skills: string[],
  targetTitles: string[],
  workExperience: Array<Record<string, unknown>> = [],
  languages: Array<{ language: string; proficiency: string }> = [],
  locationPreference: string = 'Remote, hybrid',
  candidateCity: string = 'Munich'
): Promise<{ score: number; reasoning: string; missingRequirements: string[] }> {
  const expLines = workExperience
    .slice(0, 5)
    .map((e) => `- ${e.title} at ${e.company} (${e.start_date}–${e.end_date || 'Present'})`)
    .join('\n')
  const langLine = languages.length > 0
    ? languages.map((l) => `${l.language} (${l.proficiency})`).join(', ')
    : 'Not specified'
  try {
    const skillSet = new Set(skills.map((s) => s.toLowerCase()))
    const hasSkill = (req: string) =>
      skillSet.has(req.toLowerCase()) ||
      skills.some((s) => req.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(req.toLowerCase()))

    const result = await llmJson<{ score: number; reasoning: string; missingRequirements: string[] }>(
      `Candidate profile:
- Summary: ${profileSummary || 'Not provided'}
- Skills: ${skills.join(', ')}
- Languages: ${langLine}
- Experience:\n${expLines || '(none listed)'}
- Target roles: ${targetTitles.join(', ')}
- Location preference: ${locationPreference}; based in ${candidateCity}

Job posting:
- Title: ${jobTitle}
- Description: ${jobDescription.substring(0, 2000)}

Step 1: List the hard requirements stated in the job description (required skills, years of experience, domain knowledge, must-have tools, required languages, work location).
Step 2: For each hard requirement, decide: does the candidate profile above clearly satisfy it? If yes, skip it. If no, it is a gap. Treat an on-site-only requirement outside ${candidateCity} as a location gap.
Step 3: Score 0-100. Start at 100 and deduct 20-30 pts for each gap. A job with 2+ gaps should score below 50.
missingRequirements must list ONLY things the job explicitly requires that the candidate does NOT have. Never list things the candidate has.`,
      `You are a strict job match evaluator. Protect the candidate from wasting time on roles they cannot do.
Respond with valid JSON only: {"score":<0-100>,"reasoning":"<2 sentences: what fits and what gaps exist>","missingRequirements":["<job requirement the candidate lacks>"]}`,
      { task: 'rating' }
    )
    const verified = (result.missingRequirements || []).filter((req) => !hasSkill(req))
    return { score: result.score, reasoning: result.reasoning, missingRequirements: verified }
  } catch {
    return { score: 50, reasoning: 'Unable to evaluate', missingRequirements: [] }
  }
}

export async function tailorCV(
  profile: Record<string, unknown>,
  workExperience: Array<Record<string, unknown>>,
  skills: Array<{ name: string }>,
  jobTitle: string,
  jobDescription: string
): Promise<{ tailoredSummary: string; highlightedSkills: string[]; reorderedExperience: number[] }> {
  const expSummary = workExperience
    .slice(0, 5)
    .map((e) => `[ID:${e.id}] ${e.title} at ${e.company} (${e.start_date}–${e.end_date || 'Present'}): ${String(e.description || '').substring(0, 200)}`)
    .join('\n')
  try {
    return await llmJson(
      `Tailor this candidate's CV for the following job.

Job: ${jobTitle}
Description: ${jobDescription.substring(0, 2000)}

Candidate summary: ${profile.summary || ''}
Skills: ${skills.map((s) => s.name).join(', ')}
Experience:
${expSummary}

Provide tailored content to maximize relevance for this role.`,
      `You are a professional CV writer. Tailor a candidate's CV for a specific job.
Respond with valid JSON only: {
  "tailoredSummary": "<rewritten 2-3 sentence professional summary>",
  "highlightedSkills": ["skill1", "skill2"],
  "reorderedExperience": [<array of work experience IDs in suggested order>]
}`,
      { task: 'tailoring' }
    )
  } catch {
    return {
      tailoredSummary: String(profile.summary || ''),
      highlightedSkills: skills.slice(0, 10).map((s) => s.name),
      reorderedExperience: workExperience.map((e) => e.id as number)
    }
  }
}

export async function generateCoverLetter(
  profileName: string,
  jobTitle: string,
  company: string,
  jobDescription: string,
  tailoredSummary: string
): Promise<string> {
  try {
    return await llmComplete(
      `Write a cover letter for this application:

Applicant: ${profileName}
Role: ${jobTitle} at ${company}
Job description: ${jobDescription.substring(0, 1500)}
Professional summary: ${tailoredSummary}

Write a complete, ready-to-send cover letter.`,
      `You are a professional cover letter writer. Write concise, compelling cover letters.
Write in first person. No placeholders. 3-4 short paragraphs. Professional but warm tone.`
    )
  } catch {
    return `Dear Hiring Manager,\n\nI am writing to express my strong interest in the ${jobTitle} position at ${company}.\n\n${tailoredSummary}\n\nI would welcome the opportunity to discuss how my experience aligns with your needs.\n\nBest regards,\n${profileName}`
  }
}

export async function parseProfileFromText(cvText: string): Promise<Record<string, unknown>> {
  // Split into multiple focused calls so each fits in the model's context window.
  // A single giant call causes small models (qwen2.5:1.5b etc.) to truncate mid-output.
  const text = cvText.substring(0, 8000)

  // 1. Personal info + summary
  const personal = await llmJson<Record<string, unknown>>(
    `Extract personal contact information and professional summary from this CV:\n\n${text}`,
    `You are a CV parser. Extract ONLY personal info and summary.
Return JSON: {"full_name":"","email":"","phone":"","location":"","linkedin_url":"","website_url":"","github_url":"","summary":"","languages":[{"language":"","proficiency":""}],"target_titles":[""],"missing_fields":[]}`
  ).catch(() => ({}))

  // 2. Work experience — ask for ALL entries explicitly
  const workResult = await llmJson<{ work_experience: Array<Record<string, unknown>> }>(
    `List ALL work experience entries from this CV. Include every job, even old or short ones.\n\nCV:\n${text}`,
    `You are a CV parser. Extract ALL work experience entries.
Return JSON: {"work_experience":[{"company":"","title":"","location":"","start_date":"","end_date":"","is_current":false,"description":"bullet points joined with newlines","achievements":""}]}`
  ).catch(() => ({ work_experience: [] }))

  // 3. Education, skills, certifications
  const eduSkills = await llmJson<{ education: Array<Record<string, unknown>>; skills: Array<Record<string, unknown>>; certifications: Array<Record<string, unknown>> }>(
    `Extract education, skills, and certifications from this CV:\n\n${text}`,
    `You are a CV parser. Extract education, skills, and certifications.
Return JSON: {
  "education":[{"institution":"","degree":"","field_of_study":"","graduation_year":"","gpa":"","honors":""}],
  "skills":[{"name":"","category":"Technical","proficiency":"Intermediate"}],
  "certifications":[{"name":"","issuing_org":"","year":""}]
}`
  ).catch(() => ({ education: [], skills: [], certifications: [] }))

  return {
    ...personal,
    work_experience: workResult.work_experience || [],
    education: eduSkills.education || [],
    skills: eduSkills.skills || [],
    certifications: eduSkills.certifications || [],
  }
}
