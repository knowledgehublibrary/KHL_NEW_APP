'use client'

// Place at: app/seatmap/page.tsx

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

const T = {
  bg: '#faf8f5', surface: '#ffffff',
  border: '#ede8e1',
  accent: '#c47b3a', accentLight: '#fdf0e4', accentBorder: '#f0d4b0',
  text: '#1c1917', textSub: '#78716c', textMuted: '#a8a29e',
}

const SHIFT_MAP: Record<string, string> = {
  '6 AM - 12 PM': 'M',
  '12 PM - 6 PM': 'A',
  '6 PM - 11 PM': 'E',
}

type SlotOccupant = {
  name: string
  mobile: string
  expiry: string
  status: string
}

type SeatSlot = {
  M: SlotOccupant[]
  A: SlotOccupant[]
  E: SlotOccupant[]
}

// Frozen students are intentionally excluded — they don't occupy a seat
function isVisible(status: string) {
  const s = status?.toLowerCase() || ''
  return s.includes('active') || s.includes('expired')
}

// Among multiple occupants, pick the one with the latest expiry to display
function latestOccupant(occupants: SlotOccupant[]): SlotOccupant | null {
  if (!occupants.length) return null
  return occupants.reduce((a, b) =>
    new Date(a.expiry) >= new Date(b.expiry) ? a : b
  )
}

