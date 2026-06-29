export const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  website_url TEXT,
  github_url TEXT,
  summary TEXT,
  raw_cv_text TEXT,
  languages TEXT NOT NULL DEFAULT '[]',
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_experience (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  achievements TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS education (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institution TEXT NOT NULL,
  degree TEXT NOT NULL,
  field_of_study TEXT,
  graduation_year TEXT,
  gpa TEXT,
  honors TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Technical',
  proficiency TEXT NOT NULL DEFAULT 'Intermediate',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  issuing_org TEXT,
  year TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  org TEXT,
  year TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS job_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  target_titles TEXT NOT NULL DEFAULT '[]',
  target_industries TEXT NOT NULL DEFAULT '[]',
  location_type TEXT NOT NULL DEFAULT 'Remote',
  preferred_locations TEXT NOT NULL DEFAULT '[]',
  seniority_level TEXT NOT NULL DEFAULT 'Senior',
  employment_types TEXT NOT NULL DEFAULT '["Full-time"]',
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT DEFAULT 'USD',
  include_keywords TEXT NOT NULL DEFAULT '[]',
  exclude_keywords TEXT NOT NULL DEFAULT '[]',
  exclude_companies TEXT NOT NULL DEFAULT '[]',
  relevance_threshold INTEGER NOT NULL DEFAULT 60
);

CREATE TABLE IF NOT EXISTS search_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  sources TEXT NOT NULL DEFAULT '[]',
  query_used TEXT,
  total_found INTEGER NOT NULL DEFAULT 0,
  new_results INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  source_errors TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS job_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  search_run_id INTEGER REFERENCES search_runs(id),
  source TEXT NOT NULL,
  job_url TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  posted_date TEXT,
  job_description TEXT,
  relevance_score INTEGER,
  relevance_reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  found_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_result_id INTEGER REFERENCES job_results(id),
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  job_url TEXT NOT NULL,
  job_description TEXT,
  cv_version_id INTEGER,
  cover_letter TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  application_status TEXT NOT NULL DEFAULT 'In Progress',
  submission_screenshot TEXT,
  failure_reason TEXT,
  manual_steps TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS cv_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER REFERENCES applications(id),
  template TEXT NOT NULL DEFAULT 'classic',
  tailored_summary TEXT,
  tailored_content TEXT NOT NULL DEFAULT '{}',
  pdf_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_job_results_url ON job_results(job_url);
CREATE INDEX IF NOT EXISTS idx_job_results_status ON job_results(status);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_submitted ON applications(submitted_at);
`
