import React, { useState } from 'react'
import { Check, Eye, EyeOff, ExternalLink } from 'lucide-react'

const API = 'http://localhost:8000'
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('mailpilot_token')}`,
})

const PROVIDERS = [
  {
    id: 'openai', name: 'OpenAI', model: 'GPT-4o Mini',
    color: '#10a37f', desc: 'Fast, reliable, great results',
    link: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'claude', name: 'Anthropic', model: 'Claude Haiku',
    color: '#c96a2a', desc: 'Excellent writing quality',
    link: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'gemini', name: 'Google', model: 'Gemini 1.5 Flash',
    color: '#4285f4', desc: 'Google\'s fast model, free tier available',
    link: 'https://aistudio.google.com/app/apikey'
  },
  {
    id: 'groq', name: 'Groq', model: 'Llama 3',
    color: '#f55036', desc: 'Fastest inference, generous free tier',
    link: 'https://console.groq.com/keys'
  },
]

export default function Settings({ user, login }) {
  const [provider, setProvider] = useState(user?.ai_provider || 'openai')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!apiKey.trim()) { setError('Enter your API key'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/settings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...authHeaders()
        },
        body: JSON.stringify({ ai_provider: provider, ai_api_key: apiKey })
      })
      if (!res.ok) throw new Error('Failed to save')
      
      // Update local user
      const updatedUser = { ...user, ai_provider: provider, has_api_key: true }
      localStorage.setItem('mailpilot_user', JSON.stringify(updatedUser))
      login(updatedUser)

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setApiKey('')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedProvider = PROVIDERS.find(p => p.id === provider)

  return (
    <div className="fade-in" style={{ maxWidth: 620 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Settings</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Configure your AI provider</p>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>AI Provider</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
          Choose your AI provider and paste your API key. All 4 providers work great for email generation.
        </p>

        {/* Provider selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {PROVIDERS.map(p => (
            <div key={p.id} onClick={() => setProvider(p.id)} style={{
              padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${provider === p.id ? p.color : 'var(--border)'}`,
              background: provider === p.id ? `${p.color}12` : 'var(--surface2)',
              transition: 'all 0.15s', position: 'relative',
            }}>
              {provider === p.id && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 18, height: 18, borderRadius: '50%',
                  background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Check size={11} color="white" />
                </div>
              )}
              <div style={{ fontWeight: 700, fontSize: 13, color: provider === p.id ? p.color : 'var(--text)' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{p.model}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{p.desc}</div>
            </div>
          ))}
        </div>

        {/* API key input */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ marginBottom: 0 }}>{selectedProvider?.name} API Key</label>
            <a href={selectedProvider?.link} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Get API key <ExternalLink size={10} />
            </a>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={user?.has_api_key ? '••••••••••••• (key saved — paste new to update)' : `Paste your ${selectedProvider?.name} API key`}
              style={{ paddingRight: 44 }}
            />
            <button onClick={() => setShowKey(!showKey)} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0
            }}>
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,101,132,0.1)', border: '1px solid rgba(255,101,132,0.3)', color: 'var(--accent2)', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {saved && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(0,217,163,0.08)', border: '1px solid rgba(0,217,163,0.2)', color: 'var(--green)', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Check size={14} /> Settings saved successfully
          </div>
        )}

        <button className="btn-primary" onClick={handleSave} disabled={saving || !apiKey.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saving ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Saving...</> : saved ? <><Check size={14} /> Saved</> : 'Save Settings'}
        </button>
      </div>

      {/* Account info */}
      <div className="card" style={{ padding: 24, marginTop: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Account</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {user?.picture
            ? <img src={user.picture} style={{ width: 44, height: 44, borderRadius: '50%' }} />
            : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>
                {user?.name?.[0]}
              </div>
          }
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{user?.email}</div>
            <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 3 }}>✓ Gmail connected — sending from this address</div>
          </div>
        </div>
      </div>
    </div>
  )
}
