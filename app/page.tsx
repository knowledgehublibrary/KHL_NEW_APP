'use client'

import { useEffect, useState, useMemo, useTransition, memo, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── GLOBAL CACHE ────────────────────────────────────────────────────────────
let cachedStudents: any[] | null = null

// ─── IMAGE PROXY ─────────────────────────────────────────────────────────────
function getProxyUrl(url: string) {
  if (!url) return ''
  return `/api/image?url=${encodeURIComponent(url)}`
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
function toInputDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

function isDateOlderThan20Days(dateStr: string) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const today = new Date()
  const diff = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  return diff > 20
}

// ─── SHIFTS ──────────────────────────────────────────────────────────────────
const SHIFTS = ['6 AM - 12 PM', '12 PM - 6 PM', '6 PM - 11 PM']

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || ''
  let cls = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  if (s.includes('expired')) cls = 'bg-red-500/20 text-red-400 border-red-500/30'
  else if (s.includes('active')) cls = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  else if (s.includes('blocked')) cls = 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
  else if (s.includes('freeze')) cls = 'bg-sky-500/20 text-sky-400 border-sky-500/30'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls} uppercase tracking-wider`}>
      {status}
    </span>
  )
}

// ─── STUDENT CARD ─────────────────────────────────────────────────────────────
const StudentCard = memo(({
  s,
  selectable,
  selected,
  onToggle,
  onRenew,
  role,
}: {
  s: any
  selectable: boolean
  selected: boolean
  onToggle: (mobile: string) => void
  onRenew: (s: any) => void
  role: string
}) => {
  const canRenew = (role === 'admin' || role === 'manager') && s.status?.toLowerCase().includes('expired')

  return (
    <div
      className="relative rounded-2xl transition-all duration-200 overflow-hidden"
      style={{
        background: selected ? 'rgba(200,169,110,0.07)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'rgba(200,169,110,0.4)' : 'rgba(255,255,255,0.07)'}`,
        boxShadow: selected ? '0 0 0 2px rgba(200,169,110,0.2)' : 'none',
      }}
    >
      {/* Checkbox overlay */}
      {selectable && (
        <button
          onClick={() => onToggle(s.mobile_number)}
          className="absolute top-3 right-3 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all"
          style={{
            background: selected ? '#c8a96e' : 'transparent',
            border: `2px solid ${selected ? '#c8a96e' : 'rgba(255,255,255,0.3)'}`,
          }}
        >
          {selected && (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="black" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      )}

      <Link href={`/student/${s.mobile_number}`} className="flex items-center gap-4 p-4">
        {/* Avatar with status dot */}
        <div className="relative shrink-0">
          <img
            loading="lazy"
            src={getProxyUrl(s.image_url) || '/default-avatar.png'}
            onError={(e) => { e.currentTarget.src = '/default-avatar.png' }}
            className="w-14 h-14 rounded-xl object-cover"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
          />
          <div
            className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2"
            style={{
              borderColor: '#0f0f0f',
              background: s.status?.includes('Active') ? '#10b981'
                : s.status?.includes('Blocked') ? '#71717a'
                : s.status?.toLowerCase().includes('freeze') ? '#38bdf8'
                : '#ef4444',
            }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 pr-6">
          <p className="font-semibold text-white truncate" style={{ fontFamily: "'Georgia', serif" }}>{s.name}</p>
          <p className="text-xs text-white/40 mt-0.5">{s.mobile_number}</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={s.status} />
            {s.total_due > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">
                Due ₹{s.total_due}
              </span>
            )}
            <span className="text-[10px] text-white/30">📄 {s.total_admissions}</span>
          </div>
        </div>
      </Link>

      {/* Renew CTA */}
      {canRenew && !selectable && (
        <div className="px-4 pb-4 -mt-1">
          <button
            onClick={(e) => { e.preventDefault(); onRenew(s) }}
            className="w-full py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #c8a96e, #b8935a)', color: '#0f0f0f' }}
          >
            ↺ Renew
          </button>
        </div>
      )}
    </div>
  )
})

StudentCard.displayName = 'StudentCard'

