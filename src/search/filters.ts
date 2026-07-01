// Pre-filter functions shared between search pipeline and golden eval

export const TOO_JUNIOR = /\b(intern|internship|entry.?level|junior|graduate|trainee|apprentice|student|early.?career)\b/i

export const WRONG_FUNCTION = /\b(engineer|engineering|developer|devops|sre|security|cloud|backend|frontend|fullstack|full.?stack|firmware|hardware|soc|chip|calibrat|assembly|technician|lawyer|jurist|counsel|legal|accounting|accountant|revenue accounting|controller|finance|audit|sales director|sales manager|account executive|account manager|business development|field engineer|solutions engineer|customer success|customer support|it director|it manager|business systems|revenue operations|revops)\b/i

export const PM_SIGNAL = /\b(product manager|product lead|product owner|head of product|vp of product|director of product|group pm|principal pm|chief product|cpo|program manager|technical pm|product strategy)\b/i

export const NON_EU_LOCATION = /\b(united states|usa|\bU\.S\.?\b|california|new york|san francisco|seattle|austin|boston|chicago|los angeles|texas|florida|washington d\.?c|virginia|colorado|arizona|utah|wyoming|new mexico|oregon|illinois|georgia|ohio|pennsylvania|michigan|north carolina|south carolina|new jersey|connecticut|massachusetts|maryland|nevada|minnesota|wisconsin|missouri|indiana|alabama|tennessee|kentucky|oklahoma|louisiana|arkansas|mississippi|kansas|iowa|nebraska|south dakota|north dakota|idaho|montana|alaska|hawaii|singapore|tokyo|japan|sydney|australia|canada|toronto|vancouver|india|bangalore|hyderabad|brazil|mexico|china|beijing|shanghai|dubai|uae|south korea|seoul)\b/i

export function isJobPosting(title: string, description: string): boolean {
  const t = title.toLowerCase()
  const d = description.toLowerCase().substring(0, 1000)
  if (/^(blog|home|search jobs|jobs?$|engineering$|careers?$|spotlight|rovo|newsletter|about|news|press|analyst reports?|leadership|products?$|platform$|security$|pricing$|ai agent)/i.test(title.trim())) return false
  const markers = ['responsibilit', 'requirement', 'qualif', 'apply', 'we are looking', 'you will', 'your role', 'what you', 'job description', 'about the role', "we're looking", 'the opportunity', 'who you are', "what we're looking"]
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
