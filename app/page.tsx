'use client'

import { useEffect, useState, useMemo, useTransition, memo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

let cachedStudents: any[] | null = null

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyxI48i0cFx3c4-MRADfa5nQKQJLIzJR8xAwB0UArEe0_arfxRObvjZA3Tccc6pRE4/exec'
const RENEW_FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSc5KbtfqUpgRuohNyQdhVb-xahCRVTBizCXPobr0vyErzvX_Q/viewform'
const PHOTO_FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSfq6Ajw4dxXw1PiwLR_Bu6GhNccUXSRTSo6yQgj_2o6SpZDkw/viewform'
const PHOTO_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzX-eQ5-UcKiDY1Aa15KnXG52gEK33tkIVAXaWM8lN5CFxdnMyZXqVng0rfnfWYh-vG/exec'
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''

const callGemini = async (body: object): Promise<string> => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`

  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await response.json()

    if (response.status === 503 || response.status === 429) {
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 2000))
        continue
      }
      throw new Error('Gemini is busy right now. Please try again in a moment.')
    }

    if (!response.ok) throw new Error(json?.error?.message || `HTTP ${response.status}`)
    return json?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.'
  }
  throw new Error('Gemini is busy right now. Please try again in a moment.')
}

const T = {
  bg: '#faf8f5', surface: '#ffffff',
  border: '#ede8e1', borderHover: '#ddd4c8',
  accent: '#c47b3a', accentLight: '#fdf0e4', accentBorder: '#f0d4b0',
  text: '#1c1917', textSub: '#78716c', textMuted: '#a8a29e',
}

const SHIFTS = ['6 AM - 12 PM', '12 PM - 6 PM', '6 PM - 11 PM']

function getProxyUrl(url: string) {
  if (!url) return ''
  return `/api/image?url=${encodeURIComponent(url)}`
}

function toInputDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

function isDateOlderThan20Days(dateStr: string) {
  if (!dateStr) return false
  return (Date.now() - new Date(dateStr).getTime()) / 86400000 > 20
}

async function pingAppsScript() {
  try {
    await fetch(APPS_SCRIPT_URL, { method: 'GET', mode: 'no-cors' })
  } catch (e) {
    console.warn('Apps Script ping failed:', e)
  }
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
function ConfirmModal({ message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: {
  message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(28,25,23,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full sm:max-w-xs rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="h-[3px] rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${danger ? '#dc2626' : T.accent}, transparent)` }} />
        <div className="p-6 pb-[max(24px,env(safe-area-inset-bottom,24px))]">
          <p className="text-sm font-medium text-center mb-6" style={{ color: T.text }}>{message}</p>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-3 rounded-xl text-sm font-medium"
              style={{ border: `1px solid ${T.border}`, color: T.textSub }}>
              Cancel
            </button>
            <button onClick={onConfirm}
              className="flex-1 py-3 rounded-xl text-sm font-semibold"
              style={{ background: danger ? '#dc2626' : T.accent, color: 'white' }}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || ''
  let bg = '#fef9c3', color = '#854d0e', border = '#fde68a'
  if (s.includes('expired')) { bg = '#fee2e2'; color = '#991b1b'; border = '#fca5a5' }
  else if (s.includes('active')) { bg = '#dcfce7'; color = '#166534'; border = '#86efac' }
  else if (s.includes('blocked')) { bg = '#f3f4f6'; color = '#4b5563'; border = '#d1d5db' }
  else if (s.includes('freeze')) { bg = '#e0f2fe'; color = '#075985'; border = '#7dd3fc' }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {status}
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-5">
      <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: T.textMuted }}>
        {children}
      </span>
      <div className="flex-1 h-px" style={{ background: T.border }} />
    </div>
  )
}

function NewAdmissionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
      style={{ background: T.accent, color: 'white', boxShadow: `0 2px 12px ${T.accent}50` }}>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      New Admission
    </button>
  )
}

// ─── STUDENT CARD ─────────────────────────────────────────────────────────────
const StudentCard = memo(({
  s, selectable, selected, onToggle, onRenew, role,
}: {
  s: any; selectable: boolean; selected: boolean
  onToggle: (mobile: string) => void; onRenew: (s: any) => void; role: string
}) => {
  const isPrivileged = role === 'admin' || role === 'manager' || role === 'partner'
  const canRenew = isPrivileged && s.status?.toLowerCase().includes('expired')
  const statusDot = s.status?.includes('Active') ? '#16a34a'
    : s.status?.includes('Blocked') ? '#9ca3af'
      : s.status?.toLowerCase().includes('freeze') ? '#0ea5e9'
        : '#dc2626'

  const innerContent = (
    <>
      {selectable && (
        <div className="absolute top-3 right-3 z-10 w-5 h-5 rounded-md flex items-center justify-center"
          style={{ background: selected ? T.accent : 'transparent', border: `2px solid ${selected ? T.accent : T.borderHover}` }}>
          {selected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </div>
      )}
      <div className="flex items-center gap-4 p-4">
        <div className="relative shrink-0">
          <img loading="lazy" src={getProxyUrl(s.image_url) || '/default-avatar.png'}
            onError={(e) => { e.currentTarget.src = '/default-avatar.png' }}
            className="w-14 h-14 rounded-xl object-cover" style={{ border: `1px solid ${T.border}` }} />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2"
            style={{ borderColor: T.surface, background: statusDot }} />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <p className="font-semibold truncate" style={{ color: T.text, fontFamily: "'Georgia', serif", fontSize: '15px' }}>{s.name}</p>
          <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{s.mobile_number}</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={s.status} />
            {s.total_due > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                Due ₹{s.total_due}
              </span>
            )}
            <span className="text-[10px]" style={{ color: T.textMuted }}>📄 {s.total_admissions}</span>
          </div>
        </div>
      </div>
      {canRenew && !selectable && (
        <div className="px-4 pb-4 -mt-1">
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRenew(s) }}
            className="w-full py-1.5 rounded-lg text-xs font-semibold tracking-wide"
            style={{ background: T.accent, color: 'white' }}>
            ↺ Renew
          </button>
        </div>
      )}
    </>
  )

  const baseStyle: React.CSSProperties = {
    background: selected ? T.accentLight : T.surface,
    border: `1px solid ${selected ? T.accentBorder : T.border}`,
    boxShadow: selected ? `0 0 0 2px ${T.accentBorder}` : '0 1px 3px rgba(0,0,0,0.06)',
  }

  if (selectable) {
    return (
      <div className="relative rounded-2xl overflow-hidden cursor-pointer select-none" style={baseStyle}
        onClick={() => onToggle(s.mobile_number)}>{innerContent}</div>
    )
  }
  return (
    <div className="relative rounded-2xl overflow-hidden" style={baseStyle}>
      <Link href={`/student/${s.mobile_number}`} className="block hover:bg-orange-50/40 transition-colors">{innerContent}</Link>
    </div>
  )
})
StudentCard.displayName = 'StudentCard'

