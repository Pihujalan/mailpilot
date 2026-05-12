import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Zap, Send, RefreshCw, Bell, ArrowRight } from 'lucide-react'

const API = import.meta.env.VITE_API_URL

const features = [
  { icon: Zap,       title: 'AI-Generated Emails', desc: 'Claude, GPT, Gemini or Groq — personalized cold emails in seconds.' },
  { icon: Send,      title: 'Gmail Integration',   desc: 'Send directly from your Gmail. No SMTP setup, no app passwords.' },
  { icon: RefreshCw, title: 'Smart Scheduling',    desc: 'Send now, schedule once, or set recurring campaigns every X days.' },
  { icon: Bell,      title: 'Reply Detection',     desc: 'Auto-stops follow-ups when a reply arrives. Dashboard updates instantly.' },
]

export default function Landing({ user, login }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [exchanging, setExchanging] = useState(false)

  useEffect(() => {
    // Already logged in — go straight to dashboard
    if (user) { navigate('/dashboard'); return }

    // Backend redirected here with ?code= after Google OAuth
    const code = searchParams.get('code')
    if (code) {
      setExchanging(true)
      fetch(`${API}/auth/token?code=${code}`, { method: 'POST' })
        .then(r => {
          if (!r.ok) throw new Error('Token exchange failed')
          return r.json()
        })
        .then(({ access_token }) => {
          if (!access_token) throw new Error('No token returned')
          return fetch(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${access_token}` },
          })
            .then(r => {
              if (!r.ok) throw new Error('Failed to fetch user')
              return r.json()
            })
            .then(userData => {
              login(userData, access_token)
              navigate('/dashboard', { replace: true })
            })
        })
        .catch(err => {
          console.error('Auth failed:', err)
          setExchanging(false)
          // Clear code from URL so user can try again
          window.history.replaceState({}, '', '/')
        })
    }
  }, [])

  const handleLogin = async () => {
    const res = await fetch(`${API}/auth/login`)
    const data = await res.json()
    window.location.href = data.auth_url
  }

  // Show spinner while exchanging code for token
  if (exchanging) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Background mesh */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 50% -20%, rgba(108,99,255,0.15) 0%, transparent 70%)',
      }} />

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 48px', borderBottom: '1px solid var(--border)',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Zap size={18} color="white" fill="white" />
          </div>
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20 }}>MailPilot</span>
        </div>
        <button className="btn-primary" onClick={handleLogin} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
      </nav>

      {/* Hero */}
      <div style={{
        maxWidth: 760, margin: '0 auto', padding: '100px 24px 60px',
        textAlign: 'center', position: 'relative', zIndex: 1,
      }} className="fade-in">
        <div style={{
          display: 'inline-block', padding: '6px 16px', borderRadius: 20,
          background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.3)',
          fontSize: 12, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 24,
        }}>
          AI-Powered Outreach
        </div>
        <h1 style={{ fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 800, lineHeight: 1.08, marginBottom: 24 }}>
          Cold emails that<br />
          <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            actually get replies
          </span>
        </h1>
        <p style={{ fontSize: 18, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 40, maxWidth: 520, margin: '0 auto 40px' }}>
          Generate personalized cold emails with AI, send via your Gmail, schedule follow-ups, and get notified when prospects reply.
        </p>
        <button className="btn-primary" onClick={handleLogin}
          style={{ fontSize: 16, padding: '14px 32px', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          Get started free <ArrowRight size={18} />
        </button>
      </div>

      {/* Features */}
      <div style={{
        maxWidth: 960, margin: '0 auto', padding: '0 24px 100px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20,
      }}>
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="card fade-in" style={{ padding: 24 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16
            }}>
              <Icon size={20} color="var(--accent)" />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}