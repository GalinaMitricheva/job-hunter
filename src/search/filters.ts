// Pre-filter functions shared between search pipeline and golden eval

export const TOO_JUNIOR = /\b(intern|internship|entry.?level|junior|graduate|trainee|apprentice|student|early.?career)\b/i

// Role nouns that unambiguously belong to a different job function.
// `engineer`/`engineering`/`developer` are included because they are job-function
// words when they appear without a PM signal (e.g. "Data Engineer", "Engineering Manager").
// PM titles that mention engineering/developer as a *domain* always include a PM signal
// ("Senior PM", "Head of Product", etc.) which triggers the PM_SIGNAL override below.
// Deliberately excluded: `cloud`, `security` — appear too often as pure domain modifiers
// in PM titles without a PM signal word (e.g. "Cloud PM" or "Security Product Lead")
// and are better left to the LLM scorer.
// `jurist` uses a right-boundary-only match (\b on right) to catch German compounds
// like "Schadensjurist" where there is no left word boundary.
export const WRONG_FUNCTION = new RegExp(
  '\\b(devops|sre|backend|frontend|fullstack|full.?stack|firmware|hardware|soc|chip|calibrat|assembly|technician' +
  '|lawyer|counsel|legal|accounting|accountant|controller|audit|finance' +
  '|sales director|sales manager|account executive|account manager|business development' +
  '|field engineer|solutions engineer|customer success|customer support' +
  '|it director|it manager|business systems|revenue operations|revops' +
  '|engineer|engineering|developer)\\b' +
  '|jurist\\b',   // right-boundary only for German compounds
  'i'
)

// If the title also contains any of these PM signals, WRONG_FUNCTION is overridden.
// Covers abbreviated forms like "Senior PM" and "Staff PM" in addition to full titles.
export const PM_SIGNAL = /\b(product manager|product lead|product owner|head of product|vp\s+(of\s+)?product|director of product|group pm|principal pm|senior pm|staff pm|lead pm|chief product|cpo|program manager|technical pm|product strategy)\b|\bpm\b/i

export const NON_EU_LOCATION = /\b(united states|usa|\bU\.S\.?\b|california|new york|san francisco|seattle|austin|boston|chicago|los angeles|texas|florida|washington d\.?c|virginia|colorado|arizona|utah|wyoming|new mexico|oregon|illinois|georgia|ohio|pennsylvania|michigan|north carolina|south carolina|new jersey|connecticut|massachusetts|maryland|nevada|minnesota|wisconsin|missouri|indiana|alabama|tennessee|kentucky|oklahoma|louisiana|arkansas|mississippi|kansas|iowa|nebraska|south dakota|north dakota|idaho|montana|alaska|hawaii|singapore|tokyo|japan|sydney|australia|canada|toronto|vancouver|india|bangalore|hyderabad|brazil|mexico|china|beijing|shanghai|dubai|uae|south korea|seoul)\b/i

export function isJobPosting(title: string, description: string): boolean {
  const t = title.toLowerCase()
  // Keep window at 1000 chars — going wider causes navigation/listing pages to be
  // falsely accepted because "apply" links appear deep in the scraped content.
  const d = description.toLowerCase().substring(0, 1000)
  // Reject pages whose title is clearly not a job.
  // `$`-anchored alternatives in the group match exact strings (e.g. exactly "Engineering").
  // Prefix alternatives match any title starting with that word.
  if (/^(blog|home|search jobs|jobs?$|engineering$|careers?$|spotlight|rovo|newsletter|press$|analyst reports?|products?$|platform$|security$|pricing$|ai agent)/i.test(title.trim())) return false
  const markers = [
    // English
    'responsibilit', 'requirement', 'qualif', 'apply', 'we are looking', 'you will',
    'your role', 'what you', 'job description', 'about the role', "we're looking",
    'the opportunity', 'who you are', "what we're looking", 'we offer', 'join our',
    'compensation', 'salary', 'benefits',
    // German — covers jobs that have no English job-description language in the first 1000 chars
    'aufgaben', 'anforderungen', 'wir suchen', 'wir bieten', 'ihr profil',
    'deine aufgaben', 'stellenbeschreibung', 'was sie mitbringen', 'was du mitbringst',
  ]
  return markers.some((m) => t.includes(m) || d.includes(m))
}

export function makeLocationChecker(acceptsRemote: boolean, acceptsHybrid: boolean, homeCity: string): (jobLocation: string, description: string) => boolean {
  return function locationAccepted(jobLocationRaw: string, descriptionRaw: string): boolean {
    const loc = jobLocationRaw.toLowerCase()
    const locAndOpening = (loc + ' ' + descriptionRaw.substring(0, 500)).toLowerCase()
    if (NON_EU_LOCATION.test(locAndOpening)) return false

    const combined = (loc + ' ' + descriptionRaw.substring(0, 2000)).toLowerCase()
    if (acceptsRemote && /\bremote\b/.test(combined)) return true
    if (acceptsHybrid && /\bhybrid\b/.test(combined)) return true
    if (homeCity && combined.includes(homeCity)) return true
    if (combined.includes('germany')) return true
    if (!jobLocationRaw.trim()) return true
    return false
  }
}

export type FilterResult = 'pass' | 'not-a-job' | 'wrong-function' | 'too-junior' | 'location'

export function applyPreFilters(
  title: string,
  description: string,
  location: string,
  locationAccepted: (loc: string, desc: string) => boolean
): FilterResult {
  if (!isJobPosting(title, description)) return 'not-a-job'
  if (WRONG_FUNCTION.test(title) && !PM_SIGNAL.test(title)) return 'wrong-function'
  if (TOO_JUNIOR.test(title)) return 'too-junior'
  if (!locationAccepted(location, description)) return 'location'
  return 'pass'
}
