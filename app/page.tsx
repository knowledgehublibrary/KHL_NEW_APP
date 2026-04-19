'use client'

import { useEffect, useState, useMemo, useTransition, memo, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

let cachedStudents: any[] | null = null

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyxI48i0cFx3c4-MRADfa5nQKQJLIzJR8xAwB0UArEe0_arfxRObvjZA3Tccc6pRE4/exec'
const FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSc5KbtfqUpgRuohNyQdhVb-xahCRVTBizCXPobr0vyErzvX_Q/viewform'

const T = {
  bg: '#faf8f5', surface: '#ffffff',
  border: '#ede8e1', borderHover: '#ddd4c8',
  accent: '#c47b3a', accentLight: '#fdf0e4', accentBorder: '#f0d4b0',
  text: '#1c1917', textSub: '#78716c', textMuted: '#a8a29e',
}

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

const SHIFTS = ['6 AM - 12 PM', '12 PM - 6 PM', '6 PM - 11 PM']

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || ''
  let bg = '#fef9c3', color = '#854d0e', border = '#fde68a'
  if (s.includes('expired'))      { bg = '#fee2e2'; color = '#991b1b'; border = '#fca5a5' }
  else if (s.includes('active'))  { bg = '#dcfce7'; color = '#166534'; border = '#86efac' }
  else if (s.includes('blocked')) { bg = '#f3f4f6'; color = '#4b5563'; border = '#d1d5db' }
  else if (s.includes('freeze'))  { bg = '#e0f2fe'; color = '#075985'; border = '#7dd3fc' }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {status}
    </span>
  )
}

