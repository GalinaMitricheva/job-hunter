import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../lib/utils'

const SKILL_CATEGORIES = ['Technical', 'Soft Skills', 'Languages', 'Tools & Platforms']
const PROFICIENCY_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert']

export default function Profile() {
  const [data, setData] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeSection, setActiveSection] = useState('personal')
  const [completeness, setCompleteness] = useState<{ score: number; missing: string[] } | null>(null)

  const [personal, setPersonal] = useState<any>({})
  const [workExp, setWorkExp] = useState<any[]>([])
  const [education, setEducation] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [certs, setCerts] = useState<any[]>([])
  const [newSkill, setNewSkill] = useState({ name: '', category: 'Technical', proficiency: 'Intermediate' })

  useEffect(() => { load() }, [])

  async function load() {
    const [d, c] = await Promise.all([
      window.electron.getProfile(),
      window.electron.getProfileCompleteness()
    ])
    setData(d)
    setPersonal(d.profile || {})
    setWorkExp(d.workExperience || [])
    setEducation(d.education || [])
    setSkills(d.skills || [])
    setCerts(d.certifications || [])
    setCompleteness(c)
  }

  async function refreshCompleteness() {
    const c = await window.electron.getProfileCompleteness()
    setCompleteness(c)
  }

  async function savePersonal() {
    setSaving(true)
    await window.electron.saveBasicProfile(personal)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    refreshCompleteness()
  }

  async function saveExp(item: any) {
    const res = await window.electron.saveWorkExperience({ ...item, is_current: item.is_current ? 1 : 0 })
    if (!item.id) setWorkExp((prev) => prev.map((e) => e === item ? { ...e, id: res.id } : e))
    refreshCompleteness()
  }

  async function deleteExp(id: number) {
    await window.electron.deleteWorkExperience(id)
    setWorkExp((prev) => prev.filter((e) => e.id !== id))
    refreshCompleteness()
  }

  async function saveEdu(item: any) {
    const res = await window.electron.saveEducation(item)
    if (!item.id) setEducation((prev) => prev.map((e) => e === item ? { ...e, id: res.id } : e))
    refreshCompleteness()
  }

  async function deleteEdu(id: number) {
    await window.electron.deleteEducation(id)
    setEducation((prev) => prev.filter((e) => e.id !== id))
    refreshCompleteness()
  }

  async function addSkill() {
    if (!newSkill.name.trim()) return
    const res = await window.electron.saveSkill(newSkill)
    setSkills((prev) => [...prev, { ...newSkill, id: res.id }])
    setNewSkill({ name: '', category: 'Technical', proficiency: 'Intermediate' })
    refreshCompleteness()
  }

  async function deleteSkill(id: number) {
    await window.electron.deleteSkill(id)
    setSkills((prev) => prev.filter((s) => s.id !== id))
    refreshCompleteness()
  }

  async function addCert(cert: any) {
    const res = await window.electron.saveCertification(cert)
    setCerts((prev) => [...prev, { ...cert, id: res.id }])
    refreshCompleteness()
  }

  async function deleteCert(id: number) {
    await window.electron.deleteCertification(id)
    setCerts((prev) => prev.filter((c) => c.id !== id))
    refreshCompleteness()
  }

  const sections = [
    { id: 'personal', label: 'Personal Info' },
    { id: 'experience', label: `Experience (${workExp.length})` },
    { id: 'education', label: `Education (${education.length})` },
    { id: 'skills', label: `Skills (${skills.length})` },
    { id: 'certs', label: `Certifications (${certs.length})` }
  ]

  return (
    <div className="p-6 max-w-3xl animate-in">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">My Profile</h1>
          <p className="text-slate-400 text-sm mt-1">Your professional information used for CV generation</p>
        </div>
        {completeness && (
          <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/50 rounded-lg px-4 py-2.5">
            <div className="text-right">
              <p className="text-xs text-slate-500">Profile strength</p>
              <p className={`text-lg font-bold ${completeness.score >= 80 ? 'text-emerald-400' : completeness.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {completeness.score}%
              </p>
            </div>
            <div className="w-12 h-12 relative flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.9" fill="none"
                  stroke={completeness.score >= 80 ? '#10b981' : completeness.score >= 50 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="3"
                  strokeDasharray={`${completeness.score} ${100 - completeness.score}`}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 bg-slate-800/60 p-1 rounded-lg border border-slate-700/50">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={cn('flex-1 py-1.5 text-xs font-medium rounded-md transition-colors', activeSection === s.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300')}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Personal info */}
      {activeSection === 'personal' && (
        <div className="space-y-4 animate-in">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name" value={personal.full_name} onChange={(v) => setPersonal((p: any) => ({ ...p, full_name: v }))} />
            <Field label="Email" value={personal.email} onChange={(v) => setPersonal((p: any) => ({ ...p, email: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" value={personal.phone} onChange={(v) => setPersonal((p: any) => ({ ...p, phone: v }))} />
            <Field label="Location" value={personal.location} onChange={(v) => setPersonal((p: any) => ({ ...p, location: v }))} />
          </div>
          <Field label="LinkedIn URL" value={personal.linkedin_url} onChange={(v) => setPersonal((p: any) => ({ ...p, linkedin_url: v }))} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Website / Portfolio" value={personal.website_url} onChange={(v) => setPersonal((p: any) => ({ ...p, website_url: v }))} />
            <Field label="GitHub" value={personal.github_url} onChange={(v) => setPersonal((p: any) => ({ ...p, github_url: v }))} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Professional Summary</label>
            <textarea rows={5} value={personal.summary || ''} onChange={(e) => setPersonal((p: any) => ({ ...p, summary: e.target.value }))} placeholder="Brief overview of your professional background..." className="resize-none" />
          </div>
          <button onClick={savePersonal} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-sm font-medium rounded-md transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      )}

      {/* Work Experience */}
      {activeSection === 'experience' && (
        <div className="space-y-4 animate-in">
          {workExp.map((item, i) => (
            <ExpCard key={item.id || i} item={item} onChange={(updated) => setWorkExp((prev) => prev.map((e, j) => j === i ? updated : e))} onSave={() => saveExp(item)} onDelete={() => item.id && deleteExp(item.id)} />
          ))}
          <button onClick={() => setWorkExp((prev) => [...prev, { company: '', title: '', location: '', start_date: '', end_date: '', is_current: 0, description: '', achievements: '' }])} className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-600 hover:border-slate-500 rounded-lg text-slate-400 hover:text-slate-300 text-sm transition-colors">
            <Plus size={16} /> Add Work Experience
          </button>
        </div>
      )}

      {/* Education */}
      {activeSection === 'education' && (
        <div className="space-y-4 animate-in">
          {education.map((item, i) => (
            <div key={item.id || i} className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Institution" value={item.institution} onChange={(v) => setEducation((prev) => prev.map((e, j) => j === i ? { ...e, institution: v } : e))} />
                <Field label="Degree" value={item.degree} onChange={(v) => setEducation((prev) => prev.map((e, j) => j === i ? { ...e, degree: v } : e))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Field of Study" value={item.field_of_study} onChange={(v) => setEducation((prev) => prev.map((e, j) => j === i ? { ...e, field_of_study: v } : e))} />
                <Field label="Graduation Year" value={item.graduation_year} onChange={(v) => setEducation((prev) => prev.map((e, j) => j === i ? { ...e, graduation_year: v } : e))} />
                <Field label="GPA (optional)" value={item.gpa} onChange={(v) => setEducation((prev) => prev.map((e, j) => j === i ? { ...e, gpa: v } : e))} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveEdu(item)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md">Save</button>
                {item.id && <button onClick={() => deleteEdu(item.id)} className="px-3 py-1.5 text-red-400 hover:text-red-300 text-xs"><Trash2 size={12} /></button>}
              </div>
            </div>
          ))}
          <button onClick={() => setEducation((prev) => [...prev, { institution: '', degree: '', field_of_study: '', graduation_year: '', gpa: '', honors: '' }])} className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-600 hover:border-slate-500 rounded-lg text-slate-400 hover:text-slate-300 text-sm transition-colors">
            <Plus size={16} /> Add Education
          </button>
        </div>
      )}

      {/* Skills */}
      {activeSection === 'skills' && (
        <div className="space-y-4 animate-in">
          <div className="flex gap-2">
            <input value={newSkill.name} onChange={(e) => setNewSkill((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addSkill()} placeholder="Skill name" className="flex-1" />
            <select value={newSkill.category} onChange={(e) => setNewSkill((p) => ({ ...p, category: e.target.value }))} className="w-40">
              {SKILL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={newSkill.proficiency} onChange={(e) => setNewSkill((p) => ({ ...p, proficiency: e.target.value }))} className="w-36">
              {PROFICIENCY_LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
            <button onClick={addSkill} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md whitespace-nowrap">Add</button>
          </div>
          {SKILL_CATEGORIES.map((cat) => {
            const catSkills = skills.filter((s) => s.category === cat)
            if (!catSkills.length) return null
            return (
              <div key={cat} className="space-y-2">
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">{cat}</h3>
                <div className="flex flex-wrap gap-2">
                  {catSkills.map((s) => (
                    <div key={s.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/60 border border-slate-600 rounded-full text-sm">
                      <span className="text-slate-200">{s.name}</span>
                      <span className="text-slate-500 text-xs">· {s.proficiency}</span>
                      <button onClick={() => deleteSkill(s.id)} className="text-slate-600 hover:text-red-400 ml-1 leading-none">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Certifications */}
      {activeSection === 'certs' && (
        <div className="space-y-3 animate-in">
          {certs.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm text-slate-200">{c.name}</p>
                <p className="text-xs text-slate-500">{[c.issuing_org, c.year].filter(Boolean).join(' · ')}</p>
              </div>
              <button onClick={() => deleteCert(c.id)} className="text-slate-600 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
          ))}
          <AddCertForm onAdd={addCert} />
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function ExpCard({ item, onChange, onSave, onDelete }: any) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg overflow-hidden">
      <div className="flex items-center px-4 py-3 cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-200">{item.title || 'New Position'}</p>
          <p className="text-xs text-slate-500">{item.company}</p>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Job Title" value={item.title} onChange={(v) => onChange({ ...item, title: v })} />
            <Field label="Company" value={item.company} onChange={(v) => onChange({ ...item, company: v })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Start Date" value={item.start_date} onChange={(v) => onChange({ ...item, start_date: v })} />
            <div>
              <label className="text-xs text-slate-400 mb-1 block">End Date</label>
              <input disabled={!!item.is_current} value={item.end_date || ''} onChange={(e) => onChange({ ...item, end_date: e.target.value })} className="disabled:opacity-50" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" checked={!!item.is_current} onChange={(e) => onChange({ ...item, is_current: e.target.checked ? 1 : 0 })} />
                Currently here
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description</label>
            <textarea rows={3} value={item.description || ''} onChange={(e) => onChange({ ...item, description: e.target.value })} className="resize-none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Key Achievements (one per line)</label>
            <textarea rows={3} value={item.achievements || ''} onChange={(e) => onChange({ ...item, achievements: e.target.value })} placeholder="- Led migration to microservices..." className="resize-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={onSave} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-md">Save</button>
            {onDelete && <button onClick={onDelete} className="px-3 py-1.5 text-red-400 hover:text-red-300 text-xs flex items-center gap-1"><Trash2 size=  {12} /> Delete</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function AddCertForm({ onAdd }: { onAdd: (c: any) => void }) {
  const [form, setForm] = useState({ name: '', issuing_org: '', year: '' })
  return (
    <div className="flex gap-2 items-end">
      <Field label="Certification Name" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
      <Field label="Issuing Org" value={form.issuing_org} onChange={(v) => setForm((p) => ({ ...p, issuing_org: v }))} />
      <Field label="Year" value={form.year} onChange={(v) => setForm((p) => ({ ...p, year: v }))} />
      <button onClick={() => { if (form.name) { onAdd(form); setForm({ name: '', issuing_org: '', year: '' }) } }} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md whitespace-nowrap h-[38px]">Add</button>
    </div>
  )
}
