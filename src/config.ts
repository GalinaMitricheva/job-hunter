import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface AppConfig {
  llm: {
    provider: 'claude' | 'ollama'
    claudeApiKey: string
    model: string
    ollamaBaseUrl: string
    ollamaModel: string
    ollamaTimeoutSec: number
  }
  search: {
    schedule: string
    fitScoreThreshold: number
    companyUrls: string[]
    headlessBrowser: boolean
  }
  linkedin: {
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
