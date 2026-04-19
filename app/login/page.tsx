'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

const TODAY_KEY = 'kh_login_date'

function getTodayString() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
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

      // ✅ If session exists AND was logged in today → skip login
      if (data.session && savedDate === today) {
        router.push('/')
        return
      }

      // 🔁 If session exists but it's a new day → sign out and force re-login
      if (data.session && savedDate !== today) {
        await supabase.auth.signOut()
        localStorage.removeItem(TODAY_KEY)
      }

      emailRef.current?.focus()
    }
    checkSession()
  }, [])

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Invalid email or password')
      setLoading(false)
      return
    }

    // ✅ Save today's date so session persists till midnight
    localStorage.setItem(TODAY_KEY, getTodayString())
    router.push('/')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f0f] px-4 overflow-hidden relative">

      {/* Background texture */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #c8a96e 0%, transparent 70%)' }}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-sm transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
      >
        {/* Gold top border */}
        <div className="h-[2px] w-full rounded-t-2xl" style={{ background: 'linear-gradient(90deg, transparent, #c8a96e, transparent)' }} />

        <div className="bg-[#161616] border border-white/[0.06] rounded-b-2xl px-8 pt-8 pb-10 shadow-2xl">

          {/* Logo area */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{ background: 'linear-gradient(135deg, #c8a96e22, #c8a96e11)', border: '1px solid #c8a96e44' }}>
              <span className="text-2xl">📚</span>
            </div>
            <h1 className="text-white font-bold tracking-tight"
              style={{ fontFamily: "'Georgia', serif", fontSize: '22px', letterSpacing: '-0.3px' }}>
              Knowledge Hub
            </h1>
            <p className="text-white/30 text-xs mt-1 tracking-widest uppercase">Library Management</p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Email */}
          <div className="mb-3">
            <label className="text-white/40 text-xs tracking-widest uppercase mb-2 block">Email</label>
            <input
              ref={emailRef}
              type="email"
              placeholder="you@example.com"
              className="w-full bg-white/[0.04] border border-white/10 text-white placeholder-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#c8a96e]/50 focus:bg-white/[0.06] transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Password */}
          <div className="mb-7">
            <label className="text-white/40 text-xs tracking-widest uppercase mb-2 block">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="w-full bg-white/[0.04] border border-white/10 text-white placeholder-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#c8a96e]/50 focus:bg-white/[0.06] transition-all pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-sm"
              >
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
              background: loading ? '#c8a96e88' : 'linear-gradient(135deg, #c8a96e, #b8935a)',
              color: '#0f0f0f',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Logging in...
              </span>
            ) : 'Login'}
          </button>

          <p className="text-center text-white/15 text-xs mt-6">
            Press <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/30 text-[10px]">Enter</kbd> to login
          </p>

        </div>
      </div>
    </div>
  )
}
