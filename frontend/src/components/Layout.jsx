import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Send, Settings, LogOut, Menu, X, Zap } from 'lucide-react'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Send, label: 'New Campaign', path: '/new-campaign' },
  { icon: Settings, label: 'Settings', path: '/settings' },
]

export default function Layout({ user, logout, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  if (!user) {
    return <div style={{ minHeight: '100vh' }}>{children}</div>
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? '72px' : '220px',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
        transition: 'width 0.25s ease',
        flexShrink: 0,
        position: 'fixed',
        height: '100vh',
        zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ padding: '0 16px 24px', display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Zap size={18} color="white" fill="white" />
          </div>
          {!collapsed && <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18 }}>MailPilot</span>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {navItems.map(({ icon: Icon, label, path }) => {
            const active = location.pathname === path
            return (
              <button key={path} onClick={() => navigate(path)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10,
                background: active ? 'rgba(108,99,255,0.15)' : 'transparent',
                border: 'none', cursor: 'pointer',
                color: active ? 'var(--accent)' : 'var(--muted)',
                transition: 'all 0.15s', width: '100%',
                overflow: 'hidden', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 1.8} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ fontSize: 14, fontWeight: active ? 600 : 400 }}>{label}</span>}
              </button>
            )
          })}
        </nav>

        {/* User + collapse */}
        <div style={{ padding: '16px 10px 0', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!collapsed && user && (
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
              {user.picture
                ? <img src={user.picture} style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }} />
                : <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{user.name?.[0]}</div>
              }
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
              </div>
            </div>
          )}
          <button onClick={logout} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 10,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', width: '100%',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent2)'; e.currentTarget.style.background = 'rgba(255,101,132,0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {!collapsed && <span style={{ fontSize: 14 }}>Logout</span>}
          </button>
          <button onClick={() => setCollapsed(!collapsed)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '8px', borderRadius: 10,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', width: '100%',
          }}>
            {collapsed ? <Menu size={16} /> : <X size={16} />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1,
        marginLeft: collapsed ? '72px' : '220px',
        transition: 'margin-left 0.25s ease',
        padding: '32px',
        minHeight: '100vh',
      }}>
        {children}
      </main>
    </div>
  )
}
