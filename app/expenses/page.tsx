'use client'

// Place at: app/expenses/page.tsx

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const T = {
  bg: '#faf8f5', surface: '#ffffff',
  border: '#ede8e1', borderHover: '#ddd4c8',
  accent: '#c47b3a', accentLight: '#fdf0e4', accentBorder: '#f0d4b0',
  text: '#1c1917', textSub: '#78716c', textMuted: '#a8a29e',
}

function formatDate(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Returns a date string YYYY-MM-DD for N days ago */
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

// ─── ADD EXPENSE MODAL ────────────────────────────────────────────────────────
function AddExpenseModal({ userName, role, onClose, onSuccess }: {
  userName: string
  role: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('Cash')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Admin override: fetch all staff names from profiles
  const [staffList, setStaffList] = useState<string[]>([])
  const [createdBy, setCreatedBy] = useState(userName)

  useEffect(() => {
    if (role !== 'admin') return
    const fetchStaff = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('name')
        .order('name')
      if (data) setStaffList(data.map((p: any) => p.name).filter(Boolean))
    }
    fetchStaff()
  }, [role])

  const now = new Date().toISOString()

  const handleSubmit = async () => {
    if (!description.trim()) { setError('Description is required'); return }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return }

    setSaving(true); setError('')
    const { error: insertError } = await supabase
      .schema('library_management')
      .from('expenses')
      .insert([{
        Description: description.trim(),
        Amount: parseFloat(amount),
        Mode: mode,
        Created_by: createdBy,
      }])

    if (insertError) { setError(insertError.message); setSaving(false); return }
    onSuccess(); onClose()
  }

  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text }
  const readonlyStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }
  const labelCls = "text-[10px] uppercase tracking-widest mb-1.5 block font-medium"
  const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="h-[3px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }}/>
        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>Add Expense</h2>
              <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>All fields marked * are required</p>
            </div>
            <button onClick={onClose} className="text-xl" style={{ color: T.textMuted }}>✕</button>
          </div>

          <div className="mb-4 px-3 py-2.5 rounded-xl text-xs" style={readonlyStyle}>
            🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>

          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} placeholder="What was this expense for?"
              className={inputCls + ' resize-none'} style={inputStyle}/>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Amount (₹) *</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0" min="1" className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Payment Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}
                className={inputCls + ' appearance-none'} style={inputStyle}>
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
              </select>
            </div>
          </div>

          {/* Recorded By — dropdown for admin, readonly for everyone else */}
          <div className="mb-5">
            {role === 'admin' ? (
              <>
                <label className={labelCls} style={{ color: T.textSub }}>
                  Recorded By
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` }}>
                    Admin Override
                  </span>
                </label>
                <select
                  value={createdBy}
                  onChange={(e) => setCreatedBy(e.target.value)}
                  className={inputCls + ' appearance-none'}
                  style={inputStyle}>
                  {/* Logged-in user always first */}
                  {[userName, ...staffList.filter(n => n !== userName)].map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label className={labelCls} style={{ color: T.textSub }}>Recorded By</label>
                <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{userName}</div>
              </>
            )}
          </div>

          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
              <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm"
              style={{ border: `1px solid ${T.border}`, color: T.textSub }}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: T.accent, color: 'white' }}>
              {saving
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Saving…
                  </span>
                : '✓ Add Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const router = useRouter()
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [showModal, setShowModal] = useState(false)

  // For manager the from-date is locked to 7 days ago
  const isManagerRestricted = role === 'manager'
  const managerMinDate = daysAgo(7)

  const [afterDate, setAfterDate] = useState('')
  const [beforeDate, setBeforeDate] = useState('')
  const [searchText, setSearchText] = useState('')
  const [modeFilter, setModeFilter] = useState('all')

  useEffect(() => {
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', sessionData.session.user.id).single()
      const r = profile?.role || ''
      setUserName(profile?.name || '')
      setRole(r)
      // admin, manager, partner can access expenses; everyone else is redirected
      if (r !== 'admin' && r !== 'manager' && r !== 'partner') { router.push('/'); return }
      // Manager can only see last 7 days — default the from-date
      if (r === 'manager') setAfterDate(daysAgo(7))
      fetchExpenses()
    }
    init()
  }, [])

  async function fetchExpenses() {
    setLoading(true)
    const { data, error } = await supabase
      .schema('library_management')
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setExpenses(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    // For manager: always enforce 7-day minimum regardless of their filter input
    const effectiveAfter = isManagerRestricted
      ? (afterDate && afterDate > managerMinDate ? afterDate : managerMinDate)
      : afterDate

    return expenses.filter((row) => {
      if (effectiveAfter) {
        if (new Date(row.created_at) < new Date(effectiveAfter)) return false
      }
      if (beforeDate) {
        const before = new Date(beforeDate)
        before.setHours(23, 59, 59, 999)
        if (new Date(row.created_at) > before) return false
      }
      if (searchText) {
        const q = searchText.toLowerCase()
        if (
          !row.Description?.toLowerCase().includes(q) &&
          !row.Created_by?.toLowerCase().includes(q)
        ) return false
      }
      if (modeFilter !== 'all') {
        if (row.Mode !== modeFilter) return false
      }
      return true
    })
  }, [expenses, afterDate, beforeDate, searchText, modeFilter, isManagerRestricted, managerMinDate])

  const summary = useMemo(() => {
    let total = 0, cash = 0, online = 0
    filtered.forEach((r) => {
      const amt = r.Amount || 0
      total += amt
      if (r.Mode === 'Cash') cash += amt
      else if (r.Mode === 'Online') online += amt
    })
    return { total, cash, online, count: filtered.length }
  }, [filtered])

  const hasFilters = (isManagerRestricted ? afterDate !== managerMinDate : !!afterDate) || beforeDate || searchText || modeFilter !== 'all'
  const inputStyle: React.CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, color: T.text }
  const labelCls = "text-[10px] uppercase tracking-widest font-medium mb-1.5 block"

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium transition-opacity hover:opacity-70" style={{ color: T.textSub }}>← Home</Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                💸 Expenses
              </h1>
              <p className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: T.textMuted }}>
                {loading ? 'Loading…' : `${filtered.length} of ${expenses.length} records`}
                {isManagerRestricted && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` }}>
                    Last 7 days
                  </span>
                )}
              </p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: T.accent, color: 'white', boxShadow: `0 2px 12px ${T.accent}50` }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
            </svg>
            Add Expense
          </button>
        </div>

        {/* FILTER PANEL */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-4" style={{ color: T.textMuted }}>Filters</p>

          {/* Manager restriction notice */}
          {isManagerRestricted && (
            <div className="mb-4 px-3 py-2 rounded-xl flex items-center gap-2"
              style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
              <span className="text-sm">📅</span>
              <p className="text-xs" style={{ color: T.accent }}>Showing expenses from the last 7 days only.</p>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>From</label>
              {isManagerRestricted ? (
                <div className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }}>
                  {formatDate(managerMinDate)}
                </div>
              ) : (
                <input type="date" value={afterDate} onChange={(e) => setAfterDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none" style={inputStyle}/>
              )}
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>To</label>
              <div className="relative">
                <input type="date" value={beforeDate} onChange={(e) => setBeforeDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none" style={inputStyle}/>
                {beforeDate && (
                  <button onClick={() => setBeforeDate('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.textMuted }}>✕</button>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelCls} style={{ color: T.textSub }}>Search</label>
              <input type="text" placeholder="Description or recorded by…" value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none" style={inputStyle}/>
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Mode</label>
              <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none appearance-none" style={inputStyle}>
                <option value="all">All</option>
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
              </select>
            </div>
          </div>
          {hasFilters && !isManagerRestricted && (
            <button className="mt-3 text-xs font-medium hover:underline" style={{ color: T.accent }}
              onClick={() => { setAfterDate(''); setBeforeDate(''); setSearchText(''); setModeFilter('all') }}>
              ✕ Clear all filters
            </button>
          )}
          {hasFilters && isManagerRestricted && (
            <button className="mt-3 text-xs font-medium hover:underline" style={{ color: T.accent }}
              onClick={() => { setAfterDate(managerMinDate); setBeforeDate(''); setSearchText(''); setModeFilter('all') }}>
              ✕ Clear filters
            </button>
          )}
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>Records</p>
            <p className="text-2xl font-bold" style={{ color: T.accent, fontFamily: "'Georgia', serif" }}>{summary.count}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#991b1b' }}>Total Spent</p>
            <p className="text-xl font-bold" style={{ color: '#dc2626', fontFamily: "'Georgia', serif" }}>{fmt(summary.total)}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#854d0e' }}>💵 Cash</p>
            <p className="text-xl font-bold" style={{ color: '#92400e', fontFamily: "'Georgia', serif" }}>{fmt(summary.cash)}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#1d4ed8' }}>📱 Online</p>
            <p className="text-xl font-bold" style={{ color: '#1d4ed8', fontFamily: "'Georgia', serif" }}>{fmt(summary.online)}</p>
          </div>
        </div>

        {/* TABLE */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3"
              style={{ borderColor: T.accent, borderTopColor: 'transparent' }}/>
            <p className="text-sm" style={{ color: T.textMuted }}>Loading expenses…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">💸</p>
            <p className="text-sm" style={{ color: T.textMuted }}>No expenses found</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                    {['#', 'Date & Time', 'Description', 'Amount', 'Mode', 'Recorded By'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap"
                        style={{ color: T.textMuted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={row.id}
                      className="transition-colors hover:bg-orange-50/30"
                      style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td className="px-4 py-3.5 text-xs" style={{ color: T.textMuted }}>{i + 1}</td>
                      <td className="px-4 py-3.5 text-xs whitespace-nowrap" style={{ color: T.textSub }}>
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: T.text, maxWidth: '300px' }}>
                        {row.Description}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold" style={{ color: '#dc2626' }}>
                        {fmt(row.Amount || 0)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: row.Mode === 'Cash' ? '#fefce8' : '#eff6ff',
                            color: row.Mode === 'Cash' ? '#854d0e' : '#1d4ed8',
                            border: `1px solid ${row.Mode === 'Cash' ? '#fde68a' : '#bfdbfe'}`,
                          }}>
                          {row.Mode}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs" style={{ color: T.textSub }}>{row.Created_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2"
              style={{ borderTop: `1px solid ${T.border}`, background: T.bg }}>
              <p className="text-xs" style={{ color: T.textMuted }}>
                {filtered.length} record{filtered.length !== 1 ? 's' : ''}
                {afterDate && !isManagerRestricted && ` · From ${formatDate(afterDate)}`}
                {beforeDate && ` · To ${formatDate(beforeDate)}`}
              </p>
              <div className="flex gap-5 text-xs font-semibold">
                <span style={{ color: '#dc2626' }}>Total: {fmt(summary.total)}</span>
                <span style={{ color: '#92400e' }}>Cash: {fmt(summary.cash)}</span>
                <span style={{ color: '#1d4ed8' }}>Online: {fmt(summary.online)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <AddExpenseModal
          userName={userName}
          role={role}
          onClose={() => setShowModal(false)}
          onSuccess={() => fetchExpenses()}
        />
      )}
    </div>
  )
}
