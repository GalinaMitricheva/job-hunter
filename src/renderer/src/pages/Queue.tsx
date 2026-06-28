import { useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Edit3, Loader2, ExternalLink, ChevronLeft, RefreshCw, BookmarkCheck, FileText, Download } from 'lucide-react'
import { Application } from '../types'
import { timeAgo, cn } from '../lib/utils'

export default function Queue() {
  const [queue, setQueue] = useState<Application[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [cvHtml, setCvHtml] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingCover, setEditingCover] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(true)
  const [cvTab, setCvTab] = useState<'preview' | 'text'>('preview')
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const selectedRef = useRef<number | null>(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handler = async () => {
      if (selectedRef.current !== null) {
        const html = await window.electron.getCvHtml(selectedRef.current)
        setCvHtml(html)
      }
    }
    window.electron.onSettingsSaved(handler)
    return () => { window.electron.offSettingsSaved(handler) }
  }, [])

  async function load() {
    setLoading(true)
    const q = await window.electron.getQueue()
    setQueue(q || [])
    setLoading(false)
  }

  async function openDetail(id: number) {
    setSelected(id)
    selectedRef.current = id
    setDetail(null)
    setCvHtml(null)
    const [d, html] = await Promise.all([
      window.electron.getQueueDetail(id),
      window.electron.getCvHtml(id)
    ])
    setDetail(d)
    setCvHtml(html)
    setCoverLetter(d?.cover_letter || '')
  }

  async function approve() {
    if (!selected) return
    setSubmitting(true)
    try {
      if (editingCover) {
        await window.electron.updateCoverLetter(selected, coverLetter)
        setEditingCover(false)
      }
      const result = await window.electron.approveApplication(selected)
      if (result.success) {
        showToast('Application submitted successfully!', 'success')
        setSelected(null)
        selectedRef.current = null
        setDetail(null)
        setCvHtml(null)
        load()
      } else {
        showToast(result.error || 'Submission failed — browser opened for manual apply', 'error')
        load()
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function skip() {
    if (!selected) return
    await window.electron.skipApplication(selected)
    setSelected(null)
    selectedRef.current = null
    setDetail(null)
    setCvHtml(null)
    load()
  }

  async function saveDraft() {
    if (!selected) return
    await window.electron.saveDraft(selected)
    showToast('Saved as draft', 'success')
    setSelected(null)
    selectedRef.current = null
    load()
  }

  async function regenerateCV() {
    if (!selected) return
    const res = await window.electron.regenerateCV(selected)
    if (res.success) {
      const html = await window.electron.getCvHtml(selected)
      setCvHtml(html)
      showToast('CV regenerated', 'success')
    }
  }

  async function downloadPdf() {
    if (!selected) return
    setDownloadingPdf(true)
    try {
      const res = await window.electron.regenerateCV(selected)
      if (res.success && res.pdfPath) {
        await window.electron.openFile(res.pdfPath)
        setCvHtml(await window.electron.getCvHtml(selected))
      } else if (detail.pdf_path) {
        await window.electron.openFile(detail.pdf_path)
      } else {
        showToast('PDF generation failed', 'error')
      }
    } finally {
      setDownloadingPdf(false)
    }
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="text-blue-500 animate-spin" /></div>
  }

  if (selected && detail) {
    return (
      <div className="h-full flex flex-col animate-in">
        {/* Detail header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm flex-shrink-0">
          <button onClick={() => { setSelected(null); selectedRef.current = null; setDetail(null); setCvHtml(null) }} className="text-slate-400 hover:text-slate-200 flex items-center gap-1 text-sm">
            <ChevronLeft size={16} /> Back
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-medium text-slate-100 truncate">{detail.title}</h2>
            <p className="text-slate-400 text-xs">{detail.company}</p>
          </div>
          <a href={detail.job_url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300"><ExternalLink size={16} /></a>
        </div>

        {/* Three-column review */}
        <div className="flex-1 grid grid-cols-3 divide-x divide-slate-700/50 overflow-hidden">
          {/* Job description */}
          <div className="flex flex-col overflow-hidden">
            <div className="px-4 py-2 bg-slate-800/40 border-b border-slate-700/50 flex-shrink-0">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Job Description</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
              {detail.job_description || 'No description available.'}
            </div>
          </div>

          {/* Tailored CV — with HTML preview */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800/40 border-b border-slate-700/50 flex-shrink-0">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tailored CV</p>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 bg-slate-700 p-0.5 rounded text-xs">
                  <button onClick={() => setCvTab('preview')} className={cn('px-2 py-0.5 rounded', cvTab === 'preview' ? 'bg-slate-600 text-slate-200' : 'text-slate-400')}>Preview</button>
                  <button onClick={() => setCvTab('text')} className={cn('px-2 py-0.5 rounded', cvTab === 'text' ? 'bg-slate-600 text-slate-200' : 'text-slate-400')}>Text</button>
                </div>
                <button onClick={regenerateCV} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><RefreshCw size={10} /> Regen</button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {cvTab === 'preview' && cvHtml ? (
                <iframe
                  srcDoc={cvHtml}
                  sandbox="allow-same-origin"
                  className="w-full h-full border-0 bg-white"
                  title="CV Preview"
                />
              ) : cvTab === 'preview' && !cvHtml ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-slate-500">
                    <FileText size={32} className="mx-auto mb-2 text-slate-600" />
                    <p className="text-sm">No CV preview available</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-y-auto h-full p-4">
                  {detail.tailored_summary && (
                    <div className="mb-4">
                      <p className="text-xs text-slate-500 mb-1">Tailored Summary</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{detail.tailored_summary}</p>
                    </div>
                  )}
                  {detail.pdf_path && (
                    <div className="mt-2 p-2 bg-slate-700/40 rounded text-xs text-slate-400 flex items-center gap-2">
                      <CheckCircle size={12} className="text-emerald-400" />
                      PDF generated · {detail.template} template
                    </div>
                  )}
                  {detail.cvData?.workExperience?.slice(0, 5).map((exp: any, i: number) => (
                    <div key={i} className="mt-3 pb-3 border-b border-slate-700/30">
                      <p className="text-sm font-medium text-slate-200">{exp.title}</p>
                      <p className="text-xs text-slate-500">{exp.company} · {exp.start_date}–{exp.is_current ? 'Present' : exp.end_date}</p>
                      {exp.description && <p className="text-xs text-slate-400 mt-1 line-clamp-3">{exp.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cover letter */}
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800/40 border-b border-slate-700/50 flex-shrink-0">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Cover Letter</p>
              <button onClick={() => setEditingCover((e) => !e)} className={cn('text-xs flex items-center gap-1', editingCover ? 'text-blue-400' : 'text-slate-400 hover:text-slate-300')}>
                <Edit3 size={10} /> {editingCover ? 'Editing' : 'Edit'}
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              {editingCover ? (
                <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} className="w-full h-full resize-none text-sm leading-relaxed" />
              ) : (
                <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed overflow-y-auto h-full">
                  {detail.cover_letter || 'No cover letter generated.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-700/50 bg-slate-900/50 flex-shrink-0">
          <button onClick={approve} disabled={submitting} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            {submitting ? 'Submitting...' : 'Approve & Apply'}
          </button>
          <button onClick={saveDraft} className="flex items-center gap-2 px-4 py-2.5 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-slate-100 text-sm rounded-lg transition-colors">
            <BookmarkCheck size={14} /> Save Draft
          </button>
          <button onClick={downloadPdf} disabled={downloadingPdf} className="flex items-center gap-2 px-4 py-2.5 border border-slate-600 hover:border-slate-500 text-slate-300 hover:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm rounded-lg transition-colors">
            {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {downloadingPdf ? 'Generating...' : 'Download PDF'}
          </button>
          <button onClick={skip} className="flex items-center gap-2 px-4 py-2.5 text-slate-400 hover:text-red-400 text-sm transition-colors ml-auto">
            <XCircle size={14} /> Skip
          </button>
        </div>

        {toast && (
          <div className={cn('fixed bottom-6 right-6 text-sm px-4 py-3 rounded-lg shadow-xl animate-in border', toast.type === 'success' ? 'bg-emerald-900/80 border-emerald-700 text-emerald-200' : 'bg-red-900/80 border-red-700 text-red-200')}>
            {toast.msg}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 animate-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Review Queue</h1>
          <p className="text-slate-400 text-sm mt-1">{queue.length} application{queue.length !== 1 ? 's' : ''} awaiting review</p>
        </div>
      </div>

      {!queue.length ? (
        <div className="text-center py-20">
          <CheckCircle size={40} className="text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Queue is empty</p>
          <p className="text-slate-600 text-xs mt-1">Add jobs from Search Results to review them here</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {queue.map((app) => (
            <button
              key={app.id}
              onClick={() => openDetail(app.id)}
              className="w-full text-left bg-slate-800/60 border border-slate-700/50 rounded-lg p-4 hover:border-blue-500/50 hover:bg-slate-800 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-slate-100 text-sm group-hover:text-blue-300 transition-colors">{app.title}</h3>
                  <p className="text-slate-400 text-xs mt-0.5">{app.company}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-500">Added {timeAgo(app.queued_at)}</p>
                  {(app as any).pdf_path && <p className="text-xs text-emerald-400 mt-1 flex items-center justify-end gap-1"><CheckCircle size={10} /> CV ready</p>}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">Click to review CV, cover letter, and submit →</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