// ─── MODAL SHELL ──────────────────────────────────────────────────────────────
function ModalShell({ onBackdropClick, children }: {
  onBackdropClick: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onBackdropClick() }}>
      <div
        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          maxHeight: 'calc(100dvh - 60px)',
        }}>
        {children}
      </div>
    </div>
  )
}

// ─── AI CHAT WIDGET ───────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'ai'
  text: string
  loading?: boolean
}

let cachedAdmissions: any[] | null = null

function ChatWidget({ open, setOpen }: { open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', text: '👋 Hi! Ask me anything about admission data — e.g. "Show all active students" or "Students with fees less than 1500 and 3 months".' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages])

  const fetchAdmissionData = async (): Promise<any[]> => {
    if (cachedAdmissions && cachedAdmissions.length > 0) return cachedAdmissions
    setDataLoading(true)
    const { data, error } = await supabase
      .from('v_admission_details')
      .select('*')
    setDataLoading(false)
    console.log('Admission data fetch:', { count: data?.length, error })
    if (error || !data) {
      console.error('Failed to fetch admission data:', error)
      return []
    }
    cachedAdmissions = data
    return data
  }

  const askGemini = async (question: string) => {
    if (!question.trim()) return
    setLoading(true)

    const userMsg: ChatMessage = { role: 'user', text: question }
    const aiPlaceholder: ChatMessage = { role: 'ai', text: '', loading: true }
    setMessages(prev => [...prev, userMsg, aiPlaceholder])
    setInput('')

    try {
      const data = await fetchAdmissionData()

      const systemPrompt = `You are an AI assistant for Knowledge Hub Library. You have access to the library's student records.

The data below is from v_student_summary. Each row is one student with these columns:
- name, mobile_number, status, total_due, total_admissions, image_url, latest_expiry, latest_fees, latest_months, latest_seat, latest_shift

IMPORTANT RULES:
- For COUNT queries: count EVERY matching record in the data, do not estimate
- For LIST queries: show name, mobile, status only — keep it brief
- Status values: Active, Expired, Blocked, Freezed, Active+Due, Expired+Due, Blocked+Due
- "Active students" means status includes "Active" (so both "Active" AND "Active+Due" count)
- For fee queries format with ₹ symbol
- Format dates as "15 Jan 2025"
- Keep responses concise — for lists over 10 students, show first 10 and say "and X more"

STUDENT DATA (${data.length} records):
${JSON.stringify(data, null, 0)}`

      const aiText = await callGemini({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nUser question: ${question}` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 3000 }
      })

      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 ? { role: 'ai', text: aiText, loading: false } : m
      ))
    } catch (err: any) {
      console.error('AI chat error:', err)
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 ? { role: 'ai', text: `⚠️ ${err?.message || 'Something went wrong. Please try again.'}`, loading: false } : m
      ))
    }
    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault()
      askGemini(input)
    }
  }

  const formatAiText = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('### ')) {
        return <p key={i} className="font-bold text-sm mb-1 mt-2" style={{ color: T.text }}>{line.slice(4)}</p>
      }
      if (line.startsWith('## ')) {
        return <p key={i} className="font-bold text-sm mb-1 mt-2" style={{ color: T.text }}>{line.slice(3)}</p>
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} className="font-semibold mb-1" style={{ color: T.text }}>{line.slice(2, -2)}</p>
      }
      if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
        return <p key={i} className="pl-3 mb-0.5" style={{ color: T.text }}>• {line.slice(2)}</p>
      }
      if (line.startsWith('| ')) {
        const cells = line.split('|').filter(c => c.trim() && !c.trim().match(/^[-:]+$/))
        if (cells.length === 0) return null
        return (
          <div key={i} className="flex gap-2 text-xs py-0.5 border-b" style={{ borderColor: T.border }}>
            {cells.map((cell, j) => (
              <span key={j} className="flex-1 truncate" style={{ color: T.text }}>{cell.trim()}</span>
            ))}
          </div>
        )
      }
      if (line.trim() === '' || line.trim() === '---') return <div key={i} className="h-2" />
      if (line.includes('**')) {
        const parts = line.split(/\*\*(.*?)\*\*/g)
        return (
          <p key={i} className="mb-0.5 leading-relaxed" style={{ color: T.text }}>
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
          </p>
        )
      }
      return <p key={i} className="mb-0.5 leading-relaxed" style={{ color: T.text }}>{line}</p>
    })
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all duration-200"
        style={{
          background: open ? T.text : T.accent,
          boxShadow: `0 4px 24px ${T.accent}60`,
          transform: open ? 'scale(0.95)' : 'scale(1)',
        }}
        title="AI Assistant"
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 z-[99] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            width: 'min(400px, calc(100vw - 32px))',
            height: 'min(560px, calc(100dvh - 120px))',
            background: T.surface,
            border: `1px solid ${T.border}`,
          }}
        >
          {/* Header */}
          <div className="shrink-0 px-4 py-3 flex items-center gap-3"
            style={{ background: T.accent, borderBottom: `1px solid ${T.accentBorder}` }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.2)' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">AI Assistant</p>
              <p className="text-[10px] text-white/70">Powered by Gemini · Student data</p>
            </div>
            {dataLoading && (
              <div className="flex items-center gap-1.5">
                <svg className="animate-spin w-3.5 h-3.5 text-white/70" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="text-[10px] text-white/70">Loading data…</span>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ background: T.bg }}>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'ai' && (
                  <div className="w-6 h-6 rounded-lg shrink-0 mr-2 mt-0.5 flex items-center justify-center"
                    style={{ background: T.accent }}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                )}
                <div
                  className="max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs"
                  style={msg.role === 'user'
                    ? { background: T.accent, color: 'white', borderBottomRightRadius: 6 }
                    : { background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderBottomLeftRadius: 6 }
                  }
                >
                  {msg.loading ? (
                    <div className="flex items-center gap-1.5 py-0.5">
                      {[0, 1, 2].map(j => (
                        <div key={j} className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ background: T.accent, animationDelay: `${j * 0.15}s` }} />
                      ))}
                    </div>
                  ) : msg.role === 'ai' ? (
                    <div className="leading-relaxed">{formatAiText(msg.text)}</div>
                  ) : (
                    <p className="leading-relaxed">{msg.text}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick suggestions */}
          {messages.length === 1 && (
            <div className="shrink-0 px-3 py-2 flex gap-2 overflow-x-auto"
              style={{ background: T.bg, borderTop: `1px solid ${T.border}` }}>
              {[
                'Active students count',
                'Students with due fees',
                'Show expired students',
                'Online payment students',
              ].map(q => (
                <button key={q} onClick={() => askGemini(q)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap"
                  style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}`, color: T.accent }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 flex gap-2 p-3"
            style={{ borderTop: `1px solid ${T.border}`, background: T.surface }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about students, fees, seats…"
              disabled={loading}
              className="flex-1 px-3 py-2 rounded-xl text-xs focus:outline-none disabled:opacity-50"
              style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '14px' }}
            />
            <button
              onClick={() => askGemini(input)}
              disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40 transition-all"
              style={{ background: T.accent, color: 'white' }}>
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.269 20.876L5.999 12zm0 0h7.5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── RENEW POPUP ──────────────────────────────────────────────────────────────
function RenewPopup({ student, userName, onClose, onSuccess }: {
  student: any; userName: string; onClose: () => void; onSuccess: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [regId, setRegId] = useState('')
  const [regIdLoading, setRegIdLoading] = useState(true)
  const [error, setError] = useState('')

  const latestExpiry = toInputDate(student.latest_expiry || '')
  const [startDate, setStartDate] = useState(latestExpiry)
  const [months, setMonths] = useState(student.latest_months?.toString() || '1')
  const [seat, setSeat] = useState(student.latest_seat?.toString() || '')
  const [selectedShifts, setSelectedShifts] = useState<string[]>(
    student.latest_shift ? student.latest_shift.split(', ').map((x: string) => x.trim()) : []
  )
  const [finalFees, setFinalFees] = useState(student.latest_fees?.toString() || '')
  const [feesSubmitted, setFeesSubmitted] = useState(student.latest_fees?.toString() || '')
  const [mode, setMode] = useState('Cash')
  const [comment, setComment] = useState('')
  const now = new Date().toISOString()

  const minFees = Math.round(500 * parseFloat(months || '1'))

  useEffect(() => {
    const fetchRegId = async () => {
      setRegIdLoading(true)
      const { data: lastRecord } = await supabase.schema('library_management').from('admission_responses')
        .select('register_id').order('id', { ascending: false }).limit(1).maybeSingle()
      if (lastRecord?.register_id) {
        const { data: nextId } = await supabase.rpc('get_next_reg_id', { current_val: lastRecord.register_id })
        setRegId(nextId || '')
      }
      setRegIdLoading(false)
    }
    fetchRegId()
  }, [])

  const toggleShift = (shift: string) =>
    setSelectedShifts(prev => prev.includes(shift) ? prev.filter(x => x !== shift) : [...prev, shift])

  const handleStartDateChange = (val: string) => {
    setStartDate(val)
    if (isDateOlderThan20Days(val)) setError('Start date cannot be older than 20 days')
    else if (error.includes('Start date')) setError('')
  }

  const handleFeesChange = (val: string) => {
    setFinalFees(val); setFeesSubmitted(val)
    const parsed = parseFloat(val)
    const currentMin = Math.round(500 * parseFloat(months || '1'))
    if (!isNaN(parsed) && parsed < currentMin) setError(`Minimum fees for ${months} month(s) is ₹${currentMin}`)
    else if (error.startsWith('Minimum fees')) setError('')
  }

  const handleMonthsChange = (val: string) => {
    setMonths(val)
    const currentMin = Math.round(500 * parseFloat(val || '1'))
    const parsed = parseFloat(finalFees)
    if (!isNaN(parsed) && parsed < currentMin) setError(`Minimum fees for ${val} month(s) is ₹${currentMin}`)
    else if (error.startsWith('Minimum fees')) setError('')
  }

  const handleSubmit = async () => {
    if (!startDate || !months || !seat || selectedShifts.length === 0 || !finalFees || !feesSubmitted) {
      setError('Please fill all required fields'); return
    }
    const seatNum = parseInt(seat)
    if (isNaN(seatNum) || seatNum < 0 || seatNum > 92) { setError('Seat must be between 0 and 92'); return }
    if (isDateOlderThan20Days(startDate)) { setError('Start date cannot be older than 20 days'); return }
    if (parseFloat(finalFees) < minFees) { setError(`Minimum fees for ${months} month(s) is ₹${minFees}`); return }
    if (!regId) { setError('Register ID not loaded'); return }
    setSaving(true); setError('')

    const payload = {
      timestamp: now, name: student.name, mobile_number: student.mobile_number,
      admission: 'Renew', address: null, gender: null, date_of_birth: null, aadhar_number: null, photo: null,
      start_date: startDate, months: parseFloat(months), seat, shift: selectedShifts.join(', '),
      final_fees: parseFloat(finalFees), fees_submitted: parseFloat(feesSubmitted),
      mode, register_id: regId, comment: comment || null, created_by: userName,
    }

    const { error: insertError } = await supabase.schema('library_management').from('admission_responses').insert([payload])
    if (insertError) { setError(insertError.message); setSaving(false); return }

    pingAppsScript()
    onSuccess(); onClose()
  }

  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }
  const readonlyStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }
  const labelCls = "text-[10px] uppercase tracking-widest mb-1.5 block font-medium"
  const inputCls = "w-full px-3 py-2.5 rounded-xl focus:outline-none"

  return (
    <ModalShell onBackdropClick={onClose}>
      <div className="h-[3px] rounded-t-2xl shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }} />
      <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: T.border }} />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6" style={{ WebkitOverflowScrolling: 'touch' as any }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>Renew Membership</h2>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>All fields marked * are required</p>
          </div>
          <button onClick={onClose} className="text-xl p-1" style={{ color: T.textMuted }}>✕</button>
        </div>
        <div className="mb-5 px-3 py-2.5 rounded-xl text-xs" style={readonlyStyle}>
          🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Name</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{student.name}</div>
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Mobile</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{student.mobile_number}</div>
          </div>
        </div>
        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Register ID</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>
            {regIdLoading ? <span className="animate-pulse">Fetching…</span> : regId || '—'}
          </div>
        </div>
        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Start Date *</label>
          <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Months *</label>
            <input type="number" value={months} onChange={(e) => handleMonthsChange(e.target.value)} min="1" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Seat (0–92) *</label>
            <input type="number" value={seat} onChange={(e) => setSeat(e.target.value)} min="0" max="92" className={inputCls} style={inputStyle} />
          </div>
        </div>
        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Shift *</label>
          <div className="space-y-2">
            {SHIFTS.map((shift) => {
              const checked = selectedShifts.includes(shift)
              return (
                <label key={shift} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                  style={{ background: checked ? T.accentLight : T.bg, border: `1px solid ${checked ? T.accentBorder : T.border}` }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleShift(shift)} className="hidden" />
                  <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                    style={{ background: checked ? T.accent : 'transparent', border: `2px solid ${checked ? T.accent : T.borderHover}` }}>
                    {checked && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-sm" style={{ color: checked ? T.text : T.textSub }}>{shift}</span>
                </label>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>
              Final Fees *
              {finalFees && <span className="ml-1 text-[9px]" style={{ color: T.textMuted }}>min ₹{minFees}</span>}
            </label>
            <input type="number" value={finalFees} onChange={(e) => handleFeesChange(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Fees Submitted *</label>
            <input type="number" value={feesSubmitted} onChange={(e) => setFeesSubmitted(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Payment Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls + ' appearance-none'} style={inputStyle}>
              <option value="Cash">Cash</option>
              <option value="Online">Online</option>
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Admission</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>Renew</div>
          </div>
        </div>
        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Comment (optional)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
            placeholder="Any notes…" className={inputCls + ' resize-none'} style={inputStyle} />
        </div>
        <div className="mb-2">
          <label className={labelCls} style={{ color: T.textSub }}>Created By</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{userName}</div>
        </div>
        {error && (
          <div className="mt-4 px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
            <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
          </div>
        )}
      </div>
      <div className="shrink-0 flex gap-3 p-4 pt-3"
        style={{ borderTop: `1px solid ${T.border}`, background: T.surface, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
        <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm"
          style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving || regIdLoading}
          className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: T.accent, color: 'white' }}>
          {saving
            ? <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Saving…
              </span>
            : '✓ Confirm Renewal'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── DRAFT HELPERS ────────────────────────────────────────────────────────────
const DRAFT_KEY = 'new_admission_draft'

function getDrivePreviewUrl(driveUrl: string): string {
  if (!driveUrl) return ''
  try {
    const idMatch = driveUrl.match(/[?&]id=([^&]+)/) || driveUrl.match(/\/d\/([^/]+)/)
    if (idMatch?.[1]) return `https://lh3.googleusercontent.com/d/${idMatch[1]}`
  } catch {}
  return driveUrl
}

function loadDraft(): Record<string, any> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveDraft(patch: Record<string, any>) {
  try {
    const current = loadDraft()
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...current, ...patch }))
  } catch {}
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}

// ─── NEW ADMISSION POPUP ──────────────────────────────────────────────────────
function NewAdmissionPopup({ userName, onClose, onSuccess }: {
  userName: string; onClose: () => void; onSuccess: () => void
}) {
  const draft = loadDraft()

  const [regId, setRegId] = useState('')
  const [regIdLoading, setRegIdLoading] = useState(true)

  const [photoVerified, setPhotoVerified] = useState(false)
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
  const [photoPhase, setPhotoPhase] = useState<'idle' | 'countdown' | 'polling' | 'done' | 'failed'>('idle')
  const [photoCountdown, setPhotoCountdown] = useState(40)
  const [pollCountdown, setPollCountdown] = useState(5)
  const [photoError, setPhotoError] = useState('')
  const pollingRef = useRef<{ stop: () => void } | null>(null)

  const [name, setName]       = useState(draft.name || '')
  const [mobile, setMobile]   = useState(draft.mobile || '')
  const [mobileError, setMobileError] = useState('')
  const [existingStudent, setExistingStudent] = useState<any | null>(null)
  const [address, setAddress] = useState(draft.address || '')
  const [gender, setGender]   = useState(draft.gender || '')
  const [dob, setDob]         = useState(draft.dob || '')
  const [aadhar, setAadhar]   = useState(draft.aadhar || '')

  const now = new Date().toISOString()
  const [startDate, setStartDate]           = useState(draft.startDate || toInputDate(now))
  const [months, setMonths]                 = useState(draft.months || '1')
  const [seat, setSeat]                     = useState(draft.seat ?? '0')
  const [selectedShifts, setSelectedShifts] = useState<string[]>(draft.selectedShifts || [...SHIFTS])
  const [finalFees, setFinalFees]           = useState(draft.finalFees || '500')
  const [feesSubmitted, setFeesSubmitted]   = useState(draft.feesSubmitted || '500')
  const [mode, setMode]                     = useState(draft.mode || 'Cash')
  const [comment, setComment]               = useState(draft.comment || '')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const minFees = Math.round(500 * parseFloat(months || '1'))

  useEffect(() => {
    const fetchRegId = async () => {
      setRegIdLoading(true)
      const { data: lastRecord } = await supabase
        .schema('library_management').from('admission_responses')
        .select('register_id').order('id', { ascending: false }).limit(1).maybeSingle()
      if (lastRecord?.register_id) {
        const { data: nextId } = await supabase.rpc('get_next_reg_id', { current_val: lastRecord.register_id })
        setRegId(nextId || '')
      }
      setRegIdLoading(false)
    }
    fetchRegId()
    return () => { pollingRef.current?.stop() }
  }, [])

  const sd = (patch: Record<string, any>) => saveDraft(patch)

  const startVerify = () => {
    if (!regId || photoPhase === 'countdown' || photoPhase === 'polling') return
    setPhotoError('')
    setPhotoVerified(false)
    setPhotoUrl('')
    setPhotoPreviewUrl('')
    setPhotoPhase('countdown')
    setPhotoCountdown(40)

    const stopped = { value: false }
    pollingRef.current = { stop: () => { stopped.value = true } }

    let remaining = 40
    const countdownTimer = setInterval(() => {
      if (stopped.value) { clearInterval(countdownTimer); return }
      remaining -= 1
      setPhotoCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(countdownTimer)
        if (!stopped.value) beginPolling(stopped)
      }
    }, 1000)
  }

  const doSingleCheck = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${PHOTO_SCRIPT_URL}?action=getPhotoUrl&register_id=${encodeURIComponent(regId)}`)
      const json = await res.json()
      if (json.status === 'found' && json.url) {
        setPhotoUrl(json.url)
        setPhotoPreviewUrl(getDrivePreviewUrl(json.url))
        setPhotoVerified(true)
        setPhotoPhase('done')
        setPhotoError('')
        return true
      }
    } catch {}
    return false
  }

  const beginPolling = (stopped: { value: boolean }) => {
    setPhotoPhase('polling')
    const startedAt = Date.now()
    const MAX_MS = 4 * 60 * 1000

    const runCycle = async () => {
      if (stopped.value) return
      if (Date.now() - startedAt > MAX_MS) {
        setPhotoPhase('failed')
        setPhotoError('Photo not found after 4 minutes. Please re-upload and try again.')
        return
      }
      const found = await doSingleCheck()
      if (found) return

      let c = 5
      setPollCountdown(c)
      const tick = setInterval(() => {
        if (stopped.value) { clearInterval(tick); return }
        c -= 1
        setPollCountdown(c)
        if (c <= 0) { clearInterval(tick); runCycle() }
      }, 1000)
    }

    runCycle()
  }

  const openPhotoForm = () => {
    if (!regId) return
    window.open(`${PHOTO_FORM_BASE}?usp=pp_url&entry.754882253=${encodeURIComponent(regId)}`, '_blank')
  }

  const handleMobileChange = async (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10)
    setMobile(digits); sd({ mobile: digits })
    setMobileError('')
    setExistingStudent(null)

    if (digits.length === 10) {
      const { data, error: qErr } = await supabase
        .from('v_student_summary')
        .select('name, mobile_number, status, image_url')
        .eq('mobile_number', digits)
        .maybeSingle()
      if (!qErr && data) {
        setMobileError('exists')
        setExistingStudent(data)
      }
    }
  }

  const handleStartDateChange = (val: string) => {
    setStartDate(val); sd({ startDate: val })
    if (isDateOlderThan20Days(val)) setError('Start date cannot be older than 20 days')
    else if (error.includes('Start date')) setError('')
  }

  const handleMonthsChange = (val: string) => {
    const prevMin = Math.round(500 * parseFloat(months || '1'))
    const newMin  = Math.round(500 * parseFloat(val || '1'))
    setMonths(val); sd({ months: val })
    const currentFees = parseFloat(finalFees)
    if (isNaN(currentFees) || currentFees === prevMin) {
      setFinalFees(newMin.toString()); setFeesSubmitted(newMin.toString())
      sd({ finalFees: newMin.toString(), feesSubmitted: newMin.toString() })
      if (error.startsWith('Minimum fees')) setError('')
    } else if (currentFees < newMin) {
      setError(`Minimum fees for ${val} month(s) is ₹${newMin}`)
    } else if (error.startsWith('Minimum fees')) {
      setError('')
    }
  }

  const handleFeesChange = (val: string) => {
    setFinalFees(val); setFeesSubmitted(val); sd({ finalFees: val, feesSubmitted: val })
    const parsed = parseFloat(val)
    const currentMin = Math.round(500 * parseFloat(months || '1'))
    if (!isNaN(parsed) && parsed < currentMin) setError(`Minimum fees for ${months} month(s) is ₹${currentMin}`)
    else if (error.startsWith('Minimum fees')) setError('')
  }

  const toggleShift = (shift: string) => {
    setSelectedShifts(prev => {
      const next = prev.includes(shift) ? prev.filter(x => x !== shift) : [...prev, shift]
      sd({ selectedShifts: next })
      return next
    })
  }

  const handleSubmit = async () => {
    setError('')
    if (!name.trim() || name.trim().length < 2)            { setError('Name must be at least 2 characters.'); return }
    if (mobile.length !== 10)                               { setError('Mobile number must be exactly 10 digits.'); return }
    if (mobileError === 'exists')                           { setError('This mobile is already registered. View the student card above.'); return }
    if (!gender)                                            { setError('Please select a gender.'); return }
    if (!dob)                                               { setError('Date of birth is required.'); return }
    if (new Date(dob) >= new Date())                        { setError('Date of birth must be in the past.'); return }
    if (aadhar && aadhar.replace(/\D/g, '').length !== 12) { setError('Aadhar number must be 12 digits.'); return }
    if (!startDate)                                         { setError('Start date is required.'); return }
    if (isDateOlderThan20Days(startDate))                   { setError('Start date cannot be older than 20 days.'); return }
    if (!months || parseFloat(months) < 1)                  { setError('Months must be at least 1.'); return }
    const seatNum = parseInt(seat)
    if (isNaN(seatNum) || seatNum < 0 || seatNum > 92)     { setError('Seat must be between 0 and 92.'); return }
    if (selectedShifts.length === 0)                        { setError('Please select at least one shift.'); return }
    if (!finalFees || parseFloat(finalFees) < minFees)      { setError(`Minimum fees for ${months} month(s) is ₹${minFees}.`); return }
    if (!feesSubmitted)                                     { setError('Fees Submitted is required.'); return }
    if (!regId)                                             { setError('Register ID not loaded yet. Please wait.'); return }
    if (!photoVerified || !photoUrl)                        { setError('Please verify the student photo before submitting.'); return }

    setSaving(true)
    const payload = {
      timestamp: now, name: name.trim(), mobile_number: mobile,
      admission: 'New', address: address.trim() || null, gender,
      date_of_birth: dob || null, aadhar_number: aadhar.replace(/\D/g, '') || null,
      photo: photoUrl,
      start_date: startDate, months: parseFloat(months),
      seat: seat.toString(), shift: selectedShifts.join(', '),
      final_fees: parseFloat(finalFees), fees_submitted: parseFloat(feesSubmitted),
      mode, register_id: regId, comment: comment.trim() || null, created_by: userName,
    }

    const { error: insertError } = await supabase
      .schema('library_management').from('admission_responses').insert([payload])

    if (insertError) { setError(insertError.message); setSaving(false); return }

    pingAppsScript()
    clearDraft()
    pollingRef.current?.stop()
    onSuccess()
    onClose()
  }

  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }
  const readonlyStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }
  const errorInputStyle: React.CSSProperties = { ...inputStyle, border: '1px solid #fca5a5' }
  const labelCls = "text-[10px] uppercase tracking-widest mb-1.5 block font-medium"
  const inputCls = "w-full px-3 py-2.5 rounded-xl focus:outline-none"

  const PhotoSection = () => {
    if (photoVerified) {
      return (
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ border: '2px solid #86efac' }}>
              {photoPreviewUrl
                ? <img src={photoPreviewUrl} alt="Student" className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none' }} />
                : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: '#dcfce7' }}>📷</div>
              }
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold" style={{ color: '#166534' }}>✓ Photo verified</p>
              <p className="text-[10px] mt-0.5" style={{ color: '#16a34a' }}>Linked to Register ID {regId}</p>
            </div>
            <button
              onClick={() => {
                pollingRef.current?.stop()
                setPhotoVerified(false); setPhotoUrl(''); setPhotoPreviewUrl('')
                setPhotoPhase('idle'); setPhotoError('')
              }}
              className="text-xs px-2.5 py-1 rounded-lg"
              style={{ color: '#dc2626', border: '1px solid #fca5a5', background: '#fff' }}>
              Re-upload
            </button>
          </div>
        </div>
      )
    }

    if (photoPhase === 'countdown') {
      return (
        <div className="rounded-2xl p-4 mb-4" style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: T.accent }}>
              <span className="text-white text-sm font-bold">{photoCountdown}</span>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: T.text }}>Waiting for upload…</p>
              <p className="text-[10px]" style={{ color: T.textMuted }}>Upload the photo in the new tab, checking in {photoCountdown}s</p>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: T.accentBorder }}>
            <div className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${((40 - photoCountdown) / 40) * 100}%`, background: T.accent }} />
          </div>
        </div>
      )
    }

    if (photoPhase === 'polling') {
      return (
        <div className="rounded-2xl p-4 mb-4" style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: T.surface, border: `2px solid ${T.accent}` }}>
              <span className="text-sm font-bold" style={{ color: T.accent }}>{pollCountdown}</span>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: T.text }}>Checking for photo…</p>
              <p className="text-[10px]" style={{ color: T.textMuted }}>Next check in {pollCountdown}s</p>
            </div>
            <div className="ml-auto">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" style={{ color: T.accent }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="rounded-2xl p-4 mb-4" style={{
        background: photoPhase === 'failed' ? '#fef2f2' : T.accentLight,
        border: `1px solid ${photoPhase === 'failed' ? '#fecaca' : T.accentBorder}`,
      }}>
        <p className="text-xs mb-3" style={{ color: T.textSub }}>
          {photoPhase === 'failed'
            ? 'Photo not found. Please re-upload via the form and verify again.'
            : 'Open the upload form in a new tab, upload the photo, then click Verify Photo.'}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={openPhotoForm} disabled={regIdLoading || !regId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
            style={{ background: T.accent, color: 'white' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Upload Form ↗
          </button>
          <button onClick={startVerify} disabled={regIdLoading || !regId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Verify Photo
          </button>
        </div>
        {photoError && <p className="text-xs mt-2.5 font-medium" style={{ color: '#dc2626' }}>{photoError}</p>}
      </div>
    )
  }

  return (
    <ModalShell onBackdropClick={onClose}>
      <div className="h-[3px] rounded-t-2xl shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }} />
      <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: T.border }} />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6" style={{ WebkitOverflowScrolling: 'touch' as any }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>New Admission</h2>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>All fields marked * are required</p>
          </div>
          <button onClick={onClose} className="text-xl p-1" style={{ color: T.textMuted }}>✕</button>
        </div>

        {Object.keys(draft).length > 0 && (
          <div className="mb-4 px-3 py-2 rounded-xl flex items-center justify-between"
            style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
            <p className="text-[10px]" style={{ color: T.accent }}>📝 Draft restored from your last session</p>
            <button onClick={() => { clearDraft(); onClose() }}
              className="text-[10px] underline ml-2" style={{ color: T.textMuted }}>
              Discard
            </button>
          </div>
        )}

        <div className="mb-3 px-3 py-2.5 rounded-xl text-xs" style={readonlyStyle}>
          🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Register ID</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>
            {regIdLoading
              ? <span className="animate-pulse text-xs">Fetching…</span>
              : <span className="font-semibold" style={{ color: T.text }}>{regId || '—'}</span>}
          </div>
        </div>

        <SectionLabel>👤 Personal Details</SectionLabel>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Full Name *</label>
          <input type="text" value={name}
            onChange={(e) => { setName(e.target.value); sd({ name: e.target.value }) }}
            placeholder="Enter full name" className={inputCls} style={inputStyle} />
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Mobile Number *</label>
          <input type="tel" value={mobile} onChange={(e) => handleMobileChange(e.target.value)}
            placeholder="10-digit mobile" maxLength={10} className={inputCls}
            style={existingStudent ? errorInputStyle : inputStyle} />
          {existingStudent && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: T.textMuted }}>
                Number already registered for:
              </p>
              <Link
                href={`/student/${existingStudent.mobile_number}`}
                onClick={onClose}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}`, textDecoration: 'none' }}>
                <div className="relative shrink-0">
                  <img
                    src={getProxyUrl(existingStudent.image_url) || '/default-avatar.png'}
                    onError={(e) => { e.currentTarget.src = '/default-avatar.png' }}
                    className="w-10 h-10 rounded-lg object-cover"
                    style={{ border: `1px solid ${T.border}` }} />
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                    style={{
                      borderColor: T.surface,
                      background: existingStudent.status?.includes('Active') ? '#16a34a'
                        : existingStudent.status?.toLowerCase().includes('freeze') ? '#0ea5e9'
                        : existingStudent.status?.toLowerCase().includes('blocked') ? '#9ca3af'
                        : '#dc2626',
                    }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                    {existingStudent.name}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>{existingStudent.mobile_number}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={existingStudent.status} />
                  <span className="text-[10px]" style={{ color: T.textMuted }}>Tap to view →</span>
                </div>
              </Link>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Gender *</label>
            <select value={gender}
              onChange={(e) => { setGender(e.target.value); sd({ gender: e.target.value }) }}
              className={inputCls + ' appearance-none'} style={inputStyle}>
              <option value="">Select…</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Date of Birth *</label>
            <input type="date" value={dob}
              onChange={(e) => { setDob(e.target.value); sd({ dob: e.target.value }) }}
              max={toInputDate(new Date().toISOString())} className={inputCls} style={inputStyle} />
          </div>
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>
            Aadhar Number <span className="text-[9px] normal-case tracking-normal" style={{ color: T.textMuted }}>(12 digits, optional)</span>
          </label>
          <input type="text" value={aadhar}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 12); setAadhar(v); sd({ aadhar: v }) }}
            placeholder="xxxxxxxxxxxx" className={inputCls} style={inputStyle} />
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Address</label>
          <textarea value={address}
            onChange={(e) => { setAddress(e.target.value); sd({ address: e.target.value }) }}
            rows={2} placeholder="Full address (optional)" className={inputCls + ' resize-none'} style={inputStyle} />
        </div>

        <SectionLabel>📋 Admission Details</SectionLabel>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Admission</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>New</div>
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Start Date *</label>
          <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)}
            className={inputCls} style={inputStyle} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Months *</label>
            <input type="number" value={months} onChange={(e) => handleMonthsChange(e.target.value)}
              min="1" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Seat (0–92) *</label>
            <input type="number" value={seat}
              onChange={(e) => { setSeat(e.target.value); sd({ seat: e.target.value }) }}
              min="0" max="92" className={inputCls} style={inputStyle} />
          </div>
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Shift *</label>
          <div className="space-y-2">
            {SHIFTS.map((shift) => {
              const checked = selectedShifts.includes(shift)
              return (
                <label key={shift} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                  style={{ background: checked ? T.accentLight : T.bg, border: `1px solid ${checked ? T.accentBorder : T.border}` }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleShift(shift)} className="hidden" />
                  <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                    style={{ background: checked ? T.accent : 'transparent', border: `2px solid ${checked ? T.accent : T.borderHover}` }}>
                    {checked && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-sm" style={{ color: checked ? T.text : T.textSub }}>{shift}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>
              Final Fees *
              <span className="ml-1 text-[9px]" style={{ color: T.textMuted }}>min ₹{minFees}</span>
            </label>
            <input type="number" value={finalFees} onChange={(e) => handleFeesChange(e.target.value)}
              className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Fees Submitted *</label>
            <input type="number" value={feesSubmitted}
              onChange={(e) => { setFeesSubmitted(e.target.value); sd({ feesSubmitted: e.target.value }) }}
              className={inputCls} style={inputStyle} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Payment Mode</label>
            <select value={mode}
              onChange={(e) => { setMode(e.target.value); sd({ mode: e.target.value }) }}
              className={inputCls + ' appearance-none'} style={inputStyle}>
              <option value="Cash">Cash</option>
              <option value="Online">Online</option>
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Created By</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{userName}</div>
          </div>
        </div>

        <div className="mb-5">
          <label className={labelCls} style={{ color: T.textSub }}>Comment (optional)</label>
          <textarea value={comment}
            onChange={(e) => { setComment(e.target.value); sd({ comment: e.target.value }) }}
            rows={2} placeholder="Any notes…" className={inputCls + ' resize-none'} style={inputStyle} />
        </div>

        <SectionLabel>📸 Photo Upload *</SectionLabel>
        <PhotoSection />

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
            <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
          </div>
        )}

        {!photoVerified && photoPhase === 'idle' && (
          <div className="mb-2 px-4 py-2.5 rounded-xl text-xs"
            style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}`, color: T.accent }}>
            📸 Upload and verify the student's photo above to enable submission.
          </div>
        )}
      </div>

      <div className="shrink-0 flex gap-3 p-4 pt-3"
        style={{ borderTop: `1px solid ${T.border}`, background: T.surface, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
        <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm"
          style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={!photoVerified || saving || regIdLoading || !!mobileError}
          className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: T.accent, color: 'white' }}>
          {saving
            ? <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Saving…
              </span>
            : '✓ Confirm Admission'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [students, setStudents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filter, setFilter] = useState('active')
  const [selectedCard, setSelectedCard] = useState('active')
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedMobiles, setSelectedMobiles] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [renewStudent, setRenewStudent] = useState<any | null>(null)
  const [showNewAdmission, setShowNewAdmission] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)

  const [confirmModal, setConfirmModal] = useState<{
    message: string; confirmLabel: string; danger: boolean; onConfirm: () => void
  } | null>(null)

  useEffect(() => {
    let profileFetched = false

    const fetchProfile = async (userId: string) => {
      if (profileFetched) return
      profileFetched = true
      const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', userId).single()
      setUserName(profile?.name || '')
      setRole(profile?.role || '')
      fetchStudents()
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) fetchProfile(data.session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        fetchProfile(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        router.push('/login')
      } else if (event === 'INITIAL_SESSION' && !session) {
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => startTransition(() => setSearch(searchInput)), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    const saved = sessionStorage.getItem('dashboard_filter') || 'active'
    setFilter(saved)
    setSelectedCard(saved)
  }, [])

  useEffect(() => {
    sessionStorage.setItem('dashboard_filter', filter)
  }, [filter])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        cachedStudents = null
        fetchStudents(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => { setBulkMode(false); setSelectedMobiles(new Set()) }, [filter])

  async function fetchStudents(invalidate = false) {
    if (!invalidate && cachedStudents) { setStudents(cachedStudents); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('v_student_summary').select('*')
    if (!error) { setStudents(data || []); cachedStudents = data }
    setLoading(false)
  }

  const filtered = useMemo(() => students.filter((s) => {
    const matchSearch = s.name?.toLowerCase().includes(search.toLowerCase()) || s.mobile_number?.includes(search)
    if (filter === 'all') return matchSearch
    if (filter === 'frozen') return matchSearch && s.status?.toLowerCase().includes('freeze')
    return matchSearch && s.status?.toLowerCase().includes(filter)
  }), [students, search, filter])

  const stats = useMemo(() => ({
    total: students.length,
    active: students.filter(s => s.status?.includes('Active')).length,
    expired: students.filter(s => s.status?.includes('Expired')).length,
    due: students.filter(s => s.status?.includes('Due')).length,
    blocked: students.filter(s => s.status?.toLowerCase().includes('blocked')).length,
    frozen: students.filter(s => s.status?.toLowerCase().includes('freeze')).length,
  }), [students])

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }

  const toggleSelect = useCallback((mobile: string) => {
    setSelectedMobiles(prev => { const next = new Set(prev); next.has(mobile) ? next.delete(mobile) : next.add(mobile); return next })
  }, [])

  const bulkBlockEligible = useMemo(() =>
    filtered.filter(s => s.status?.toLowerCase().includes('expired') && !(s.total_due > 0)), [filtered])

  const selectAll = () =>
    setSelectedMobiles(new Set(filter === 'blocked' ? filtered.map(s => s.mobile_number) : bulkBlockEligible.map(s => s.mobile_number)))

  const executeBulkBlock = async () => {
    setBulkLoading(true)
    for (const mobile of Array.from(selectedMobiles)) {
      const { data: existing } = await supabase.schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).maybeSingle()
      if (!existing) await supabase.schema('library_management').from('blocked').insert([{ mobile_number: mobile, created_by: userName }])
      else if (existing.is_unblocked) await supabase.schema('library_management').from('blocked').update({ is_unblocked: false, created_by: userName, created_at: new Date().toISOString(), unblocked_by: null }).eq('mobile_number', mobile)
    }
    setBulkLoading(false); setBulkMode(false); setSelectedMobiles(new Set())
    cachedStudents = null; fetchStudents(true)
  }

  const executeBulkUnblock = async () => {
    setBulkLoading(true)
    for (const mobile of Array.from(selectedMobiles)) {
      const { data: existing } = await supabase.schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).maybeSingle()
      if (existing && !existing.is_unblocked) await supabase.schema('library_management').from('blocked').update({ is_unblocked: true, unblocked_by: userName }).eq('mobile_number', mobile)
    }
    setBulkLoading(false); setBulkMode(false); setSelectedMobiles(new Set())
    cachedStudents = null; fetchStudents(true)
  }

  const handleBulkBlock = () => {
    if (selectedMobiles.size === 0) return
    setConfirmModal({
      message: `Block ${selectedMobiles.size} student${selectedMobiles.size !== 1 ? 's' : ''}?`,
      confirmLabel: `🔒 Block ${selectedMobiles.size}`,
      danger: true,
      onConfirm: () => { setConfirmModal(null); executeBulkBlock() },
    })
  }

  const handleBulkUnblock = () => {
    if (selectedMobiles.size === 0) return
    setConfirmModal({
      message: `Unblock ${selectedMobiles.size} student${selectedMobiles.size !== 1 ? 's' : ''}?`,
      confirmLabel: `🔓 Unblock ${selectedMobiles.size}`,
      danger: false,
      onConfirm: () => { setConfirmModal(null); executeBulkUnblock() },
    })
  }

  const isPrivileged = role === 'admin' || role === 'manager' || role === 'partner'
  const canSeeLedger = role === 'admin' || role === 'partner'
  const showBulkBlock = isPrivileged && filter === 'expired'
  const showBulkUnblock = isPrivileged && filter === 'blocked'

  const CARDS = [
    { key: 'active',  label: 'Active',  count: stats.active,  color: '#16a34a', lightBg: '#f0fdf4', border: '#bbf7d0' },
    { key: 'expired', label: 'Expired', count: stats.expired, color: '#dc2626', lightBg: '#fef2f2', border: '#fecaca' },
    { key: 'due',     label: 'Due',     count: stats.due,     color: '#d97706', lightBg: '#fffbeb', border: '#fde68a' },
    { key: 'frozen',  label: 'Frozen',  count: stats.frozen,  color: '#0284c7', lightBg: '#f0f9ff', border: '#bae6fd' },
    { key: 'blocked', label: 'Blocked', count: stats.blocked, color: '#6b7280', lightBg: '#f9fafb', border: '#e5e7eb' },
    { key: 'all',     label: 'All',     count: stats.total,   color: T.accent,  lightBg: T.accentLight, border: T.accentBorder },
  ]

  return (
    <>
      <div className="min-h-screen" style={{ background: T.bg }}>
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }} />

        <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">

          <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold"
                style={{ color: T.text, fontFamily: "'Georgia', serif", letterSpacing: '-0.5px' }}>
                📚 Knowledge Hub Library
              </h1>
              <p className="text-[10px] mt-1 tracking-[0.2em] uppercase font-medium" style={{ color: T.textMuted }}>Library Dashboard</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link href="/seatmap" className="px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                🗺️ Seat Map
              </Link>

              {isPrivileged && (
                <>
                  {canSeeLedger && (
                    <Link href="/admissions" className="px-3 py-2 rounded-xl text-xs font-medium"
                      style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                      📋 Ledger
                    </Link>
                  )}
                  {role === 'admin' && (
                    <Link href="/admin_ledger" className="px-3 py-2 rounded-xl text-xs font-medium"
                      style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                      🏦 Admin Ledger
                    </Link>
                  )}
                  <Link href="/expenses" className="px-3 py-2 rounded-xl text-xs font-medium"
                    style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                    💸 Expenses
                  </Link>
                  {role === 'admin' && (
                    <button
                      onClick={() => setChatOpen(o => !o)}
                      className="px-3 py-2 rounded-xl text-xs font-medium"
                      style={{ background: chatOpen ? T.accent : T.surface, border: `1px solid ${chatOpen ? T.accent : T.border}`, color: chatOpen ? 'white' : T.textSub }}>
                      🤖 AI Chat
                    </button>
                  )}
                  <NewAdmissionButton onClick={() => setShowNewAdmission(true)} />
                </>
              )}

              <div className="flex items-center gap-2 ml-1">
                <p className="text-sm font-semibold" style={{ color: T.text }}>{userName}</p>
                <button onClick={handleLogout} className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                  style={{ color: '#dc2626', borderColor: '#fecaca', background: 'transparent' }}>
                  Logout
                </button>
              </div>
            </div>
          </div>

          {/* STAT CARDS */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mb-6">
            {CARDS.map(({ key, label, count, color, lightBg, border }) => {
              const active = selectedCard === key
              return (
                <button key={key} onClick={() => { setSelectedCard(key); startTransition(() => setFilter(key)) }}
                  className="rounded-2xl p-3 md:p-4 text-left relative overflow-hidden transition-all duration-150"
                  style={{
                    background: active ? lightBg : T.surface,
                    border: `1px solid ${active ? border : T.border}`,
                    transform: active ? 'scale(1.03)' : 'scale(1)',
                    boxShadow: active ? `0 4px 16px ${color}20` : '0 1px 3px rgba(0,0,0,0.05)',
                  }}>
                  {active && (
                    <div className="absolute top-0 inset-x-0 h-[3px]"
                      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
                  )}
                  <p className="text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: active ? color : T.textMuted }}>{label}</p>
                  <p className="text-2xl md:text-3xl font-bold mt-0.5"
                    style={{ fontFamily: "'Georgia', serif", color: active ? color : T.text }}>{count}</p>
                </button>
              )
            })}
          </div>

          {/* SEARCH + BULK CONTROLS */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <input
              type="text"
              placeholder="Search by name or mobile…"
              className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl focus:outline-none"
              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }}
              onFocus={e => (e.currentTarget.style.borderColor = T.accent)}
              onBlur={e => (e.currentTarget.style.borderColor = T.border)}
              onChange={(e) => setSearchInput(e.target.value)} />
            {showBulkBlock && (
              <button onClick={() => { setBulkMode(m => !m); setSelectedMobiles(new Set()) }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  background: bulkMode ? '#fee2e2' : '#fff1f2',
                  border: `1px solid ${bulkMode ? '#fca5a5' : '#fecdd3'}`,
                  color: '#dc2626',
                }}>
                {bulkMode ? '✕ Cancel' : '🔒 Bulk Block'}
              </button>
            )}
            {showBulkUnblock && (
              <button onClick={() => { setBulkMode(m => !m); setSelectedMobiles(new Set()) }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  background: bulkMode ? '#dcfce7' : '#f0fdf4',
                  border: `1px solid ${bulkMode ? '#86efac' : '#bbf7d0'}`,
                  color: '#16a34a',
                }}>
                {bulkMode ? '✕ Cancel' : '🔓 Bulk Unblock'}
              </button>
            )}
          </div>

          {/* BULK ACTION BAR */}
          {bulkMode && (
            <div className="mb-3 flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl"
              style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <span className="text-sm" style={{ color: T.textSub }}>{selectedMobiles.size} selected</span>
              <button onClick={selectAll} className="text-xs font-medium hover:underline" style={{ color: T.accent }}>
                Select All Eligible
              </button>
              <button onClick={() => setSelectedMobiles(new Set())} className="text-xs hover:underline" style={{ color: T.textMuted }}>
                Clear
              </button>
              <div className="ml-auto flex gap-2">
                {showBulkBlock && (
                  <button onClick={handleBulkBlock} disabled={selectedMobiles.size === 0 || bulkLoading}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                    style={{ background: '#dc2626', color: 'white' }}>
                    {bulkLoading ? 'Blocking…' : `Block ${selectedMobiles.size}`}
                  </button>
                )}
                {showBulkUnblock && (
                  <button onClick={handleBulkUnblock} disabled={selectedMobiles.size === 0 || bulkLoading}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                    style={{ background: '#16a34a', color: 'white' }}>
                    {bulkLoading ? 'Unblocking…' : `Unblock ${selectedMobiles.size}`}
                  </button>
                )}
              </div>
            </div>
          )}
          {bulkMode && showBulkBlock && (
            <p className="text-[10px] mb-3" style={{ color: T.textMuted }}>
              ⚠️ Only expired students with no pending dues can be bulk blocked.
            </p>
          )}

          {/* STUDENT LIST */}
          {loading && (
            <div className="text-center py-20">
              <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3"
                style={{ borderColor: T.accent, borderTopColor: 'transparent' }} />
              <p className="text-sm" style={{ color: T.textMuted }}>Loading students…</p>
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="text-5xl mb-3">🔍</p>
              <p className="text-sm" style={{ color: T.textMuted }}>No students found</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            {filtered.map((s) => {
              const isEligibleForBulk = filter === 'blocked'
                ? true
                : (s.status?.toLowerCase().includes('expired') && !(s.total_due > 0))
              return (
                <StudentCard
                  key={s.mobile_number}
                  s={s}
                  selectable={bulkMode && isEligibleForBulk}
                  selected={selectedMobiles.has(s.mobile_number)}
                  onToggle={toggleSelect}
                  onRenew={setRenewStudent}
                  role={role} />
              )
            })}
          </div>
        </div>
      </div>

      {role === 'admin' && (
        <ChatWidget open={chatOpen} setOpen={setChatOpen} />
      )}

      {showNewAdmission && (
        <NewAdmissionPopup
          userName={userName}
          onClose={() => setShowNewAdmission(false)}
          onSuccess={() => { cachedStudents = null; fetchStudents(true) }} />
      )}

      {renewStudent && (
        <RenewPopup
          student={renewStudent}
          userName={userName}
          onClose={() => setRenewStudent(null)}
          onSuccess={() => { cachedStudents = null; fetchStudents(true) }} />
      )}

      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)} />
      )}
    </>
  )
}
