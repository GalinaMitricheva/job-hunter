import Anthropic from '@anthropic-ai/sdk'
import { getConfig } from '../config'

export async function llmComplete(prompt: string, system?: string): Promise<string> {
  const cfg = getConfig()
  if (cfg.llm.provider === 'claude') {
    return claudeComplete(prompt, system, cfg.llm.model)
  }
  return ollamaComplete(prompt, system, cfg.llm.ollamaBaseUrl, cfg.llm.ollamaModel)
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

async function ollamaComplete(
  prompt: string,
  system: string | undefined,
  baseUrl: string,
  model: string
): Promise<string> {
  const body: Record<string, unknown> = { model, prompt, stream: false }
  if (system) body.system = system
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((cfg.llm.ollamaTimeoutSec ?? 600) * 1000)
  })
  if (!res.ok) throw new Error(`Ollama error: HTTP ${res.status}`)
  const data = (await res.json()) as { response?: string }
  return data.response || ''
}

export async function llmJson<T>(prompt: string, system?: string): Promise<T> {
  const raw = await llmComplete(prompt, system)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found in LLM response')
  return JSON.parse(match[0]) as T
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
  return llmJson(
    `Extract a structured professional profile from this CV text:\n\n${cvText.substring(0, 6000)}`,
    `You are a CV parser. Extract structured data from CV text.
Return JSON with this exact shape:
{
  "full_name": "string",
  "email": "string",
  "phone": "string",
  "location": "string",
  "linkedin_url": "string",
  "website_url": "string",
  "github_url": "string",
  "summary": "string",
  "work_experience": [
    {"company":"","title":"","location":"","start_date":"","end_date":"","is_current":false,"description":"","achievements":""}
  ],
  "education": [
    {"institution":"","degree":"","field_of_study":"","graduation_year":"","gpa":"","honors":""}
  ],
  "skills": [{"name":"","category":"Technical","proficiency":"Intermediate"}],
  "certifications": [{"name":"","issuing_org":"","year":""}],
  "target_titles": ["string"],
  "missing_fields": ["list of fields that seem missing or unclear"]
}`
  )
}
