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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

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

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Invalid email or password'); setLoading(false); return }
    localStorage.setItem(TODAY_KEY, getTodayString())
    router.push('/')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleLogin() }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ background: T.bg }}>

      {/* Subtle warm texture dots */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, ${T.accentBorder} 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          opacity: 0.4,
        }}/>

      {/* Warm ambient blob */}
      <div className="absolute top-0 right-0 w-96 h-96 pointer-events-none rounded-full"
        style={{ background: `radial-gradient(circle, ${T.accentLight} 0%, transparent 70%)`, transform: 'translate(30%, -30%)' }}/>
      <div className="absolute bottom-0 left-0 w-80 h-80 pointer-events-none rounded-full"
        style={{ background: `radial-gradient(circle, ${T.accentLight} 0%, transparent 70%)`, transform: 'translate(-30%, 30%)' }}/>

      {/* Top accent line */}
      <div className="absolute top-0 inset-x-0 h-1"
        style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>

      <div className={`relative w-full max-w-sm transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>

        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: T.accentLight,
              border: `1px solid ${T.accentBorder}`,
              boxShadow: `0 4px 20px ${T.accent}20`,
            }}>
            <span style={{ fontSize: '28px' }}>📚</span>
          </div>
          <h1 className="font-bold mb-1"
            style={{ fontFamily: "'Georgia', serif", fontSize: '24px', color: T.text, letterSpacing: '-0.3px' }}>
            Knowledge Hub
          </h1>
          <p style={{ color: T.textMuted, fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase' }}>
            Library Management System
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl px-7 py-8"
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            boxShadow: '0 4px 40px rgba(196,123,58,0.08)',
          }}>

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-2"
              style={{ background: '#fee2e2', border: '1px solid #fecaca' }}>
              <span style={{ fontSize: '14px' }}>⚠</span>
              <p style={{ color: '#991b1b', fontSize: '13px' }}>{error}</p>
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label style={{ color: T.textSub, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Email
            </label>
            <input
              ref={emailRef}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all"
              style={{
                background: T.bg,
                border: `1px solid ${T.border}`,
                color: T.text,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentLight}` }}
              onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          {/* Password */}
          <div className="mb-7">
            <label style={{ color: T.textSub, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none transition-all pr-11"
                style={{
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  color: T.text,
                }}
                onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentLight}` }}
                onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: T.textMuted, fontSize: '14px' }}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Login button */}
          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: T.accent,
              color: 'white',
              boxShadow: `0 2px 16px ${T.accent}40`,
            }}
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
        </div>

        {/* Footer */}
        <p className="text-center mt-6" style={{ color: T.textMuted, fontSize: '11px' }}>
          Knowledge Hub · Library Management
        </p>
      </div>
    </div>
  )
}
