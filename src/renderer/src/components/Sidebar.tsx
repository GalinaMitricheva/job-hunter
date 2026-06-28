import { NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, User, Star, Search, ListChecks,
  History, Settings, Briefcase, Loader2, RefreshCw
} from 'lucide-react'
import { cn } from '../lib/utils'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/results', icon: Search, label: 'Search Results' },
  { to: '/queue', icon: ListChecks, label: 'Review Queue' },
  { to: '/history', icon: History, label: 'History' },
  { separator: true },
  { to: '/profile', icon: User, label: 'My Profile' },
  { to: '/preferences', icon: Star, label: 'Preferences' },
  { to: '/settings', icon: Settings, label: 'Settings' }
]

export default function Sidebar() {
  const navigate = useNavigate()
  const [searching, setSearching] = useState(false)
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null)
  const [queueCount, setQueueCount] = useState(0)

  useEffect(() => {
    window.electron.checkOllama().then((r: any) => setOllamaOnline(r.connected)).catch(() => setOllamaOnline(false))
    window.electron.getQueue().then((q: any[]) => setQueueCount(q?.length || 0)).catch(() => {})

    window.electron.onSearchStarted(() => setSearching(true))
    window.electron.onSearchCompleted((result: any) => {
      setSearching(false)
      if (result?.newResults?.length > 0) navigate('/results')
    })
    window.electron.onTriggerSearch(() => handleSearch())
    window.electron.onQueueCountUpdated((count: number) => setQueueCount(count))

    return () => {
      window.electron.removeAllListeners('search:started')
      window.electron.removeAllListeners('search:completed')
      window.electron.removeAllListeners('trigger:search')
      window.electron.removeAllListeners('queue:count-updated')
    }
  }, [])

  async function handleSearch() {
    if (searching) return
    setSearching(true)
    try {
      await window.electron.runSearch()
      navigate('/results')
    } catch {
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
      {/* Titlebar drag region */}
      <div className="drag-region h-9 flex items-center px-4 border-b border-slate-800">
        <div className="no-drag flex items-center gap-2">
          <Briefcase size={16} className="text-blue-500" />
          <span className="text-sm font-semibold text-slate-100">Job Hunter Pro</span>
        </div>
      </div>

      {/* Search button */}
      <div className="p-3">
        <button
          onClick={handleSearch}
          disabled={searching}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {searching ? 'Searching...' : 'Run Search'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
        {NAV.map((item, i) => {
          if ('separator' in item) {
            return <div key={i} className="my-2 border-t border-slate-800" />
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors relative',
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={16} className={isActive ? 'text-blue-400' : ''} />
                  {item.label}
                  {item.to === '/queue' && queueCount > 0 && (
                    <span className="ml-auto bg-blue-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {queueCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Ollama status */}
      <div className="p-3 border-t border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className={cn('w-2 h-2 rounded-full flex-shrink-0', ollamaOnline === null ? 'bg-slate-600' : ollamaOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')} />
          <span>
            {ollamaOnline === null ? 'Checking Ollama...' : ollamaOnline ? 'Ollama connected' : 'Ollama offline'}
          </span>
        </div>
      </div>
    </div>
  )
}
