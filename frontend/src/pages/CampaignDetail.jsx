import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Mail, MessageSquare, Clock, CheckCircle, XCircle, RefreshCw, Trash2 } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'

const API = import.meta.env.VITE_API_URL

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('mailpilot_token')}`,
})

const STATUS = {
  pending: { color: 'var(--muted)', icon: Clock, label: 'Pending' },
  sent: { color: '#60a5fa', icon: Mail, label: 'Sent' },
  followup_sent: { color: 'var(--accent)', icon: RefreshCw, label: 'Follow-up Sent' },
  replied: { color: 'var(--green)', icon: MessageSquare, label: 'Replied' },
  failed: { color: 'var(--accent2)', icon: XCircle, label: 'Failed' },
}

export default function CampaignDetail({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!user) { navigate('/'); return }
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [user, id])

  const fetchData = async () => {
    try {
      const [camRes, logsRes] = await Promise.all([
        fetch(`${API}/campaigns`, { headers: authHeaders() }),
        fetch(`${API}/campaigns/${id}/logs`, { headers: authHeaders() }),
      ])

      if (camRes.status === 401 || logsRes.status === 401) {
        localStorage.removeItem('mailpilot_user')
        localStorage.removeItem('mailpilot_token')
        navigate('/')
        return
      }

      const campaigns = await camRes.json()
      setCampaign(campaigns.find(c => c.id === id))
      setLogs(await logsRes.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setDeleting(true)
    try {
      await fetch(`${API}/campaigns/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      navigate('/dashboard')
    } catch (e) {
      console.error(e)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="spinner" />
    </div>
  )

  if (!campaign) return (
    <div style={{ textAlign: 'center', paddingTop: 80 }}>
      <p style={{ color: 'var(--muted)' }}>Campaign not found</p>
      <button className="btn-ghost" onClick={() => navigate('/dashboard')} style={{ marginTop: 16 }}>Back</button>
    </div>
  )

  const replied = logs.filter(l => l.status === 'replied').length
  const sent = logs.filter(l => ['sent', 'followup_sent', 'replied'].includes(l.status)).length

  return (
    <div className="fade-in" style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => navigate('/dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '8px 14px' }}>
          <ArrowLeft size={15} /> Back to Dashboard
        </button>

        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            border: `1px solid ${confirmDelete ? 'var(--accent2)' : 'rgba(255,101,132,0.3)'}`,
            background: confirmDelete ? 'rgba(255,101,132,0.15)' : 'transparent',
            color: 'var(--accent2)', cursor: deleting ? 'not-allowed' : 'pointer',
            opacity: deleting ? 0.6 : 1, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!deleting) { e.currentTarget.style.background = 'rgba(255,101,132,0.15)'; e.currentTarget.style.borderColor = 'var(--accent2)' } }}
          onMouseLeave={e => { if (!confirmDelete) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,101,132,0.3)' } }}
        >
          <Trash2 size={14} />
          {deleting ? 'Deleting...' : confirmDelete ? 'Click again to confirm' : 'Delete Campaign'}
        </button>
      </div>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{campaign.name}</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          {campaign.company_name} · {campaign.target_role} · Created {
            campaign.created_at && !isNaN(new Date(campaign.created_at + 'Z').getTime())
              ? formatDistanceToNow(new Date(campaign.created_at + 'Z'), { addSuffix: true })
              : '—'
          }
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Recipients', value: campaign.recipient_count, color: 'var(--muted)' },
          { label: 'Sent', value: sent, color: '#60a5fa' },
          { label: 'Replied', value: replied, color: 'var(--green)' },
          { label: 'Reply Rate', value: sent ? `${Math.round(replied / sent * 100)}%` : '—', color: 'var(--accent)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Syne', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Logs */}
      <div className="card">
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Email Logs</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Refreshes every 15s</span>
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>No email logs yet</div>
        ) : (
          logs.map((log, i) => {
            const cfg = STATUS[log.status] || STATUS.pending
            const Icon = cfg.icon
            return (
              <div key={log.id} style={{
                padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16,
                borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Icon size={16} color={cfg.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{log.recipient}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.subject}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 20,
                    background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`,
                    fontSize: 11, color: cfg.color, fontWeight: 600, marginBottom: 4
                  }}>
                    <span className={log.status === 'sent' ? 'pulse' : ''} style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color }} />
                    {cfg.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {
                      log.sent_at &&
                        !isNaN(new Date(log.sent_at + 'Z').getTime())
                        ? format(new Date(log.sent_at + 'Z'), 'MMM d, h:mm a')
                        : '—'
                    }
                  </div>
                  {log.next_followup_at && !log.followup_sent && log.status !== 'replied' && (
                    <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2 }}>
                      Follow-up: {
                        log.next_followup_at &&
                          !isNaN(new Date(log.next_followup_at + 'Z').getTime())
                          ? formatDistanceToNow(new Date(log.next_followup_at + 'Z'), { addSuffix: true })
                          : '—'
                      }
                    </div>
                  )}
                  {log.replied_at && (
                    <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 2 }}>
                      Replied {
                        log.replied_at &&
                          !isNaN(new Date(log.replied_at + 'Z').getTime())
                          ? formatDistanceToNow(new Date(log.replied_at + 'Z'), { addSuffix: true })
                          : '—'
                      }
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}