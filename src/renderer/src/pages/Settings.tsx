import { useEffect, useState } from 'react'
import { Save, Loader2, CheckCircle, XCircle, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { Settings as SettingsType } from '../types'
import { cn } from '../lib/utils'

const SCHEDULES = [
  { value: 'manual', label: 'Manual only' },
  { value: '3h', label: 'Every 3 hours' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: 'daily', label: 'Daily at...' }
]

const TEMPLATES = [
  { value: 'classic', label: 'Classic', desc: 'Clean, traditional, ATS-friendly' },
  { value: 'modern', label: 'Modern', desc: 'Color accent, two-column layout' },
  { value: 'minimal', label: 'Minimal', desc: 'Single column, strong typography' }
]

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [ollamaStatus, setOllamaStatus] = useState<{ connected: boolean; models: string[]; error?: string } | null>(null)
  const [checkingOllama, setCheckingOllama] = useState(false)
  const [linkedinEmail, setLinkedinEmail] = useState('')
  const [linkedinPassword, setLinkedinPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [savingLinkedIn, setSavingLinkedIn] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [backingUp, setBackingUp] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [dataPath, setDataPath] = useState<string>('')

  useEffect(() => { load() }, [])

  async function load() {
    const [s, p] = await Promise.all([
      window.electron.getSettings(),
      window.electron.getDataPath()
    ])
    setSettings(s)
    if (s?.linkedin_email) setLinkedinEmail(s.linkedin_email)
    setDataPath(p || '')
  }

  async function checkOllama() {
    setCheckingOllama(true)
    const result = await window.electron.checkOllama()
    setOllamaStatus(result)
    setCheckingOllama(false)
  }

  async function save() {
    if (!settings) return
    setSaving(true)
    await window.electron.saveSettings(settings)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    showToast('Settings saved')
  }

  async function saveLinkedIn() {
    if (!linkedinEmail || !linkedinPassword) return
    setSavingLinkedIn(true)
    await window.electron.saveLinkedInCredentials(linkedinEmail, linkedinPassword)
    setLinkedinPassword('')
    load()
    setSavingLinkedIn(false)
    showToast('LinkedIn credentials saved securely')
  }

  async function clearLinkedIn() {
    await window.electron.clearLinkedInCredentials()
    setLinkedinEmail('')
    setLinkedinPassword('')
    load()
    showToast('LinkedIn credentials removed')
  }

  function addCompanyUrl() {
    if (!newUrl.trim() || !settings) return
    setSettings((s: any) => ({ ...s, company_urls: [...(s.company_urls || []), newUrl.trim()] }))
    setNewUrl('')
  }

  function removeCompanyUrl(i: number) {
    setSettings((s: any) => ({ ...s, company_urls: s.company_urls.filter((_: any, j: number) => j !== i) }))
  }

  async function backup() {
    setBackingUp(true)
    const result = await window.electron.backupData()
    setBackingUp(false)
    if (!result.cancelled) showToast('Backup saved to ' + result.path)
  }

  async function restore() {
    const result = await window.electron.restoreData()
    if (result?.success) showToast('Restore complete — please restart the app')
    else if (!result?.cancelled) showToast('Restore failed')
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  if (!settings) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="text-blue-500 animate-spin" /></div>

  return (
    <div className="p-6 max-w-2xl animate-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Configure Ollama, LinkedIn, search schedule, and more</p>
      </div>

      <div className="space-y-8">
        {/* Ollama */}
        <section>
          <h2 className="text-sm font-semibold text-slate-200 mb-4 pb-2 border-b border-slate-700/50">Ollama AI Configuration</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Ollama API URL</label>
                <input value={settings.ollama_url} onChange={(e) => setSettings((s: any) => ({ ...s, ollama_url: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Model</label>
                <input value={settings.ollama_model} onChange={(e) => setSettings((s: any) => ({ ...s, ollama_model: e.target.value }))} placeholder="e.g. llama3, mistral" />
              </div>
            </div>
            {ollamaStatus?.connected && ollamaStatus.models.length > 0 && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Available Models</label>
                <select value={settings.ollama_model} onChange={(e) => setSettings((s: any) => ({ ...s, ollama_model: e.target.value }))} className="w-full">
                  {ollamaStatus.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={checkOllama} disabled={checkingOllama} className="flex items-center gap-2 px-4 py-2 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-slate-100 text-sm rounded-md transition-colors">
                {checkingOllama ? <Loader2 size={14} className="animate-spin" /> : null}
                Test Connection
              </button>
              {ollamaStatus && (
                <div className={cn('flex items-center gap-2 text-sm', ollamaStatus.connected ? 'text-emerald-400' : 'text-red-400')}>
                  {ollamaStatus.connected ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {ollamaStatus.connected ? `Connected · ${ollamaStatus.models.length} model${ollamaStatus.models.length !== 1 ? 's' : ''}` : `Offline${ollamaStatus.error ? ': ' + ollamaStatus.error : ''}`}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* LinkedIn */}
        <section>
          <h2 className="text-sm font-semibold text-slate-200 mb-4 pb-2 border-b border-slate-700/50">LinkedIn Credentials</h2>
          <p className="text-xs text-slate-500 mb-3">Stored encrypted on your machine using Windows Credential Manager. Never uploaded anywhere.</p>
          {settings.has_linkedin_credentials && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg mb-3">
              <CheckCircle size={14} className="text-emerald-400" />
              <span className="text-sm text-emerald-300">Credentials saved for {settings.linkedin_email}</span>
              <button onClick={clearLinkedIn} className="ml-auto text-xs text-red-400 hover:text-red-300">Remove</button>
            </div>
          )}
          <div className="space-y-2">
            <input value={linkedinEmail} onChange={(e) => setLinkedinEmail(e.target.value)} placeholder="LinkedIn email" type="email" />
            <div className="relative">
              <input value={linkedinPassword} onChange={(e) => setLinkedinPassword(e.target.value)} placeholder="LinkedIn password" type={showPassword ? 'text' : 'password'} className="pr-10" />
              <button onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button onClick={saveLinkedIn} disabled={savingLinkedIn || !linkedinEmail || !linkedinPassword} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm rounded-md transition-colors">
              {savingLinkedIn ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save Credentials
            </button>
          </div>
        </section>

        {/* Company URLs */}
        <section>
          <h2 className="text-sm font-semibold text-slate-200 mb-4 pb-2 border-b border-slate-700/50">Company Career Pages</h2>
          <p className="text-xs text-slate-500 mb-3">Add career page URLs to scrape for open positions</p>
          <div className="space-y-2 mb-3">
            {(settings.company_urls || []).map((url, i) => (
              <div key={i} className="flex items-center gap-2 p-2.5 bg-slate-700/40 border border-slate-600/50 rounded-md">
                <span className="text-sm text-slate-300 flex-1 truncate">{url}</span>
                <button onClick={() => removeCompanyUrl(i)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCompanyUrl()} placeholder="https://company.com/careers" />
            <button onClick={addCompanyUrl} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-md"><Plus size={16} /></button>
          </div>
        </section>

        {/* Schedule */}
        <section>
          <h2 className="text-sm font-semibold text-slate-200 mb-4 pb-2 border-b border-slate-700/50">Search Schedule</h2>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {SCHEDULES.map((s) => (
              <button key={s.value} onClick={() => setSettings((p: any) => ({ ...p, search_schedule: s.value }))} className={cn('py-2 px-3 text-sm rounded-md border transition-colors text-left', settings.search_schedule === s.value ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-600 text-slate-400 hover:border-slate-500')}>
                {s.label}
              </button>
            ))}
          </div>
          {settings.search_schedule === 'daily' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Time:</label>
              <input type="time" value={settings.search_schedule_time} onChange={(e) => setSettings((s: any) => ({ ...s, search_schedule_time: e.target.value }))} className="w-36" />
            </div>
          )}
        </section>

        {/* CV Template */}
        <section>
          <h2 className="text-sm font-semibold text-slate-200 mb-4 pb-2 border-b border-slate-700/50">Default CV Template</h2>
          <div className="grid grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button key={t.value} onClick={() => setSettings((s: any) => ({ ...s, cv_template: t.value }))} className={cn('p-3 rounded-lg border text-left transition-colors', settings.cv_template === t.value ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500 bg-slate-800/40')}>
                <p className="text-sm font-medium text-slate-200">{t.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Browser & Notifications */}
        <section>
          <h2 className="text-sm font-semibold text-slate-200 mb-4 pb-2 border-b border-slate-700/50">Application Settings</h2>
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm text-slate-200">Run browser in background (headless)</p>
                <p className="text-xs text-slate-500">Disable to watch the browser fill the form</p>
              </div>
              <div onClick={() => setSettings((s: any) => ({ ...s, headless_browser: s.headless_browser ? 0 : 1 }))} className={cn('w-10 h-5 rounded-full transition-colors relative', settings.headless_browser ? 'bg-blue-600' : 'bg-slate-600')}>
                <div className={cn('w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all', settings.headless_browser ? 'left-5.5' : 'left-0.5')} style={{ left: settings.headless_browser ? '22px' : '2px' }} />
              </div>
            </label>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Notification score threshold ({settings.notification_threshold})</label>
              <input type="range" min="10" max="100" value={settings.notification_threshold} onChange={(e) => setSettings((s: any) => ({ ...s, notification_threshold: Number(e.target.value) }))} className="w-full accent-blue-500" />
            </div>
          </div>
        </section>

        {/* Data */}
        <section>
          <h2 className="text-sm font-semibold text-slate-200 mb-4 pb-2 border-b border-slate-700/50">Data & Backup</h2>
          <div className="mb-4 p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg">
            <p className="text-xs text-slate-400 mb-1 font-medium">Your data is stored in your Documents folder</p>
            <p className="text-xs text-slate-500 mb-2">
              This location survives app reinstalls, updates, and uninstalls — your profile and preferences are always safe.
            </p>
            {dataPath && (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-slate-900/60 text-slate-300 px-2 py-1.5 rounded border border-slate-700/50 truncate font-mono">
                  {dataPath}
                </code>
                <button
                  onClick={() => window.electron.openDataFolder()}
                  className="flex-shrink-0 px-3 py-1.5 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-slate-100 text-xs rounded-md transition-colors"
                >
                  Open →
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-3">Backup exports your database and generated CVs as a ZIP. Restore replaces all current data — use with caution.</p>
          <div className="flex gap-3 flex-wrap">
            <button onClick={backup} disabled={backingUp} className="flex items-center gap-2 px-4 py-2 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-slate-100 text-sm rounded-md transition-colors">
              {backingUp ? <Loader2 size={14} className="animate-spin" /> : null}
              Backup to ZIP
            </button>
            <button onClick={restore} className="flex items-center gap-2 px-4 py-2 border border-amber-600/50 hover:border-amber-500 text-amber-400 hover:text-amber-300 text-sm rounded-md transition-colors">
              Restore from ZIP
            </button>
          </div>
        </section>

        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-700 border border-slate-600 text-slate-200 text-sm px-4 py-3 rounded-lg shadow-xl animate-in">
          {toast}
        </div>
      )}
    </div>
  )
}
