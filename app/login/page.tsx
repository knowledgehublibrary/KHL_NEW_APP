'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

const TODAY_KEY = 'kh_login_date'

function getTodayString() {
  return new Date().toLocaleDateString('en-CA')
}

const T = {
  bg: '#faf8f5',
  surface: '#ffffff',
  border: '#ede8e1',
  accent: '#c47b3a',
  accentLight: '#fdf0e4',
  accentBorder: '#f0d4b0',
  text: '#1c1917',
  textSub: '#78716c',
  textMuted: '#a8a29e',
}

export default function LoginPage() {
  const router = useRouter()

  // ── Login state ──
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  // ── Change-password state ──
  const [mode, setMode] = useState<'login' | 'changePassword'>('login')
  const [cpEmail, setCpEmail] = useState('')
  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew] = useState('')
  const [cpConfirm, setCpConfirm] = useState('')
  const [cpLoading, setCpLoading] = useState(false)
  const [cpError, setCpError] = useState('')
  const [cpSuccess, setCpSuccess] = useState('')
  const [showCpCurrent, setShowCpCurrent] = useState(false)
  const [showCpNew, setShowCpNew] = useState(false)

  useEffect(() => {
    setMounted(true)
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      const savedDate = localStorage.getItem(TODAY_KEY)
      const today = getTodayString()
      if (data.session && savedDate === today) { router.push('/'); return }
      if (data.session && savedDate !== today) { await supabase.auth.signOut(); localStorage.removeItem(TODAY_KEY) }
      emailRef.current?.focus()
    }
    checkSession()
  }, [])

  // ── Login ──
  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Invalid email or password'); setLoading(false); return }
    localStorage.setItem(TODAY_KEY, getTodayString())
    router.push('/')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleLogin() }

  // ── Change password ──
  const handleChangePassword = async () => {
    setCpError(''); setCpSuccess('')
    if (!cpEmail || !cpCurrent || !cpNew || !cpConfirm) { setCpError('All fields are required'); return }
    if (cpNew.length < 6) { setCpError('New password must be at least 6 characters'); return }
    if (cpNew !== cpConfirm) { setCpError('New passwords do not match'); return }
    if (cpNew === cpCurrent) { setCpError('New password must differ from current password'); return }

    setCpLoading(true)
    // Step 1: verify current credentials
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: cpEmail, password: cpCurrent })
    if (signInErr) { setCpError('Current password is incorrect'); setCpLoading(false); return }

    // Step 2: update to new password
    const { error: updateErr } = await supabase.auth.updateUser({ password: cpNew })
    if (updateErr) { setCpError(updateErr.message); setCpLoading(false); return }

    // Step 3: sign out so user logs in fresh
    await supabase.auth.signOut()
    localStorage.removeItem(TODAY_KEY)
    setCpLoading(false)
    setCpSuccess('Password changed successfully! Please log in with your new password.')
    setTimeout(() => {
      setMode('login')
      setEmail(cpEmail)
      setCpEmail(''); setCpCurrent(''); setCpNew(''); setCpConfirm('')
      setCpSuccess('')
    }, 2500)
  }

  const handleCpKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleChangePassword() }

  const inputCls = "w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
  const inputBase: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text }
  const labelStyle: React.CSSProperties = { color: T.textSub, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: '8px', fontWeight: 600 }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden" style={{ background: T.bg }}>

      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `radial-gradient(circle, ${T.accentBorder} 1px, transparent 1px)`, backgroundSize: '32px 32px', opacity: 0.4 }}/>
      <div className="absolute top-0 right-0 w-96 h-96 pointer-events-none rounded-full"
        style={{ background: `radial-gradient(circle, ${T.accentLight} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }}/>
      <div className="absolute bottom-0 left-0 w-80 h-80 pointer-events-none rounded-full"
        style={{ background: `radial-gradient(circle, ${T.accentLight} 0%, transparent 70%)`, transform: 'translate(-30%, 30%)' }}/>
      <div className="absolute top-0 inset-x-0 h-1"
        style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>

      <div className={`relative w-full max-w-sm transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}`, boxShadow: `0 4px 20px ${T.accent}20` }}>
            <span style={{ fontSize: '28px' }}>📚</span>
          </div>
          <h1 className="font-bold mb-1" style={{ fontFamily: "'Georgia', serif", fontSize: '24px', color: T.text, letterSpacing: '-0.3px' }}>
            Knowledge Hub Library
          </h1>
          <p style={{ color: T.textMuted, fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
            Library Management System
          </p>
        </div>

        {/* ── LOGIN CARD ── */}
        {mode === 'login' && (
          <div className="rounded-2xl px-7 py-8"
            style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: '0 4px 40px rgba(196,123,58,0.08)' }}>

            {error && (
              <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-2"
                style={{ background: '#fee2e2', border: '1px solid #fecaca' }}>
                <span style={{ fontSize: '14px' }}>⚠</span>
                <p style={{ color: '#991b1b', fontSize: '13px' }}>{error}</p>
              </div>
            )}

            <div className="mb-4">
              <label style={labelStyle}>Email</label>
              <input ref={emailRef} type="email" placeholder="you@khl.com"
                value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={handleKeyDown}
                className={inputCls} style={inputBase}
                onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentLight}` }}
                onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none' }}/>
            </div>

            <div className="mb-7">
              <label style={labelStyle}>Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown}
                  className={inputCls + ' pr-11'} style={inputBase}
                  onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentLight}` }}
                  onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none' }}/>
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: T.textMuted, fontSize: '14px' }}>
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button onClick={handleLogin} disabled={loading || !email || !password}
              className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: T.accent, color: 'white', boxShadow: `0 2px 16px ${T.accent}40` }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.filter = 'brightness(1.08)' }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)' }}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Logging in…
                </span>
              ) : 'Login →'}
            </button>

            <p className="text-center mt-5" style={{ color: T.textMuted, fontSize: '11px' }}>
              Press{' '}
              <span style={{ background: T.bg, padding: '2px 6px', borderRadius: '4px', border: `1px solid ${T.border}`, color: T.textSub }}>Enter</span>
              {' '}to login
            </p>

            <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${T.border}` }}>
              <button onClick={() => { setMode('changePassword'); setError('') }}
                className="w-full text-center text-xs font-medium hover:underline transition-opacity hover:opacity-80"
                style={{ color: T.accent }}>
                🔑 Change Password
              </button>
            </div>
          </div>
        )}

        {/* ── CHANGE PASSWORD CARD ── */}
        {mode === 'changePassword' && (
          <div className="rounded-2xl px-7 py-8"
            style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: '0 4px 40px rgba(196,123,58,0.08)' }}>

            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => { setMode('login'); setCpError(''); setCpSuccess('') }}
                className="text-sm hover:opacity-70 transition-opacity" style={{ color: T.textSub }}>
                ←
              </button>
              <div>
                <h2 className="font-bold" style={{ fontFamily: "'Georgia', serif", fontSize: '18px', color: T.text }}>Change Password</h2>
                <p style={{ color: T.textMuted, fontSize: '11px' }}>Verify your current password first</p>
              </div>
            </div>

            {cpError && (
              <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2"
                style={{ background: '#fee2e2', border: '1px solid #fecaca' }}>
                <span style={{ fontSize: '14px' }}>⚠</span>
                <p style={{ color: '#991b1b', fontSize: '13px' }}>{cpError}</p>
              </div>
            )}

            {cpSuccess && (
              <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-2"
                style={{ background: '#dcfce7', border: '1px solid #86efac' }}>
                <span style={{ fontSize: '14px' }}>✅</span>
                <p style={{ color: '#166534', fontSize: '13px' }}>{cpSuccess}</p>
              </div>
            )}

            <div className="mb-4">
              <label style={labelStyle}>Email</label>
              <input type="email" placeholder="your email address" value={cpEmail}
                onChange={(e) => setCpEmail(e.target.value)} onKeyDown={handleCpKeyDown}
                className={inputCls} style={inputBase}
                onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentLight}` }}
                onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none' }}/>
            </div>

            <div className="mb-4">
              <label style={labelStyle}>Current Password</label>
              <div className="relative">
                <input type={showCpCurrent ? 'text' : 'password'} placeholder="••••••••"
                  value={cpCurrent} onChange={(e) => setCpCurrent(e.target.value)} onKeyDown={handleCpKeyDown}
                  className={inputCls + ' pr-11'} style={inputBase}
                  onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentLight}` }}
                  onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none' }}/>
                <button type="button" onClick={() => setShowCpCurrent(!showCpCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: T.textMuted, fontSize: '14px' }}>
                  {showCpCurrent ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label style={labelStyle}>New Password</label>
              <div className="relative">
                <input type={showCpNew ? 'text' : 'password'} placeholder="min. 6 characters"
                  value={cpNew} onChange={(e) => setCpNew(e.target.value)} onKeyDown={handleCpKeyDown}
                  className={inputCls + ' pr-11'} style={inputBase}
                  onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentLight}` }}
                  onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none' }}/>
                <button type="button" onClick={() => setShowCpNew(!showCpNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: T.textMuted, fontSize: '14px' }}>
                  {showCpNew ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div className="mb-7">
              <label style={labelStyle}>Confirm New Password</label>
              <input type="password" placeholder="repeat new password"
                value={cpConfirm} onChange={(e) => setCpConfirm(e.target.value)} onKeyDown={handleCpKeyDown}
                className={inputCls} style={{
                  ...inputBase,
                  borderColor: cpConfirm && cpNew !== cpConfirm ? '#fca5a5' : T.border,
                }}
                onFocus={e => { e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentLight}` }}
                onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}/>
              {cpConfirm && cpNew !== cpConfirm && (
                <p className="mt-1 text-[11px]" style={{ color: '#dc2626' }}>Passwords do not match</p>
              )}
            </div>

            <button onClick={handleChangePassword}
              disabled={cpLoading || !cpEmail || !cpCurrent || !cpNew || !cpConfirm || !!cpSuccess}
              className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: T.accent, color: 'white', boxShadow: `0 2px 16px ${T.accent}40` }}>
              {cpLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Updating…
                </span>
              ) : '🔑 Update Password'}
            </button>
          </div>
        )}

        <p className="text-center mt-6" style={{ color: T.textMuted, fontSize: '11px' }}>
          Knowledge Hub · Library Management
        </p>
      </div>
    </div>
  )
}
