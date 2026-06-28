import { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Preferences from './pages/Preferences'
import Onboarding from './pages/Onboarding'
import SearchResults from './pages/SearchResults'
import Queue from './pages/Queue'
import History from './pages/History'
import Settings from './pages/Settings'

export default function App() {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electron.getProfile().then((data: any) => {
      setOnboardingComplete(!!data?.profile?.onboarding_complete)
      setLoading(false)
    }).catch(() => {
      setOnboardingComplete(false)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        {!onboardingComplete ? (
          <>
            <Route path="/onboarding" element={<Onboarding onComplete={() => setOnboardingComplete(true)} />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          </>
        ) : (
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/preferences" element={<Preferences />} />
            <Route path="/results" element={<SearchResults />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </HashRouter>
  )
}
