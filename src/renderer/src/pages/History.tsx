import { useEffect, useState } from 'react'
import { Search, Download, ChevronDown, ChevronUp, ExternalLink, Image } from 'lucide-react'
import { Application } from '../types'
import { cn, formatDate, statusBadge, timeAgo } from '../lib/utils'

const APPLICATION_STATUSES = ['In Progress', 'Submitted', 'Interview Scheduled', 'Offer Received', 'Rejected', 'Withdrawn']
const DISPLAY_STATUSES = ['', 'submitted', 'skipped', 'failed', 'draft']

type Tab = 'applications' | 'searches'

export default function History() {
  const [tab, setTab] = useState<Tab>('applications')
  const [apps, setApps] = useState<Application[]>([])
  const [searches, setSearches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedSearch, setExpandedSearch] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => { loadData() }, [tab])

  async function loadData() {
    setLoading(true)
    if (tab === 'applications') {
      const res = await window.electron.getApplicationHistory({ limit: 500 })
      setApps(res || [])
    } else {
      const res = await window.electron.getSearchHistory()
      setSearches(res || [])
    }
    setLoading(false)
  }

  async function updateStatus(id: number, applicationStatus: string) {
    await window.electron.updateApplicationStatus(id, applicationStatus)
    setApps((prev) => prev.map((a) => a.id === id ? { ...a, application_status: applicationStatus } : a))
  }

  function downloadCsv(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportCSV() {
    const csv = await window.electron.exportCSV()
    downloadCsv(csv, `applications-${new Date().toISOString().split('T')[0]}.csv`)
  }

  async function exportSearchCSV() {
    const csv = await window.electron.exportSearchCSV()
    downloadCsv(csv, `search-history-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const filteredApps = apps.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!a.company.toLowerCase().includes(q) && !a.title.toLowerCase().includes(q)) return false
    }
    if (dateFrom) {
      const itemDate = new Date(a.submitted_at || a.queued_at)
      if (itemDate < new Date(dateFrom)) return false
    }
    if (dateTo) {
      const itemDate = new Date(a.submitted_at || a.queued_at)
      if (itemDate > new Date(dateTo + 'T23:59:59')) return false
    }
    return true
  })

  const filteredSearches = searches.filter((r) => {
    if (dateFrom && new Date(r.started_at) < new Date(dateFrom)) return false
    if (dateTo && new Date(r.started_at) > new Date(dateTo + 'T23:59:59')) return false
    return true
  })

  return (
    <div className="p-6 animate-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">History</h1>
          <p className="text-slate-400 text-sm mt-1">All searches and applications</p>
        </div>
        <button
          onClick={tab === 'applications' ? exportCSV : exportSearchCSV}
          className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-slate-200 border border-slate-600 hover:border-slate-500 text-sm rounded-lg transition-colors"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-800 p-1 rounded-lg border border-slate-700/50 w-fit">
        {(['applications', 'searches'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn('px-4 py-1.5 text-sm rounded-md capitalize transition-colors', tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300')}>
            {t}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'applications' ? 'Search company or title…' : 'Search query…'}
            className="pl-9 w-full"
          />
        </div>
        {tab === 'applications' && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            {DISPLAY_STATUSES.slice(1).map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
        )}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 whitespace-nowrap">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 whitespace-nowrap">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 text-sm" />
        </div>
        {(dateFrom || dateTo || statusFilter || search) && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter(''); setSearch('') }}
            className="text-xs text-slate-500 hover:text-slate-300 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'applications' ? (
        <div className="space-y-2 max-w-3xl">
          {!filteredApps.length ? (
            <div className="text-center py-16 text-slate-500 text-sm">No applications match your filters</div>
          ) : filteredApps.map((app) => (
            <div key={app.id} className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-200 truncate">{app.title}</p>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border capitalize flex-shrink-0', statusBadge(app.status))}>
                      {app.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{app.company}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <select
                    value={app.application_status || 'In Progress'}
                    onChange={(e) => updateStatus(app.id, e.target.value)}
                    className="text-xs py-1 px-2 w-44 bg-slate-700 border-slate-600"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {APPLICATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                  <span className="text-xs text-slate-600 whitespace-nowrap">{formatDate(app.submitted_at || app.queued_at)}</span>
                  <button onClick={() => setExpanded((e) => e === app.id ? null : app.id)} className="text-slate-500 hover:text-slate-300">
                    {expanded === app.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>
              {expanded === app.id && (
                <div className="border-t border-slate-700/50 p-4 space-y-3 animate-in">
                  <div className="flex gap-3 flex-wrap items-center">
                    {app.job_url && (
                      <a href={app.job_url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        <ExternalLink size={12} /> Job posting
                      </a>
                    )}
                    {(app as any).pdf_path && (
                      <button
                        onClick={() => window.electron.openFile((app as any).pdf_path)}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <ExternalLink size={12} /> Open CV PDF
                      </button>
                    )}
                    {(app as any).submission_screenshot && (
                      <button
                        onClick={() => window.electron.openFile((app as any).submission_screenshot)}
                        className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                      >
                        <Image size={12} /> View screenshot
                      </button>
                    )}
                    {app.submitted_at && (
                      <span className="text-xs text-slate-500">Submitted: {formatDate(app.submitted_at)}</span>
                    )}
                    {(app as any).failure_reason && (
                      <span className="text-xs text-red-400">Error: {(app as any).failure_reason}</span>
                    )}
                  </div>
                  {app.job_description && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Job Description:</p>
                      <p className="text-xs text-slate-400 line-clamp-5 leading-relaxed whitespace-pre-wrap">{app.job_description}</p>
                    </div>
                  )}
                  {app.cover_letter && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Cover Letter Preview:</p>
                      <p className="text-xs text-slate-400 line-clamp-4 leading-relaxed">{app.cover_letter}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {!filteredSearches.length ? (
            <div className="text-center py-16 text-slate-500 text-sm">No search runs match your filters</div>
          ) : filteredSearches.map((run: any) => (
            <div key={run.id} className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
              <div className="flex items-center gap-4 px-4 py-3 cursor-pointer" onClick={() => setExpandedSearch((e) => e === run.id ? null : run.id)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200">{run.query_used || 'Automated search'}</p>
                  <p className="text-xs text-slate-500">{formatDate(run.started_at)} · {run.new_results} new · {run.total_found} total</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border', run.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20')}>
                    {run.status}
                  </span>
                  {expandedSearch === run.id ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </div>
              </div>
              {expandedSearch === run.id && run.results?.length > 0 && (
                <div className="border-t border-slate-700/50 divide-y divide-slate-700/30 animate-in">
                  {run.results.map((r: any) => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={cn('text-xs font-bold w-8 text-center flex-shrink-0', r.relevance_score >= 70 ? 'text-emerald-400' : r.relevance_score >= 50 ? 'text-sky-400' : 'text-slate-400')}>{r.relevance_score}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-300 truncate">{r.title}</p>
                        <p className="text-xs text-slate-500 truncate">{r.company}</p>
                      </div>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded capitalize', statusBadge(r.status))}>{r.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
