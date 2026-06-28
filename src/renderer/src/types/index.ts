export interface Profile {
  id: number
  full_name: string
  email: string
  phone: string
  location: string
  linkedin_url: string
  website_url: string
  github_url: string
  summary: string
  onboarding_complete: number
  created_at: string
  updated_at: string
}

export interface WorkExperience {
  id?: number
  company: string
  title: string
  location: string
  start_date: string
  end_date: string
  is_current: number
  description: string
  achievements: string
  sort_order?: number
}

export interface Education {
  id?: number
  institution: string
  degree: string
  field_of_study: string
  graduation_year: string
  gpa: string
  honors: string
  sort_order?: number
}

export interface Skill {
  id?: number
  name: string
  category: string
  proficiency: string
  sort_order?: number
}

export interface Certification {
  id?: number
  name: string
  issuing_org: string
  year: string
  sort_order?: number
}

export interface JobPreferences {
  target_titles: string[]
  target_industries: string[]
  location_type: string
  preferred_locations: string[]
  seniority_level: string
  employment_types: string[]
  salary_min?: number
  salary_max?: number
  salary_currency: string
  include_keywords: string[]
  exclude_keywords: string[]
  exclude_companies: string[]
  relevance_threshold: number
}

export interface JobResult {
  id: number
  search_run_id: number
  source: string
  job_url: string
  company: string
  title: string
  location: string
  posted_date: string
  job_description: string
  relevance_score: number
  relevance_reasoning: string
  status: string
  found_at: string
}

export interface Application {
  id: number
  job_result_id: number
  company: string
  title: string
  job_url: string
  job_description: string
  cv_version_id: number
  cover_letter: string
  status: string
  application_status: string
  submission_screenshot: string
  failure_reason: string
  queued_at: string
  submitted_at: string
  notes: string
  tailored_summary?: string
  tailored_content?: string
  pdf_path?: string
  template?: string
}

export interface AppStats {
  total: number
  submitted: number
  skipped: number
  failed: number
  queued: number
  last30: number
  recent: Array<{ company: string; title: string; status: string; submitted_at: string; queued_at: string }>
}

export interface Settings {
  ollama_url: string
  ollama_model: string
  search_schedule: string
  search_schedule_time: string
  linkedin_email: string
  company_urls: string[]
  cv_template: string
  headless_browser: number
  notification_threshold: number
  has_linkedin_credentials: boolean
}

export interface OllamaStatus {
  connected: boolean
  models: string[]
  error?: string
}

export interface SourceError {
  source: string
  error: string
  type: string
}
