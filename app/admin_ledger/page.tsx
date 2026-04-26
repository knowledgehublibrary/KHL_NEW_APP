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

const LAST_NET          = 104059
const LAST_BANK_BALANCE = 98709

const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`
const fmtSigned = (n: number) =>
  n === 0 ? '₹0' : n > 0
    ? `+₹${n.toLocaleString('en-IN')}`
    : `-₹${Math.abs(n).toLocaleString('en-IN')}`

function formatDate(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || ''
  let bg = '#fef9c3', color = '#854d0e', border = '#fde68a'
  if (s.includes('expired'))      { bg = '#fee2e2'; color = '#991b1b'; border = '#fca5a5' }
  else if (s.includes('active'))  { bg = '#dcfce7'; color = '#166534'; border = '#86efac' }
  else if (s.includes('blocked')) { bg = '#f3f4f6'; color = '#4b5563'; border = '#d1d5db' }
  else if (s.includes('freeze') || s.includes('freezed')) { bg = '#e0f2fe'; color = '#075985'; border = '#7dd3fc' }
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {status}
    </span>
  )
}

function MetricCard({ label, value, sub, color, bg, border, formula }: {
  label: string; value: string; sub?: string
  color?: string; bg?: string; border?: string; formula?: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: bg || T.surface, border: `1px solid ${border || T.border}` }}>
      <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>{label}</p>
      <p className="text-xl font-bold" style={{ color: color || T.text, fontFamily: "'Georgia', serif" }}>{value}</p>
      {sub     && <p className="text-[10px] mt-1"              style={{ color: T.textMuted }}>{sub}</p>}
      {formula && <p className="text-[9px] mt-1 font-mono"     style={{ color: T.textMuted, opacity: 0.7 }}>{formula}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: T.textMuted }}>
        {title}
      </p>
      {children}
    </div>
  )
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const inputBaseStyle: React.CSSProperties = {
  background: T.bg,
  border: `1px solid ${T.border}`,
  color: T.text,
  fontSize: '16px',
  WebkitAppearance: 'none',
}
const labelCls  = "text-[10px] uppercase tracking-widest mb-1.5 block font-medium"
const inputCls  = "w-full px-3 rounded-xl focus:outline-none"
const inputHCls = "py-2.5"

// ─── VIEW TOGGLE ──────────────────────────────────────────────────────────────
function ViewToggle({ view, onChange }: { view: 'glance' | 'detailed'; onChange: (v: 'glance' | 'detailed') => void }) {
  return (
    <div
      className="flex items-center rounded-xl p-1 gap-1"
      style={{ background: T.bg, border: `1px solid ${T.border}` }}>
      {(['glance', 'detailed'] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className="px-4 rounded-lg text-xs font-semibold capitalize transition-all"
          style={{
            minHeight: '34px',
            touchAction: 'manipulation',
            background: view === v ? T.surface : 'transparent',
            color: view === v ? T.accent : T.textMuted,
            border: view === v ? `1px solid ${T.border}` : '1px solid transparent',
            boxShadow: view === v ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
          }}>
          {v === 'glance' ? '👁 Glance' : '📊 Detailed'}
        </button>
      ))}
    </div>
  )
}

// ─── GLANCE VIEW ─────────────────────────────────────────────────────────────
function GlanceView({ m, balanced }: { m: any; balanced: (v: number) => boolean }) {
  const greenSet  = { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' }
  const amberSet  = { color: '#92400e', bg: '#fefce8', border: '#fde68a' }
  const blueSet   = { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' }

  return (
    <div className="mb-6">
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: T.textMuted }}>
        At a Glance
      </p>

      <div className="grid grid-cols-2 gap-2 md:gap-3 mb-2">
        {/* Net Profit */}
        <MetricCard
          label="📈 Net Profit"
          value={fmt(m.netProfit)}
          formula="Opening + Fees − Exp"
          color={m.netProfit >= 0 ? '#166534' : '#dc2626'}
          bg={m.netProfit >= 0 ? '#f0fdf4' : '#fef2f2'}
          border={m.netProfit >= 0 ? '#bbf7d0' : '#fecaca'}
        />
        {/* Cash in Hand */}
        <MetricCard
          label="💰 Cash in Hand"
          value={fmt(m.cashInHand)}
          sub="Received − All Dr"
          color={m.cashInHand >= 0 ? '#92400e' : '#dc2626'}
          bg={m.cashInHand >= 0 ? '#fefce8' : '#fef2f2'}
          border={m.cashInHand >= 0 ? '#fde68a' : '#fecaca'}
        />
        {/* Expected Bank */}
        <MetricCard
          label="🏦 Expected Bank"
          value={fmt(m.expectedBankBalance)}
          sub="Opening+Banked+Online−Exp"
          {...blueSet}
        />
        {/* Remaining */}
        <MetricCard
          label="🔄 Remaining"
          value={fmt(m.remainingToCollect)}
          sub="Fees−InHand−ExpBank"
          color={balanced(m.remainingToCollect) ? '#166534' : '#d97706'}
          bg={balanced(m.remainingToCollect) ? '#f0fdf4' : '#fffbeb'}
          border={balanced(m.remainingToCollect) ? '#bbf7d0' : '#fde68a'}
        />
      </div>

      {/* Bank Error + Still to Check inline summary */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl flex-wrap"
        style={{
          background: balanced(m.bankError) ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${balanced(m.bankError) ? '#bbf7d0' : '#fecaca'}`,
        }}>
        <span className="text-sm" style={{ color: balanced(m.bankError) ? '#166534' : '#dc2626' }}>
          {balanced(m.bankError) ? '✅' : '⚠️'}
        </span>
        <span className="text-xs font-semibold" style={{ color: balanced(m.bankError) ? '#166534' : '#dc2626' }}>
          Bank Error: {fmtSigned(m.bankError)}
        </span>
        {!balanced(m.bankError) && (
          <>
            <span className="text-[10px]" style={{ color: T.textMuted }}>·</span>
            <span className="text-xs" style={{ color: balanced(m.stillToCheck) ? '#166534' : '#c2410c' }}>
              Still to check: {fmtSigned(m.stillToCheck)}
            </span>
          </>
        )}
        {balanced(m.bankError) && (
          <span className="text-xs font-medium" style={{ color: '#166534' }}>Balanced ✓</span>
        )}
      </div>
    </div>
  )
}

