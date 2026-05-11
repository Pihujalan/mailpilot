import React, { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useSearchParams } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import NewCampaign from './pages/NewCampaign'
import Settings from './pages/Settings'
import CampaignDetail from './pages/CampaignDetail'
import Layout from './components/Layout'

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

// Exchanges ?code= one-time code for a JWT, then fetches user info
function AuthCallback({ login, children }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [done, setDone] = useState(false)

  useEffect(() => {
    const code = searchParams.get('code')
    const existingToken = localStorage.getItem('mailpilot_token')

    if (code) {
      // Exchange the one-time code for a real JWT
      fetch(`http://localhost:8000/auth/token?code=${code}`, {
        method: 'POST',
      })
        .then(r => r.json())
        .then(({ access_token }) => {
          if (!access_token) throw new Error('No token')
          return fetch('http://localhost:8000/auth/me', {
            headers: { Authorization: `Bearer ${access_token}` },
          })
            .then(r => r.json())
            .then(user => {
              login(user, access_token)
              setDone(true)
              navigate('/dashboard', { replace: true })
            })
        })
        .catch(() => {
          setDone(true)
          navigate('/', { replace: true })
        })
    } else if (existingToken) {
      // Already logged in — just show the dashboard
      setDone(true)
    } else {
      // No code, no token — back to landing
      navigate('/', { replace: true })
    }
  }, [])

  if (!done) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  )
  return children
}