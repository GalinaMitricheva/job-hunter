import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface AppConfig {
  llm: {
    provider: 'claude' | 'ollama' | 'openrouter'
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
