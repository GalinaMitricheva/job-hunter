import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, Send, XCircle, Clock, TrendingUp, ChevronRight, AlertCircle, Search, Calendar, AlertTriangle } from 'lucide-react'
import { AppStats, SourceError } from '../types'
import { timeAgo, statusBadge, formatDate } from '../lib/utils'
import { cn } from '../lib/utils'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<AppStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [ollamaStatus, setOllamaStatus] = useState<{ connected: boolean; models: string[] } | null>(null)
  const [searchInfo, setSearchInfo] = useState<{ nextRun: string | null; lastRun: any } | null>(null)
  const [completeness, setCompleteness] = useState<{ score: number; missing: string[] } | null>(null)

  useEffect(() => {
    Promise.all([
      window.electron.getStats(),
      window.electron.checkOllama(),
      window.electron.getNextRunTime(),
      window.electron.getProfileCompleteness()
    ]).then(([s, o, sr, c]) => {
      setStats(s)
      setOllamaStatus(o)
      setSearchInfo(sr)
      setCompleteness(c)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const statCards = [
    { label: 'In Queue', value: stats?.queued || 0, icon: Clock, color: 'text-sky-400', bg: 'bg-sky-500/10', action: () => navigate('/queue') },
    { label: 'Submitted', value: stats?.submitted || 0, icon: Send, color: 'text-emerald-400', bg: 'bg-emerald-500/10', action: () => navigate('/history') },
    { label: 'Last 30 days', value: stats?.last30 || 0, icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-500/10', action: () => navigate('/history') },
    { label: 'Skipped', value: stats?.skipped || 0, icon: XCircle, color: 'text-slate-400', bg: 'bg-slate-500/10', action: () => navigate('/history') }
  ]

  return (
    <div className="p-6 max-w-5xl animate-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Your job search at a glance</p>
      </div>

      {!ollamaStatus?.connected && (
        <div className="flex items-start gap-3 p-4 mb-6 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 text-sm font-medium">Ollama is not connected</p>
            <p className="text-amber-400/70 text-xs mt-0.5">AI features (job scoring, CV tailoring, cover letters) are paused. Start Ollama and check Settings.</p>
          </div>
          <button onClick={() => navigate('/settings')} className="ml-auto text-amber-400 hover:text-amber-300 text-xs underline whitespace-nowrap">
            Go to Settings
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => (
          <button
            key={card.label}
            onClick={card.action}
            className="p-4 bg-slate-800/60 border border-slate-700/50 rounded-lg text-left hover:border-slate-600 transition-all hover:bg-slate-800 group"
          >
            <div className={cn('w-8 h-8 rounded-md flex items-center justify-center mb-3', card.bg)}>
              <card.icon size={16} className={card.color} />
            </div>
            <div className="text-2xl font-bold text-slate-100 mb-1">{card.value}</div>
            <div className="text-xs text-slate-500">{card.label}</div>
          </button>
        ))}
      </div>

      {/* Profile completeness */}
      {completeness && (
        <div className="mb-6 p-4 bg-slate-800/60 border border-slate-700/50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-200">Profile strength</span>
              <span className={cn('text-sm font-bold', completeness.score >= 80 ? 'text-emerald-400' : completeness.score >= 50 ? 'text-amber-400' : 'text-red-400')}>
                {completeness.score}%
              </span>
            </div>
            <button onClick={() => navigate('/profile')} className="text-xs text-blue-400 hover:text-blue-300 underline">
              {completeness.score === 100 ? 'View profile' : 'Complete profile'} →
            </button>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-1.5 mb-3">
            <div
              className={cn('h-1.5 rounded-full transition-all', completeness.score >= 80 ? 'bg-emerald-500' : completeness.score >= 50 ? 'bg-amber-500' : 'bg-red-500')}
              style={{ width: `${completeness.score}%` }}
            />
          </div>
          {completeness.missing.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {completeness.missing.map((m) => (
                <span key={m} className="text-xs px-2 py-0.5 bg-slate-700/60 text-slate-400 rounded-full">{m}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-500">All key sections complete — your profile is ready for applications</p>
          )}
        </div>
      )}

      {/* Search status row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-slate-800/60 border border-slate-700/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Search size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Last Search</span>
          </div>
          {searchInfo?.lastRun ? (
            <div>
              <p className="text-sm text-slate-200">{timeAgo(searchInfo.lastRun.started_at)}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {searchInfo.lastRun.new_results} new results · {searchInfo.lastRun.status}
              </p>
              {(searchInfo.lastRun.source_errors as SourceError[] | undefined)?.map((e, i) => (
                <div key={i} className="flex items-start gap-1.5 mt-2">
                  <AlertTriangle size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-xs text-amber-400/80 leading-snug">
                    <span className="font-medium text-amber-300">{e.source === 'linkedin' ? 'LinkedIn' : e.source}: </span>
                    {e.error}
                    {e.source === 'linkedin' && (
                      <a href="https://www.linkedin.com/login" target="_blank" rel="noreferrer" className="ml-1 underline text-amber-300 hover:text-amber-100">
                        Sign in →
                      </a>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No searches run yet</p>
          )}
        </div>
        <div className="p-4 bg-slate-800/60 border border-slate-700/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Next Scheduled Search</span>
          </div>
          {searchInfo?.nextRun ? (
            <div>
              <p className="text-sm text-slate-200">{formatDate(searchInfo.nextRun)}</p>
              <p className="text-xs text-slate-500 mt-0.5">{timeAgo(searchInfo.nextRun).replace(' ago', '')} from now</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No schedule active — use sidebar to run manually</p>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-sm font-medium text-slate-200">Recent Activity</h2>
          <button onClick={() => navigate('/history')} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
            View all <ChevronRight size={12} />
          </button>
        </div>
        {!stats?.recent?.length ? (
          <div className="py-12 text-center">
            <Briefcase size={32} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No activity yet</p>
            <p className="text-slate-600 text-xs mt-1">Run a search to find job opportunities</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {stats.recent.map((item, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-700/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.company}</p>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full border capitalize', statusBadge(item.status))}>
                  {item.status.replace('_', ' ')}
                </span>
                <span className="text-xs text-slate-600 whitespace-nowrap">
                  {timeAgo(item.submitted_at || item.queued_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
