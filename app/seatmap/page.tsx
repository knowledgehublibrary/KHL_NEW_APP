'use client'

// Place at: app/seatmap/page.tsx

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'

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

function slotColor(occupants: string[]): { bg: string; color: string; border: string } {
  if (!occupants || occupants.length === 0) return { bg: '#f1f5f9', color: '#94a3b8', border: '#e2e8f0' }
  if (occupants.length > 1) return { bg: '#fef9c3', color: '#854d0e', border: '#fde68a' }
  return { bg: '#dcfce7', color: '#166534', border: '#86efac' }
}

type SeatSlot = {
  M: string[]; A: string[]; E: string[]
  mobileM: string[]; mobileA: string[]; mobileE: string[]
  expiryM: string[]; expiryA: string[]; expiryE: string[]
}

function isVisible(status: string) {
  const s = status?.toLowerCase() || ''
  return s.includes('active') || s.includes('freeze') || s.includes('freezed') || s.includes('expired')
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
    // v_student_summary already returns one row per student (latest record),
    // which is exactly what a seat map needs.
    const { data, error } = await supabase
      .from('v_student_summary')
      .select('name, mobile_number, latest_seat, latest_shift, status, latest_expiry')
      .order('latest_seat', { ascending: true })
    if (!error) setRecords((data || []).filter(r => isVisible(r.status)))
    setLoading(false)
  }

  // Students with seat 0 or unassigned
  const unreservedStudents = useMemo(() => {
    return records.filter((r) => {
      const n = parseInt(r.latest_seat)
      return isNaN(n) || n === 0
    })
  }, [records])

  // Build seat map for seats 1–92
  const seatMap = useMemo(() => {
    const map: Record<number, SeatSlot> = {}
    for (let i = 1; i <= 92; i++) {
      map[i] = {
        M: [], A: [], E: [],
        mobileM: [], mobileA: [], mobileE: [],
        expiryM: [], expiryA: [], expiryE: [],
      }
    }
    records.forEach((rec) => {
      const seatNum = parseInt(rec.latest_seat)
      if (isNaN(seatNum) || seatNum < 1 || seatNum > 92) return
      const shifts = (rec.latest_shift || '').split(', ').map((x: string) => x.trim())
      const shortName = rec.name?.split(' ').slice(0, 2).join(' ') || ''
      shifts.forEach((shift: string) => {
        const key = SHIFT_MAP[shift]
        if (key === 'M') { map[seatNum].M.push(shortName); map[seatNum].mobileM.push(rec.mobile_number); map[seatNum].expiryM.push(rec.latest_expiry) }
        if (key === 'A') { map[seatNum].A.push(shortName); map[seatNum].mobileA.push(rec.mobile_number); map[seatNum].expiryA.push(rec.latest_expiry) }
        if (key === 'E') { map[seatNum].E.push(shortName); map[seatNum].mobileE.push(rec.mobile_number); map[seatNum].expiryE.push(rec.latest_expiry) }
      })
    })
    return map
  }, [records])

  // Conflicts: seat+shift with >1 student
  const conflictSeats = useMemo(() => {
    const out: { seat: number; shift: string; names: string[]; mobiles: string[]; expiries: string[] }[] = []
    Object.entries(seatMap).forEach(([seatStr, slot]) => {
      const seat = parseInt(seatStr)
      ;(['M', 'A', 'E'] as const).forEach((sh) => {
        const names = slot[sh]
        if (names.length <= 1) return
        const mobiles = sh === 'M' ? slot.mobileM : sh === 'A' ? slot.mobileA : slot.mobileE
        const expiries = sh === 'M' ? slot.expiryM : sh === 'A' ? slot.expiryA : slot.expiryE
        out.push({ seat, shift: sh, names, mobiles, expiries })
      })
    })
    return out
  }, [seatMap])

  // Vacancy counts
  const vacancies = useMemo(() => {
    let M = 0, A = 0, E = 0
    Object.values(seatMap).forEach((s) => {
      if (s.M.length === 0) M++
      if (s.A.length === 0) A++
      if (s.E.length === 0) E++
    })
    return { M, A, E, fullDay: Math.min(M, A, E) }
  }, [seatMap])

  // Search highlight
  const highlightedSeats = useMemo(() => {
    if (!search.trim()) return new Set<number>()
    const q = search.toLowerCase()
    const out = new Set<number>()
    Object.entries(seatMap).forEach(([seat, slot]) => {
      if ([...slot.M, ...slot.A, ...slot.E].some(n => n?.toLowerCase().includes(q)))
        out.add(parseInt(seat))
    })
    return out
  }, [seatMap, search])

  const rows = useMemo(() => {
    const seats = Array.from({ length: 92 }, (_, i) => i + 1)
    const out: number[][] = []
    for (let i = 0; i < seats.length; i += 10) out.push(seats.slice(i, i + 10))
    return out
  }, [])

  const shiftFullName: Record<string, string> = { M: '6 AM – 12 PM', A: '12 PM – 6 PM', E: '6 PM – 11 PM' }

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  return (
    <div className="min-h-screen" style={{ background: T.bg }}>
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }}/>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>🗺️ Seat Map</h1>
            <p className="text-[10px] mt-0.5 uppercase tracking-widest" style={{ color: T.textMuted }}>Knowledge Hub Library · Active, Frozen &amp; Expired</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {unreservedStudents.length > 0 && (
              <button onClick={() => setShowUnreservedModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}`, color: T.accent }}>
                🪑 Unreserved
                <span className="px-1.5 py-0.5 rounded-full font-bold text-[10px]"
                  style={{ background: T.accent, color: 'white' }}>
                  {unreservedStudents.length}
                </span>
              </button>
            )}
            <button onClick={() => setShowConflictsModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
              style={{
                background: conflictSeats.length > 0 ? '#fef9c3' : T.surface,
                border: `1px solid ${conflictSeats.length > 0 ? '#fde68a' : T.border}`,
                color: conflictSeats.length > 0 ? '#854d0e' : T.textSub,
              }}>
              {conflictSeats.length > 0 ? '⚠️' : '✓'} Conflicts
              {conflictSeats.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: '#fde68a', color: '#854d0e' }}>
                  {conflictSeats.length}
                </span>
              )}
            </button>
            <button onClick={fetchData} className="text-xs px-3 py-2 rounded-xl"
              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* VACANCY CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: '6 AM – 12 PM', key: 'M', count: vacancies.M, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
            { label: '12 PM – 6 PM', key: 'A', count: vacancies.A, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
            { label: '6 PM – 11 PM', key: 'E', count: vacancies.E, color: '#9333ea', bg: '#faf5ff', border: '#e9d5ff' },
            { label: 'Full Day', key: 'fd', count: vacancies.fullDay, color: T.accent, bg: T.accentLight, border: T.accentBorder },
          ].map(({ label, key, count, color, bg, border }) => (
            <div key={key} className="rounded-xl p-4" style={{ background: bg, border: `1px solid ${border}` }}>
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color }}>Vacant</p>
              <p className="text-[10px] mb-2" style={{ color, opacity: 0.7 }}>{label}</p>
              <p className="text-3xl font-bold" style={{ color, fontFamily: "'Georgia', serif" }}>{count}</p>
              <p className="text-[10px] mt-1" style={{ color, opacity: 0.6 }}>of 92 seats</p>
            </div>
          ))}
        </div>

        {/* CONTROLS */}
        <div className="flex gap-3 mb-6 flex-wrap items-center">
          <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
            {(['all', 'M', 'A', 'E'] as const).map((v) => {
              const labels = { all: 'All', M: 'Morning', A: 'Afternoon', E: 'Evening' }
              const isActive = shiftView === v
              return (
                <button key={v} onClick={() => setShiftView(v)}
                  className="px-3 py-2 text-xs font-medium transition-colors"
                  style={{
                    background: isActive ? T.accent : T.surface,
                    color: isActive ? 'white' : T.textSub,
                    borderRight: v !== 'E' ? `1px solid ${T.border}` : undefined,
                  }}>
                  {labels[v]}
                </button>
              )
            })}
          </div>
          <input type="text" placeholder="Search student…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] px-3 py-2 rounded-xl text-sm focus:outline-none"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}/>
        </div>

        {/* LEGEND */}
        <div className="flex items-center gap-5 mb-6 flex-wrap text-xs" style={{ color: T.textSub }}>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#dcfce7', border: '1px solid #86efac', display: 'inline-block' }}/>Occupied</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', display: 'inline-block' }}/>Vacant</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: '#fef9c3', border: '1px solid #fde68a', display: 'inline-block' }}/>Conflict / Search</span>
          <span style={{ color: T.textMuted }}>M = Morning · A = Afternoon · E = Evening</span>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3" style={{ borderColor: T.accent, borderTopColor: 'transparent' }}/>
            <p className="text-sm" style={{ color: T.textMuted }}>Loading seats…</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row, ri) => (
              <div key={ri} className="flex gap-3 flex-wrap">
                {row.map((seatNum) => {
                  const seat = seatMap[seatNum]
                  const isHighlighted = highlightedSeats.has(seatNum)
                  const hasConflict = conflictSeats.some(c => c.seat === seatNum)
                  const shiftsToShow = shiftView === 'all' ? (['M', 'A', 'E'] as const) : ([shiftView] as const)
                  const isVacantAll = seat.M.length === 0 && seat.A.length === 0 && seat.E.length === 0

                  return (
                    <div key={seatNum}
                      style={{
                        width: shiftView === 'all' ? '128px' : '136px',
                        background: isHighlighted ? '#fef9c3' : T.surface,
                        border: `1px solid ${hasConflict ? '#fde68a' : isHighlighted ? '#fde68a' : T.border}`,
                        boxShadow: hasConflict ? '0 0 0 2px #fde68a' : '0 1px 3px rgba(0,0,0,0.04)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}>
                      <div className="px-2.5 py-1.5 flex items-center justify-between"
                        style={{ background: isVacantAll ? '#f8fafc' : hasConflict ? '#fef9c3' : T.accentLight, borderBottom: `1px solid ${isVacantAll ? '#e2e8f0' : hasConflict ? '#fde68a' : T.accentBorder}` }}>
                        <span className="text-[11px] font-bold" style={{ color: isVacantAll ? '#94a3b8' : hasConflict ? '#854d0e' : T.accent, fontFamily: "'Georgia', serif" }}>
                          S-{seatNum}
                        </span>
                        {isVacantAll && <span className="text-[9px]" style={{ color: '#cbd5e1' }}>EMPTY</span>}
                        {hasConflict && <span className="text-[9px] font-bold" style={{ color: '#854d0e' }}>⚠</span>}
                      </div>
                      <div className="p-1.5 space-y-1">
                        {shiftsToShow.map((sh) => {
                          const occupants = seat[sh]
                          const sc = slotColor(occupants)
                          const label = occupants.length === 0 ? '—' : occupants.length === 1 ? occupants[0] : `${occupants.length} students`
                          return (
                            <div key={sh} className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg"
                              style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
                              <span className="text-[9px] font-bold shrink-0 w-3" style={{ color: sc.color }}>{sh}</span>
                              <span className="text-[10px] truncate" style={{ color: sc.color }}>{label}</span>
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
        )}

        <div className="mt-10 pt-4 text-center" style={{ borderTop: `1px solid ${T.border}` }}>
          <p className="text-xs" style={{ color: T.textMuted }}>Knowledge Hub Library · Seats 1–92 · Updated in real time</p>
        </div>
      </div>

      {/* ─── UNRESERVED MODAL ─── */}
      {showUnreservedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl shadow-2xl"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="h-[3px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }}/>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-bold text-lg" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>🪑 Unreserved Students</h2>
                  <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>{unreservedStudents.length} student{unreservedStudents.length !== 1 ? 's' : ''} with seat 0 or no seat assigned</p>
                </div>
                <button onClick={() => setShowUnreservedModal(false)} className="text-xl" style={{ color: T.textMuted }}>✕</button>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                      {['Name', 'Mobile', 'Shift', 'Status'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-widest font-semibold" style={{ color: T.textMuted }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {unreservedStudents.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td className="px-3 py-2.5 text-xs font-medium" style={{ color: T.text }}>{r.name}</td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: T.textSub }}>{r.mobile_number}</td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: T.textSub }}>{r.latest_shift}</td>
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

      {/* ─── CONFLICTS MODAL ─── */}
      {showConflictsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="h-[3px] rounded-t-2xl" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }}/>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-bold text-lg" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                    {conflictSeats.length > 0 ? `⚠️ ${conflictSeats.length} Seat Conflict${conflictSeats.length !== 1 ? 's' : ''}` : '✓ No Conflicts'}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>
                    {conflictSeats.length > 0 ? 'Multiple students on the same seat & shift' : 'All seats properly allocated'}
                  </p>
                </div>
                <button onClick={() => setShowConflictsModal(false)} className="text-xl" style={{ color: T.textMuted }}>✕</button>
              </div>
              {conflictSeats.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-4xl mb-3">✅</p>
                  <p className="text-sm" style={{ color: T.textMuted }}>No duplicate seat assignments found</p>
                </div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: T.bg, borderBottom: `1px solid ${T.border}` }}>
                        {['Seat', 'Shift', 'Student', 'Mobile', 'Expiry'].map(h => (
                          <th key={h} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-widest font-semibold" style={{ color: T.textMuted }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {conflictSeats.map((conflict, ci) =>
                        conflict.names.map((name, ni) => (
                          <tr key={`${ci}-${ni}`} style={{ borderBottom: `1px solid ${T.border}`, background: ni === 0 ? '#fef9c3' : '#fffde7' }}>
                            {ni === 0 && (
                              <td className="px-3 py-2.5 font-bold text-xs" rowSpan={conflict.names.length} style={{ color: T.accent, verticalAlign: 'top' }}>S-{conflict.seat}</td>
                            )}
                            {ni === 0 && (
                              <td className="px-3 py-2.5 text-xs font-semibold" rowSpan={conflict.names.length} style={{ color: '#854d0e', verticalAlign: 'top' }}>
                                {shiftFullName[conflict.shift]} ({conflict.shift})
                              </td>
                            )}
                            <td className="px-3 py-2.5 text-xs" style={{ color: T.text }}>{name}</td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: T.textSub }}>{conflict.mobiles[ni]}</td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: T.textSub }}>
                              {formatDate(conflict.expiries[ni])}
                            </td>
                          </tr>
                        ))
                      )}
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
