import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export type LlmProvider = 'claude' | 'ollama' | 'openrouter' | 'claude-cli'

export interface AppConfig {
  llm: {
    provider: LlmProvider
    // When the primary provider errors (throttling, CLI failure, network),
    // retry the call once on this provider. Empty string disables fallback.
    fallbackProvider: LlmProvider | ''
    claudeApiKey: string
    model: string
    ollamaBaseUrl: string
    ollamaModel: string
    ollamaTimeoutSec: number
    // OpenRouter (OpenAI-compatible). Rating and tailoring can use different models.
    openrouterApiKey: string
    openrouterBaseUrl: string
    openrouterRatingModel: string
    openrouterTailoringModel: string
    // Headless Claude Code — runs on your Claude Pro/Max subscription (not the
    // paid API). Requires Claude Code installed and logged in on this machine.
    // Rating and tailoring can use different models; claudeCliModel is the
    // fallback used when the per-task field is empty.
    claudeCliCommand: string
    claudeCliModel: string
    claudeCliRatingModel: string
    claudeCliTailoringModel: string
  }
  search: {
    schedule: string
    fitScoreThreshold: number
    companyUrls: string[]
    headlessBrowser: boolean
    jobBoards: {
      enabled: boolean
      sites: string[]   // "indeed" | "stepstone"
      locations: string[]
    }
  }
  linkedin: {
    enabled: boolean
    email: string
    password: string
  }
  autoApply: boolean
  reviewPort: number
}

let _config: AppConfig | null = null

export function getConfig(): AppConfig {
  if (_config) return _config
  const configPath = join(process.cwd(), 'config.json')
  if (!existsSync(configPath)) {
    throw new Error(
      'config.json not found. Copy config.example.json to config.json and fill in your settings.'
    )
  }
  _config = JSON.parse(readFileSync(configPath, 'utf-8')) as AppConfig
  return _config
}
