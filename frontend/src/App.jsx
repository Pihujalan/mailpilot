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

  const login = (userData) => {
    localStorage.setItem('mailpilot_user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('mailpilot_user')
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

// Handles OAuth callback — reads user_id from URL, fetches user info
function AuthCallback({ login, children }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [done, setDone] = useState(false)

  useEffect(() => {
    const userId = searchParams.get('user_id')
    if (userId) {
      fetch(`http://localhost:8000/auth/me?user_id=${userId}`)
        .then(r => r.json())
        .then(user => {
          login(user)
          setDone(true)
          navigate('/dashboard', { replace: true })
        })
        .catch(() => setDone(true))
    } else {
      setDone(true)
    }
  }, [])

  if (!done) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="spinner" />
    </div>
  )
  return children
}
