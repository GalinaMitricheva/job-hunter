import { useEffect, useState } from 'react'
import { ExternalLink, ChevronDown, ChevronUp, Plus, EyeOff, Bookmark, Loader2, RefreshCw, AlertTriangle, X, UserX } from 'lucide-react'
import { JobResult, SourceError } from '../types'
import { cn, scoreBg, timeAgo } from '../lib/utils'
import { useNavigate } from 'react-router-dom'

function sourceLabel(source: string): string {
  if (source === 'linkedin') return 'LinkedIn'
  try { return new URL(source).hostname } catch { return source }
}

function SourceErrorBanner({ errors, onDismiss }: { errors: SourceError[]; onDismiss: () => void }) {
  return (
    <div className="mb-5 bg-amber-950/40 border border-amber-700/50 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-300 mb-2">
            {errors.length === 1 ? '1 source had an issue' : `${errors.length} sources had issues`} — other results may still be shown below
          </p>
          <ul className="space-y-1.5">
            {errors.map((e, i) => (
              <li key={i} className="text-xs text-amber-400/80 flex items-start gap-2">
                <span className="font-medium text-amber-300 flex-shrink-0">{sourceLabel(e.source)}:</span>
                <span>{e.error}</span>
                {e.source === 'linkedin' && (
                  <a
                    href="https://www.linkedin.com/login"
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 flex-shrink-0 underline text-amber-300 hover:text-amber-100 transition-colors"
                  >
                    Open LinkedIn →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
        <button onClick={onDismiss} className="text-amber-600 hover:text-amber-400 flex-shrink-0" title="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export default function SearchResults() {
  const navigate = useNavigate()
  const [results, setResults] = useState<JobResult[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filter, setFilter] = useState<'new' | 'saved' | 'all'>('new')
  const [addingToQueue, setAddingToQueue] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sourceErrors, setSourceErrors] = useState<SourceError[]>([])
  const [errorsDismissed, setErrorsDismissed] = useState(false)
  const [showIncompleteWarning, setShowIncompleteWarning] = useState(false)
  const [missingProfileFields, setMissingProfileFields] = useState<string[]>([])

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    const params: any = {}
    if (filter !== 'all') params.status = filter
    const res = await window.electron.getSearchResults(params)
    setResults(res || [])
    setLoading(false)
  }

  async function handleRunSearch() {
    const completeness = await window.electron.getProfileCompleteness()
    if ((completeness?.score ?? 100) < 40) {
      setMissingProfileFields(completeness?.missing ?? [])
      setShowIncompleteWarning(true)
      return
    }
    await doSearch()
  }

  async function doSearch() {
    setShowIncompleteWarning(false)
    setSearching(true)
    setSourceErrors([])
    setErrorsDismissed(false)
    try {
      const result = await window.electron.runSearch()
      if (result?.sourceErrors?.length) {
        setSourceErrors(result.sourceErrors)
      }
      await load()
      const newCount = result?.newResults?.length ?? 0
      showToast(newCount > 0 ? `Search complete — ${newCount} new result${newCount !== 1 ? 's' : ''}` : 'Search complete — no new results')
    } catch (err: any) {
      showToast('Search failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSearching(false)
    }
  }

  async function addToQueue(job: JobResult) {
    setAddingToQueue(job.id)
    try {
      const res = await window.electron.addToQueue(job.id)
      if (res.error) { showToast(res.error); return }
      await window.electron.updateJobStatus(job.id, 'queued')
      setResults((prev) => prev.filter((r) => r.id !== job.id))
      showToast('Added to review queue')
    } finally {
      setAddingToQueue(null)
    }
  }

  async function skipJob(job: JobResult) {
    await window.electron.updateJobStatus(job.id, 'skipped')
    setResults((prev) => prev.filter((r) => r.id !== job.id))
  }

  async function saveJob(job: JobResult) {
    await window.electron.updateJobStatus(job.id, 'saved')
    setResults((prev) => prev.map((r) => r.id === job.id ? { ...r, status: 'saved' } : r))
    showToast('Saved for later')
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const filtered = filter === 'all' ? results : results.filter((r) => r.status === filter || (filter === 'new' && r.status === 'new'))
  const showErrors = sourceErrors.length > 0 && !errorsDismissed

  return (
    <div className="p-6 animate-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Search Results</h1>
          <p className="text-slate-400 text-sm mt-1">{results.length} results · Sorted by relevance</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700/50">
            {(['new', 'saved', 'all'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cn('px-3 py-1 text-sm rounded-md capitalize transition-colors', filter === f ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300')}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={handleRunSearch} disabled={searching} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm rounded-lg transition-colors">
            {searching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {searching ? 'Searching...' : 'Refresh'}
          </button>
        </div>
      </div>

      {showErrors && (
        <SourceErrorBanner errors={sourceErrors} onDismiss={() => setErrorsDismissed(true)} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-blue-500 animate-spin" />
        </div>
      ) : !filtered.length ? (
        <div className="text-center py-20">
          <p className="text-slate-500 text-sm">No results found</p>
          <p className="text-slate-600 text-xs mt-1">Run a search to discover job opportunities</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {filtered.map((job) => (
            <div key={job.id} className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden hover:border-slate-600 transition-all">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Score badge */}
                  <div className={cn('score-ring border', scoreBg(job.relevance_score || 0))}>
                    {job.relevance_score || '?'}
                  </div>

                  {/* Job info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium text-slate-100 text-sm">{job.title}</h3>
                        <p className="text-slate-400 text-xs mt-0.5">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-600">{timeAgo(job.found_at)}</span>
                        <a href={job.job_url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300" title="Open job posting">
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </div>

                    {job.relevance_reasoning && (
                      <p className="text-xs text-slate-500 mt-1.5 italic">"{job.relevance_reasoning}"</p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => addToQueue(job)}
                        disabled={addingToQueue === job.id || job.status === 'queued'}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-xs rounded-md transition-colors"
                      >
                        {addingToQueue === job.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        {job.status === 'queued' ? 'In Queue' : 'Add to Queue'}
                      </button>
                      <button onClick={() => saveJob(job)} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs border border-slate-600 hover:border-slate-500 rounded-md transition-colors">
                        <Bookmark size={12} /> Save
                      </button>
                      <button onClick={() => skipJob(job)} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-slate-300 text-xs rounded-md transition-colors">
                        <EyeOff size={12} /> Skip
                      </button>
                      <button onClick={() => setExpanded((e) => e === job.id ? null : job.id)} className="ml-auto text-slate-500 hover:text-slate-300 text-xs flex items-center gap-1">
                        {expanded === job.id ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded description */}
              {expanded === job.id && (
                <div className="border-t border-slate-700/50 p-4 animate-in">
                  <h4 className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Job Description</h4>
                  <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                    {job.job_description || 'No description available.'}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Incomplete profile warning dialog */}
      {showIncompleteWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <UserX size={16} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-100 mb-1">Profile is incomplete</h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Results may be low quality without a complete profile. Fill in the missing sections for better matches.
                </p>
                {missingProfileFields.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-amber-400 mb-1.5">Missing:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {missingProfileFields.map((field) => (
                        <button
                          key={field}
                          onClick={() => navigate('/profile')}
                          className="px-2 py-0.5 text-xs rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 transition-colors"
                        >
                          {field}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => navigate('/profile')}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                Go to Profile
              </button>
              <button
                onClick={() => doSearch()}
                className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
              >
                Search anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-700 border border-slate-600 text-slate-200 text-sm px-4 py-3 rounded-lg shadow-xl animate-in">
          {toast}
        </div>
      )}
    </div>
  )
}
