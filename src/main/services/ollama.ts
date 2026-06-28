import { getDb } from '../db'

interface OllamaModel {
  name: string
  modified_at: string
  size: number
}

interface OllamaResponse {
  model: string
  response?: string
  message?: { content: string }
  done: boolean
}

function getOllamaConfig(): { url: string; model: string } {
  const db = getDb()
  const settings = db.prepare('SELECT ollama_url, ollama_model FROM settings WHERE id = 1').get() as any
  return {
    url: settings?.ollama_url || 'http://localhost:11434',
    model: settings?.ollama_model || 'llama3'
  }
}

export async function checkOllamaConnection(): Promise<{ connected: boolean; models: string[]; error?: string }> {
  const { url } = getOllamaConfig()
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { connected: false, models: [], error: `HTTP ${res.status}` }
    const data = (await res.json()) as { models: OllamaModel[] }
    const models = (data.models || []).map((m) => m.name)
    return { connected: true, models }
  } catch (err: any) {
    return { connected: false, models: [], error: err.message }
  }
}

async function generate(prompt: string, systemPrompt?: string): Promise<string> {
  const { url, model } = getOllamaConfig()
  const body: any = {
    model,
    prompt,
    stream: false
  }
  if (systemPrompt) body.system = systemPrompt

  const res = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  })

  if (!res.ok) throw new Error(`Ollama error: HTTP ${res.status}`)
  const data = (await res.json()) as OllamaResponse
  return data.response || ''
}

export async function scoreJobRelevance(
  jobTitle: string,
  jobDescription: string,
  profileSummary: string,
  skills: string[],
  targetTitles: string[]
): Promise<{ score: number; reasoning: string }> {
  const systemPrompt = `You are a job match evaluator. Score how well a job posting matches a candidate's profile.
Always respond with valid JSON only: {"score": <0-100>, "reasoning": "<1-2 sentences>"}`

  const prompt = `Candidate profile:
- Summary: ${profileSummary || 'Not provided'}
- Skills: ${skills.join(', ')}
- Target roles: ${targetTitles.join(', ')}

Job posting:
- Title: ${jobTitle}
- Description: ${jobDescription.substring(0, 2000)}

Rate the match from 0-100 and explain why.`

  try {
    const raw = await generate(prompt, systemPrompt)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { score: 50, reasoning: 'Unable to evaluate' }
    const parsed = JSON.parse(jsonMatch[0])
    return {
      score: Math.min(100, Math.max(0, Number(parsed.score) || 50)),
      reasoning: String(parsed.reasoning || '')
    }
  } catch {
    return { score: 50, reasoning: 'Evaluation unavailable (Ollama offline)' }
  }
}

export async function tailorCV(
  profile: any,
  workExperience: any[],
  education: any[],
  skills: any[],
  jobTitle: string,
  jobDescription: string
): Promise<{ tailoredSummary: string; highlightedSkills: string[]; reorderedExperience: number[] }> {
  const systemPrompt = `You are a professional CV writer. Tailor a candidate's CV for a specific job.
Respond with valid JSON only: {
  "tailoredSummary": "<rewritten 2-3 sentence professional summary>",
  "highlightedSkills": ["skill1", "skill2", ...],
  "reorderedExperience": [<array of work experience IDs in suggested order>],
  "keywordsToEmphasize": ["keyword1", ...]
}`

  const expSummary = workExperience
    .slice(0, 5)
    .map((e) => `[ID:${e.id}] ${e.title} at ${e.company} (${e.start_date}–${e.end_date || 'Present'}): ${e.description?.substring(0, 200)}`)
    .join('\n')

  const prompt = `Tailor this candidate's CV for the following job.

Job: ${jobTitle}
Description: ${jobDescription.substring(0, 2000)}

Candidate summary: ${profile.summary || ''}
Skills: ${skills.map((s) => s.name).join(', ')}
Experience:
${expSummary}

Provide tailored content to maximize relevance for this role.`

  try {
    const raw = await generate(prompt, systemPrompt)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const parsed = JSON.parse(jsonMatch[0])
    return {
      tailoredSummary: parsed.tailoredSummary || profile.summary || '',
      highlightedSkills: parsed.highlightedSkills || skills.slice(0, 10).map((s: any) => s.name),
      reorderedExperience: parsed.reorderedExperience || workExperience.map((e: any) => e.id)
    }
  } catch {
    return {
      tailoredSummary: profile.summary || '',
      highlightedSkills: skills.slice(0, 10).map((s: any) => s.name),
      reorderedExperience: workExperience.map((e: any) => e.id)
    }
  }
}

export async function generateCoverLetter(
  profile: any,
  jobTitle: string,
  company: string,
  jobDescription: string,
  tailoredSummary: string
): Promise<string> {
  const systemPrompt = `You are a professional cover letter writer. Write concise, compelling cover letters.
Write in first person. No placeholders. 3-4 short paragraphs. Professional but warm tone.`

  const prompt = `Write a cover letter for this application:

Applicant: ${profile.full_name}
Role: ${jobTitle} at ${company}
Job description: ${jobDescription.substring(0, 1500)}
Professional summary: ${tailoredSummary}

Write a complete, ready-to-send cover letter.`

  try {
    return await generate(prompt, systemPrompt)
  } catch {
    return `Dear Hiring Manager,

I am writing to express my strong interest in the ${jobTitle} position at ${company}. With my background and expertise, I am confident I would be a valuable addition to your team.

${tailoredSummary}

I would welcome the opportunity to discuss how my experience aligns with your needs.

Best regards,
${profile.full_name}`
  }
}
