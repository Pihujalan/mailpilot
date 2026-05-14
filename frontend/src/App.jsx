import React, { useEffect, useState } from 'react'
import { Routes, Route, useNavigate, useSearchParams } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import NewCampaign from './pages/NewCampaign'
import Settings from './pages/Settings'
import CampaignDetail from './pages/CampaignDetail'
import Layout from './components/Layout'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'

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
      <Route path="/" element={<Landing user={user} login={login} />} />
      <Route path="/dashboard" element={
        <RequireAuth>
          <Layout user={user} logout={logout}>
            <Dashboard user={user} />
          </Layout>
        </RequireAuth>
      } />
      <Route path="/new-campaign" element={
        <RequireAuth>
          <Layout user={user} logout={logout}>
            <NewCampaign user={user} />
          </Layout>
        </RequireAuth>
      } />
      <Route path="/campaign/:id" element={
        <RequireAuth>
          <Layout user={user} logout={logout}>
            <CampaignDetail user={user} />
          </Layout>
        </RequireAuth>
      } />
      <Route path="/settings" element={
        <RequireAuth>
          <Layout user={user} logout={logout}>
            <Settings user={user} setUser={setUser} login={login} />
          </Layout>
        </RequireAuth>
      } />
      <Route path="/privacy" element={<Privacy />} />
<Route path="/terms" element={<Terms />} />
    </Routes>
  )
}

// Protects routes — redirects to / if not logged in
function RequireAuth({ children }) {
  const token = localStorage.getItem('mailpilot_token')
  if (!token) {
    window.location.href = '/'
    return null
  }
  return children
}