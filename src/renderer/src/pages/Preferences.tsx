import { useEffect, useState } from 'react'
import { Save, Loader2, Plus, X } from 'lucide-react'

const SENIORITY = ['Junior', 'Mid', 'Senior', 'Lead', 'Director', 'VP', 'C-Level']
const LOCATION_TYPES = ['Remote', 'Hybrid', 'On-site', 'Any']
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance']

export default function Preferences() {
  const [prefs, setPrefs] = useState<any>({
    target_titles: [], target_industries: [], location_type: 'Remote', preferred_locations: [],
    seniority_level: 'Senior', employment_types: ['Full-time'], salary_min: '', salary_max: '',
    salary_currency: 'USD', include_keywords: [], exclude_keywords: [], exclude_companies: [],
    relevance_threshold: 60
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [inputs, setInputs] = useState<Record<string, string>>({})

  useEffect(() => {
    window.electron.getProfile().then((d: any) => {
      if (d.preferences) setPrefs(d.preferences)
    })
  }, [])

  async function save() {
    setSaving(true)
    await window.electron.savePreferences(prefs)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function addToList(field: string, inputKey: string) {
    const val = (inputs[inputKey] || '').trim()
    if (!val) return
    setPrefs((p: any) => ({ ...p, [field]: [...(p[field] || []), val] }))
    setInputs((p) => ({ ...p, [inputKey]: '' }))
  }

  function removeFromList(field: string, idx: number) {
    setPrefs((p: any) => ({ ...p, [field]: p[field].filter((_: any, i: number) => i !== idx) }))
  }

  function toggleEmployment(type: string) {
    setPrefs((p: any) => ({
      ...p,
      employment_types: p.employment_types.includes(type)
        ? p.employment_types.filter((t: string) => t !== type)
        : [...p.employment_types, type]
    }))
  }

  return (
    <div className="p-6 max-w-2xl animate-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Job Preferences</h1>
        <p className="text-slate-400 text-sm mt-1">Used to drive job searches and AI relevance scoring</p>
      </div>

      <div className="space-y-6">
        {/* Target titles */}
        <Section title="Target Job Titles" description="Roles you're looking for">
          <TagInput field="target_titles" inputKey="title" placeholder="e.g. Senior Software Engineer" />
        </Section>

        {/* Location */}
        <Section title="Location" description="Preferred work arrangement">
          <div className="flex gap-2 mb-3">
            {LOCATION_TYPES.map((t) => (
              <button key={t} onClick={() => setPrefs((p: any) => ({ ...p, location_type: t }))} className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${prefs.location_type === t ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>{t}</button>
            ))}
          </div>
          <TagInput field="preferred_locations" inputKey="loc" placeholder="e.g. New York, NY" />
        </Section>

        {/* Seniority & Employment */}
        <div className="grid grid-cols-2 gap-6">
          <Section title="Seniority Level" description="">
            <select value={prefs.seniority_level} onChange={(e) => setPrefs((p: any) => ({ ...p, seniority_level: e.target.value }))}>
              {SENIORITY.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Section>
          <Section title="Employment Type" description="">
            <div className="flex flex-wrap gap-2">
              {EMPLOYMENT_TYPES.map((t) => (
                <button key={t} onClick={() => toggleEmployment(t)} className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${prefs.employment_types?.includes(t) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-600 text-slate-400 hover:border-slate-500'}`}>{t}</button>
              ))}
            </div>
          </Section>
        </div>

        {/* Salary */}
        <Section title="Salary Expectation" description="Optional — only shared if the application asks">
          <div className="flex items-center gap-3">
            <select value={prefs.salary_currency} onChange={(e) => setPrefs((p: any) => ({ ...p, salary_currency: e.target.value }))} className="w-24">
              <option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>AUD</option>
            </select>
            <input type="number" value={prefs.salary_min || ''} onChange={(e) => setPrefs((p: any) => ({ ...p, salary_min: e.target.value }))} placeholder="Min" className="w-32" />
            <span className="text-slate-500">–</span>
            <input type="number" value={prefs.salary_max || ''} onChange={(e) => setPrefs((p: any) => ({ ...p, salary_max: e.target.value }))} placeholder="Max" className="w-32" />
          </div>
        </Section>

        {/* Keywords */}
        <Section title="Include Keywords" description="Always add these to search queries">
          <TagInput field="include_keywords" inputKey="inc" placeholder="e.g. TypeScript, React" />
        </Section>

        <Section title="Exclude Keywords" description="Skip jobs containing these terms">
          <TagInput field="exclude_keywords" inputKey="exc" placeholder="e.g. PHP, .NET" />
        </Section>

        <Section title="Exclude Companies" description="Skip jobs from these companies">
          <TagInput field="exclude_companies" inputKey="excco" placeholder="e.g. Acme Corp" />
        </Section>

        {/* Relevance threshold */}
        <Section title="Notification Threshold" description="Notify when a match scores at or above this level">
          <div className="flex items-center gap-4">
            <input type="range" min="10" max="100" value={prefs.relevance_threshold} onChange={(e) => setPrefs((p: any) => ({ ...p, relevance_threshold: Number(e.target.value) }))} className="flex-1 accent-blue-500" />
            <span className="text-lg font-bold text-blue-400 w-10">{prefs.relevance_threshold}</span>
          </div>
        </Section>

        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saved ? 'Saved!' : 'Save Preferences'}
        </button>
      </div>
    </div>
  )

  function TagInput({ field, inputKey, placeholder }: { field: string; inputKey: string; placeholder: string }) {
    return (
      <div>
        <div className="flex gap-2 mb-2">
          <input value={inputs[inputKey] || ''} onChange={(e) => setInputs((p) => ({ ...p, [inputKey]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addToList(field, inputKey)} placeholder={placeholder} />
          <button onClick={() => addToList(field, inputKey)} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-md"><Plus size={14} /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(prefs[field] || []).map((val: string, i: number) => (
            <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 text-slate-300 text-sm rounded-full">
              {val}
              <button onClick={() => removeFromList(field, i)} className="text-slate-500 hover:text-red-400"><X size={12} /></button>
            </span>
          ))}
        </div>
      </div>
    )
  }
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      {children}
    </div>
  )
}
