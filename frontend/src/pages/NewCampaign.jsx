import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ChevronRight, ChevronLeft, Send, Clock, Calendar, RefreshCw, Plus, X, Check } from 'lucide-react'

const API = 'http://localhost:8000'

const TONES = [
  { value: 'professional', label: 'Professional', desc: 'Formal & polished' },
  { value: 'friendly',     label: 'Friendly',     desc: 'Warm & approachable' },
  { value: 'direct',       label: 'Direct',       desc: 'No fluff, straight to point' },
  { value: 'confident',    label: 'Confident',    desc: 'Bold & assertive' },
]

const SCHEDULE_OPTIONS = [
  { value: 'now',       label: 'Send Now',        icon: Send,      desc: 'Sends immediately' },
  { value: 'once',      label: 'Schedule Once',   icon: Calendar,  desc: 'Pick a date & time' },
  { value: 'recurring', label: 'Recurring',       icon: RefreshCw, desc: 'Send every X days' },
]

export default function NewCampaign({ user }) {
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1=details, 2=generate, 3=schedule

  // Form state
  const [name, setName] = useState('')
  const [recipients, setRecipients] = useState([''])
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [offer, setOffer] = useState('')
  const [tone, setTone] = useState('professional')

  // Generated content
  const [generated, setGenerated] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  // Editing generated content
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [followupSubject, setFollowupSubject] = useState('')
  const [followupBody, setFollowupBody] = useState('')

  // Schedule
  const [scheduleType, setScheduleType] = useState('now')
  const [scheduleDate, setScheduleDate] = useState('')
  const [recurrenceDays, setRecurrenceDays] = useState(3)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const addRecipient = () => setRecipients([...recipients, ''])
  const removeRecipient = (i) => setRecipients(recipients.filter((_, idx) => idx !== i))
  const updateRecipient = (i, val) => { const r = [...recipients]; r[i] = val; setRecipients(r) }

  const handleGenerate = async () => {
    setGenerating(true); setGenError('')
    try {
      const res = await fetch(`${API}/generate?user_id=${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: company, target_role: role, offer, tone })
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail) }
      const data = await res.json()
      setGenerated(data)
      setSubject(data.subject)
      setBody(data.body)
      setFollowupSubject(data.followup_subject)
      setFollowupBody(data.followup_body)
    } catch (e) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitting(true); setError('')
    try {
      const validRecipients = recipients.filter(r => r.trim() && r.includes('@'))
      if (!validRecipients.length) throw new Error('Add at least one valid recipient email')

      const res = await fetch(`${API}/campaigns?user_id=${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `Campaign for ${company}`,
          recipient_emails: validRecipients,
          company_name: company,
          target_role: role,
          offer,
          tone,
          subject,
          email_body: body,
          followup_subject: followupSubject,
          followup_body: followupBody,
          schedule_type: scheduleType,
          schedule_datetime: scheduleType === 'once' ? scheduleDate : null,
          recurrence_days: scheduleType === 'recurring' ? recurrenceDays : null,
        })
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail) }
      navigate('/dashboard')
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const canProceed1 = company && role && offer && recipients.some(r => r.includes('@'))
  const canProceed2 = subject && body

  return (
    <div className="fade-in" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>New Campaign</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          AI-powered cold outreach in 3 steps
        </p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32 }}>
        {['Details', 'Email', 'Schedule'].map((s, i) => {
          const n = i + 1
          const active = step === n, done = step > n
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--surface2)',
                  border: `2px solid ${done ? 'var(--green)' : active ? 'var(--accent)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: done || active ? 'white' : 'var(--muted)',
                  transition: 'all 0.2s',
                }}>
                  {done ? <Check size={14} /> : n}
                </div>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--text)' : 'var(--muted)' }}>{s}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: step > n ? 'var(--green)' : 'var(--border)', margin: '0 12px', transition: 'background 0.3s' }} />}
            </div>
          )
        })}
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <div className="card fade-in" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 24 }}>Campaign Details</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label>Campaign Name (optional)</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Q1 SaaS Outreach" />
            </div>

            <div>
              <label>Company / Target Company</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Stripe, small fintech startups" />
            </div>

            <div>
              <label>Target Role</label>
              <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Head of Marketing, CTO" />
            </div>

            <div>
              <label>Your Offer / Service</label>
              <textarea value={offer} onChange={e => setOffer(e.target.value)}
                placeholder="e.g. I build AI automation tools that reduce customer support tickets by 60%"
                rows={3} style={{ resize: 'vertical' }} />
            </div>

            <div>
              <label>Tone</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {TONES.map(t => (
                  <div key={t.value} onClick={() => setTone(t.value)} style={{
                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${tone === t.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: tone === t.value ? 'rgba(108,99,255,0.1)' : 'var(--surface2)',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: tone === t.value ? 'var(--accent)' : 'var(--text)' }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label>Recipient Emails</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recipients.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <input value={r} onChange={e => updateRecipient(i, e.target.value)}
                      placeholder={`recipient${i + 1}@company.com`} type="email" />
                    {recipients.length > 1 &&
                      <button onClick={() => removeRecipient(i)} style={{
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '0 12px', cursor: 'pointer', color: 'var(--muted)', flexShrink: 0
                      }}>
                        <X size={14} />
                      </button>
                    }
                  </div>
                ))}
                <button onClick={addRecipient} className="btn-ghost" style={{ fontSize: 13, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, width: 'fit-content' }}>
                  <Plus size={14} /> Add recipient
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={() => setStep(2)} disabled={!canProceed1}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Generate emails */}
      {step === 2 && (
        <div className="card fade-in" style={{ padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Email Content</h2>
            <button className="btn-primary" onClick={handleGenerate} disabled={generating}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', fontSize: 13 }}>
              {generating ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Generating...</> : <><Sparkles size={14} /> {generated ? 'Regenerate' : 'Generate with AI'}</>}
            </button>
          </div>

          {genError && (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(255,101,132,0.1)', border: '1px solid rgba(255,101,132,0.3)', color: 'var(--accent2)', fontSize: 13, marginBottom: 16 }}>
              {genError}
            </div>
          )}

          {generated?.personalization_reason && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(0,217,163,0.08)', border: '1px solid rgba(0,217,163,0.2)', fontSize: 12, color: 'var(--green)', marginBottom: 20, display: 'flex', gap: 8 }}>
              <Sparkles size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span><strong>AI insight:</strong> {generated.personalization_reason}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label>Subject Line</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter or generate a subject line" />
            </div>
            <div>
              <label>Email Body</label>
              <textarea value={body} onChange={e => setBody(e.target.value)}
                placeholder="Your cold email content will appear here after generation, or write your own..."
                rows={8} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div>
              <label>Follow-up Subject</label>
              <input value={followupSubject} onChange={e => setFollowupSubject(e.target.value)} placeholder="e.g. Re: Quick follow up" />
            </div>
            <div>
              <label>Follow-up Body</label>
              <textarea value={followupBody} onChange={e => setFollowupBody(e.target.value)}
                placeholder="Follow-up email sent automatically if no reply..."
                rows={5} style={{ resize: 'vertical' }} />
            </div>
          </div>

          <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn-ghost" onClick={() => setStep(1)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ChevronLeft size={16} /> Back
            </button>
            <button className="btn-primary" onClick={() => setStep(3)} disabled={!canProceed2}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Continue <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Schedule */}
      {step === 3 && (
        <div className="card fade-in" style={{ padding: 28 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 24 }}>Schedule</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {SCHEDULE_OPTIONS.map(({ value, label, icon: Icon, desc }) => (
              <div key={value} onClick={() => setScheduleType(value)} style={{
                padding: '16px 20px', borderRadius: 12, cursor: 'pointer',
                border: `1px solid ${scheduleType === value ? 'var(--accent)' : 'var(--border)'}`,
                background: scheduleType === value ? 'rgba(108,99,255,0.08)' : 'var(--surface2)',
                display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: scheduleType === value ? 'rgba(108,99,255,0.2)' : 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Icon size={18} color={scheduleType === value ? 'var(--accent)' : 'var(--muted)'} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: scheduleType === value ? 'var(--text)' : 'var(--text)' }}>{label}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{desc}</div>
                </div>
                {scheduleType === value && <Check size={16} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
              </div>
            ))}
          </div>

          {scheduleType === 'once' && (
            <div style={{ marginBottom: 20 }}>
              <label>Send Date & Time</label>
              <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)} />
            </div>
          )}

          {scheduleType === 'recurring' && (
            <div style={{ marginBottom: 20 }}>
              <label>Send every how many days?</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[1, 2, 3, 5, 7, 14].map(d => (
                  <button key={d} onClick={() => setRecurrenceDays(d)} style={{
                    padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${recurrenceDays === d ? 'var(--accent)' : 'var(--border)'}`,
                    background: recurrenceDays === d ? 'rgba(108,99,255,0.15)' : 'var(--surface2)',
                    color: recurrenceDays === d ? 'var(--accent)' : 'var(--muted)',
                    fontWeight: recurrenceDays === d ? 700 : 400, fontSize: 14,
                  }}>
                    {d}d
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                Sends a fresh email every {recurrenceDays} day{recurrenceDays > 1 ? 's' : ''} to all recipients
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(255,101,132,0.1)', border: '1px solid rgba(255,101,132,0.3)', color: 'var(--accent2)', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Summary */}
          <div style={{ padding: '16px 20px', borderRadius: 12, background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--muted)' }}>CAMPAIGN SUMMARY</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Campaign</span>
                <span style={{ fontWeight: 600 }}>{name || `${company} outreach`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Recipients</span>
                <span style={{ fontWeight: 600 }}>{recipients.filter(r => r.includes('@')).length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Follow-up</span>
                <span style={{ fontWeight: 600, color: followupBody ? 'var(--green)' : 'var(--muted)' }}>
                  {followupBody ? 'Yes — in 3 days if no reply' : 'None'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Schedule</span>
                <span style={{ fontWeight: 600 }}>
                  {scheduleType === 'now' ? 'Immediate' : scheduleType === 'once' ? `Once at ${scheduleDate}` : `Every ${recurrenceDays} days`}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn-ghost" onClick={() => setStep(2)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ChevronLeft size={16} /> Back
            </button>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {submitting ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Launching...</> : <><Send size={14} /> Launch Campaign</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