function slotColor(occupants: SlotOccupant[]): { bg: string; color: string; border: string } {
  if (!occupants.length) return { bg: '#f1f5f9', color: '#94a3b8', border: '#e2e8f0' }
  // Conflict → yellow (takes visual precedence over blocked)
  if (occupants.length > 1) return { bg: '#fef9c3', color: '#854d0e', border: '#fde68a' }
  // Single blocked student → red
  if (occupants[0].status?.toLowerCase().includes('expired')) {
    return { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
  }
  // Normal occupied → green
  return { bg: '#dcfce7', color: '#166534', border: '#86efac' }
}

export default function SeatMapPage() {
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [shiftView, setShiftView] = useState<'all' | 'M' | 'A' | 'E'>('all')
  const [search, setSearch] = useState('')
  const [showConflictsModal, setShowConflictsModal] = useState(false)
  const [showUnreservedModal, setShowUnreservedModal] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('v_student_summary')
      .select('name, mobile_number, latest_seat, latest_shift, status, latest_expiry')
      .order('latest_seat', { ascending: true })
    if (!error) setRecords((data || []).filter(r => isVisible(r.status)))
    setLoading(false)
  }

  const unreservedStudents = useMemo(() =>
    records.filter(r => { const n = parseInt(r.latest_seat); return isNaN(n) || n === 0 })
  , [records])

  const seatMap = useMemo(() => {
    const map: Record<number, SeatSlot> = {}
    for (let i = 1; i <= 92; i++) map[i] = { M: [], A: [], E: [] }
    records.forEach(rec => {
      const seatNum = parseInt(rec.latest_seat)
      if (isNaN(seatNum) || seatNum < 1 || seatNum > 92) return
      const shifts = (rec.latest_shift || '').split(', ').map((x: string) => x.trim())
      const occupant: SlotOccupant = {
        name: rec.name?.split(' ').slice(0, 2).join(' ') || '',
        mobile: rec.mobile_number,
        expiry: rec.latest_expiry || '',
        status: rec.status || '',
      }
      shifts.forEach((shift: string) => {
        const key = SHIFT_MAP[shift] as 'M' | 'A' | 'E'
        if (key) map[seatNum][key].push(occupant)
      })
    })
    return map
  }, [records])

  const conflictSeats = useMemo(() => {
    const out: { seat: number; shift: string; occupants: SlotOccupant[] }[] = []
    Object.entries(seatMap).forEach(([seatStr, slot]) => {
      const seat = parseInt(seatStr)
      ;(['M', 'A', 'E'] as const).forEach(sh => {
        if (slot[sh].length > 1) out.push({ seat, shift: sh, occupants: slot[sh] })
      })
    })
    return out
  }, [seatMap])

  const vacancies = useMemo(() => {
    let M = 0, A = 0, E = 0
    Object.values(seatMap).forEach(s => {
      if (s.M.length === 0) M++
      if (s.A.length === 0) A++
      if (s.E.length === 0) E++
    })
    return { M, A, E, fullDay: Math.min(M, A, E) }
  }, [seatMap])

  const highlightedSeats = useMemo(() => {
    if (!search.trim()) return new Set<number>()
    const q = search.toLowerCase()
    const out = new Set<number>()
    Object.entries(seatMap).forEach(([seat, slot]) => {
      const allNames = [...slot.M, ...slot.A, ...slot.E].map(o => o.name.toLowerCase())
      if (allNames.some(n => n.includes(q))) out.add(parseInt(seat))
    })
    return out
  }, [seatMap, search])

  // On mobile show 5 seats per row, on desktop 10
  const rows = useMemo(() => {
    const seats = Array.from({ length: 92 }, (_, i) => i + 1)
    const out: number[][] = []
    for (let i = 0; i < seats.length; i += 10) out.push(seats.slice(i, i + 10))
    return out
  }, [])

  const shiftFullName: Record<string, string> = { M: '6 AM – 12 PM', A: '12 PM – 6 PM', E: '6 PM – 11 PM' }
  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>

      <div className="max-w-7xl mx-auto px-3 md:px-6 py-5 md:py-6">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-medium hover:opacity-70 transition-opacity"
              style={{ color: T.textSub }}>← Back</Link>
            <div>
              <h1 className="text-lg md:text-2xl font-bold"
                style={{ color: T.text, fontFamily: "'Georgia', serif" }}>🗺️ Seat Map</h1>
              <p className="text-[10px] mt-0.5 uppercase tracking-widest hidden md:block"
                style={{ color: T.textMuted }}>Active, Expired &amp; Blocked · Frozen excluded</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {unreservedStudents.length > 0 && (
              <button onClick={() => setShowUnreservedModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}`, color: T.accent }}>
                🪑 <span className="hidden sm:inline">Unreserved </span>
                <span className="px-1.5 py-0.5 rounded-full font-bold text-[10px]"
                  style={{ background: T.accent, color: 'white' }}>{unreservedStudents.length}</span>
              </button>
            )}
            <button onClick={() => setShowConflictsModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
              style={{
                background: conflictSeats.length > 0 ? '#fef9c3' : T.surface,
                border: `1px solid ${conflictSeats.length > 0 ? '#fde68a' : T.border}`,
                color: conflictSeats.length > 0 ? '#854d0e' : T.textSub,
              }}>
              {conflictSeats.length > 0 ? '⚠️' : '✓'} <span className="hidden sm:inline">Conflicts </span>
              {conflictSeats.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: '#fde68a', color: '#854d0e' }}>{conflictSeats.length}</span>
              )}
            </button>
            <button onClick={fetchData} className="text-xs px-2.5 py-1.5 rounded-xl"
              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
              ↻
            </button>
          </div>
        </div>

        {/* ── VACANCY CARDS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-5">
          {[
            { label: '6 AM – 12 PM', key: 'M',  count: vacancies.M,       color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
            { label: '12 PM – 6 PM', key: 'A',  count: vacancies.A,       color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
            { label: '6 PM – 11 PM', key: 'E',  count: vacancies.E,       color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff' },
            { label: 'Full Day',     key: 'fd', count: vacancies.fullDay, color: T.accent,  bg: T.accentLight, border: T.accentBorder },
          ].map(({ label, key, count, color, bg, border }) => (
            <div key={key} className="rounded-xl p-3 md:p-4" style={{ background: bg, border: `1px solid ${border}` }}>
              <p className="text-[9px] md:text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color }}>Vacant</p>
              <p className="text-[9px] md:text-[10px] mb-1 md:mb-2" style={{ color, opacity: 0.7 }}>{label}</p>
              <p className="text-2xl md:text-3xl font-bold" style={{ color, fontFamily: "'Georgia', serif" }}>{count}</p>
              <p className="text-[9px] md:text-[10px] mt-0.5 md:mt-1" style={{ color, opacity: 0.6 }}>of 92 seats</p>
            </div>
          ))}
        </div>

        {/* ── CONTROLS ── */}
        <div className="flex gap-2 md:gap-3 mb-4 flex-wrap items-center">
          {/* Shift toggle */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
            {(['all', 'M', 'A', 'E'] as const).map(v => {
              const labels = { all: 'All', M: 'M', A: 'A', E: 'E' }
              const labelsMd = { all: 'All', M: 'Morning', A: 'Afternoon', E: 'Evening' }
              const isActive = shiftView === v
              return (
                <button key={v} onClick={() => setShiftView(v)}
                  className="px-2.5 md:px-3 py-2 text-xs font-medium transition-colors"
                  style={{
                    background: isActive ? T.accent : T.surface,
                    color: isActive ? 'white' : T.textSub,
                    borderRight: v !== 'E' ? `1px solid ${T.border}` : undefined,
                  }}>
                  <span className="md:hidden">{labels[v]}</span>
                  <span className="hidden md:inline">{labelsMd[v]}</span>
                </button>
              )
            })}
          </div>
          <input type="text" placeholder="Search student…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[120px] px-3 py-2 rounded-xl text-sm focus:outline-none"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}/>
        </div>

        {/* ── LEGEND ── */}
        <div className="flex items-center gap-3 md:gap-5 mb-5 flex-wrap text-xs" style={{ color: T.textSub }}>
          {[
            { bg: '#dcfce7', border: '#86efac', label: 'Occupied' },
            { bg: '#fee2e2', border: '#fca5a5', label: 'Blocked' },
            { bg: '#f1f5f9', border: '#e2e8f0', label: 'Vacant' },
            { bg: '#fef9c3', border: '#fde68a', label: 'Conflict' },
          ].map(({ bg, border, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded inline-block shrink-0"
                style={{ background: bg, border: `1px solid ${border}` }}/>
              {label}
            </span>
          ))}
          <span className="text-[10px]" style={{ color: T.textMuted }}>M · A · E = shifts</span>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3"
              style={{ borderColor: T.accent, borderTopColor: 'transparent' }}/>
            <p className="text-sm" style={{ color: T.textMuted }}>Loading seats…</p>
          </div>
        ) : (
          /* Horizontally scrollable on mobile so cards never crush */
          <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
            <div className="space-y-2 md:space-y-4" style={{ minWidth: '340px' }}>
              {rows.map((row, ri) => (
                <div key={ri} className="flex gap-1.5 md:gap-3">
                  {row.map(seatNum => {
                    const slot = seatMap[seatNum]
                    const isHighlighted = highlightedSeats.has(seatNum)
                    const hasConflict = conflictSeats.some(c => c.seat === seatNum)
                    const shiftsToShow = shiftView === 'all' ? (['M', 'A', 'E'] as const) : ([shiftView] as const)
                    const isVacantAll = slot.M.length === 0 && slot.A.length === 0 && slot.E.length === 0

                    // On mobile shiftView=all each card is ~86px; single shift ~100px
                    const cardW = shiftView === 'all' ? 86 : 108

                    return (
                      <div key={seatNum}
                        style={{
                          width: `${cardW}px`,
                          minWidth: `${cardW}px`,
                          background: isHighlighted ? '#fef9c3' : T.surface,
                          border: `1px solid ${hasConflict ? '#fde68a' : isHighlighted ? '#fde68a' : T.border}`,
                          boxShadow: hasConflict ? '0 0 0 2px #fde68a' : '0 1px 3px rgba(0,0,0,0.04)',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}>
                        {/* Seat header */}
                        <div className="px-1.5 md:px-2.5 py-1 md:py-1.5 flex items-center justify-between"
                          style={{
                            background: isVacantAll ? '#f8fafc' : hasConflict ? '#fef9c3' : T.accentLight,
                            borderBottom: `1px solid ${isVacantAll ? '#e2e8f0' : hasConflict ? '#fde68a' : T.accentBorder}`,
                          }}>
                          <span className="font-bold"
                            style={{
                              fontSize: '10px',
                              color: isVacantAll ? '#94a3b8' : hasConflict ? '#854d0e' : T.accent,
                              fontFamily: "'Georgia', serif",
                            }}>
                            {seatNum}
                          </span>
                          {isVacantAll && <span style={{ fontSize: '8px', color: '#cbd5e1' }}>—</span>}
                          {hasConflict && <span style={{ fontSize: '9px', fontWeight: 700, color: '#854d0e' }}>⚠</span>}
                        </div>

                        {/* Shift slots */}
                        <div className="p-1 space-y-0.5">
                          {shiftsToShow.map(sh => {
                            const occupants = slot[sh]
                            const display = latestOccupant(occupants)
                            const sc = slotColor(occupants)
                            const label = !display
                              ? '—'
                              : occupants.length > 1
                                ? `${display.name.split(' ')[0]} +${occupants.length - 1}`
                                : display.name.split(' ')[0]   // first name only on mobile
                            return (
                              <div key={sh} className="flex items-center gap-1 px-1 py-0.5 rounded"
                                style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
                                <span style={{ fontSize: '8px', fontWeight: 700, color: sc.color, minWidth: '8px' }}>{sh}</span>
                                <span className="truncate" style={{ fontSize: '9px', color: sc.color, maxWidth: '60px' }}>{label}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 pt-4 text-center" style={{ borderTop: `1px solid ${T.border}` }}>
          <p className="text-xs" style={{ color: T.textMuted }}>
            Knowledge Hub Library · Seats 1–92 · Frozen students excluded
          </p>
        </div>
      </div>

      {/* ── UNRESERVED MODAL ── */}
      {showUnreservedModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="h-[3px] rounded-t-2xl"
              style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }}/>
            {/* Drag handle on mobile */}
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="w-10 h-1 rounded-full" style={{ background: T.border }}/>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-base" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                    🪑 Unreserved Students
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>
                    {unreservedStudents.length} student{unreservedStudents.length !== 1 ? 's' : ''} with seat 0 or unassigned
                  </p>
                </div>
                <button onClick={() => setShowUnreservedModal(false)} className="text-lg p-1" style={{ color: T.textMuted }}>✕</button>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                      {['Name', 'Mobile', 'Shift', 'Status'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-widest font-semibold"
                          style={{ color: T.textMuted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unreservedStudents.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td className="px-3 py-2.5 text-xs font-medium" style={{ color: T.text }}>{r.name}</td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: T.textSub }}>{r.mobile_number}</td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: T.textSub }}>{r.latest_shift || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}` }}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFLICTS MODAL ── */}
      {showConflictsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="h-[3px] rounded-t-2xl"
              style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }}/>
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="w-10 h-1 rounded-full" style={{ background: T.border }}/>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-base" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                    {conflictSeats.length > 0
                      ? `⚠️ ${conflictSeats.length} Conflict${conflictSeats.length !== 1 ? 's' : ''}`
                      : '✓ No Conflicts'}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>
                    {conflictSeats.length > 0
                      ? 'Latest expiry is shown on the map · others listed below'
                      : 'All seats properly allocated'}
                  </p>
                </div>
                <button onClick={() => setShowConflictsModal(false)} className="text-lg p-1" style={{ color: T.textMuted }}>✕</button>
              </div>

              {conflictSeats.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-4xl mb-3">✅</p>
                  <p className="text-sm" style={{ color: T.textMuted }}>No duplicate seat assignments found</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${T.border}` }}>
                  <table className="w-full text-sm" style={{ minWidth: '480px' }}>
                    <thead>
                      <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                        {['Seat', 'Shift', 'Student', 'Mobile', 'Expiry', 'Status'].map(h => (
                          <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-widest font-semibold"
                            style={{ color: T.textMuted }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {conflictSeats.map((conflict, ci) => {
                        const sorted = [...conflict.occupants].sort(
                          (a, b) => new Date(b.expiry).getTime() - new Date(a.expiry).getTime()
                        )
                        return sorted.map((occ, ni) => {
                          const isBlocked = occ.status?.toLowerCase().includes('blocked')
                          const isOnMap = ni === 0
                          return (
                            <tr key={`${ci}-${ni}`}
                              style={{
                                borderBottom: `1px solid ${T.border}`,
                                background: isBlocked ? '#fff5f5' : isOnMap ? '#f0fdf4' : T.surface,
                              }}>
                              {ni === 0 && (
                                <td className="px-3 py-2.5 font-bold text-xs" rowSpan={sorted.length}
                                  style={{ color: T.accent, verticalAlign: 'top' }}>
                                  S-{conflict.seat}
                                </td>
                              )}
                              {ni === 0 && (
                                <td className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap" rowSpan={sorted.length}
                                  style={{ color: '#854d0e', verticalAlign: 'top' }}>
                                  {shiftFullName[conflict.shift]}
                                </td>
                              )}
                              <td className="px-3 py-2.5 text-xs" style={{ color: T.text }}>
                                {occ.name}
                                {isOnMap && (
                                  <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{ background: '#dcfce7', color: '#166534' }}>
                                    on map
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-xs" style={{ color: T.textSub }}>{occ.mobile}</td>
                              <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: T.textSub }}>
                                {formatDate(occ.expiry)}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                                  style={{
                                    background: isBlocked ? '#fee2e2' : '#dcfce7',
                                    color: isBlocked ? '#991b1b' : '#166534',
                                    border: `1px solid ${isBlocked ? '#fca5a5' : '#86efac'}`,
                                  }}>
                                  {occ.status}
                                </span>
                              </td>
                            </tr>
                          )
                        })
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
