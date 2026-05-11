import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, MessageSquare, TrendingUp, Zap, Plus, ChevronRight, Clock, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const API = 'http://localhost:8000'

// Helper — always reads the latest token from localStorage
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('mailpilot_token')}`,
})

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: `${color}18`, border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Syne', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
      </div>
    </div>
  )
}

const STATUS_CONFIG = {
  draft:     { color: 'var(--muted)',  label: 'Draft',     icon: AlertCircle },
  scheduled: { color: '#f59e0b',       label: 'Scheduled', icon: Clock },
  sending:   { color: 'var(--accent)', label: 'Sending',   icon: RefreshCw },
  active:    { color: 'var(--green)',  label: 'Active',    icon: CheckCircle },
  completed: { color: 'var(--muted)',  label: 'Completed', icon: CheckCircle },
}

export default function Dashboard({ user }) {
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [user])

  const fetchData = async () => {
    try {
      const [camRes, statRes] = await Promise.all([
        fetch(`${API}/campaigns`, { headers: authHeaders() }),
        fetch(`${API}/stats`,     { headers: authHeaders() }),
      ])

      // Token expired or invalid — log out
      if (camRes.status === 401 || statRes.status === 401) {
        localStorage.removeItem('mailpilot_user')
        localStorage.removeItem('mailpilot_token')
        navigate('/')
        return
      }

      setCampaigns(await camRes.json())
      setStats(await statRes.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
            Good {getGreeting()}, {user.name?.split(' ')[0]} 👋
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>Here's your outreach overview</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/new-campaign')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {/* API key warning */}
      {!user.has_api_key && (
        <div style={{
          padding: '14px 20px', borderRadius: 12, marginBottom: 24,
          background: 'rgba(255,101,132,0.08)', border: '1px solid rgba(255,101,132,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent2)', fontSize: 14 }}>
            <AlertCircle size={16} />
            <span>Add your AI API key to start generating emails</span>
          </div>
          <button className="btn-ghost" onClick={() => navigate('/settings')} style={{ fontSize: 13, padding: '6px 14px' }}>
            Go to Settings
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard icon={Zap}           label="Total Campaigns"   value={stats?.total_campaigns ?? '—'} color="var(--accent)" />
        <StatCard icon={Send}          label="Emails Sent"        value={stats?.total_sent ?? '—'}       color="#60a5fa" />
        <StatCard icon={MessageSquare} label="Replies Received"   value={stats?.total_replied ?? '—'}    color="var(--green)" />
        <StatCard icon={TrendingUp}    label="Reply Rate"         value={stats ? `${stats.reply_rate}%` : '—'} color="var(--accent2)"
          sub={stats?.active_campaigns ? `${stats.active_campaigns} active` : null} />
      </div>

      {/* Campaigns table */}
      <div className="card">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Campaigns</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Auto-refreshes every 30s</span>
        </div>

        {loading ? (
          <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
            <div className="spinner" />
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>No campaigns yet</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>Create your first AI-powered outreach campaign</p>
            <button className="btn-primary" onClick={() => navigate('/new-campaign')}>
              <Plus size={16} style={{ marginRight: 8 }} /> Create Campaign
            </button>
          </div>
        ) : (
          <div>
            {campaigns.map((c, i) => {
              const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft
              const StatusIcon = cfg.icon
              return (
                <div key={c.id}
                  onClick={() => navigate(`/campaign/${c.id}`)}
                  style={{
                    padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16,
                    borderBottom: i < campaigns.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {c.company_name} · {c.target_role} · {c.recipient_count} recipient{c.recipient_count !== 1 ? 's' : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}>
                    <StatusIcon size={12} color={cfg.color} />
                    <span style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, color: '#60a5fa' }}>{c.stats.sent}</div>
                      <div style={{ color: 'var(--muted)' }}>sent</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, color: 'var(--green)' }}>{c.stats.replied}</div>
                      <div style={{ color: 'var(--muted)' }}>replied</div>
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {c.created_at && !isNaN(new Date(c.created_at).getTime())
                      ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true })
                      : '—'}
                  </div>

                  <ChevronRight size={16} color="var(--muted)" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}