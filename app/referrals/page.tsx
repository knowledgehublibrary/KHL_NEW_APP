'use client'

// Suggested path in your Next.js app: app/referrals/page.tsx

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── THEME (matches your dashboard) ───────────────────────────────────────────
const T = {
  bg: '#faf8f5', surface: '#ffffff',
  border: '#ede8e1', borderHover: '#ddd4c8',
  accent: '#c47b3a', accentLight: '#fdf0e4', accentBorder: '#f0d4b0',
  text: '#1c1917', textSub: '#78716c', textMuted: '#a8a29e',
}

// ─── HELPERS ───────────────────────────────────────────────────────────────
function getProxyUrl(url?: string | null) {
  if (!url) return ''
  return `/api/image?url=${encodeURIComponent(url)}`
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── TYPES ─────────────────────────────────────────────────────────────────
type ReferralRow = {
  id: number
  referrer_mobile: string
  referred_mobile: string
  referred_reg_id: string | null
  referrer_reg_id: string | null
  amount: number
  status: string
  applied_at: string | null
  created_at?: string | null
}

type StudentLite = {
  name: string
  mobile_number: string
  image_url?: string | null
  status?: string
}

// ─── STATUS BADGE ──────────────────────────────────────────────────────────
function ReferralStatusBadge({ status }: { status: string }) {
  const isApplied = status === 'applied'
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0"
      style={isApplied
        ? { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }
        : { background: '#fefce8', color: '#854d0e', border: '1px solid #fde047' }}
    >
      {isApplied ? '✓ Applied' : '⏳ Pending'}
    </span>
  )
}

// ─── PERSON CHIP (clickable, links to student detail page) ───────────────────
function PersonChip({ student, mobile }: { student?: StudentLite; mobile: string }) {
  return (
    <Link href={`/student/${mobile}`} className="flex items-center gap-2 group min-w-0" style={{ textDecoration: 'none' }}>
      <img
        loading="lazy"
        src={getProxyUrl(student?.image_url) || '/default-avatar.png'}
        onError={(e) => { e.currentTarget.src = '/default-avatar.png' }}
        className="w-8 h-8 rounded-lg object-cover shrink-0"
        style={{ border: `1px solid ${T.border}` }}
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate group-hover:underline" style={{ color: T.text }}>
          {student?.name || 'Unknown'}
        </p>
        <p className="text-[10px] truncate" style={{ color: T.textMuted }}>{mobile}</p>
      </div>
    </Link>
  )
}

