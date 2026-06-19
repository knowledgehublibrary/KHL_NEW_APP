'use client'

//export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo, useTransition, memo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

let cachedStudents: any[] | null = null

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyxI48i0cFx3c4-MRADfa5nQKQJLIzJR8xAwB0UArEe0_arfxRObvjZA3Tccc6pRE4/exec'
const RENEW_FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSc5KbtfqUpgRuohNyQdhVb-xahCRVTBizCXPobr0vyErzvX_Q/viewform'
const PHOTO_FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSfq6Ajw4dxXw1PiwLR_Bu6GhNccUXSRTSo6yQgj_2o6SpZDkw/viewform'
const PHOTO_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzX-eQ5-UcKiDY1Aa15KnXG52gEK33tkIVAXaWM8lN5CFxdnMyZXqVng0rfnfWYh-vG/exec'

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

/** Days until expiry (positive = future, negative = already past, null = no date) */
function getExpiryDiffDays(dateStr: string): number | null {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  if (isNaN(expiry.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  expiry.setHours(0, 0, 0, 0)
  return Math.round((expiry.getTime() - today.getTime()) / 86400000)
}

/** Pretty date for the expiry ribbon, e.g. "19 Jun 2026" */
function formatExpiryDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Trim + convert any casing to Title Case */
function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
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
  s, selectable, selected, onToggle, onRenew, role, highlight,
}: {
  s: any; selectable: boolean; selected: boolean
  onToggle: (mobile: string) => void; onRenew: (s: any) => void; role: string
  highlight?: 'yellow' | 'red' | null
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

          {/* ── FIX: plain text number + proper <a href="tel:"> Call pill — works on iOS & Android ── */}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color: T.textSub }}>
              {s.mobile_number}
            </span>
            <a
              href={`tel:${s.mobile_number}`}
              onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation() }}
              onTouchEnd={(e) => { e.stopPropagation(); window.location.href = `tel:${s.mobile_number}` }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}`, textDecoration: 'none' }}
            >
              📞 Call
            </a>
          </div>

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={s.status} />
            {s.total_due > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                Due ₹{s.total_due}
              </span>
            )}
            <span className="text-[10px]" style={{ color: T.textMuted }}>📄 {s.total_admissions}</span>
            {s.latest_expiry && (
              <span className="text-[10px] font-medium" style={{ color: T.textMuted }}>
                📅 {formatExpiryDate(s.latest_expiry)}
              </span>
            )}
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

  const router = useRouter()

  const highlightBg = highlight === 'yellow' ? '#fefce8' : highlight === 'red' ? '#fef2f2' : T.surface
  const highlightBorder = highlight === 'yellow' ? '#fde047' : highlight === 'red' ? '#fca5a5' : T.border

  const baseStyle: React.CSSProperties = {
    background: selected ? T.accentLight : highlightBg,
    border: `1px solid ${selected ? T.accentBorder : highlightBorder}`,
    boxShadow: selected ? `0 0 0 2px ${T.accentBorder}` : highlight ? `0 0 0 1px ${highlightBorder}` : '0 1px 3px rgba(0,0,0,0.06)',
  }

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking the Call link or Renew button
    const target = e.target as HTMLElement
    if (target.closest('a') || target.closest('button')) return
    router.push(`/student/${s.mobile_number}`)
  }

  if (selectable) {
    return (
      <div className="relative rounded-2xl overflow-hidden cursor-pointer select-none" style={baseStyle}
        onClick={() => onToggle(s.mobile_number)}>{innerContent}</div>
    )
  }
  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer hover:bg-orange-50/40 transition-colors"
      style={baseStyle}
      onClick={handleCardClick}
    >
      {innerContent}
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

// ─── RENEW POPUP ──────────────────────────────────────────────────────────────
function RenewPopup({ student, userName, role, onClose, onSuccess }: {
  student: any; userName: string; role: string; onClose: () => void; onSuccess: () => void
}) {
  const isAdmin = role === 'admin'
  const [saving, setSaving] = useState(false)
  const [regId, setRegId] = useState('')
  const [regIdLoading, setRegIdLoading] = useState(true)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

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
    setWarning('')
    if (!startDate || !months || !seat || selectedShifts.length === 0 || !finalFees || !feesSubmitted) {
      setError('Please fill all required fields'); return
    }
    const seatNum = parseInt(seat)
    if (isNaN(seatNum) || seatNum < 0 || seatNum > 92) { setError('Seat must be between 0 and 92'); return }

    if (isDateOlderThan20Days(startDate)) {
      if (!isAdmin) { setError('Start date cannot be older than 20 days'); return }
      else setWarning('⚠️ Start date is older than 20 days. Proceeding as admin override.')
    }

    if (parseFloat(finalFees) < minFees) {
      if (!isAdmin) { setError(`Minimum fees for ${months} month(s) is ₹${minFees}`); return }
      else setWarning(`⚠️ Fees below minimum (₹${minFees}) for ${months} month(s). Proceeding as admin override.`)
    }

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
          <div classN