// ─── ADD CASH LOG MODAL ───────────────────────────────────────────────────────
function AddCashLogModal({ userName, onClose, onSuccess }: {
  userName: string; onClose: () => void; onSuccess: () => void
}) {
  const [amount, setAmount]           = useState('')
  const [type, setType]               = useState<'Cr' | 'Dr'>('Cr')
  const [description, setDescription] = useState('')
  const [goesToBank, setGoesToBank]   = useState<boolean | null>(null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const handleSubmit = async () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('Enter a valid positive amount'); return
    }
    if (!description.trim()) { setError('Please enter a description'); return }
    if (type === 'Cr' && goesToBank === null) {
      setError('Please specify if this amount goes to bank'); return
    }
    setSaving(true); setError('')

    const amt = parseFloat(amount)
    const entries: { amount: number; type: string; description: string; created_by: string }[] = []
    entries.push({ amount: amt, type, description: description.trim(), created_by: userName })
    if (type === 'Cr' && goesToBank === true) {
      entries.push({ amount: amt, type: 'Dr', description: 'Bank', created_by: userName })
    }

    const { error: insertError } = await supabase
      .schema('library_management')
      .from('cash_log')
      .insert(entries)

    if (insertError) { setError(insertError.message); setSaving(false); return }
    onSuccess(); onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{
        background: 'rgba(28,25,23,0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
      <div
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="h-[3px] rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }}/>

        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: T.border }}/>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                Add Cash Entry
              </h2>
              <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>
                Cr = cash received · Dr = cash going out
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-11 h-11 rounded-full"
              style={{ color: T.textMuted, touchAction: 'manipulation' }}>
              ✕
            </button>
          </div>

          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Entry Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['Cr', 'Dr'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setType(t); setGoesToBank(null) }}
                  className="min-h-[44px] px-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: type === t ? (t === 'Cr' ? '#f0fdf4' : '#fef2f2') : T.bg,
                    border: `1px solid ${type === t ? (t === 'Cr' ? '#86efac' : '#fca5a5') : T.border}`,
                    color: type === t ? (t === 'Cr' ? '#166534' : '#dc2626') : T.textSub,
                    touchAction: 'manipulation',
                  }}>
                  {t === 'Cr' ? '📥 Credit (Cash In)' : '📤 Debit (Cash Out)'}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Amount (₹)</label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min="1"
              className={`${inputCls} ${inputHCls}`}
              style={inputBaseStyle}/>
          </div>

          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'Cr' ? 'e.g. Daily collection, Fees received…' : 'e.g. Petty cash, Staff expense…'}
              className={`${inputCls} ${inputHCls}`}
              style={inputBaseStyle}/>
          </div>

          {type === 'Cr' && (
            <div className="mb-5">
              <label className={labelCls} style={{ color: T.textSub }}>Will this amount go to the bank?</label>
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    onClick={() => setGoesToBank(val)}
                    className="min-h-[44px] px-3 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: goesToBank === val ? (val ? '#eff6ff' : T.bg) : T.bg,
                      border: `1px solid ${goesToBank === val ? (val ? '#bfdbfe' : T.borderHover) : T.border}`,
                      color: goesToBank === val ? (val ? '#1d4ed8' : T.text) : T.textSub,
                      touchAction: 'manipulation',
                    }}>
                    {val ? '🏦 Yes, to bank' : '✋ No, stays out'}
                  </button>
                ))}
              </div>
              {goesToBank === true && (
                <p className="text-[10px] mt-2 px-3 py-2 rounded-xl"
                  style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                  Two entries will be recorded: one for this debit and one marking it as banked.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl"
              style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
              <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 min-h-[48px] rounded-xl text-sm"
              style={{ border: `1px solid ${T.border}`, color: T.textSub, touchAction: 'manipulation' }}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 min-h-[48px] rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: T.accent, color: 'white', touchAction: 'manipulation' }}>
              {saving
                ? <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Saving…
                  </span>
                : '✓ Add Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function localMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}
function toDateInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

// ─── COLLAPSIBLE TABLE WRAPPER ────────────────────────────────────────────────
function CollapsibleTable({ toggleLabel, open, onToggle, children }: {
  toggleLabel: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-all"
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          touchAction: 'manipulation',
          minHeight: '52px',
        }}>
        <div className="flex items-center gap-2 flex-wrap min-w-0 pr-2">
          {toggleLabel}
        </div>
        <span className="ml-2 shrink-0 text-sm" style={{ color: T.textMuted }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-2xl overflow-hidden"
          style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function AdminLedgerPage() {
  const router = useRouter()

  const [loading, setLoading]             = useState(true)
  const [userName, setUserName]           = useState('')
  const [showCashModal, setShowCashModal] = useState(false)
  const [view, setView]                   = useState<'glance' | 'detailed'>('glance')

  const [showCashLog, setShowCashLog]     = useState(false)
  const [showAdmTable, setShowAdmTable]   = useState(false)
  const [showExpTable, setShowExpTable]   = useState(false)

  const [admissionFees, setAdmissionFees] = useState<any[]>([])
  const [dueFees, setDueFees]             = useState<any[]>([])
  const [expenses, setExpenses]           = useState<any[]>([])
  const [cashLog, setCashLog]             = useState<any[]>([])
  const [admissions, setAdmissions]       = useState<any[]>([])
  const [expensesTable, setExpensesTable] = useState<any[]>([])

  const [admStartDate, setAdmStartDate]   = useState('')
  const [expStartDate, setExpStartDate]   = useState('')

  const [realBankBalance, setRealBankBalance]   = useState('0')
  const [extraPaid, setExtraPaid]               = useState('0')
  const [extraPaidComment, setExtraPaidComment] = useState('')
  const [extraPaidPerson, setExtraPaidPerson]   = useState('')
  const [notes, setNotes]                       = useState('')
  const [savingConfig, setSavingConfig]         = useState(false)
  const [configSaved, setConfigSaved]           = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, role')
        .eq('id', sessionData.session.user.id)
        .single()
      if (profile?.role !== 'admin') { router.push('/'); return }
      setUserName(profile?.name || '')
      await fetchAll()
      setLoading(false)
    }
    init()
  }, [])

  async function fetchAllRows<T>(
    table: string, columns: string,
    orderBy?: { column: string; ascending: boolean }
  ): Promise<T[]> {
    const PAGE_SIZE = 1000
    let allRows: T[] = [], from = 0
    while (true) {
      let query = supabase
        .schema('library_management')
        .from(table).select(columns)
        .range(from, from + PAGE_SIZE - 1)
      if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending })
      const { data, error } = await query
      if (error) throw new Error(`${table}: ${error.message}`)
      allRows = allRows.concat((data as T[]) || [])
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    return allRows
  }

  async function fetchAllRowsView<T>(
    view: string, columns: string,
    orderBy?: { column: string; ascending: boolean }
  ): Promise<T[]> {
    const PAGE_SIZE = 1000
    let allRows: T[] = [], from = 0
    while (true) {
      let query = supabase.from(view).select(columns).range(from, from + PAGE_SIZE - 1)
      if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending })
      const { data, error } = await query
      if (error) throw new Error(`${view}: ${error.message}`)
      allRows = allRows.concat((data as T[]) || [])
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }
    return allRows
  }

  async function fetchAll() {
    const [admRows, dueRows, expRows, cashRows, cfgRows, admissionRows, expTableRows] = await Promise.all([
      fetchAllRows<any>('admission_responses', 'fees_submitted, mode'),
      fetchAllRows<any>('due_submission', 'due_fees_submitted, due_fees_mode'),
      fetchAllRows<any>('expenses', 'Amount, Mode'),
      fetchAllRows<any>('cash_log', '*', { column: 'created_at', ascending: false }),
      fetchAllRows<any>('ledger_config', '*'),
      fetchAllRowsView<any>('v_admission_details', '*', { column: 'timestamp', ascending: false }),
      fetchAllRows<any>('expenses', '*', { column: 'created_at', ascending: false }),
    ])

    setAdmissionFees(admRows); setDueFees(dueRows); setExpenses(expRows)
    setCashLog(cashRows); setAdmissions(admissionRows); setExpensesTable(expTableRows)

    const maxCashDate = cashRows.length > 0
      ? cashRows.reduce((max: string, r: any) => r.created_at > max ? r.created_at : max, cashRows[0].created_at)
      : ''
    if (maxCashDate) {
      const d = toDateInput(new Date(maxCashDate))
      setAdmStartDate(d); setExpStartDate(d)
    }

    const c = cfgRows?.[0]
    if (c) {
      setRealBankBalance(c.real_bank_balance?.toString() || '0')
      setExtraPaid(c.extra_paid?.toString() || '0')
      setExtraPaidComment(c.extra_paid_comment || '')
      setExtraPaidPerson(c.extra_paid_person || '')
      setNotes(c.notes || '')
    }
  }

  const m = useMemo(() => {
    const cashFees =
      admissionFees.filter(r => r.mode === 'Cash').reduce((s, r) => s + (Number(r.fees_submitted) || 0), 0) +
      dueFees.filter(r => r.due_fees_mode === 'Cash').reduce((s, r) => s + (Number(r.due_fees_submitted) || 0), 0)
    const onlineFees =
      admissionFees.filter(r => r.mode === 'Online').reduce((s, r) => s + (Number(r.fees_submitted) || 0), 0) +
      dueFees.filter(r => r.due_fees_mode === 'Online').reduce((s, r) => s + (Number(r.due_fees_submitted) || 0), 0)
    const totalFees = cashFees + onlineFees

    const cashExpenses   = expenses.filter(r => r.Mode === 'Cash').reduce((s, r) => s + (r.Amount || 0), 0)
    const onlineExpenses = expenses.filter(r => r.Mode === 'Online').reduce((s, r) => s + (r.Amount || 0), 0)
    const totalExpenses  = cashExpenses + onlineExpenses

    const netProfit    = LAST_NET + totalFees - totalExpenses
    const cashReceived = cashLog.filter(r => r.type === 'Cr').reduce((s, r) => s + (r.amount || 0), 0)
    const cashDebited  = cashLog.filter(r => r.type === 'Dr').reduce((s, r) => s + (r.amount || 0), 0)
    const cashBanked   = cashLog.filter(r => r.type === 'Dr' && r.description === 'Bank').reduce((s, r) => s + (r.amount || 0), 0)
    const cashInHand   = cashReceived - cashDebited

    const expectedBankBalance = LAST_BANK_BALANCE + cashBanked + onlineFees - onlineExpenses
    const remainingToCollect  = netProfit - cashInHand - expectedBankBalance

    const realBank     = parseFloat(realBankBalance) || 0
    const extraPaidAmt = parseFloat(extraPaid) || 0
    const bankError    = realBank - expectedBankBalance
    const stillToCheck = bankError - extraPaidAmt

    return {
      cashFees, onlineFees, totalFees,
      cashExpenses, onlineExpenses, totalExpenses,
      netProfit, cashReceived, cashBanked, cashInHand,
      expectedBankBalance, remainingToCollect, bankError, stillToCheck,
    }
  }, [admissionFees, dueFees, expenses, cashLog, realBankBalance, extraPaid])

  const filteredAdmissions = useMemo(() => {
    if (!admStartDate) return admissions
    const from = localMidnight(admStartDate)
    return admissions.filter(r => {
      const ts  = r.timestamp ? new Date(r.timestamp) : null
      const due = r.due_fees_submitted_date ? new Date(r.due_fees_submitted_date) : null
      return (ts && ts >= from) || (due && due >= from)
    })
  }, [admissions, admStartDate])

  const admSummary = useMemo(() => {
    let totalPaid = 0, cashPaid = 0, onlinePaid = 0
    let totalDuePaid = 0, cashDuePaid = 0, onlineDuePaid = 0
    let totalDue = 0
    filteredAdmissions.forEach(r => {
      const paid = r.fees_submitted || 0
      totalPaid += paid
      if ((r.mode || '').toLowerCase() === 'cash')   cashPaid += paid
      if ((r.mode || '').toLowerCase() === 'online') onlinePaid += paid
      const duePaid = r.due_fees_submitted || 0
      if (duePaid > 0) {
        totalDuePaid += duePaid
        if ((r.due_fees_mode || '').toLowerCase() === 'cash')   cashDuePaid += duePaid
        if ((r.due_fees_mode || '').toLowerCase() === 'online') onlineDuePaid += duePaid
      }
      totalDue += r.due_fees || 0
    })
    return {
      count: filteredAdmissions.length,
      totalCollected: totalPaid + totalDuePaid,
      cashCollected: cashPaid + cashDuePaid,
      onlineCollected: onlinePaid + onlineDuePaid,
      totalDue,
    }
  }, [filteredAdmissions])

  const filteredExpenses = useMemo(() => {
    if (!expStartDate) return expensesTable
    const from = localMidnight(expStartDate)
    return expensesTable.filter(r => r.created_at && new Date(r.created_at) >= from)
  }, [expensesTable, expStartDate])

  const expSummary = useMemo(() => {
    let total = 0, cash = 0, online = 0
    filteredExpenses.forEach(r => {
      const amt = r.Amount || 0; total += amt
      if (r.Mode === 'Cash') cash += amt
      else if (r.Mode === 'Online') online += amt
    })
    return { total, cash, online, count: filteredExpenses.length }
  }, [filteredExpenses])

  async function saveConfig() {
    setSavingConfig(true)
    await supabase
      .schema('library_management')
      .from('ledger_config')
      .update({
        real_bank_balance:  parseFloat(realBankBalance) || 0,
        extra_paid:         parseFloat(extraPaid) || 0,
        extra_paid_comment: extraPaidComment || null,
        extra_paid_person:  extraPaidPerson || null,
        notes:              notes || null,
        updated_by:         userName,
        updated_at:         new Date().toISOString(),
      })
      .eq('id', 1)
    setSavingConfig(false); setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2500)
    await fetchAll()
  }

  if (loading) return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: '100dvh', background: T.bg }}>
      <div className="text-center">
        <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3"
          style={{ borderColor: T.accent, borderTopColor: 'transparent' }}/>
        <p className="text-sm" style={{ color: T.textMuted }}>Loading ledger…</p>
      </div>
    </div>
  )

  const balanced  = (v: number) => Math.abs(v) < 1
  const greenSet  = { color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' }
  const redSet    = { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
  const amberSet  = { color: '#92400e', bg: '#fefce8', border: '#fde68a' }
  const blueSet   = { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' }

  const cfgInputStyle: React.CSSProperties = { ...inputBaseStyle }

  return (
    <div
      className="min-h-screen"
      style={{
        background: T.bg,
        minHeight: '100dvh',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
      <div className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-medium hover:opacity-70"
              style={{ color: T.textSub, touchAction: 'manipulation' }}>
              ← Home
            </Link>
            <div>
              <h1 className="text-lg md:text-2xl font-bold"
                style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                🏦 Admin Ledger
              </h1>
              <p className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: T.textMuted }}>
                All-time reconciliation · Admin only
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Toggle */}
            <ViewToggle view={view} onChange={setView} />

            <button
              onClick={() => setShowCashModal(true)}
              className="flex items-center gap-2 px-4 rounded-xl text-sm font-semibold"
              style={{
                background: T.accent, color: 'white',
                boxShadow: `0 2px 12px ${T.accent}50`,
                minHeight: '44px',
                touchAction: 'manipulation',
              }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
              Cash Entry
            </button>
          </div>
        </div>

        {/* ══ GLANCE VIEW ══ */}
        {view === 'glance' && (
          <GlanceView m={m} balanced={balanced} />
        )}

        {/* ══ DETAILED VIEW ══ */}
        {view === 'detailed' && (
          <>
            {/* ══ SECTION 1: REVENUE ══ */}
            <Section title="Revenue — all-time fees collected">
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <MetricCard label="💵 Cash Fees"  value={fmt(m.cashFees)}   {...amberSet}/>
                <MetricCard label="📱 Online Fees" value={fmt(m.onlineFees)} {...blueSet}/>
                <MetricCard label="Total Fees"     value={fmt(m.totalFees)}  {...greenSet}/>
              </div>
            </Section>

            {/* ══ SECTION 2: EXPENSES ══ */}
            <Section title="Expenses — all-time">
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <MetricCard label="💵 Cash Exp"   value={fmt(m.cashExpenses)}   {...amberSet}/>
                <MetricCard label="📱 Online Exp" value={fmt(m.onlineExpenses)} {...blueSet}/>
                <MetricCard label="Total Exp"     value={fmt(m.totalExpenses)}  {...redSet}/>
              </div>
            </Section>

            {/* ══ SECTION 3: NET PROFIT ══ */}
            <Section title="Net Profit">
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <MetricCard label="Opening" value={fmt(LAST_NET)} color={T.textSub} sub="Constant"/>
                <MetricCard
                  label="Net Change"
                  value={fmtSigned(m.totalFees - m.totalExpenses)}
                  color={(m.totalFees - m.totalExpenses) >= 0 ? '#166534' : '#dc2626'}
                  formula="Fees − Expenses"/>
                <MetricCard
                  label="📈 Net Profit"
                  value={fmt(m.netProfit)}
                  formula="Opening + Fees − Exp"
                  color={m.netProfit >= 0 ? '#166534' : '#dc2626'}
                  bg={m.netProfit >= 0 ? '#f0fdf4' : '#fef2f2'}
                  border={m.netProfit >= 0 ? '#bbf7d0' : '#fecaca'}/>
              </div>
            </Section>

            {/* ══ SECTION 4: CASH FLOW ══ */}
            <Section title="Cash Flow — from cash log entries">
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <MetricCard label="📥 Received (Cr)" value={fmt(m.cashReceived)} sub="Sum of Cr entries" {...greenSet}/>
                <MetricCard label="🏦 Banked (Dr)"   value={fmt(m.cashBanked)}  sub="Sum of Dr·Bank"    {...blueSet}/>
                <MetricCard
                  label="💰 In Hand"
                  value={fmt(m.cashInHand)}
                  sub="Received − All Dr"
                  color={m.cashInHand >= 0 ? '#92400e' : '#dc2626'}
                  bg={m.cashInHand >= 0 ? '#fefce8' : '#fef2f2'}
                  border={m.cashInHand >= 0 ? '#fde68a' : '#fecaca'}/>
              </div>
            </Section>

            {/* ══ SECTION 5: BANK RECONCILIATION ══ */}
            <Section title="Bank Reconciliation">
              <div className="rounded-2xl p-4 md:p-5"
                style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 mb-6">
                  <MetricCard label="Opening Bank"  value={fmt(LAST_BANK_BALANCE)} color={T.textSub} sub="Constant"/>
                  <MetricCard label="Expected Bank" value={fmt(m.expectedBankBalance)} sub="Opening+Banked+Online−OnlineExp" {...blueSet}/>
                  <MetricCard
                    label="Remaining"
                    value={fmt(m.remainingToCollect)}
                    sub="Fees−InHand−ExpBank"
                    color={balanced(m.remainingToCollect) ? '#166534' : '#d97706'}
                    bg={balanced(m.remainingToCollect) ? '#f0fdf4' : '#fffbeb'}
                    border={balanced(m.remainingToCollect) ? '#bbf7d0' : '#fde68a'}/>
                </div>

                <div className="border-t mb-5" style={{ borderColor: T.border }}/>

                <p className="text-[10px] uppercase tracking-widest font-semibold mb-4" style={{ color: T.textMuted }}>
                  Editable Fields
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls} style={{ color: T.textSub }}>Real Bank Balance (₹)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={realBankBalance}
                      onChange={(e) => setRealBankBalance(e.target.value)}
                      placeholder="0"
                      className={`${inputCls} ${inputHCls}`}
                      style={cfgInputStyle}/>
                  </div>
                  <div>
                    <label className={labelCls} style={{ color: T.textSub }}>Extra Paid (₹)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={extraPaid}
                      onChange={(e) => setExtraPaid(e.target.value)}
                      placeholder="0"
                      className={`${inputCls} ${inputHCls}`}
                      style={cfgInputStyle}/>
                  </div>
                  <div>
                    <label className={labelCls} style={{ color: T.textSub }}>Extra Paid — Person</label>
                    <input
                      type="text"
                      value={extraPaidPerson}
                      onChange={(e) => setExtraPaidPerson(e.target.value)}
                      placeholder="Who paid extra?"
                      className={`${inputCls} ${inputHCls}`}
                      style={cfgInputStyle}/>
                  </div>
                  <div>
                    <label className={labelCls} style={{ color: T.textSub }}>Extra Paid — Reason</label>
                    <input
                      type="text"
                      value={extraPaidComment}
                      onChange={(e) => setExtraPaidComment(e.target.value)}
                      placeholder="Why was it paid?"
                      className={`${inputCls} ${inputHCls}`}
                      style={cfgInputStyle}/>
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls} style={{ color: T.textSub }}>Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Any observations or notes…"
                      className={`${inputCls} py-2.5 resize-none`}
                      style={cfgInputStyle}/>
                  </div>
                </div>

                <button
                  onClick={saveConfig}
                  disabled={savingConfig}
                  className="mt-4 px-6 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                  style={{
                    background: configSaved ? '#16a34a' : T.accent,
                    color: 'white',
                    minHeight: '44px',
                    touchAction: 'manipulation',
                  }}>
                  {savingConfig ? 'Saving…' : configSaved ? '✓ Saved!' : 'Save Changes'}
                </button>

                <div className="grid grid-cols-2 gap-2 md:gap-3 mt-6">
                  <div className="rounded-xl p-4" style={{
                    background: balanced(m.bankError) ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${balanced(m.bankError) ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>Bank Error</p>
                    <p className="text-xl font-bold" style={{ color: balanced(m.bankError) ? '#166534' : '#dc2626', fontFamily: "'Georgia', serif" }}>
                      {fmtSigned(m.bankError)}
                    </p>
                    <p className="text-[9px] mt-1 font-mono" style={{ color: T.textMuted }}>Real − Expected</p>
                    {balanced(m.bankError) && <p className="text-[10px] mt-1 font-medium" style={{ color: '#166534' }}>✓ Balanced</p>}
                  </div>
                  <div className="rounded-xl p-4" style={{
                    background: balanced(m.stillToCheck) ? '#f0fdf4' : '#fff7ed',
                    border: `1px solid ${balanced(m.stillToCheck) ? '#bbf7d0' : '#fed7aa'}`,
                  }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>Still To Check</p>
                    <p className="text-xl font-bold" style={{ color: balanced(m.stillToCheck) ? '#166534' : '#c2410c', fontFamily: "'Georgia', serif" }}>
                      {fmtSigned(m.stillToCheck)}
                    </p>
                    <p className="text-[9px] mt-1 font-mono" style={{ color: T.textMuted }}>Bank Error − Extra Paid</p>
                    {balanced(m.stillToCheck) && <p className="text-[10px] mt-1 font-medium" style={{ color: '#166534' }}>✓ All accounted for</p>}
                  </div>
                </div>

                {notes && (
                  <div className="mt-4 px-4 py-3 rounded-xl"
                    style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.accent }}>Notes</p>
                    <p className="text-sm" style={{ color: T.text }}>{notes}</p>
                  </div>
                )}
              </div>
            </Section>

            {/* ══ SECTION 6: CASH LOG (collapsible) ══ */}
            <CollapsibleTable
              open={showCashLog}
              onToggle={() => setShowCashLog(v => !v)}
              toggleLabel={
                <>
                  <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: T.textMuted }}>Cash Log</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` }}>
                    {cashLog.length} entries
                  </span>
                  <span className="text-xs font-semibold" style={{ color: '#166534' }}>Cr: {fmt(m.cashReceived)}</span>
                  <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>Dr: {fmt(m.cashBanked)}</span>
                  <span className="text-xs font-semibold" style={{ color: m.cashInHand >= 0 ? '#92400e' : '#dc2626' }}>
                    In Hand: {fmt(m.cashInHand)}
                  </span>
                </>
              }>
              {cashLog.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-4xl mb-2">📋</p>
                  <p className="text-sm" style={{ color: T.textMuted }}>No cash log entries yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <table className="w-full text-sm" style={{ minWidth: '480px' }}>
                    <thead>
                      <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                        {['#', 'Date & Time', 'Type', 'Amount', 'Description', 'By'].map(h => (
                          <th key={h} className="text-left px-3 py-3 text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap"
                            style={{ color: T.textMuted }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cashLog.map((row, i) => (
                        <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td className="px-3 py-3 text-xs" style={{ color: T.textMuted }}>{i + 1}</td>
                          <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: T.textSub }}>{formatDateTime(row.created_at)}</td>
                          <td className="px-3 py-3">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{
                                background: row.type === 'Cr' ? '#f0fdf4' : '#fef2f2',
                                color:      row.type === 'Cr' ? '#166534' : '#dc2626',
                                border:     `1px solid ${row.type === 'Cr' ? '#bbf7d0' : '#fecaca'}`,
                              }}>
                              {row.type === 'Cr' ? '📥 Cr' : '📤 Dr'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-sm font-semibold" style={{ color: row.type === 'Cr' ? '#166534' : '#dc2626' }}>
                            {fmt(row.amount)}
                          </td>
                          <td className="px-3 py-3 text-xs" style={{ color: T.text }}>
                            {row.description || <span style={{ color: T.textMuted }}>—</span>}
                          </td>
                          <td className="px-3 py-3 text-xs" style={{ color: T.textSub }}>{row.created_by}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                        <td colSpan={3} className="px-3 py-3 text-xs font-semibold" style={{ color: T.textMuted }}>Totals</td>
                        <td colSpan={3} className="px-3 py-3">
                          <div className="flex gap-3 text-xs font-semibold flex-wrap">
                            <span style={{ color: '#166534' }}>Cr: {fmt(m.cashReceived)}</span>
                            <span style={{ color: '#dc2626' }}>Dr: {fmt(cashLog.filter(r => r.type === 'Dr').reduce((s, r) => s + (r.amount || 0), 0))}</span>
                            <span style={{ color: m.cashInHand >= 0 ? '#92400e' : '#dc2626' }}>In Hand: {fmt(m.cashInHand)}</span>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CollapsibleTable>

            {/* ══ SECTION 7: ADMISSIONS TABLE (collapsible) ══ */}
            <CollapsibleTable
              open={showAdmTable}
              onToggle={() => setShowAdmTable(v => !v)}
              toggleLabel={
                <>
                  <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: T.textMuted }}>Admissions</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` }}>
                    {filteredAdmissions.length} records
                  </span>
                  <span className="text-xs font-semibold" style={{ color: '#166534' }}>
                    Collected: {fmt(admSummary.totalCollected)}
                  </span>
                  {admSummary.totalDue > 0 && (
                    <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>
                      Due: {fmt(admSummary.totalDue)}
                    </span>
                  )}
                </>
              }>
              <div className="p-4 border-b" style={{ borderColor: T.border }}>
                <div className="flex items-center gap-3 flex-wrap mb-4">
                  <div>
                    <label className={labelCls} style={{ color: T.textSub }}>From Date</label>
                    <input
                      type="date"
                      value={admStartDate}
                      onChange={(e) => setAdmStartDate(e.target.value)}
                      className="px-3 py-2 rounded-xl focus:outline-none"
                      style={{ ...inputBaseStyle, minHeight: '44px' }}/>
                  </div>
                  <div className="self-end pb-1">
                    <span className="text-xs" style={{ color: T.textMuted }}>{filteredAdmissions.length} records</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-xl p-3" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>Records</p>
                    <p className="text-lg font-bold" style={{ color: T.accent, fontFamily: "'Georgia', serif" }}>{admSummary.count}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#166534' }}>Collected</p>
                    <p className="text-lg font-bold" style={{ color: '#16a34a', fontFamily: "'Georgia', serif" }}>{fmt(admSummary.totalCollected)}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#4ade80' }}>💵 {fmt(admSummary.cashCollected)} · 📱 {fmt(admSummary.onlineCollected)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#991b1b' }}>Pending Due</p>
                    <p className="text-lg font-bold" style={{ color: '#dc2626', fontFamily: "'Georgia', serif" }}>{fmt(admSummary.totalDue)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: T.textMuted }}>Type</p>
                    <p className="text-xs font-bold mt-1" style={{ color: '#166534' }}>New: {filteredAdmissions.filter(r => r.admission === 'New').length}</p>
                    <p className="text-xs font-bold" style={{ color: T.accent }}>Renew: {filteredAdmissions.filter(r => r.admission === 'Renew').length}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full text-sm" style={{ minWidth: '900px' }}>
                  <thead>
                    <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                      {['#', 'Reg ID', 'Name', 'Type', 'Recorded On', 'Shift', 'Fees', 'Paid', 'Mode', 'Due Paid', 'Due Mode', 'Pending', 'Status'].map(h => (
                        <th key={h} className="text-left px-3 py-3 text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap"
                          style={{ color: T.textMuted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdmissions.map((row, i) => (
                      <tr key={row.register_id + i}
                        className="transition-colors"
                        style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td className="px-3 py-3 text-xs" style={{ color: T.textMuted }}>{i + 1}</td>
                        <td className="px-3 py-3 text-xs font-mono font-medium" style={{ color: T.accent }}>
                          <Link href={`/student/${row.mobile_number}`} className="hover:underline">{row.register_id}</Link>
                        </td>
                        <td className="px-3 py-3 text-sm font-medium whitespace-nowrap" style={{ color: T.text }}>
                          <Link href={`/student/${row.mobile_number}`} className="hover:underline">{row.name}</Link>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              background: row.admission === 'New' ? '#f0fdf4' : T.accentLight,
                              color: row.admission === 'New' ? '#166534' : T.accent,
                              border: `1px solid ${row.admission === 'New' ? '#bbf7d0' : T.accentBorder}`,
                            }}>
                            {row.admission || 'New'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: T.textSub }}>
                          {row.timestamp ? new Date(row.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: T.textSub }}>{row.shift}</td>
                        <td className="px-3 py-3 text-xs font-medium" style={{ color: T.text }}>{fmt(row.final_fees || 0)}</td>
                        <td className="px-3 py-3 text-xs font-medium" style={{ color: '#16a34a' }}>{fmt(row.fees_submitted || 0)}</td>
                        <td className="px-3 py-3">
                          {row.mode
                            ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: row.mode === 'Cash' ? '#fefce8' : '#eff6ff', color: row.mode === 'Cash' ? '#854d0e' : '#1d4ed8', border: `1px solid ${row.mode === 'Cash' ? '#fde68a' : '#bfdbfe'}` }}>
                                {row.mode}
                              </span>
                            : <span style={{ color: T.textMuted }}>—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs font-medium" style={{ color: (row.due_fees_submitted || 0) > 0 ? '#16a34a' : T.textMuted }}>
                          {(row.due_fees_submitted || 0) > 0 ? fmt(row.due_fees_submitted) : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {row.due_fees_mode
                            ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: row.due_fees_mode === 'Cash' ? '#fefce8' : '#eff6ff', color: row.due_fees_mode === 'Cash' ? '#854d0e' : '#1d4ed8', border: `1px solid ${row.due_fees_mode === 'Cash' ? '#fde68a' : '#bfdbfe'}` }}>
                                {row.due_fees_mode}
                              </span>
                            : <span style={{ color: T.textMuted }}>—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs font-medium" style={{ color: (row.due_fees || 0) > 0 ? '#dc2626' : T.textMuted }}>
                          {(row.due_fees || 0) > 0 ? fmt(row.due_fees) : '—'}
                        </td>
                        <td className="px-3 py-3"><StatusBadge status={row.status}/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleTable>

            {/* ══ SECTION 8: EXPENSES TABLE (collapsible) ══ */}
            <CollapsibleTable
              open={showExpTable}
              onToggle={() => setShowExpTable(v => !v)}
              toggleLabel={
                <>
                  <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: T.textMuted }}>Expenses</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` }}>
                    {filteredExpenses.length} records
                  </span>
                  <span className="text-xs font-semibold" style={{ color: '#dc2626' }}>Total: {fmt(expSummary.total)}</span>
                  <span className="text-xs font-semibold" style={{ color: '#92400e' }}>💵 {fmt(expSummary.cash)}</span>
                  <span className="text-xs font-semibold" style={{ color: '#1d4ed8' }}>📱 {fmt(expSummary.online)}</span>
                </>
              }>
              <div className="p-4 border-b" style={{ borderColor: T.border }}>
                <div className="flex items-center gap-3 flex-wrap mb-4">
                  <div>
                    <label className={labelCls} style={{ color: T.textSub }}>From Date</label>
                    <input
                      type="date"
                      value={expStartDate}
                      onChange={(e) => setExpStartDate(e.target.value)}
                      className="px-3 py-2 rounded-xl focus:outline-none"
                      style={{ ...inputBaseStyle, minHeight: '44px' }}/>
                  </div>
                  <div className="self-end pb-1">
                    <span className="text-xs" style={{ color: T.textMuted }}>{filteredExpenses.length} records</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl p-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#991b1b' }}>Total Spent</p>
                    <p className="text-lg font-bold" style={{ color: '#dc2626', fontFamily: "'Georgia', serif" }}>{fmt(expSummary.total)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#854d0e' }}>💵 Cash</p>
                    <p className="text-lg font-bold" style={{ color: '#92400e', fontFamily: "'Georgia', serif" }}>{fmt(expSummary.cash)}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <p className="text-[10px] uppercase tracking-widest font-medium mb-1" style={{ color: '#1d4ed8' }}>📱 Online</p>
                    <p className="text-lg font-bold" style={{ color: '#1d4ed8', fontFamily: "'Georgia', serif" }}>{fmt(expSummary.online)}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <table className="w-full text-sm" style={{ minWidth: '480px' }}>
                  <thead>
                    <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                      {['#', 'Date & Time', 'Description', 'Amount', 'Mode', 'By'].map(h => (
                        <th key={h} className="text-left px-3 py-3 text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap"
                          style={{ color: T.textMuted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((row, i) => (
                      <tr key={row.id}
                        className="transition-colors"
                        style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td className="px-3 py-3 text-xs" style={{ color: T.textMuted }}>{i + 1}</td>
                        <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color: T.textSub }}>{formatDateTime(row.created_at)}</td>
                        <td className="px-3 py-3 text-xs" style={{ color: T.text, maxWidth: '200px' }}>{row.Description}</td>
                        <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#dc2626' }}>{fmt(row.Amount || 0)}</td>
                        <td className="px-3 py-3">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              background: row.Mode === 'Cash' ? '#fefce8' : '#eff6ff',
                              color: row.Mode === 'Cash' ? '#854d0e' : '#1d4ed8',
                              border: `1px solid ${row.Mode === 'Cash' ? '#fde68a' : '#bfdbfe'}`,
                            }}>
                            {row.Mode}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: T.textSub }}>{row.Created_by}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleTable>
          </>
        )}

      </div>

      {showCashModal && (
        <AddCashLogModal
          userName={userName}
          onClose={() => setShowCashModal(false)}
          onSuccess={() => fetchAll()}
        />
      )}
    </div>
  )
}
