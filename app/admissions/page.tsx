'use client'

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

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || ''
  let bg = '#fef9c3', color = '#854d0e', border = '#fde68a'
  if (s.includes('expired'))      { bg = '#fee2e2'; color = '#991b1b'; border = '#fca5a5' }
  else if (s.includes('active'))  { bg = '#dcfce7'; color = '#166534'; border = '#86efac' }
  else if (s.includes('blocked')) { bg = '#f3f4f6'; color = '#4b5563'; border = '#d1d5db' }
  else if (s.includes('freeze') || s.includes('freezed')) { bg = '#e0f2fe'; color = '#075985'; border = '#7dd3fc' }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {status}
    </span>
  )
}

const PAGE_SIZE = 100

function localMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}
function localEndOfDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

export default function AdmissionsPage() {
  const router = useRouter()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const [afterDate, setAfterDate] = useState('')
  const [beforeDate, setBeforeDate] = useState('')
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [shiftFilter, setShiftFilter] = useState('all')
  const [admissionFilter, setAdmissionFilter] = useState('all')
  const [modeFilter, setModeFilter] = useState('all')

  useEffect(() => {
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', sessionData.session.user.id).single()
      const r = profile?.role || ''
      if (r !== 'admin' && r !== 'partner') { router.push('/'); return }
      fetchAllData()
    }
    init()
  }, [])

  async function fetchAllData() {
    setLoading(true)
    setData([])
    let allRows: any[] = []
    let from = 0
    const batchSize = 1000
    while (true) {
      const { data: batch, error } = await supabase
        .from('v_admission_details')
        .select('*')
        .order('timestamp', { ascending: false })
        .range(from, from + batchSize - 1)
      if (error) { console.error(error); break }
      if (!batch || batch.length === 0) break
      allRows = allRows.concat(batch)
      if (batch.length < batchSize) break
      from += batchSize
    }
    setData(allRows)
    setTotalCount(allRows.length)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return data.filter((row) => {
      if (afterDate || beforeDate) {
        const after = afterDate ? localMidnight(afterDate) : null
        const before = beforeDate ? localEndOfDay(beforeDate) : null
        const ts = row.timestamp ? new Date(row.timestamp) : null
        const dueDate = row.due_fees_submitted_date ? new Date(row.due_fees_submitted_date) : null
        const tsInRange = ts ? (!after || ts >= after) && (!before || ts <= before) : false
        const dueDateInRange = dueDate ? (!after || dueDate >= after) && (!before || dueDate <= before) : false
        if (!tsInRange && !dueDateInRange) return false
      }
      if (searchText) {
        const q = searchText.toLowerCase()
        if (!row.name?.toLowerCase().includes(q) && !row.mobile_number?.includes(q) && !row.register_id?.toLowerCase().includes(q)) return false
      }
      if (statusFilter !== 'all' && !row.status?.toLowerCase().includes(statusFilter)) return false
      if (shiftFilter !== 'all' && !row.shift?.includes(shiftFilter)) return false
      if (admissionFilter !== 'all' && row.admission !== admissionFilter) return false
      if (modeFilter !== 'all' && row.mode !== modeFilter) return false
      return true
    })
  }, [data, afterDate, beforeDate, searchText, statusFilter, shiftFilter, admissionFilter, modeFilter])

  useEffect(() => { setPage(0) }, [filtered.length])

  const paginated = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page])
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const summary = useMemo(() => {
    const after = afterDate ? localMidnight(afterDate) : null
    const before = beforeDate ? localEndOfDay(beforeDate) : null
    let totalFees = 0, cashFees = 0, onlineFees = 0
    let totalPaid = 0, cashPaid = 0, onlinePaid = 0
    let totalDuePaid = 0, cashDuePaid = 0, onlineDuePaid = 0
    let totalDue = 0

    filtered.forEach((r) => {
      const fees = r.final_fees || 0
      const paid = r.fees_submitted || 0
      const duePaid = r.due_fees_submitted || 0
      const due = r.due_fees || 0
      const mode = (r.mode || '').toLowerCase()
      const dueMode = (r.due_fees_mode || '').toLowerCase()

      totalFees += fees
      totalPaid += paid
      if (mode === 'cash') { cashFees += fees; cashPaid += paid }
      else if (mode === 'online') { onlineFees += fees; onlinePaid += paid }
      if (due > 0) totalDue += due

      const dueDate = r.due_fees_submitted_date ? new Date(r.due_fees_submitted_date) : null
      const dueDateOk = (after || before)
        ? dueDate && (!after || dueDate >= after) && (!before || dueDate <= before)
        : true
      if (dueDateOk && duePaid > 0) {
        totalDuePaid += duePaid
        if (dueMode === 'cash') cashDuePaid += duePaid
        else if (dueMode === 'online') onlineDuePaid += duePaid
      }
    })

    return {
      count: filtered.length,
      totalFees, cashFees, onlineFees,
      totalPaid, cashPaid, onlinePaid,
      totalDuePaid, cashDuePaid, onlineDuePaid,
      totalDue,
      totalCollected: totalPaid + totalDuePaid,
      cashCollected: cashPaid + cashDuePaid,
      onlineCollected: onlinePaid + onlineDuePaid,
    }
  }, [filtered, afterDate, beforeDate])

  // iOS: font-size 16px prevents zoom
  const inputStyle: React.CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'none' as any }
  const labelCls = "text-[10px] uppercase tracking-widest font-medium mb-1.5 block"
  const SHIFTS = ['6 AM - 12 PM', '12 PM - 6 PM', '6 PM - 11 PM']
  const hasFilters = afterDate || beforeDate || searchText || statusFilter !== 'all' || shiftFilter !== 'all' || admissionFilter !== 'all' || modeFilter !== 'all'
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>
      <div className="max-w-[1400px] mx-auto px-4 py-6">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-medium transition-opacity hover:opacity-70" style={{ color: T.textSub }}>← Home</Link>
            <div>
              <h1 className="text-xl md:text-2xl font-bold" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>📋 Admissions Ledger</h1>
              <p className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: T.textMuted }}>
                {loading ? 'Loading…' : `${filtered.length} of ${totalCount} records`}
              </p>
            </div>
          </div>
          <button onClick={() => fetchAllData()} className="text-xs px-3 py-1.5 rounded-lg"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>↻ Refresh</button>
        </div>

        {/* FILTER PANEL — iOS-safe: 1 col mobile → 2 col sm → 4 col md → 8 col lg */}
        <div className="rounded-2xl p-4 sm:p-5 mb-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: T.textMuted }}>Filters</p>
          <p className="text-[10px] mb-4 leading-relaxed" style={{ color: T.textMuted }}>
            📅 Date range filters on <span style={{ color: T.textSub, fontWeight: 600 }}>admission recorded date</span>. Rows where a <span style={{ color: T.textSub, fontWeight: 600 }}>due payment date</span> falls in the same range are also included.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="sm:col-span-1">
              <label className={labelCls} style={{ color: T.textSub }}>From</label>
              <input type="date" value={afterDate} onChange={(e) => setAfterDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl focus:outline-none" style={inputStyle}/>
            </div>
            <div className="sm:col-span-1">
              <label className={labelCls} style={{ color: T.textSub }}>To</label>
              <div className="relative">
                <input type="date" value={beforeDate} onChange={(e) => setBeforeDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl focus:outline-none" style={inputStyle}/>
                {beforeDate && <button onClick={() => setBeforeDate('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: T.textMuted }}>✕</button>}
              </div>
            </div>
            {/* Search spans 2 cols on sm, 2 on md, 2 on lg */}
            <div className="sm:col-span-2">
              <label className={labelCls} style={{ color: T.textSub }}>Search</label>
              <input type="text" placeholder="Name, mobile or reg ID…" value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full px-3 py-2 rounded-xl focus:outline-none" style={inputStyle}/>
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl focus:outline-none" style={selectStyle}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="blocked">Blocked</option>
                <option value="freeze">Frozen</option>
                <option value="due">Due</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Shift</label>
              <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl focus:outline-none" style={selectStyle}>
                <option value="all">All</option>
                {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Type</label>
              <select value={admissionFilter} onChange={(e) => setAdmissionFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl focus:outline-none" style={selectStyle}>
                <option value="all">All</option>
                <option value="New">New</option>
                <option value="Renew">Renew</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Mode</label>
              <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl focus:outline-none" style={selectStyle}>
                <option value="all">All</option>
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
              </select>
            </div>
          </div>
          {hasFilters && (
            <button className="mt-3 text-xs font-medium hover:underline" style={{ color: T.accent }}
              onClick={() => { setAfterDate(''); setBeforeDate(''); setSearchText(''); setStatusFilter('all'); setShiftFilter('all'); setAdmissionFilter('all'); setModeFilter('all') }}>
              ✕ Clear all filters
            </button>
          )}
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-4">
          <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>Records</p>
            <p className="text-2xl font-bold" style={{ color: T.accent, fontFamily: "'Georgia', serif" }}>{summary.count}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>Total Fees</p>
            <p className="text-lg font-bold" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>{fmt(summary.totalFees)}</p>
            <div className="mt-1.5 space-y-0.5">
              <p className="text-[10px]" style={{ color: T.textMuted }}>💵 Cash: <span style={{ color: T.textSub }}>{fmt(summary.cashFees)}</span></p>
              <p className="text-[10px]" style={{ color: T.textMuted }}>📱 Online: <span style={{ color: T.textSub }}>{fmt(summary.onlineFees)}</span></p>
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#166534' }}>Main Paid</p>
            <p className="text-lg font-bold" style={{ color: '#16a34a', fontFamily: "'Georgia', serif" }}>{fmt(summary.totalPaid)}</p>
            <div className="mt-1.5 space-y-0.5">
              <p className="text-[10px]" style={{ color: '#4ade80' }}>💵 <span style={{ color: '#166534' }}>{fmt(summary.cashPaid)}</span></p>
              <p className="text-[10px]" style={{ color: '#4ade80' }}>📱 <span style={{ color: '#166534' }}>{fmt(summary.onlinePaid)}</span></p>
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#166534' }}>
              Due Paid{(afterDate || beforeDate) && <span className="ml-1 opacity-50">(in range)</span>}
            </p>
            <p className="text-lg font-bold" style={{ color: '#16a34a', fontFamily: "'Georgia', serif" }}>{fmt(summary.totalDuePaid)}</p>
            <div className="mt-1.5 space-y-0.5">
              <p className="text-[10px]" style={{ color: '#4ade80' }}>💵 <span style={{ color: '#166534' }}>{fmt(summary.cashDuePaid)}</span></p>
              <p className="text-[10px]" style={{ color: '#4ade80' }}>📱 <span style={{ color: '#166534' }}>{fmt(summary.onlineDuePaid)}</span></p>
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#166534' }}>Total Collected</p>
            <p className="text-lg font-bold" style={{ color: '#15803d', fontFamily: "'Georgia', serif" }}>{fmt(summary.totalCollected)}</p>
            <div className="mt-1.5 space-y-0.5">
              <p className="text-[10px]" style={{ color: '#4ade80' }}>💵 <span style={{ color: '#166534' }}>{fmt(summary.cashCollected)}</span></p>
              <p className="text-[10px]" style={{ color: '#4ade80' }}>📱 <span style={{ color: '#166534' }}>{fmt(summary.onlineCollected)}</span></p>
            </div>
          </div>
          <div className="rounded-xl p-4" style={{ background: summary.totalDue > 0 ? '#fef2f2' : T.surface, border: `1px solid ${summary.totalDue > 0 ? '#fecaca' : T.border}` }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: summary.totalDue > 0 ? '#991b1b' : T.textMuted }}>Pending Due</p>
            <p className="text-2xl font-bold" style={{ color: summary.totalDue > 0 ? '#dc2626' : T.textMuted, fontFamily: "'Georgia', serif" }}>{fmt(summary.totalDue)}</p>
            <p className="text-[10px] mt-1" style={{ color: summary.totalDue > 0 ? '#fca5a5' : T.textMuted }}>
              {filtered.filter(r => (r.due_fees || 0) > 0).length} records
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>Type</p>
            <div className="mt-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>New</span>
                <span className="text-sm font-bold" style={{ color: T.text }}>{filtered.filter(r => r.admission === 'New').length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` }}>Renew</span>
                <span className="text-sm font-bold" style={{ color: T.text }}>{filtered.filter(r => r.admission === 'Renew').length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* TABLE */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3" style={{ borderColor: T.accent, borderTopColor: 'transparent' }}/>
            <p className="text-sm mb-1" style={{ color: T.textMuted }}>Loading records…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">📋</p>
            <p className="text-sm" style={{ color: T.textMuted }}>No records match your filters</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '1300px' }}>
                <thead>
                  <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                    {['#', 'Reg ID', 'Name', 'Mobile', 'Type', 'Recorded On', 'Start', 'Expiry', 'Months', 'Seat', 'Shift', 'Fees', 'Main Paid', 'Mode', 'Due Paid', 'Due Mode', 'Due Date', 'Pending Due', 'Status'].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap" style={{ color: T.textMuted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row, i) => {
                    const after = afterDate ? localMidnight(afterDate) : null
                    const before = beforeDate ? localEndOfDay(beforeDate) : null
                    const ts = row.timestamp ? new Date(row.timestamp) : null
                    const tsInRange = ts ? (!after || ts >= after) && (!before || ts <= before) : false
                    const dueDate = row.due_fees_submitted_date ? new Date(row.due_fees_submitted_date) : null
                    const dueDateInRange = dueDate ? (!after || dueDate >= after) && (!before || dueDate <= before) : false
                    const isDueOnly = (afterDate || beforeDate) && !tsInRange && dueDateInRange

                    return (
                      <tr key={row.register_id + i}
                        className="transition-colors hover:bg-orange-50/30"
                        style={{ borderBottom: `1px solid ${T.border}`, background: isDueOnly ? '#fefce8' : undefined }}>
                        <td className="px-3 py-3 text-xs" style={{ color: T.textMuted }}>{page * PAGE_SIZE + i + 1}</td>
                        <td className="px-3 py-3 text-xs font-mono font-medium" style={{ color: T.accent }}>
                          <Link href={`/student/${row.mobile_number}`} className="hover:underline">{row.register_id}</Link>
                        </td>
                        <td className="px-3 py-3 text-sm font-medium whitespace-nowrap" style={{ color: T.text }}>
                          <Link href={`/student/${row.mobile_number}`} className="hover:underline">{row.name}</Link>
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: T.textSub }}>{row.mobile_number}</td>
                        <td className="px-3 py-3">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: row.admission === 'New' ? '#f0fdf4' : T.accentLight, color: row.admission === 'New' ? '#166534' : T.accent, border: `1px solid ${row.admission === 'New' ? '#bbf7d0' : T.accentBorder}` }}>
                            {row.admission || 'New'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: T.textSub }}>
                          {row.timestamp ? new Date(row.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: T.text }}>{formatDate(row.start_date)}</td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: T.text }}>{formatDate(row.expiry)}</td>
                        <td className="px-3 py-3 text-xs text-center" style={{ color: T.textSub }}>{row.months}</td>
                        <td className="px-3 py-3 text-xs font-medium text-center" style={{ color: T.text }}>{row.seat}</td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: T.textSub }}>{row.shift}</td>
                        <td className="px-3 py-3 text-xs font-medium" style={{ color: T.text }}>{fmt(row.final_fees || 0)}</td>
                        <td className="px-3 py-3 text-xs font-medium" style={{ color: '#16a34a' }}>{fmt(row.fees_submitted || 0)}</td>
                        <td className="px-3 py-3">
                          {row.mode ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: row.mode === 'Cash' ? '#fefce8' : '#eff6ff', color: row.mode === 'Cash' ? '#854d0e' : '#1d4ed8', border: `1px solid ${row.mode === 'Cash' ? '#fde68a' : '#bfdbfe'}` }}>
                              {row.mode}
                            </span>
                          ) : <span style={{ color: T.textMuted }}>—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs font-medium" style={{ color: (row.due_fees_submitted || 0) > 0 ? '#16a34a' : T.textMuted }}>
                          {(row.due_fees_submitted || 0) > 0 ? fmt(row.due_fees_submitted) : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {row.due_fees_mode ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: row.due_fees_mode === 'Cash' ? '#fefce8' : '#eff6ff', color: row.due_fees_mode === 'Cash' ? '#854d0e' : '#1d4ed8', border: `1px solid ${row.due_fees_mode === 'Cash' ? '#fde68a' : '#bfdbfe'}` }}>
                              {row.due_fees_mode}
                            </span>
                          ) : <span style={{ color: T.textMuted }}>—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap"
                          style={{ color: dueDateInRange && (afterDate || beforeDate) ? '#16a34a' : T.textSub, fontWeight: dueDateInRange && (afterDate || beforeDate) ? 600 : 400 }}>
                          {row.due_fees_submitted_date ? formatDate(row.due_fees_submitted_date) : '—'}
                        </td>
                        <td className="px-3 py-3 text-xs font-medium" style={{ color: (row.due_fees || 0) > 0 ? '#dc2626' : T.textMuted }}>
                          {(row.due_fees || 0) > 0 ? fmt(row.due_fees) : '—'}
                        </td>
                        <td className="px-3 py-3"><StatusBadge status={row.status}/></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2"
              style={{ borderTop: `1px solid ${T.border}`, background: T.bg }}>
              <div className="flex items-center gap-3">
                <p className="text-xs" style={{ color: T.textMuted }}>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="px-2 py-1 rounded text-xs disabled:opacity-40"
                      style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>←</button>
                    <span className="text-xs px-2" style={{ color: T.textSub }}>{page + 1} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                      className="px-2 py-1 rounded text-xs disabled:opacity-40"
                      style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>→</button>
                  </div>
                )}
              </div>
              <div className="flex gap-4 text-xs font-semibold flex-wrap">
                <span style={{ color: T.text }}>Fees: {fmt(summary.totalFees)}</span>
                <span style={{ color: '#16a34a' }}>Collected: {fmt(summary.totalCollected)}</span>
                {summary.totalDue > 0 && <span style={{ color: '#dc2626' }}>Pending: {fmt(summary.totalDue)}</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}