import React, { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useSearchParams } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import NewCampaign from './pages/NewCampaign'
import Settings from './pages/Settings'
import CampaignDetail from './pages/CampaignDetail'
import Layout from './components/Layout'

const API = import.meta.env.VITE_API_URL

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('mailpilot_user')
    return saved ? JSON.parse(saved) : null
  })

  const login = (userData, token) => {
    localStorage.setItem('mailpilot_user', JSON.stringify(userData))
    localStorage.setItem('mailpilot_token', token)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('mailpilot_user')
    localStorage.removeItem('mailpilot_token')
    setUser(null)
  }

  return (
    <Routes>
      <Route path="/" element={<Landing user={user} />} />
      <Route path="/dashboard" element={
        <AuthCallback login={login}>
          <Layout user={user} logout={logout}>
            <Dashboard user={user} />
          </Layout>
        </AuthCallback>
      } />
      <Route path="/new-campaign" element={
        <Layout user={user} logout={logout}>
          <NewCampaign user={user} />
        </Layout>
      } />
      <Route path="/campaign/:id" element={
        <Layout user={user} logout={logout}>
          <CampaignDetail user={user} />
        </Layout>
      } />
      <Route path="/settings" element={
        <Layout user={user} logout={logout}>
          <Settings user={user} setUser={setUser} login={login} />
        </Layout>
      } />
    </Routes>
  )
}

// Flow:
// 1. User clicks Sign in → /auth/login on backend
// 2. Google redirects to backend /auth/callback?code=
// 3. Backend exchanges code, issues JWT, redirects to frontend /dashboard?token=JWT
// 4. This component reads ?token=, calls /auth/me, saves user+token, navigates cleanly
function AuthCallback({ login, children }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [done, setDone] = useState(false)

  useEffect(() => {
    const token = searchParams.get('token')
    const existingToken = localStorage.getItem('mailpilot_token')

    if (token) {
      // Fresh OAuth login — backend gave us JWT in URL
      fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => {
          if (!r.ok) throw new Error('Auth failed')
          return r.json()
        })
        .then(userData => {
          login(userData, token)
          setDone(true)
          navigate('/dashboard', { replace: true })
        })
        .catch(() => {
          localStorage.removeItem('mailpilot_user')
          localStorage.removeItem('mailpilot_token')
          window.location.href = '/'
        })
    } else if (existingToken) {
      // Already logged in — re-validate token
      fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${existingToken}` },
      })
        .then(r => {
          if (!r.ok) throw new Error('Token expired')
          return r.json()
        })
        .then(userData => {
          login(userData, existingToken)
          setDone(true)
        })
        .catch(() => {
          localStorage.removeItem('mailpilot_user')
          localStorage.removeItem('mailpilot_token')
          window.location.href = '/'
        })
    } else {
      window.location.href = '/'
    }
  }, [])

  if (!done) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  )
  return children
}