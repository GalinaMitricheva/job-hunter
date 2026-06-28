import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-sky-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-red-400'
}

export function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (score >= 60) return 'bg-sky-500/10 text-sky-400 border-sky-500/20'
  if (score >= 40) return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
  return 'bg-red-500/10 text-red-400 border-red-500/20'
}

export function statusBadge(status: string): string {
  switch (status) {
    case 'submitted': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    case 'pending_review': return 'bg-sky-500/10 text-sky-400 border-sky-500/20'
    case 'skipped': return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    case 'failed': return 'bg-red-500/10 text-red-400 border-red-500/20'
    case 'draft': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  }
}
