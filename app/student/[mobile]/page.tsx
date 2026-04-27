'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams, useRouter } from 'next/navigation'

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg:          '#faf8f5',
  surface:     '#ffffff',
  border:      '#ede8e1',
  borderHover: '#ddd4c8',
  accent:      '#c47b3a',
  accentLight: '#fdf0e4',
  accentBorder:'#f0d4b0',
  text:        '#1c1917',
  textSub:     '#78716c',
  textMuted:   '#a8a29e',
}

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyxI48i0cFx3c4-MRADfa5nQKQJLIzJR8xAwB0UArEe0_arfxRObvjZA3Tccc6pRE4/exec'
const SHIFTS = ['6 AM - 12 PM', '12 PM - 6 PM', '6 PM - 11 PM']

function getProxyUrl(url: string) {
  if (!url) return ''
  return `/api/image?url=${encodeURIComponent(url)}`
}

function formatDate(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateForDB() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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

function getWhatsappLink(name: string, mobile: string, due: number, expiry: string) {
  const today = new Date()
  const exp = new Date(expiry)
  let message = ''
  if (due > 0 && exp < today) {
    message = `Hi ${name}, your plan was *expired on ${formatDate(expiry)}* and your *last due fees is Rs.${due}*.`
  } else if (due > 0) {
    message = `Hi ${name}, your *due fees is Rs.${due}*.`
  } else if (exp < today) {
    message = `Hi ${name}, your plan was *expired on ${formatDate(expiry)}*. Renew today!!`
  } else return ''
  const finalMsg = `${message}\n_Knowledge Hub Library_\nhttps://g.co/kgs/iMBXRFr`
  return `https://wa.me/91${mobile}?text=${encodeURIComponent(finalMsg)}`
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || ''
  let bg = '#fef9c3', color = '#854d0e', border = '#fde68a'
  if (s.includes('expired'))      { bg = '#fee2e2'; color = '#991b1b'; border = '#fca5a5' }
  else if (s.includes('active'))  { bg = '#dcfce7'; color = '#166534'; border = '#86efac' }
  else if (s.includes('blocked')) { bg = '#f3f4f6'; color = '#4b5563'; border = '#d1d5db' }
  else if (s.includes('freeze'))  { bg = '#e0f2fe'; color = '#075985'; border = '#7dd3fc' }
  return (
    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {status}
    </span>
  )
}

function ActionBtn({ onClick, color, bg, border, children, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {children}
    </button>
  )
}

// ─── iOS-SAFE MODAL WRAPPER ───────────────────────────────────────────────────
function ModalSheet({ onClose, children, accentColor = T.accent }: {
  onClose: () => void
  children: React.ReactNode
  accentColor?: string
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 44px))',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch' as any,
          overscrollBehavior: 'contain',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
        <div className="h-[3px] rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}/>
        {/* drag handle for mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: T.border }}/>
        </div>
        {children}
      </div>
    </div>
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

  const latestExpiry = toInputDate(student.latest_expiry || student.expiry || '')
  const [startDate, setStartDate] = useState(latestExpiry)
  const [months, setMonths] = useState(student.latest_months?.toString() || student.months?.toString() || '1')
  const [seat, setSeat] = useState(student.latest_seat?.toString() || student.seat?.toString() || '')
  const [selectedShifts, setSelectedShifts] = useState<string[]>(() => {
    const raw = student.latest_shift || student.shift || ''
    return raw ? raw.split(', ').map((x: string) => x.trim()) : []
  })
  const [finalFees, setFinalFees] = useState(student.latest_fees?.toString() || student.final_fees?.toString() || '')
  const [feesSubmitted, setFeesSubmitted] = useState(student.latest_fees?.toString() || student.fees_submitted?.toString() || '')
  const [mode, setMode] = useState('Cash')
  const [comment, setComment] = useState('')
  const now = new Date().toISOString()

  const getMinFees = (m: string) => Math.round(500 * parseFloat(m || '1'))
  const minFees = getMinFees(months)

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

  const toggleShift = (shift: string) => {
    setSelectedShifts(prev => prev.includes(shift) ? prev.filter(x => x !== shift) : [...prev, shift])
  }

  // Real-time start date validation
  const handleStartDateChange = (val: string) => {
    setStartDate(val)
    if (val && isDateOlderThan20Days(val)) {
      setError('Start date cannot be older than 20 days from today')
    } else if (error.includes('Start date')) {
      setError('')
    }
  }

  // Real-time fees validation
  const handleFeesChange = (val: string) => {
    setFinalFees(val)
    setFeesSubmitted(val)
    const parsed = parseFloat(val)
    const currentMin = getMinFees(months)
    if (val && !isNaN(parsed) && parsed < currentMin) {
      setError(`Minimum fees for ${months} month(s) is ₹${currentMin}`)
    } else if (error.startsWith('Minimum fees')) {
      setError('')
    }
  }

  // Re-validate fees when months change
  const handleMonthsChange = (val: string) => {
    setMonths(val)
    const currentMin = getMinFees(val)
    const parsed = parseFloat(finalFees)
    if (finalFees && !isNaN(parsed) && parsed < currentMin) {
      setError(`Minimum fees for ${val} month(s) is ₹${currentMin}`)
    } else if (error.startsWith('Minimum fees')) {
      setError('')
    }
  }

  const handleSubmit = async () => {
    if (!startDate || !months || !seat || selectedShifts.length === 0 || !finalFees || !feesSubmitted) {
      setError('Please fill all required fields'); return
    }
    const seatNum = parseInt(seat)
    if (isNaN(seatNum) || seatNum < 0 || seatNum > 92) { setError('Seat must be between 0 and 92'); return }
    if (isDateOlderThan20Days(startDate)) { setError('Start date cannot be older than 20 days from today'); return }
    const feesParsed = parseFloat(finalFees)
    if (feesParsed < minFees) { setError(`Minimum fees for ${months} month(s) is ₹${minFees}`); return }
    if (!regId) { setError('Register ID not loaded. Please close and retry.'); return }
    setSaving(true); setError('')

    const payload = {
      timestamp: now, name: student.name, mobile_number: student.mobile_number,
      admission: 'Renew', address: null, gender: null, date_of_birth: null, aadhar_number: null, photo: null,
      start_date: startDate, months: parseFloat(months), seat, shift: selectedShifts.join(', '),
      final_fees: feesParsed, fees_submitted: parseFloat(feesSubmitted),
      mode, register_id: regId, comment: comment || null, created_by: userName,
    }

    const { error: insertError } = await supabase.schema('library_management').from('admission_responses').insert([payload])
    if (insertError) { setError(insertError.message); setSaving(false); return }

    try {
      const res = await fetch(APPS_SCRIPT_URL, { method: 'GET' })
      const json = await res.json()
      if (json.status !== 'success') console.warn('Apps Script returned:', json)
    } catch (e) { console.warn('Apps Script call failed:', e) }

    onSuccess(); onClose()
  }

  // font-size: 16px on all inputs prevents iOS auto-zoom
  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }
  const readonlyStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }
  const labelCls = "text-[10px] uppercase tracking-widest mb-1.5 block font-medium"
  const inputCls = "w-full px-3 py-2.5 rounded-xl focus:outline-none"

  return (
    <ModalSheet onClose={onClose}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>↺ Renew Membership</h2>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>All fields marked * are required</p>
          </div>
          <button onClick={onClose} className="text-xl p-1" style={{ color: T.textMuted }}>✕</button>
        </div>

        <div className="mb-5 px-3 py-2.5 rounded-xl text-xs" style={readonlyStyle}>
          🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div><label className={labelCls} style={{ color: T.textSub }}>Name</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{student.name}</div></div>
          <div><label className={labelCls} style={{ color: T.textSub }}>Mobile</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{student.mobile_number}</div></div>
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Register ID</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>
            {regIdLoading ? <span className="animate-pulse" style={{ color: T.textMuted }}>Fetching…</span> : regId || '—'}
          </div>
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Start Date *</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className={inputCls}
            style={inputStyle}/>
          <p className="text-[10px] mt-1" style={{ color: T.textMuted }}>Default: latest expiry. Cannot be older than 20 days.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Months *</label>
            <input type="number" value={months} onChange={(e) => handleMonthsChange(e.target.value)} min="1" className={inputCls} style={inputStyle}/>
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Seat (0–92) *</label>
            <input type="number" value={seat} onChange={(e) => setSeat(e.target.value)} min="0" max="92" className={inputCls} style={inputStyle}/>
          </div>
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Shift * (select all that apply)</label>
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
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>
              Final Fees *
              <span className="ml-1 text-[9px]" style={{ color: T.textMuted }}>min ₹{minFees}</span>
            </label>
            <input
              type="number"
              value={finalFees}
              onChange={(e) => handleFeesChange(e.target.value)}
              className={inputCls}
              style={inputStyle}/>
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Fees Submitted *</label>
            <input type="number" value={feesSubmitted} onChange={(e) => setFeesSubmitted(e.target.value)} className={inputCls} style={inputStyle}/>
            <p className="text-[10px] mt-1" style={{ color: T.textMuted }}>Edit if partial payment</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Payment Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls + ' appearance-none'} style={inputStyle}>
              <option value="Cash">Cash</option><option value="Online">Online</option>
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
            placeholder="Any notes…" className={inputCls + ' resize-none'} style={inputStyle}/>
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
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm"
            style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || regIdLoading}
            className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: T.accent, color: 'white' }}>
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>Saving…
              </span>
            ) : '✓ Confirm Renewal'}
          </button>
        </div>
      </div>
    </ModalSheet>
  )
}

// ─── CHANGE SEAT POPUP ────────────────────────────────────────────────────────
function ChangeSeatPopup({ latestRecord, userName, onClose, onSuccess }: {
  latestRecord: any; userName: string; onClose: () => void; onSuccess: () => void
}) {
  const [newSeat, setNewSeat] = useState(latestRecord?.seat?.toString() || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    const seatNum = parseInt(newSeat)
    if (isNaN(seatNum) || seatNum < 0 || seatNum > 92) {
      setError('Seat must be a number between 0 and 92'); return
    }
    setSaving(true); setError('')

    const { error: upsertErr } = await supabase
      .schema('library_management')
      .from('seat_change')
      .insert([{
        register_id: latestRecord.register_id,
        new_seat: seatNum,
        created_by: userName,
      }])

    if (upsertErr) {
      if (upsertErr.code === '23505') {
        setError('Seat has already been changed for this registration. A new seat change can only be done after renewal.')
      } else {
        setError(upsertErr.message)
      }
      setSaving(false); return
    }

    onSuccess(); onClose()
  }

  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }

  return (
    <ModalSheet onClose={onClose} accentColor="#6366f1">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>⇄ Change Seat</h2>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>One change allowed per registration</p>
          </div>
          <button onClick={onClose} className="text-xl p-1" style={{ color: T.textMuted }}>✕</button>
        </div>

        <div className="mb-4 px-4 py-3 rounded-xl flex items-center gap-3"
          style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-0.5" style={{ color: '#0284c7' }}>Reg ID</p>
            <p className="text-sm font-semibold" style={{ color: '#0c4a6e' }}>{latestRecord?.register_id || '—'}</p>
          </div>
          <div className="w-px h-8 mx-2" style={{ background: '#bae6fd' }}/>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-0.5" style={{ color: '#0284c7' }}>Current Seat</p>
            <p className="text-sm font-semibold" style={{ color: '#0c4a6e' }}>{latestRecord?.seat ?? '—'}</p>
          </div>
        </div>

        <div className="mb-5">
          <label className="text-[10px] uppercase tracking-widest mb-1.5 block font-medium" style={{ color: T.textSub }}>
            New Seat Number (0–92)
          </label>
          <input
            type="number" value={newSeat} onChange={(e) => setNewSeat(e.target.value)} min="0" max="92"
            placeholder="Enter new seat number"
            className="w-full px-3 py-2.5 rounded-xl focus:outline-none"
            style={inputStyle}/>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
            <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm"
            style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: '#6366f1', color: 'white' }}>
            {saving ? 'Saving…' : '✓ Confirm Change'}
          </button>
        </div>
      </div>
    </ModalSheet>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function StudentDetail() {
  const params = useParams()
  const mobile = params?.mobile as string
  const router = useRouter()

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showImageView, setShowImageView] = useState(false)
  const [role, setRole] = useState('')
  const [userName, setUserName] = useState('')

  const [showDuePopup, setShowDuePopup] = useState(false)
  const [dueAmount, setDueAmount] = useState(0)
  const [mode, setMode] = useState('Cash')

  const [isBlocked, setIsBlocked] = useState(false)
  const [blockError, setBlockError] = useState('')

  const [isFrozen, setIsFrozen] = useState(false)
  const [hasEverFrozen, setHasEverFrozen] = useState(false)
  const [showFreezePopup, setShowFreezePopup] = useState(false)
  const [freezeDate, setFreezeDate] = useState(formatDateForDB())

  const [showRenewPopup, setShowRenewPopup] = useState(false)
  const [showSeatPopup, setShowSeatPopup] = useState(false)
  const [seatAlreadyChanged, setSeatAlreadyChanged] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role, name').eq('id', sessionData.session.user.id).single()
      setRole(profile?.role || ''); setUserName(profile?.name || '')
      if (mobile) { fetchStudent(); checkBlocked() }
    }
    init()
  }, [mobile])

  async function fetchStudent() {
    setLoading(true)
    const { data, error } = await supabase.from('v_admission_details').select('*').eq('mobile_number', mobile).order('start_date', { ascending: true })
    if (!error) setData(data || [])
    setLoading(false)
  }

  async function checkBlocked() {
    const { data } = await supabase.schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).single()
    if (data && !data.is_unblocked) setIsBlocked(true)
  }

  async function checkFreeze() {
    const latest = data[data.length - 1]
    if (!latest?.register_id) return
    const { data: freezeData } = await supabase.schema('library_management').from('freeeze').select('*').eq('register_id', latest.register_id).maybeSingle()
    if (freezeData) { setHasEverFrozen(true); setIsFrozen(!freezeData.unfreeze_date) }
    else { setHasEverFrozen(false); setIsFrozen(false) }
  }

  async function checkSeatChanged(registerId: string) {
    const { data } = await supabase.schema('library_management').from('seat_change').select('id').eq('register_id', registerId).maybeSingle()
    setSeatAlreadyChanged(!!data)
  }

  useEffect(() => {
    if (data.length) {
      checkFreeze()
      const latest = [...data].sort((a, b) => new Date(b.expiry).getTime() - new Date(a.expiry).getTime())[0]
      if (latest?.register_id) checkSeatChanged(latest.register_id)
    }
  }, [data])

  async function handleBlockToggle() {
    const totalDue = data.reduce((s, r) => s + (r.due_fees || 0), 0)
    if (!isBlocked && totalDue > 0) {
      setBlockError(`Cannot block: this student has ₹${totalDue} in pending dues. Clear dues first.`)
      setTimeout(() => setBlockError(''), 5000)
      return
    }

    setBlockError('')
    const { data: existing } = await supabase.schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).maybeSingle()
    if (!existing) {
      await supabase.schema('library_management').from('blocked').insert([{ mobile_number: mobile, created_by: userName }])
      setIsBlocked(true)
    } else {
      if (existing.is_unblocked) {
        await supabase.schema('library_management').from('blocked')
          .update({ is_unblocked: false, created_by: userName, created_at: new Date().toISOString(), unblocked_by: null })
          .eq('mobile_number', mobile)
        setIsBlocked(true)
      } else {
        await supabase.schema('library_management').from('blocked').update({ is_unblocked: true, unblocked_by: userName }).eq('mobile_number', mobile)
        setIsBlocked(false)
      }
    }
    fetchStudent(); checkBlocked()
  }

  async function submitDue() {
    const latest = data[data.length - 1]
    const { error } = await supabase.schema('library_management').from('due_submission').insert([{
      register_id: latest.register_id, due_fees_submitted: dueAmount,
      due_fees_submitted_date: formatDateForDB(), due_fees_mode: mode, created_by: userName,
    }])
    if (error) { alert(error.message) } else { alert('Saved'); setShowDuePopup(false); fetchStudent() }
  }

  async function handleFreeze() {
    const latest = data[data.length - 1]
    await supabase.schema('library_management').from('freeeze').upsert([{
      register_id: latest.register_id, freeze_date: freezeDate, created_by: userName, unfreeze_date: null, unfreeze_by: null,
    }])
    setShowFreezePopup(false); fetchStudent(); checkFreeze()
  }

  async function handleUnfreeze() {
    const latest = data[data.length - 1]
    await supabase.schema('library_management').from('freeeze')
      .update({ unfreeze_date: freezeDate, unfreeze_by: userName }).eq('register_id', latest.register_id)
    setShowFreezePopup(false); fetchStudent(); checkFreeze()
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 rounded-full animate-spin mb-3"
          style={{ borderColor: T.accent, borderTopColor: 'transparent' }}/>
        <p className="text-sm" style={{ color: T.textMuted }}>Loading student…</p>
      </div>
    </div>
  )

  if (!data.length) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
      <div className="text-center">
        <p className="text-5xl mb-3">🔍</p>
        <p className="text-sm" style={{ color: T.textMuted }}>No student data found</p>
      </div>
    </div>
  )

  const student = data[0]
  const latestRecord = [...data].sort((a, b) => new Date(b.expiry).getTime() - new Date(a.expiry).getTime())[0]
  const displayData = role === 'viewer' ? [latestRecord] : data

  const totalFees = displayData.reduce((s, r) => s + (r.final_fees || 0), 0)
  const totalPaid = displayData.reduce((s, r) => s + (r.fees_submitted || 0), 0)
  const totalDue = displayData.reduce((s, r) => s + (r.due_fees || 0), 0)

  const today = new Date()
  const expiryDate = new Date(latestRecord?.expiry)
  const isExpired = expiryDate < today
  const hasDue = totalDue > 0
  const showWhatsapp = hasDue || isExpired
  const whatsappLink = getWhatsappLink(student.name, mobile, totalDue, latestRecord?.expiry)
  const isActive = latestRecord?.status?.toLowerCase().includes('active')

  const isPrivileged = role === 'admin' || role === 'manager' || role === 'partner'
  const canRenew = isPrivileged && isExpired && !isBlocked
  const canFreeze = isPrivileged && isActive && !hasDue && !hasEverFrozen
  const canUnfreeze = isPrivileged && isFrozen
  const canChangeSeat = isPrivileged && isActive && !seatAlreadyChanged

  const renewStudentObj = {
    name: student.name,
    mobile_number: mobile,
    latest_expiry: latestRecord?.expiry,
    latest_months: latestRecord?.months,
    latest_seat: latestRecord?.seat,
    latest_shift: latestRecord?.shift,
    latest_fees: latestRecord?.final_fees,
  }

  if (showImageView) {
    return (
      <div className="min-h-screen" style={{ background: '#0f0f0f' }}>
        <button onClick={() => setShowImageView(false)} className="text-white p-4 text-sm">← Back</button>
        <div className="flex justify-center">
          <img src={getProxyUrl(student.photo) || '/default-avatar.png'}
            onError={(e) => (e.currentTarget.src = '/default-avatar.png')}
            className="max-h-[90vh] rounded-xl"/>
        </div>
      </div>
    )
  }

  // Shared input style with iOS zoom prevention
  const iosInputStyle: React.CSSProperties = {
    background: T.bg,
    border: `1px solid ${T.border}`,
    color: T.text,
    fontSize: '16px',
  }

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <button onClick={() => router.back()}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
          style={{ color: T.textSub }}>
          ← Back
        </button>

        {/* ── PROFILE CARD ── */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className="h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }}/>
          <div className="p-5 flex items-start gap-5 flex-wrap">
            <div className="relative shrink-0">
              <img src={getProxyUrl(student.photo) || '/default-avatar.png'}
                onClick={() => student.photo && setShowImageView(true)}
                onError={(e) => (e.currentTarget.src = '/default-avatar.png')}
                className="w-20 h-20 rounded-2xl object-cover cursor-pointer"
                style={{ border: `2px solid ${T.border}` }}/>
              <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full border-2"
                style={{
                  borderColor: T.surface,
                  background: isActive ? '#16a34a' : isBlocked ? '#9ca3af' : isFrozen ? '#0ea5e9' : '#dc2626'
                }}/>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-2xl font-bold" style={{ color: T.text, fontFamily: "'Georgia', serif", letterSpacing: '-0.3px' }}>
                    {student.name}
                  </h1>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <a href={`tel:${mobile}`} className="text-sm font-medium" style={{ color: T.accent }}>
                      📞 {mobile}
                    </a>
                    {showWhatsapp && whatsappLink && (
                      <a href={whatsappLink} target="_blank"
                        className="text-xs font-semibold px-3 py-1 rounded-full"
                        style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
                        WhatsApp ↗
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={latestRecord?.status}/>
                  <span className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                    style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.textSub }}>
                    Exp: {formatDate(latestRecord?.expiry)}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex gap-2 flex-wrap">
                <span className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.textSub }}>
                  🪑 Seat {latestRecord?.seat ?? '—'}
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.textSub }}>
                  🕐 {latestRecord?.shift || '—'}
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.textSub }}>
                  📄 {displayData.length} admission{displayData.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── SUMMARY STATS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Total Fees', value: `₹${totalFees}`, color: T.text },
            { label: 'Paid', value: `₹${totalPaid}`, color: '#16a34a' },
            { label: 'Due', value: `₹${totalDue}`, color: totalDue > 0 ? '#dc2626' : T.text },
            { label: 'Admissions', value: displayData.length, color: T.text },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>{label}</p>
              <p className="text-xl font-bold" style={{ color, fontFamily: "'Georgia', serif" }}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── QUICK ACTIONS ── */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <p className="text-[10px] uppercase tracking-widest font-medium mb-3" style={{ color: T.textMuted }}>Quick Actions</p>
          <div className="flex gap-2 flex-wrap">
            {isPrivileged && hasDue && (
              <ActionBtn onClick={() => { setDueAmount(totalDue); setShowDuePopup(true) }}
                color="#1d4ed8" bg="#eff6ff" border="#bfdbfe">
                💰 Submit Due
              </ActionBtn>
            )}
            {canRenew && (
              <ActionBtn onClick={() => setShowRenewPopup(true)}
                color="white" bg={T.accent} border={T.accent}>
                ↺ Renew
              </ActionBtn>
            )}
            {canChangeSeat && (
              <ActionBtn onClick={() => setShowSeatPopup(true)}
                color="#5b21b6" bg="#f5f3ff" border="#ddd6fe">
                ⇄ Change Seat
              </ActionBtn>
            )}
            {canFreeze && (
              <ActionBtn onClick={() => setShowFreezePopup(true)}
                color="#92400e" bg="#fffbeb" border="#fde68a">
                ❄ Freeze
              </ActionBtn>
            )}
            {canUnfreeze && (
              <ActionBtn onClick={() => setShowFreezePopup(true)}
                color="white" bg="#16a34a" border="#16a34a">
                ✓ Unfreeze
              </ActionBtn>
            )}
            {isPrivileged && (
              <ActionBtn onClick={handleBlockToggle}
                color={isBlocked ? '#166534' : '#991b1b'}
                bg={isBlocked ? '#f0fdf4' : '#fef2f2'}
                border={isBlocked ? '#bbf7d0' : '#fecaca'}>
                {isBlocked ? '🔓 Unblock' : '🔒 Block'}
              </ActionBtn>
            )}
          </div>

          {blockError && (
            <div className="mt-3 px-4 py-2.5 rounded-xl flex items-start gap-2"
              style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
              <span className="shrink-0 mt-0.5">⚠️</span>
              <p className="text-sm" style={{ color: '#991b1b' }}>{blockError}</p>
            </div>
          )}

          {canChangeSeat === false && isPrivileged && isActive && seatAlreadyChanged && (
            <p className="mt-2 text-[10px]" style={{ color: T.textMuted }}>
              ⚠️ Seat already changed for this registration. Seat can be changed again after renewal.
            </p>
          )}
        </div>

        {/* ── ADMISSION HISTORY TABLE ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${T.border}` }}>
            <p className="text-sm font-semibold" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>Admission History</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '700px' }}>
              <thead>
                <tr style={{ background: T.bg }}>
                  {['Reg ID', 'Start', 'Expiry', 'Seat', 'Shift', 'Fees', 'Paid', 'Due', 'Status'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-semibold"
                      style={{ color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...displayData].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
                  .map((row, i) => (
                    <tr key={row.register_id}
                      style={{ background: i % 2 === 0 ? T.surface : T.bg, borderBottom: `1px solid ${T.border}` }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: T.textSub }}>{row.register_id}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: T.text }}>{formatDate(row.start_date)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: T.text }}>{formatDate(row.expiry)}</td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: T.text }}>{row.seat}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: T.textSub }}>{row.shift}</td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: T.text }}>₹{row.final_fees}</td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: '#16a34a' }}>₹{row.fees_submitted || 0}</td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: row.due_fees > 0 ? '#dc2626' : T.textMuted }}>₹{row.due_fees || 0}</td>
                      <td className="px-4 py-3"><StatusBadge status={row.status}/></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── SUBMIT DUE POPUP ── */}
      {showDuePopup && (
        <ModalSheet onClose={() => setShowDuePopup(false)} accentColor="#2563eb">
          <div className="p-5 sm:p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-bold text-lg" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>💰 Submit Due</h2>
              <button onClick={() => setShowDuePopup(false)} style={{ color: T.textMuted }}>✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest font-medium mb-1.5 block" style={{ color: T.textSub }}>Amount</label>
                <input type="number" value={dueAmount} onChange={(e) => setDueAmount(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl focus:outline-none"
                  style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }}/>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-medium mb-1.5 block" style={{ color: T.textSub }}>Date</label>
                <div className="px-3 py-2.5 rounded-xl text-sm" style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }}>
                  {formatDateForDB()}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest font-medium mb-1.5 block" style={{ color: T.textSub }}>Mode</label>
                <select value={mode} onChange={(e) => setMode(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl focus:outline-none appearance-none"
                  style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }}>
                  <option>Cash</option><option>Online</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowDuePopup(false)} className="flex-1 py-3 rounded-xl text-sm"
                style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
              <button onClick={submitDue} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: '#2563eb', color: 'white' }}>✓ Submit</button>
            </div>
          </div>
        </ModalSheet>
      )}

      {/* ── FREEZE POPUP ── */}
      {showFreezePopup && (
        <ModalSheet onClose={() => setShowFreezePopup(false)} accentColor={isFrozen ? '#16a34a' : '#f59e0b'}>
          <div className="p-5 sm:p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-bold text-lg" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                {isFrozen ? '✓ Unfreeze Student' : '❄ Freeze Student'}
              </h2>
              <button onClick={() => setShowFreezePopup(false)} style={{ color: T.textMuted }}>✕</button>
            </div>
            <div className="mb-5">
              <label className="text-[10px] uppercase tracking-widest font-medium mb-1.5 block" style={{ color: T.textSub }}>
                {isFrozen ? 'Unfreeze Date' : 'Freeze Date'}
              </label>
              <input value={freezeDate} onChange={(e) => setFreezeDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl focus:outline-none"
                style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }}/>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowFreezePopup(false)} className="flex-1 py-3 rounded-xl text-sm"
                style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
              {!isFrozen ? (
                <button onClick={handleFreeze} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: '#f59e0b', color: 'white' }}>❄ Freeze</button>
              ) : (
                <button onClick={handleUnfreeze} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: '#16a34a', color: 'white' }}>✓ Unfreeze</button>
              )}
            </div>
          </div>
        </ModalSheet>
      )}

      {showRenewPopup && (
        <RenewPopup student={renewStudentObj} userName={userName}
          onClose={() => setShowRenewPopup(false)}
          onSuccess={() => fetchStudent()}/>
      )}

      {showSeatPopup && (
        <ChangeSeatPopup latestRecord={latestRecord} userName={userName}
          onClose={() => setShowSeatPopup(false)}
          onSuccess={() => { fetchStudent(); setSeatAlreadyChanged(true) }}/>
      )}
    </div>
  )
}