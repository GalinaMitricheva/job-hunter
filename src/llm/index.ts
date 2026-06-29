import Anthropic from '@anthropic-ai/sdk'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { getConfig } from '../config'

export async function llmComplete(prompt: string, system?: string): Promise<string> {
  const cfg = getConfig()
  if (cfg.llm.provider === 'claude') {
    return claudeComplete(prompt, system, cfg.llm.model)
  }
  return ollamaComplete(prompt, system, cfg.llm.ollamaBaseUrl, cfg.llm.ollamaModel, cfg.llm.ollamaTimeoutSec ?? 600)
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

export async function llmJson<T>(prompt: string, system?: string): Promise<T> {
  const raw = await llmComplete(prompt, system)
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
  targetTitles: string[]
): Promise<{ score: number; reasoning: string }> {
  try {
    return await llmJson<{ score: number; reasoning: string }>(
      `Candidate profile:
- Summary: ${profileSummary || 'Not provided'}
- Skills: ${skills.join(', ')}
- Target roles: ${targetTitles.join(', ')}

Job posting:
- Title: ${jobTitle}
- Description: ${jobDescription.substring(0, 2000)}

Rate the match from 0-100 and explain why.`,
      `You are a job match evaluator. Score how well a job posting matches a candidate's profile.
Always respond with valid JSON only: {"score": <0-100>, "reasoning": "<1-2 sentences>"}`
    )
  } catch {
    return { score: 50, reasoning: 'Unable to evaluate' }
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
}`
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
Return JSON: {"full_name":"","email":"","phone":"","location":"","linkedin_url":"","website_url":"","github_url":"","summary":"","target_titles":[""],"missing_fields":[]}`
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