// ─── FLAT VIEW ROW CARD ────────────────────────────────────────────────────
function ReferralRowCard({ row, referrer, referred }: {
  row: ReferralRow; referrer?: StudentLite; referred?: StudentLite
}) {
  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <PersonChip student={referrer} mobile={row.referrer_mobile} />
          <span className="text-sm shrink-0" style={{ color: T.textMuted }}>→</span>
          <PersonChip student={referred} mobile={row.referred_mobile} />
        </div>
        <ReferralStatusBadge status={row.status} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
        <div>
          <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: T.textMuted }}>Amount</p>
          <p className="text-sm font-bold mt-0.5" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>₹{row.amount}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: T.textMuted }}>Earned via Reg ID</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: T.textSub }}>{row.referred_reg_id || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: T.textMuted }}>Redeemed via Reg ID</p>
          <p className="text-xs font-medium mt-0.5" style={{ color: T.textSub }}>{row.referrer_reg_id || '—'}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest font-medium" style={{ color: T.textMuted }}>
            {row.status === 'applied' ? 'Applied On' : 'Created'}
          </p>
          <p className="text-xs font-medium mt-0.5" style={{ color: T.textSub }}>
            {formatDate(row.status === 'applied' ? row.applied_at : row.created_at)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── GROUPED-BY-REFERRER CARD ──────────────────────────────────────────────
function ReferrerGroupCard({ referrerMobile, referrer, rows, studentMap }: {
  referrerMobile: string; referrer?: StudentLite; rows: ReferralRow[]; studentMap: Record<string, StudentLite>
}) {
  const [expanded, setExpanded] = useState(false)
  const pendingTotal = rows.filter(r => r.status !== 'applied').reduce((sum, r) => sum + (r.amount || 0), 0)
  const appliedTotal = rows.filter(r => r.status === 'applied').reduce((sum, r) => sum + (r.amount || 0), 0)

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <PersonChip student={referrer} mobile={referrerMobile} />
        <div className="flex items-center gap-2 shrink-0">
          {pendingTotal > 0 && (
            <span className="text-[10px] font-semibold px-2 py-1 rounded-lg" style={{ background: '#fefce8', color: '#854d0e', border: '1px solid #fde047' }}>
              ⏳ ₹{pendingTotal}
            </span>
          )}
          {appliedTotal > 0 && (
            <span className="text-[10px] font-semibold px-2 py-1 rounded-lg" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>
              ✓ ₹{appliedTotal}
            </span>
          )}
          <span className="text-[10px]" style={{ color: T.textMuted }}>{rows.length} referral{rows.length !== 1 ? 's' : ''}</span>
          <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: T.textMuted }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="p-3 pt-0 space-y-2">
          {rows.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl flex-wrap" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
              <PersonChip student={studentMap[r.referred_mobile]} mobile={r.referred_mobile} />
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-xs font-bold" style={{ color: T.text }}>₹{r.amount}</p>
                  <p className="text-[9px]" style={{ color: T.textMuted }}>
                    {formatDate(r.status === 'applied' ? r.applied_at : r.created_at)}
                  </p>
                </div>
                <ReferralStatusBadge status={r.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── STAT CARD ──────────────────────────────────────────────────────────────
function StatCard({ label, value, color, active, onClick }: {
  label: string; value: string | number; color: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="rounded-2xl p-3 md:p-4 text-left relative overflow-hidden transition-all duration-150"
      style={{
        background: active ? `${color}10` : T.surface,
        border: `1px solid ${active ? color + '40' : T.border}`,
        transform: active ? 'scale(1.03)' : 'scale(1)',
        boxShadow: active ? `0 4px 16px ${color}20` : '0 1px 3px rgba(0,0,0,0.05)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {active && <div className="absolute top-0 inset-x-0 h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />}
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: active ? color : T.textMuted }}>{label}</p>
      <p className="text-xl md:text-2xl font-bold mt-0.5" style={{ fontFamily: "'Georgia', serif", color: active ? color : T.text }}>{value}</p>
    </button>
  )
}

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────
export default function ReferralsPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState('')
  const [authChecked, setAuthChecked] = useState(false)

  const [rows, setRows] = useState<ReferralRow[]>([])
  const [studentMap, setStudentMap] = useState<Record<string, StudentLite>>({})

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'applied'>('all')
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat')
  const [search, setSearch] = useState('')

  // ── Auth + role check ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.session.user.id).single()
      setRole(profile?.role || '')
      setAuthChecked(true)
    })
  }, [router])

  const isPrivileged = role === 'admin' || role === 'manager' || role === 'partner'

  // ── Fetch referral data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!authChecked || !isPrivileged) { if (authChecked) setLoading(false); return }

    const load = async () => {
      setLoading(true)
      const { data: referralData, error } = await supabase
        .schema('library_management')
        .from('referral_discounts')
        .select('*')
        .order('id', { ascending: false })

      if (error || !referralData) { setLoading(false); return }
      setRows(referralData as ReferralRow[])

      const mobiles = Array.from(new Set(
        (referralData as ReferralRow[]).flatMap(r => [r.referrer_mobile, r.referred_mobile])
      ))

      if (mobiles.length > 0) {
        const { data: students } = await supabase
          .from('v_student_summary')
          .select('name, mobile_number, image_url, status')
          .in('mobile_number', mobiles)

        const map: Record<string, StudentLite> = {}
        for (const s of students || []) map[s.mobile_number] = s
        setStudentMap(map)
      }

      setLoading(false)
    }
    load()
  }, [authChecked, isPrivileged])

  // ── Stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const pendingRows = rows.filter(r => r.status !== 'applied')
    const appliedRows = rows.filter(r => r.status === 'applied')
    return {
      total: rows.length,
      pendingCount: pendingRows.length,
      appliedCount: appliedRows.length,
      pendingAmount: pendingRows.reduce((s, r) => s + (r.amount || 0), 0),
      appliedAmount: appliedRows.reduce((s, r) => s + (r.amount || 0), 0),
      uniqueReferrers: new Set(rows.map(r => r.referrer_mobile)).size,
    }
  }, [rows])

  // ── Filter + search ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (statusFilter === 'pending' && r.status === 'applied') return false
      if (statusFilter === 'applied' && r.status !== 'applied') return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      const referrer = studentMap[r.referrer_mobile]
      const referred = studentMap[r.referred_mobile]
      return (
        r.referrer_mobile.includes(q) ||
        r.referred_mobile.includes(q) ||
        referrer?.name?.toLowerCase().includes(q) ||
        referred?.name?.toLowerCase().includes(q)
      )
    })
  }, [rows, statusFilter, search, studentMap])

  // ── Grouped data ────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, ReferralRow[]>()
    for (const r of filtered) {
      const arr = map.get(r.referrer_mobile) || []
      arr.push(r)
      map.set(r.referrer_mobile, arr)
    }
    // sort groups by total pending amount desc, then applied desc
    return Array.from(map.entries()).sort((a, b) => {
      const pendingA = a[1].filter(r => r.status !== 'applied').reduce((s, r) => s + r.amount, 0)
      const pendingB = b[1].filter(r => r.status !== 'applied').reduce((s, r) => s + r.amount, 0)
      return pendingB - pendingA
    })
  }, [filtered])

  // ── Access gates ────────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
        <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: T.accent, borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!isPrivileged) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg }}>
        <div className="text-center px-6">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-sm font-semibold mb-1" style={{ color: T.text }}>Access Restricted</p>
          <p className="text-xs mb-4" style={{ color: T.textMuted }}>You don't have permission to view referral tracking.</p>
          <Link href="/" className="text-sm font-medium" style={{ color: T.accent }}>← Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }} />

      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">

        {/* Header */}
        <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: T.text, fontFamily: "'Georgia', serif", letterSpacing: '-0.5px' }}>
              🤝 Referral Tracking
            </h1>
            <p className="text-[10px] mt-1 tracking-[0.2em] uppercase font-medium" style={{ color: T.textMuted }}>
              Who referred whom · claimed & pending status
            </p>
          </div>
          <Link href="/" className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
            ← Dashboard
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-6">
          <StatCard label="Total Referrals" value={stats.total} color={T.accent} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          <StatCard label="Pending" value={`₹${stats.pendingAmount}`} color="#d97706" active={statusFilter === 'pending'} onClick={() => setStatusFilter('pending')} />
          <StatCard label="Applied" value={`₹${stats.appliedAmount}`} color="#16a34a" active={statusFilter === 'applied'} onClick={() => setStatusFilter('applied')} />
          <StatCard label="Unique Referrers" value={stats.uniqueReferrers} color="#0284c7" />
        </div>

        {/* Search + view toggle */}
        <div className="flex gap-3 mb-5 flex-wrap items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or mobile…"
            className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl focus:outline-none"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }}
          />
          <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
            <button
              onClick={() => setViewMode('flat')}
              className="px-4 py-2.5 text-xs font-semibold"
              style={{ background: viewMode === 'flat' ? T.accentLight : T.surface, color: viewMode === 'flat' ? T.accent : T.textSub }}
            >
              📋 Flat List
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className="px-4 py-2.5 text-xs font-semibold"
              style={{ background: viewMode === 'grouped' ? T.accentLight : T.surface, color: viewMode === 'grouped' ? T.accent : T.textSub, borderLeft: `1px solid ${T.border}` }}
            >
              👥 By Referrer
            </button>
          </div>
        </div>

        {/* Content */}
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3" style={{ borderColor: T.accent, borderTopColor: 'transparent' }} />
            <p className="text-sm" style={{ color: T.textMuted }}>Loading referrals…</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">🤝</p>
            <p className="text-sm" style={{ color: T.textMuted }}>No referrals found</p>
          </div>
        )}

        {!loading && filtered.length > 0 && viewMode === 'flat' && (
          <div className="space-y-3">
            {filtered.map(row => (
              <ReferralRowCard
                key={row.id}
                row={row}
                referrer={studentMap[row.referrer_mobile]}
                referred={studentMap[row.referred_mobile]}
              />
            ))}
          </div>
        )}

        {!loading && filtered.length > 0 && viewMode === 'grouped' && (
          <div className="space-y-3">
            {grouped.map(([referrerMobile, groupRows]) => (
              <ReferrerGroupCard
                key={referrerMobile}
                referrerMobile={referrerMobile}
                referrer={studentMap[referrerMobile]}
                rows={groupRows}
                studentMap={studentMap}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