// ─── RENEW POPUP ──────────────────────────────────────────────────────────────
function RenewPopup({
  student,
  userName,
  onClose,
  onSuccess,
}: {
  student: any
  userName: string
  onClose: () => void
  onSuccess: () => void
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

  useEffect(() => {
    const fetchRegId = async () => {
      setRegIdLoading(true)
      const { data: lastRecord } = await supabase
        .schema('library_management')
        .from('admission_responses')
        .select('register_id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      console.log(lastRecord )

      if (lastRecord?.register_id) {
        const { data: nextId } = await supabase.rpc('get_next_reg_id', {
          current_val: lastRecord.register_id,
        })
        setRegId(nextId || '')
      }
      setRegIdLoading(false)
    }
    fetchRegId()
  }, [])

  const toggleShift = (shift: string) => {
    setSelectedShifts(prev =>
      prev.includes(shift) ? prev.filter(x => x !== shift) : [...prev, shift]
    )
  }

  const handleStartDateChange = (val: string) => {
    setStartDate(val)
    if (isDateOlderThan20Days(val)) {
      setError('Start date cannot be older than 20 days from today')
    } else {
      setError('')
    }
  }

  const handleFinalFeesChange = (val: string) => {
    setFinalFees(val)
    setFeesSubmitted(val) // sync by default
  }

  const handleSubmit = async () => {
    if (!startDate || !months || !seat || selectedShifts.length === 0 || !finalFees || !feesSubmitted) {
      setError('Please fill all required fields')
      return
    }
    const seatNum = parseInt(seat)
    if (isNaN(seatNum) || seatNum < 0 || seatNum > 92) {
      setError('Seat must be a number between 0 and 92')
      return
    }
    if (isDateOlderThan20Days(startDate)) {
      setError('Start date cannot be older than 20 days from today')
      return
    }
    if (!regId) {
      setError('Register ID not loaded. Please close and retry.')
      return
    }

    setSaving(true)
    setError('')

    const { error: insertError } = await supabase
      .schema('library_management')
      .from('admission_responses')
      .insert([{
        timestamp: now,
        name: student.name,
        mobile_number: student.mobile_number,
        admission: 'Renew',
        address: null,
        gender: null,
        date_of_birth: null,
        aadhar_number: null,
        photo: null,
        start_date: startDate,
        months: parseFloat(months),
        seat: seat,
        shift: selectedShifts.join(', '),
        final_fees: parseFloat(finalFees),
        fees_submitted: parseFloat(feesSubmitted),
        mode,
        register_id: regId,
        comment: comment || null,
        created_by: userName,
      }])

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    onSuccess()
    onClose()
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none transition-all"
  const inputStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' as const }
  const readonlyCls = "px-3 py-2.5 rounded-xl text-sm text-white/50"
  const readonlyStyle = { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }
  const labelCls = "text-white/40 text-[10px] uppercase tracking-widest mb-1.5 block"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Gold top accent */}
        <div className="h-[2px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, transparent, #c8a96e, transparent)' }} />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-white font-bold text-xl" style={{ fontFamily: "'Georgia', serif" }}>Renew Membership</h2>
              <p className="text-white/30 text-xs mt-0.5">All fields marked * are required</p>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white transition text-xl leading-none mt-0.5">✕</button>
          </div>

          {/* Timestamp */}
          <div className="mb-5 px-3 py-2.5 rounded-xl text-xs text-white/30" style={readonlyStyle}>
            🕐 Timestamp: {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>

          {/* Name + Mobile (readonly) */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelCls}>Name</label>
              <div className={readonlyCls} style={readonlyStyle}>{student.name}</div>
            </div>
            <div>
              <label className={labelCls}>Mobile</label>
              <div className={readonlyCls} style={readonlyStyle}>{student.mobile_number}</div>
            </div>
          </div>

          {/* Register ID (readonly) */}
          <div className="mb-4">
            <label className={labelCls}>Register ID</label>
            <div className={readonlyCls} style={readonlyStyle}>
              {regIdLoading ? <span className="animate-pulse text-white/20">Fetching…</span> : regId || '—'}
            </div>
          </div>

          {/* Start Date */}
          <div className="mb-4">
            <label className={labelCls}>Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className={inputCls}
              style={inputStyle}
            />
            <p className="text-white/25 text-[10px] mt-1">Default: latest expiry date. Cannot be older than 20 days.</p>
          </div>

          {/* Months + Seat */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelCls}>Months *</label>
              <input type="number" value={months} onChange={(e) => setMonths(e.target.value)} min="1"
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls}>Seat (0–92) *</label>
              <input type="number" value={seat} onChange={(e) => setSeat(e.target.value)} min="0" max="92"
                className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Shift checkboxes */}
          <div className="mb-4">
            <label className={labelCls}>Shift * (select all that apply)</label>
            <div className="space-y-2">
              {SHIFTS.map((shift) => {
                const checked = selectedShifts.includes(shift)
                return (
                  <label
                    key={shift}
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                    style={{
                      background: checked ? 'rgba(200,169,110,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${checked ? 'rgba(200,169,110,0.35)' : 'rgba(255,255,255,0.07)'}`,
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleShift(shift)} className="hidden" />
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all"
                      style={{
                        background: checked ? '#c8a96e' : 'transparent',
                        border: `2px solid ${checked ? '#c8a96e' : 'rgba(255,255,255,0.25)'}`,
                      }}
                    >
                      {checked && (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="black" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm" style={{ color: checked ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)' }}>{shift}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Fees */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelCls}>Final Fees *</label>
              <input type="number" value={finalFees} onChange={(e) => handleFinalFeesChange(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls}>Fees Submitted *</label>
              <input type="number" value={feesSubmitted} onChange={(e) => setFeesSubmitted(e.target.value)}
                className={inputCls} style={inputStyle} />
              <p className="text-white/25 text-[10px] mt-1">Edit if partial payment</p>
            </div>
          </div>

          {/* Mode + Admission type */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelCls}>Payment Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}
                className={inputCls + ' appearance-none'}
                style={{ ...inputStyle, colorScheme: 'dark' }}>
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Admission</label>
              <div className={readonlyCls} style={readonlyStyle}>Renew</div>
            </div>
          </div>

          {/* Comment */}
          <div className="mb-4">
            <label className={labelCls}>Comment (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
              placeholder="Any notes…"
              className={inputCls + ' resize-none'}
              style={inputStyle} />
          </div>

          {/* Created by */}
          <div className="mb-5">
            <label className={labelCls}>Created By</label>
            <div className={readonlyCls} style={readonlyStyle}>{userName}</div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm text-white/40 hover:text-white border border-white/10 hover:border-white/20 transition-all">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || regIdLoading}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #c8a96e, #b8935a)', color: '#0f0f0f' }}
            >
              {saving ? 'Saving…' : '✓ Confirm Renewal'}
            </button>
          </div>
        </div>
      </div>
    </div>
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

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, role')
        .eq('id', data.session.user.id)
        .single()

      setUserName(profile?.name || '')
      setRole(profile?.role || '')
      fetchStudents()
    }
    init()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => startTransition(() => setSearch(searchInput)), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setBulkMode(false)
    setSelectedMobiles(new Set())
  }, [filter])

  async function fetchStudents(invalidate = false) {
    if (!invalidate && cachedStudents) {
      setStudents(cachedStudents)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase.from('v_student_summary').select('*')
    if (!error) { setStudents(data || []); cachedStudents = data }
    setLoading(false)
  }

  const filtered = useMemo(() => students.filter((s) => {
    const matchSearch =
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.mobile_number?.includes(search)
    if (filter === 'all') return matchSearch
    if (filter === 'frozen') return matchSearch && s.status?.toLowerCase().includes('freeze')
    return matchSearch && s.status?.toLowerCase().includes(filter)
  }), [students, search, filter])

  const stats = useMemo(() => ({
    total:   students.length,
    active:  students.filter(s => s.status?.includes('Active')).length,
    expired: students.filter(s => s.status?.includes('Expired')).length,
    due:     students.filter(s => s.status?.includes('Due')).length,
    blocked: students.filter(s => s.status?.toLowerCase().includes('blocked')).length,
    frozen:  students.filter(s => s.status?.toLowerCase().includes('freeze')).length,
  }), [students])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const toggleSelect = useCallback((mobile: string) => {
    setSelectedMobiles(prev => {
      const next = new Set(prev)
      next.has(mobile) ? next.delete(mobile) : next.add(mobile)
      return next
    })
  }, [])

  // Students eligible for bulk block: expired + no due
  const bulkBlockEligible = useMemo(() =>
    filtered.filter(s => s.status?.toLowerCase().includes('expired') && !(s.total_due > 0)),
    [filtered]
  )

  const selectAll = () => {
    if (filter === 'blocked') {
      setSelectedMobiles(new Set(filtered.map(s => s.mobile_number)))
    } else {
      setSelectedMobiles(new Set(bulkBlockEligible.map(s => s.mobile_number)))
    }
  }

  const handleBulkBlock = async () => {
    if (selectedMobiles.size === 0) return
    if (!confirm(`Block ${selectedMobiles.size} student(s)? This cannot be undone easily.`)) return
    setBulkLoading(true)

    for (const mobile of Array.from(selectedMobiles)) {
      const { data: existing } = await supabase
        .schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).maybeSingle()

      if (!existing) {
        await supabase.schema('library_management').from('blocked').insert([{ mobile_number: mobile, created_by: userName }])
      } else if (existing.is_unblocked) {
        await supabase.schema('library_management').from('blocked').update({
          is_unblocked: false, created_by: userName, created_at: new Date().toISOString(), unblocked_by: null,
        }).eq('mobile_number', mobile)
      }
    }

    setBulkLoading(false)
    setBulkMode(false)
    setSelectedMobiles(new Set())
    cachedStudents = null
    fetchStudents(true)
  }

  const handleBulkUnblock = async () => {
    if (selectedMobiles.size === 0) return
    if (!confirm(`Unblock ${selectedMobiles.size} student(s)?`)) return
    setBulkLoading(true)

    for (const mobile of Array.from(selectedMobiles)) {
      const { data: existing } = await supabase
        .schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).maybeSingle()
      if (existing && !existing.is_unblocked) {
        await supabase.schema('library_management').from('blocked').update({
          is_unblocked: true, unblocked_by: userName,
        }).eq('mobile_number', mobile)
      }
    }

    setBulkLoading(false)
    setBulkMode(false)
    setSelectedMobiles(new Set())
    cachedStudents = null
    fetchStudents(true)
  }

  const isAdminOrManager = role === 'admin' || role === 'manager'
  const showBulkBlock = isAdminOrManager && filter === 'expired'
  const showBulkUnblock = isAdminOrManager && filter === 'blocked'

  const CARDS = [
    { key: 'active',  label: 'Active',  count: stats.active,  color: '#10b981' },
    { key: 'expired', label: 'Expired', count: stats.expired, color: '#ef4444' },
    { key: 'due',     label: 'Due',     count: stats.due,     color: '#f59e0b' },
    { key: 'frozen',  label: 'Frozen',  count: stats.frozen,  color: '#38bdf8' },
    { key: 'blocked', label: 'Blocked', count: stats.blocked, color: '#71717a' },
    { key: 'all',     label: 'All',     count: stats.total,   color: '#c8a96e' },
  ]

  return (
    <div className="min-h-screen text-white" style={{ background: '#0f0f0f' }}>

      {/* Ambient bg glow */}
      <div className="fixed top-0 inset-x-0 h-80 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 35% at 50% -5%, rgba(200,169,110,0.09) 0%, transparent 70%)' }} />

      <div className="relative max-w-5xl mx-auto px-4 py-6 md:py-8">

        {/* ── HEADER ─────────────────────────────────────── */}
        <div className="flex justify-between items-start mb-8 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white"
              style={{ fontFamily: "'Georgia', serif", letterSpacing: '-0.5px' }}>
              📚 Knowledge Hub
            </h1>
            <p className="text-white/25 text-[10px] mt-1 tracking-[0.2em] uppercase">Library Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{userName}</p>
              <p className="text-[10px] text-white/30 uppercase tracking-widest">{role}</p>
            </div>
            <button onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg text-xs border transition-all"
              style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.2)', background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Logout
            </button>
          </div>
        </div>

        {/* ── STAT CARDS ──────────────────────────────────── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mb-6">
          {CARDS.map(({ key, label, count, color }) => {
            const active = selectedCard === key
            return (
              <button
                key={key}
                onClick={() => { setSelectedCard(key); startTransition(() => setFilter(key)) }}
                className="rounded-2xl p-3 md:p-4 text-left transition-all duration-200 relative overflow-hidden"
                style={{
                  background: active ? `${color}15` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? `${color}45` : 'rgba(255,255,255,0.07)'}`,
                  transform: active ? 'scale(1.03)' : 'scale(1)',
                  boxShadow: active ? `0 6px 24px ${color}18` : 'none',
                }}
              >
                {active && (
                  <div className="absolute top-0 inset-x-0 h-[2px]"
                    style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
                )}
                <p className="text-[10px] font-medium uppercase tracking-widest"
                  style={{ color: active ? color : 'rgba(255,255,255,0.35)' }}>
                  {label}
                </p>
                <p className="text-2xl md:text-3xl font-bold mt-0.5"
                  style={{ fontFamily: "'Georgia', serif", color: active ? color : 'rgba(255,255,255,0.8)' }}>
                  {count}
                </p>
              </button>
            )
          })}
        </div>

        {/* ── SEARCH + BULK BUTTON ROW ─────────────────────── */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input
            type="text"
            placeholder="Search by name or mobile…"
            className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'rgba(200,169,110,0.4)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
            onChange={(e) => setSearchInput(e.target.value)}
          />

          {showBulkBlock && (
            <button
              onClick={() => { setBulkMode(m => !m); setSelectedMobiles(new Set()) }}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: bulkMode ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)',
                border: `1px solid ${bulkMode ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.18)'}`,
                color: '#f87171',
              }}
            >
              {bulkMode ? '✕ Cancel' : '🔒 Bulk Block'}
            </button>
          )}

          {showBulkUnblock && (
            <button
              onClick={() => { setBulkMode(m => !m); setSelectedMobiles(new Set()) }}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: bulkMode ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.06)',
                border: `1px solid ${bulkMode ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.18)'}`,
                color: '#34d399',
              }}
            >
              {bulkMode ? '✕ Cancel' : '🔓 Bulk Unblock'}
            </button>
          )}
        </div>

        {/* ── BULK TOOLBAR ─────────────────────────────────── */}
        {bulkMode && (
          <div
            className="mb-3 flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <span className="text-sm text-white/50">{selectedMobiles.size} selected</span>
            <button onClick={selectAll} className="text-xs text-[#c8a96e] hover:underline">Select All Eligible</button>
            <button onClick={() => setSelectedMobiles(new Set())} className="text-xs text-white/30 hover:underline">Clear</button>

            <div className="ml-auto flex gap-2">
              {showBulkBlock && (
                <button
                  onClick={handleBulkBlock}
                  disabled={selectedMobiles.size === 0 || bulkLoading}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                  style={{ background: '#ef4444', color: 'white' }}
                >
                  {bulkLoading ? 'Blocking…' : `Block ${selectedMobiles.size}`}
                </button>
              )}
              {showBulkUnblock && (
                <button
                  onClick={handleBulkUnblock}
                  disabled={selectedMobiles.size === 0 || bulkLoading}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                  style={{ background: '#10b981', color: 'white' }}
                >
                  {bulkLoading ? 'Unblocking…' : `Unblock ${selectedMobiles.size}`}
                </button>
              )}
            </div>
          </div>
        )}

        {bulkMode && showBulkBlock && (
          <p className="text-[10px] text-white/25 mb-3">
            ⚠️ Only expired students with no pending dues can be bulk blocked.
          </p>
        )}

        {/* ── LOADING ─────────────────────────────────────── */}
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3"
              style={{ borderColor: '#c8a96e', borderTopColor: 'transparent' }} />
            <p className="text-white/25 text-sm">Loading students…</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">🔍</p>
            <p className="text-white/25 text-sm">No students found</p>
          </div>
        )}

        {/* ── STUDENT GRID ────────────────────────────────── */}
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
                role={role}
              />
            )
          })}
        </div>
      </div>

      {/* ── RENEW POPUP ──────────────────────────────────── */}
      {renewStudent && (
        <RenewPopup
          student={renewStudent}
          userName={userName}
          onClose={() => setRenewStudent(null)}
          onSuccess={() => {
            cachedStudents = null
            fetchStudents(true)
          }}
        />
      )}
    </div>
  )
}
