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

function daysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

// Shared input style — fontSize:16 prevents iOS zoom, minHeight:44 ensures tap target on Android
const filterInp: React.CSSProperties = {
  background: '#ffffff', border: '1px solid #ede8e1', color: '#1c1917',
  fontSize: 16, width: '100%', padding: '10px 12px', borderRadius: 12,
  outline: 'none', boxSizing: 'border-box', minHeight: 44,
  // Explicit display:block prevents iOS date input collapsing to 0 height
  display: 'block',
}

// ─── ADD EXPENSE MODAL ────────────────────────────────────────────────────────
function AddExpenseModal({ userName, role, onClose, onSuccess }: {
  userName: string; role: string; onClose: () => void; onSuccess: () => void
}) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('Cash')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [staffList, setStaffList] = useState<string[]>([])
  const [createdBy, setCreatedBy] = useState(userName)

  useEffect(() => {
    if (role !== 'admin') return
    supabase.from('profiles').select('name').order('name').then(({ data }) => {
      if (data) setStaffList(data.map((p: any) => p.name).filter(Boolean))
    })
  }, [role])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const now = new Date().toISOString()
  const inp: React.CSSProperties = { ...filterInp }
  const ro: React.CSSProperties = { ...filterInp, color: T.textMuted }
  const lbl: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', fontWeight: 600, color: T.textSub, display: 'block', marginBottom: 6 }

  const handleSubmit = async () => {
    if (!description.trim()) { setError('Description is required'); return }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError('')
    const { error: insertError } = await supabase.schema('library_management').from('expenses').insert([{
      Description: description.trim(), Amount: parseFloat(amount), Mode: mode, Created_by: createdBy,
    }])
    if (insertError) { setError(insertError.message); setSaving(false); return }
    onSuccess(); onClose()
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      }}>
      <div style={{
        position: 'relative', width: '100%', maxWidth: '28rem', maxHeight: '92vh',
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: '16px 16px 0 0',
        display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain',
      }}>
        <div style={{ height: 3, flexShrink: 0, borderRadius: '16px 16px 0 0', background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }}/>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px', flexShrink: 0 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: T.border }}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 20px 12px', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: T.text, fontFamily: "'Georgia', serif" }}>Add Expense</div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>All fields marked * are required</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: T.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 12px' }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any, padding: '0 20px', minHeight: 0 }}>
          <div style={{ ...ro, fontSize: 11, marginBottom: 16 }}>
            🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Description *</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What was this expense for?" style={{ ...inp, resize: 'none', minHeight: 80 }}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div><label style={lbl}>Amount (₹) *</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" min="1" style={inp}/></div>
            <div><label style={lbl}>Payment Mode</label><select value={mode} onChange={(e) => setMode(e.target.value)} style={{ ...inp, appearance: 'none' as any }}><option value="Cash">Cash</option><option value="Online">Online</option></select></div>
          </div>
          <div style={{ marginBottom: 16 }}>
            {role === 'admin' ? (
              <>
                <label style={lbl}>Recorded By <span style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 999, fontSize: 9, fontWeight: 600, background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` }}>Admin Override</span></label>
                <select value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} style={{ ...inp, appearance: 'none' as any }}>
                  {[userName, ...staffList.filter(n => n !== userName)].map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </>
            ) : (
              <>
                <label style={lbl}>Recorded By</label>
                <div style={ro}>{userName}</div>
              </>
            )}
          </div>
          {error && <div style={{ padding: '10px 14px', borderRadius: 12, background: '#fee2e2', border: '1px solid #fca5a5', marginBottom: 8 }}><p style={{ fontSize: 13, color: '#991b1b' }}>{error}</p></div>}
          <div style={{ height: 8 }}/>
        </div>

        {/* Sticky footer */}
        <div style={{ flexShrink: 0, padding: '12px 20px', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))', borderTop: `1px solid ${T.border}`, background: T.surface }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '13px 0', borderRadius: 12, fontSize: 14, border: `1px solid ${T.border}`, color: T.textSub, background: 'none', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving} style={{ flex: 1, padding: '13px 0', borderRadius: 12, fontSize: 14, fontWeight: 600, border: 'none', background: T.accent, color: 'white', cursor: 'pointer', opacity: saving ? 0.4 : 1 }}>
              {saving ? 'Saving…' : '✓ Add Expense'}
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
      setUserName(profile?.name || ''); setRole(r)
      if (r !== 'admin' && r !== 'manager' && r !== 'partner') { router.push('/'); return }
      if (r === 'manager') setAfterDate(daysAgo(7))
      fetchExpenses()
    }
    init()
  }, [])

  async function fetchExpenses() {
    setLoading(true)
    const { data, error } = await supabase.schema('library_management').from('expenses').select('*').order('created_at', { ascending: false })
    if (!error) setExpenses(data || [])
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const effectiveAfter = isManagerRestricted ? (afterDate && afterDate > managerMinDate ? afterDate : managerMinDate) : afterDate
    return expenses.filter((row) => {
      if (effectiveAfter && new Date(row.created_at) < new Date(effectiveAfter)) return false
      if (beforeDate) { const b = new Date(beforeDate); b.setHours(23, 59, 59, 999); if (new Date(row.created_at) > b) return false }
      if (searchText) { const q = searchText.toLowerCase(); if (!row.Description?.toLowerCase().includes(q) && !row.Created_by?.toLowerCase().includes(q)) return false }
      if (modeFilter !== 'all' && row.Mode !== modeFilter) return false
      return true
    })
  }, [expenses, afterDate, beforeDate, searchText, modeFilter, isManagerRestricted, managerMinDate])

  const summary = useMemo(() => {
    let total = 0, cash = 0, online = 0
    filtered.forEach((r) => { const a = r.Amount || 0; total += a; if (r.Mode === 'Cash') cash += a; else if (r.Mode === 'Online') online += a })
    return { total, cash, online, count: filtered.length }
  }, [filtered])

  const hasFilters = (isManagerRestricted ? afterDate !== managerMinDate : !!afterDate) || beforeDate || searchText || modeFilter !== 'all'
  const lbl: React.CSSProperties = { fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em', fontWeight: 600, color: T.textSub, display: 'block', marginBottom: 6 }

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium" style={{ color: T.textSub }}>← Home</Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>💸 Expenses</h1>
              <p className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: T.textMuted }}>
                {loading ? 'Loading…' : `${filtered.length} of ${expenses.length} records`}
                {isManagerRestricted && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-semibold" style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` }}>Last 7 days</span>}
              </p>
            </div>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: T.accent, color: 'white', boxShadow: `0 2px 12px ${T.accent}50` }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
            Add Expense
          </button>
        </div>

        {/* FILTER PANEL
            iOS fix: each filter on its own row (grid-cols-1) on mobile.
            Date inputs MUST have display:block and explicit minHeight to render on iOS Safari. */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: T.textMuted, marginBottom: 16 }}>Filters</p>

          {isManagerRestricted && (
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 12, background: T.accentLight, border: `1px solid ${T.accentBorder}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📅</span><p style={{ fontSize: 12, color: T.accent }}>Showing expenses from the last 7 days only.</p>
            </div>
          )}

          {/* Stack all filters vertically on mobile, 2-col on sm+ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
            <div>
              <label style={lbl}>From</label>
              {isManagerRestricted
                ? <div style={{ ...filterInp, color: T.textMuted }}>{formatDate(managerMinDate)}</div>
                : <input type="date" value={afterDate} onChange={(e) => setAfterDate(e.target.value)} style={filterInp}/>
              }
            </div>
            <div>
              <label style={lbl}>To</label>
              <div style={{ position: 'relative' }}>
                <input type="date" value={beforeDate} onChange={(e) => setBeforeDate(e.target.value)} style={filterInp}/>
                {beforeDate && <button onClick={() => setBeforeDate('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: 12 }}>✕</button>}
              </div>
            </div>
            <div>
              <label style={lbl}>Search</label>
              <input type="text" placeholder="Description or recorded by…" value={searchText} onChange={(e) => setSearchText(e.target.value)} style={filterInp}/>
            </div>
            <div>
              <label style={lbl}>Mode</label>
              <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} style={{ ...filterInp, appearance: 'none' as any }}>
                <option value="all">All</option><option value="Cash">Cash</option><option value="Online">Online</option>
              </select>
            </div>
          </div>

          {hasFilters && (
            <button style={{ marginTop: 12, fontSize: 12, fontWeight: 500, color: T.accent, background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => { setAfterDate(isManagerRestricted ? managerMinDate : ''); setBeforeDate(''); setSearchText(''); setModeFilter('all') }}>
              ✕ Clear {isManagerRestricted ? '' : 'all '}filters
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
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3" style={{ borderColor: T.accent, borderTopColor: 'transparent' }}/>
            <p className="text-sm" style={{ color: T.textMuted }}>Loading expenses…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20"><p className="text-5xl mb-3">💸</p><p className="text-sm" style={{ color: T.textMuted }}>No expenses found</p></div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                    {['#', 'Date & Time', 'Description', 'Amount', 'Mode', 'Recorded By'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={row.id} className="transition-colors hover:bg-orange-50/30" style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td className="px-4 py-3.5 text-xs" style={{ color: T.textMuted }}>{i + 1}</td>
                      <td className="px-4 py-3.5 text-xs whitespace-nowrap" style={{ color: T.textSub }}>{formatDateTime(row.created_at)}</td>
                      <td className="px-4 py-3.5 text-sm" style={{ color: T.text, maxWidth: '300px' }}>{row.Description}</td>
                      <td className="px-4 py-3.5 text-sm font-semibold" style={{ color: '#dc2626' }}>{fmt(row.Amount || 0)}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: row.Mode === 'Cash' ? '#fefce8' : '#eff6ff', color: row.Mode === 'Cash' ? '#854d0e' : '#1d4ed8', border: `1px solid ${row.Mode === 'Cash' ? '#fde68a' : '#bfdbfe'}` }}>{row.Mode}</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs" style={{ color: T.textSub }}>{row.Created_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ borderTop: `1px solid ${T.border}`, background: T.bg }}>
              <p className="text-xs" style={{ color: T.textMuted }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}{afterDate && !isManagerRestricted && ` · From ${formatDate(afterDate)}`}{beforeDate && ` · To ${formatDate(beforeDate)}`}</p>
              <div className="flex gap-5 text-xs font-semibold">
                <span style={{ color: '#dc2626' }}>Total: {fmt(summary.total)}</span>
                <span style={{ color: '#92400e' }}>Cash: {fmt(summary.cash)}</span>
                <span style={{ color: '#1d4ed8' }}>Online: {fmt(summary.online)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && <AddExpenseModal userName={userName} role={role} onClose={() => setShowModal(false)} onSuccess={() => fetchExpenses()}/>}
    </div>
  )
}