// ─── NEW ADMISSION BUTTON ─────────────────────────────────────────────────────
function NewAdmissionButton() {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const { data: lastRecord } = await supabase
        .schema('library_management')
        .from('admission_responses')
        .select('register_id')
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle()

      let nextRegId = ''
      if (lastRecord?.register_id) {
        const { data: nextId } = await supabase.rpc('get_next_reg_id', { current_val: lastRecord.register_id })
        nextRegId = nextId || ''
      }

      const todayFormatted = new Date().toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      }).replace(/ /g, '-')

      const params = new URLSearchParams({
        usp: 'pp_url',
        'entry.2048375196': 'New',
        'entry.1627633184': todayFormatted,
        'entry.171992334': '1',
        'entry.1403304295': '0',
        'entry.890774174': 'Online',
        'entry.1136862612': nextRegId,
      })
      const url = `${FORM_BASE}?${params.toString()}&entry.157693685=6+AM+-+12+PM&entry.157693685=12+PM+-+6+PM&entry.157693685=6+PM+-+11+PM`
      window.open(url, '_blank')
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleClick} disabled={loading}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
      style={{ background: T.accent, color: 'white', boxShadow: `0 2px 12px ${T.accent}50` }}>
      {loading
        ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
        : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
      }
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
  const canRenew = (role === 'admin' || role === 'manager') && s.status?.toLowerCase().includes('expired')
  const statusDot = s.status?.includes('Active') ? '#16a34a'
    : s.status?.includes('Blocked') ? '#9ca3af'
    : s.status?.toLowerCase().includes('freeze') ? '#0ea5e9'
    : '#dc2626'

  const innerContent = (
    <>
      {selectable && (
        <div className="absolute top-3 right-3 z-10 w-5 h-5 rounded-md flex items-center justify-center"
          style={{ background: selected ? T.accent : 'transparent', border: `2px solid ${selected ? T.accent : T.borderHover}` }}>
          {selected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
        </div>
      )}
      <div className="flex items-center gap-4 p-4">
        <div className="relative shrink-0">
          <img loading="lazy" src={getProxyUrl(s.image_url) || '/default-avatar.png'}
            onError={(e) => { e.currentTarget.src = '/default-avatar.png' }}
            className="w-14 h-14 rounded-xl object-cover" style={{ border: `1px solid ${T.border}` }}/>
          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2"
            style={{ borderColor: T.surface, background: statusDot }}/>
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <p className="font-semibold truncate" style={{ color: T.text, fontFamily: "'Georgia', serif", fontSize: '15px' }}>{s.name}</p>
          <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{s.mobile_number}</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={s.status}/>
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

  const handleSubmit = async () => {
    if (!startDate || !months || !seat || selectedShifts.length === 0 || !finalFees || !feesSubmitted) {
      setError('Please fill all required fields'); return
    }
    const seatNum = parseInt(seat)
    if (isNaN(seatNum) || seatNum < 0 || seatNum > 92) { setError('Seat must be between 0 and 92'); return }
    if (isDateOlderThan20Days(startDate)) { setError('Start date cannot be older than 20 days'); return }
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

    try { await fetch(APPS_SCRIPT_URL, { method: 'GET' }) } catch (e) { console.warn('Apps Script call failed:', e) }

    onSuccess(); onClose()
  }

  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text }
  const readonlyStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }
  const labelCls = "text-[10px] uppercase tracking-widest mb-1.5 block font-medium"
  const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="h-[3px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }}/>
        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>Renew Membership</h2>
              <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>All fields marked * are required</p>
            </div>
            <button onClick={onClose} className="text-xl" style={{ color: T.textMuted }}>✕</button>
          </div>
          <div className="mb-5 px-3 py-2.5 rounded-xl text-xs" style={readonlyStyle}>
            🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><label className={labelCls} style={{ color: T.textSub }}>Name</label><div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{student.name}</div></div>
            <div><label className={labelCls} style={{ color: T.textSub }}>Mobile</label><div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{student.mobile_number}</div></div>
          </div>
          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Register ID</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>
              {regIdLoading ? <span className="animate-pulse">Fetching…</span> : regId || '—'}
            </div>
          </div>
          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Start Date *</label>
            <input type="date" value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setError(isDateOlderThan20Days(e.target.value) ? 'Start date cannot be older than 20 days' : '') }}
              className={inputCls} style={inputStyle}/>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><label className={labelCls} style={{ color: T.textSub }}>Months *</label><input type="number" value={months} onChange={(e) => setMonths(e.target.value)} min="1" className={inputCls} style={inputStyle}/></div>
            <div><label className={labelCls} style={{ color: T.textSub }}>Seat (0–92) *</label><input type="number" value={seat} onChange={(e) => setSeat(e.target.value)} min="0" max="92" className={inputCls} style={inputStyle}/></div>
          </div>
          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Shift *</label>
            <div className="space-y-2">
              {SHIFTS.map((shift) => {
                const checked = selectedShifts.includes(shift)
                return (
                  <label key={shift} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                    style={{ background: checked ? T.accentLight : T.bg, border: `1px solid ${checked ? T.accentBorder : T.border}` }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleShift(shift)} className="hidden"/>
                    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                      style={{ background: checked ? T.accent : 'transparent', border: `2px solid ${checked ? T.accent : T.borderHover}` }}>
                      {checked && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                    </div>
                    <span className="text-sm" style={{ color: checked ? T.text : T.textSub }}>{shift}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><label className={labelCls} style={{ color: T.textSub }}>Final Fees *</label><input type="number" value={finalFees} onChange={(e) => { setFinalFees(e.target.value); setFeesSubmitted(e.target.value) }} className={inputCls} style={inputStyle}/></div>
            <div><label className={labelCls} style={{ color: T.textSub }}>Fees Submitted *</label><input type="number" value={feesSubmitted} onChange={(e) => setFeesSubmitted(e.target.value)} className={inputCls} style={inputStyle}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div><label className={labelCls} style={{ color: T.textSub }}>Payment Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls + ' appearance-none'} style={inputStyle}>
                <option value="Cash">Cash</option><option value="Online">Online</option>
              </select></div>
            <div><label className={labelCls} style={{ color: T.textSub }}>Admission</label><div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>Renew</div></div>
          </div>
          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Comment (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Any notes…" className={inputCls + ' resize-none'} style={inputStyle}/>
          </div>
          <div className="mb-5">
            <label className={labelCls} style={{ color: T.textSub }}>Created By</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{userName}</div>
          </div>
          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
              <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm" style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving || regIdLoading}
              className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: T.accent, color: 'white' }}>
              {saving ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Saving…</span> : '✓ Confirm Renewal'}
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
      const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', data.session.user.id).single()
      setUserName(profile?.name || ''); setRole(profile?.role || '')
      fetchStudents()
    }
    init()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => startTransition(() => setSearch(searchInput)), 300)
    return () => clearTimeout(t)
  }, [searchInput])

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
    total:   students.length,
    active:  students.filter(s => s.status?.includes('Active')).length,
    expired: students.filter(s => s.status?.includes('Expired')).length,
    due:     students.filter(s => s.status?.includes('Due')).length,
    blocked: students.filter(s => s.status?.toLowerCase().includes('blocked')).length,
    frozen:  students.filter(s => s.status?.toLowerCase().includes('freeze')).length,
  }), [students])

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }
  const toggleSelect = useCallback((mobile: string) => {
    setSelectedMobiles(prev => { const next = new Set(prev); next.has(mobile) ? next.delete(mobile) : next.add(mobile); return next })
  }, [])

  const bulkBlockEligible = useMemo(() =>
    filtered.filter(s => s.status?.toLowerCase().includes('expired') && !(s.total_due > 0)), [filtered])
  const selectAll = () =>
    setSelectedMobiles(new Set(filter === 'blocked' ? filtered.map(s => s.mobile_number) : bulkBlockEligible.map(s => s.mobile_number)))

  const handleBulkBlock = async () => {
    if (selectedMobiles.size === 0) return
    if (!confirm(`Block ${selectedMobiles.size} student(s)?`)) return
    setBulkLoading(true)
    for (const mobile of Array.from(selectedMobiles)) {
      const { data: existing } = await supabase.schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).maybeSingle()
      if (!existing) await supabase.schema('library_management').from('blocked').insert([{ mobile_number: mobile, created_by: userName }])
      else if (existing.is_unblocked) await supabase.schema('library_management').from('blocked').update({ is_unblocked: false, created_by: userName, created_at: new Date().toISOString(), unblocked_by: null }).eq('mobile_number', mobile)
    }
    setBulkLoading(false); setBulkMode(false); setSelectedMobiles(new Set())
    cachedStudents = null; fetchStudents(true)
  }

  const handleBulkUnblock = async () => {
    if (selectedMobiles.size === 0) return
    if (!confirm(`Unblock ${selectedMobiles.size} student(s)?`)) return
    setBulkLoading(true)
    for (const mobile of Array.from(selectedMobiles)) {
      const { data: existing } = await supabase.schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).maybeSingle()
      if (existing && !existing.is_unblocked) await supabase.schema('library_management').from('blocked').update({ is_unblocked: true, unblocked_by: userName }).eq('mobile_number', mobile)
    }
    setBulkLoading(false); setBulkMode(false); setSelectedMobiles(new Set())
    cachedStudents = null; fetchStudents(true)
  }

  const isAdminOrManager = role === 'admin' || role === 'manager'
  const showBulkBlock = isAdminOrManager && filter === 'expired'
  const showBulkUnblock = isAdminOrManager && filter === 'blocked'

  const CARDS = [
    { key: 'active',  label: 'Active',  count: stats.active,  color: '#16a34a', lightBg: '#f0fdf4', border: '#bbf7d0' },
    { key: 'expired', label: 'Expired', count: stats.expired, color: '#dc2626', lightBg: '#fef2f2', border: '#fecaca' },
    { key: 'due',     label: 'Due',     count: stats.due,     color: '#d97706', lightBg: '#fffbeb', border: '#fde68a' },
    { key: 'frozen',  label: 'Frozen',  count: stats.frozen,  color: '#0284c7', lightBg: '#f0f9ff', border: '#bae6fd' },
    { key: 'blocked', label: 'Blocked', count: stats.blocked, color: '#6b7280', lightBg: '#f9fafb', border: '#e5e7eb' },
    { key: 'all',     label: 'All',     count: stats.total,   color: T.accent,  lightBg: T.accentLight, border: T.accentBorder },
  ]

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>

      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">

        {/* HEADER */}
        <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: T.text, fontFamily: "'Georgia', serif", letterSpacing: '-0.5px' }}>
              📚 Knowledge Hub
            </h1>
            <p className="text-[10px] mt-1 tracking-[0.2em] uppercase font-medium" style={{ color: T.textMuted }}>Library Dashboard</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Seat map visible to all */}
            <Link href="/seatmap" className="px-3 py-2 rounded-xl text-xs font-medium"
              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
              🗺️ Seat Map
            </Link>

            {/* Admin/Manager only nav items */}
            {isAdminOrManager && (
              <>
                <Link href="/admissions" className="px-3 py-2 rounded-xl text-xs font-medium"
                  style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                  📋 Ledger
                </Link>
                <Link href="/expenses" className="px-3 py-2 rounded-xl text-xs font-medium"
                  style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                  💸 Expenses
                </Link>
                <NewAdmissionButton />
              </>
            )}

            {/* User info + logout */}
            <div className="flex items-center gap-2 ml-1">
              <div className="text-right">
                <p className="text-sm font-semibold" style={{ color: T.text }}>{userName}</p>
                <p className="text-[10px] uppercase tracking-widest" style={{ color: T.textMuted }}>{role}</p>
              </div>
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
                style={{ background: active ? lightBg : T.surface, border: `1px solid ${active ? border : T.border}`, transform: active ? 'scale(1.03)' : 'scale(1)', boxShadow: active ? `0 4px 16px ${color}20` : '0 1px 3px rgba(0,0,0,0.05)' }}>
                {active && <div className="absolute top-0 inset-x-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}/>}
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: active ? color : T.textMuted }}>{label}</p>
                <p className="text-2xl md:text-3xl font-bold mt-0.5" style={{ fontFamily: "'Georgia', serif", color: active ? color : T.text }}>{count}</p>
              </button>
            )
          })}
        </div>

        {/* SEARCH + BULK */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <input type="text" placeholder="Search by name or mobile…"
            className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl text-sm focus:outline-none"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
            onFocus={e => (e.currentTarget.style.borderColor = T.accent)}
            onBlur={e => (e.currentTarget.style.borderColor = T.border)}
            onChange={(e) => setSearchInput(e.target.value)}/>
          {showBulkBlock && (
            <button onClick={() => { setBulkMode(m => !m); setSelectedMobiles(new Set()) }}
              className="px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: bulkMode ? '#fee2e2' : '#fff1f2', border: `1px solid ${bulkMode ? '#fca5a5' : '#fecdd3'}`, color: '#dc2626' }}>
              {bulkMode ? '✕ Cancel' : '🔒 Bulk Block'}
            </button>
          )}
          {showBulkUnblock && (
            <button onClick={() => { setBulkMode(m => !m); setSelectedMobiles(new Set()) }}
              className="px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: bulkMode ? '#dcfce7' : '#f0fdf4', border: `1px solid ${bulkMode ? '#86efac' : '#bbf7d0'}`, color: '#16a34a' }}>
              {bulkMode ? '✕ Cancel' : '🔓 Bulk Unblock'}
            </button>
          )}
        </div>

        {bulkMode && (
          <div className="mb-3 flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <span className="text-sm" style={{ color: T.textSub }}>{selectedMobiles.size} selected</span>
            <button onClick={selectAll} className="text-xs font-medium hover:underline" style={{ color: T.accent }}>Select All Eligible</button>
            <button onClick={() => setSelectedMobiles(new Set())} className="text-xs hover:underline" style={{ color: T.textMuted }}>Clear</button>
            <div className="ml-auto flex gap-2">
              {showBulkBlock && <button onClick={handleBulkBlock} disabled={selectedMobiles.size === 0 || bulkLoading} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: '#dc2626', color: 'white' }}>{bulkLoading ? 'Blocking…' : `Block ${selectedMobiles.size}`}</button>}
              {showBulkUnblock && <button onClick={handleBulkUnblock} disabled={selectedMobiles.size === 0 || bulkLoading} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: '#16a34a', color: 'white' }}>{bulkLoading ? 'Unblocking…' : `Unblock ${selectedMobiles.size}`}</button>}
            </div>
          </div>
        )}
        {bulkMode && showBulkBlock && <p className="text-[10px] mb-3" style={{ color: T.textMuted }}>⚠️ Only expired students with no pending dues can be bulk blocked.</p>}

        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3" style={{ borderColor: T.accent, borderTopColor: 'transparent' }}/>
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
            const isEligibleForBulk = filter === 'blocked' ? true : (s.status?.toLowerCase().includes('expired') && !(s.total_due > 0))
            return (
              <StudentCard key={s.mobile_number} s={s}
                selectable={bulkMode && isEligibleForBulk} selected={selectedMobiles.has(s.mobile_number)}
                onToggle={toggleSelect} onRenew={setRenewStudent} role={role}/>
            )
          })}
        </div>
      </div>

      {renewStudent && (
        <RenewPopup student={renewStudent} userName={userName}
          onClose={() => setRenewStudent(null)}
          onSuccess={() => { cachedStudents = null; fetchStudents(true) }}/>
      )}
    </div>
  )
}
