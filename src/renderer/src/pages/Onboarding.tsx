import { useState } from 'react'
import { Briefcase, User, GraduationCap, Code, CheckCircle } from 'lucide-react'
import { cn } from '../lib/utils'

const STEPS = [
  { id: 'welcome', icon: Briefcase, title: 'Welcome to Job Hunter Pro' },
  { id: 'personal', icon: User, title: 'Personal Information' },
  { id: 'experience', icon: Briefcase, title: 'Work Experience' },
  { id: 'education', icon: GraduationCap, title: 'Education' },
  { id: 'skills', icon: Code, title: 'Skills' },
  { id: 'done', icon: CheckCircle, title: 'All Set!' }
]

interface Props { onComplete: () => void }

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [personal, setPersonal] = useState({ full_name: '', email: '', phone: '', location: '', linkedin_url: '', website_url: '', github_url: '', summary: '' })
  const [exp, setExp] = useState({ company: '', title: '', location: '', start_date: '', end_date: '', is_current: false, description: '', achievements: '' })
  const [edu, setEdu] = useState({ institution: '', degree: '', field_of_study: '', graduation_year: '', gpa: '', honors: '' })
  const [skillInput, setSkillInput] = useState('')
  const [skills, setSkills] = useState<{ name: string; category: string; proficiency: string }[]>([])

  async function handleFinish() {
    setSaving(true)
    try {
      await window.electron.saveBasicProfile(personal)
      if (exp.company && exp.title) await window.electron.saveWorkExperience({ ...exp, is_current: exp.is_current ? 1 : 0 })
      if (edu.institution && edu.degree) await window.electron.saveEducation(edu)
      for (const s of skills) await window.electron.saveSkill(s)
      await window.electron.completeOnboarding()
      onComplete()
    } finally {
      setSaving(false)
    }
  }

  function addSkill() {
    if (!skillInput.trim()) return
    setSkills((prev) => [...prev, { name: skillInput.trim(), category: 'Technical', proficiency: 'Intermediate' }])
    setSkillInput('')
  }

  const current = STEPS[step]

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Briefcase size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Job Hunter Pro</h1>
          <p className="text-slate-400 text-sm mt-1">Let's set up your profile</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className={cn('h-1 flex-1 rounded-full transition-all', i <= step ? 'bg-blue-500' : 'bg-slate-700')} />
          ))}
        </div>

        {/* Step card */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 animate-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
              <current.icon size={16} className="text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-100">{current.title}</h2>
          </div>

          {step === 0 && (
            <div className="space-y-3">
              <p className="text-slate-300">Job Hunter Pro will:</p>
              {['Find job openings on LinkedIn and company career pages', 'Score matches using your local Ollama AI model', 'Tailor your CV and cover letter for each role', 'Submit applications after you approve them'].map((t) => (
                <div key={t} className="flex items-start gap-2 text-sm text-slate-400">
                  <CheckCircle size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                  {t}
                </div>
              ))}
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-400">
                Make sure Ollama is running at http://localhost:11434 with a model installed (e.g. <code>ollama pull llama3</code>)
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Full Name *</label><input value={personal.full_name} onChange={(e) => setPersonal((p) => ({ ...p, full_name: e.target.value }))} placeholder="Jane Smith" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Email *</label><input type="email" value={personal.email} onChange={(e) => setPersonal((p) => ({ ...p, email: e.target.value }))} placeholder="jane@example.com" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Phone</label><input value={personal.phone} onChange={(e) => setPersonal((p) => ({ ...p, phone: e.target.value }))} placeholder="+1 555 0100" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Location</label><input value={personal.location} onChange={(e) => setPersonal((p) => ({ ...p, location: e.target.value }))} placeholder="New York, NY" /></div>
              </div>
              <div><label className="text-xs text-slate-400 mb-1 block">LinkedIn URL</label><input value={personal.linkedin_url} onChange={(e) => setPersonal((p) => ({ ...p, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/in/..." /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Professional Summary</label><textarea rows={3} value={personal.summary} onChange={(e) => setPersonal((p) => ({ ...p, summary: e.target.value }))} placeholder="Brief overview of your professional background and key strengths..." className="resize-none" /></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">Add your most recent role (you can add more later)</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Job Title</label><input value={exp.title} onChange={(e) => setExp((p) => ({ ...p, title: e.target.value }))} placeholder="Senior Engineer" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Company</label><input value={exp.company} onChange={(e) => setExp((p) => ({ ...p, company: e.target.value }))} placeholder="Acme Corp" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Start Date</label><input value={exp.start_date} onChange={(e) => setExp((p) => ({ ...p, start_date: e.target.value }))} placeholder="Jan 2022" /></div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-xs text-slate-400">End Date</label>
                    <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={exp.is_current} onChange={(e) => setExp((p) => ({ ...p, is_current: e.target.checked }))} className="w-3 h-3" />
                      Current
                    </label>
                  </div>
                  <input disabled={exp.is_current} value={exp.end_date} onChange={(e) => setExp((p) => ({ ...p, end_date: e.target.value }))} placeholder="Dec 2023" className="disabled:opacity-50" />
                </div>
              </div>
              <div><label className="text-xs text-slate-400 mb-1 block">Description</label><textarea rows={3} value={exp.description} onChange={(e) => setExp((p) => ({ ...p, description: e.target.value }))} placeholder="What you did and built..." className="resize-none" /></div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div><label className="text-xs text-slate-400 mb-1 block">Institution</label><input value={edu.institution} onChange={(e) => setEdu((p) => ({ ...p, institution: e.target.value }))} placeholder="MIT" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Degree</label><input value={edu.degree} onChange={(e) => setEdu((p) => ({ ...p, degree: e.target.value }))} placeholder="B.S." /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">Field of Study</label><input value={edu.field_of_study} onChange={(e) => setEdu((p) => ({ ...p, field_of_study: e.target.value }))} placeholder="Computer Science" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 mb-1 block">Graduation Year</label><input value={edu.graduation_year} onChange={(e) => setEdu((p) => ({ ...p, graduation_year: e.target.value }))} placeholder="2020" /></div>
                <div><label className="text-xs text-slate-400 mb-1 block">GPA (optional)</label><input value={edu.gpa} onChange={(e) => setEdu((p) => ({ ...p, gpa: e.target.value }))} placeholder="3.8" /></div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSkill()} placeholder="Type a skill and press Enter" className="flex-1" />
                <button onClick={addSkill} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md">Add</button>
              </div>
              <div className="flex flex-wrap gap-2 min-h-[60px]">
                {skills.map((s, i) => (
                  <span key={i} className="flex items-center gap-1 px-3 py-1 bg-slate-700 text-slate-300 text-sm rounded-full">
                    {s.name}
                    <button onClick={() => setSkills((prev) => prev.filter((_, j) => j !== i))} className="text-slate-500 hover:text-red-400 ml-1">×</button>
                  </span>
                ))}
                {!skills.length && <p className="text-slate-600 text-sm self-center">No skills added yet</p>}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center py-4">
              <CheckCircle size={48} className="text-emerald-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-100 mb-2">You're all set!</h3>
              <p className="text-slate-400 text-sm">Your profile is ready. You can run your first job search from the sidebar.</p>
              <div className="mt-4 p-3 bg-slate-700/50 rounded-lg text-xs text-slate-400 text-left space-y-1">
                <p>Next steps:</p>
                <p>1. Go to <strong className="text-slate-300">Preferences</strong> to set target job titles</p>
                <p>2. Add your LinkedIn credentials in <strong className="text-slate-300">Settings</strong></p>
                <p>3. Click <strong className="text-slate-300">Run Search</strong> in the sidebar</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 disabled:opacity-0 transition-colors"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Get Started
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
