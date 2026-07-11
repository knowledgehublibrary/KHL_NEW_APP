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

// ── PHYSICAL SEAT LAYOUT ──
// Reconstructed from the library's seating-plan sheet. Each entry is a column
// (left → right, matching the room), listing seat numbers top → bottom exactly
// as they're arranged on the floor. Columns are uneven lengths on purpose —
// that's how the room is laid out. Total = 92 seats. `0` = a blank filler row
// (an aisle/walkway gap in the room) — not a seat, just reserves the space.
const SEAT_LAYOUT: number[][] = [
  [75, 76, 77, 78, 79, 80, 81, 82, 83, 84],
  [74, 73, 72, 71, 70, 69, 68, 67, 0, 66, 0, 0, 0, 0, 0, 92],
  [56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 0, 0, 88, 89, 90, 91],
  [55, 54, 53, 52, 51, 50, 49, 0, 0, 48, 47, 0, 85, 86, 87, 46],
  [31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 0, 42, 43, 44, 45],
  [30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 0, 19, 18, 17, 16],
  [1, 2, 3, 4, 5, 6, 7, 8, 0, 9, 10, 11, 12, 13, 14, 15],
]
const MAX_COL_LEN = Math.max(...SEAT_LAYOUT.map(c => c.length))

// Maps each real column (0-indexed, left→right as in SEAT_LAYOUT) to a grid
// track number. Extra numbers are skipped between groups to create wider
// aisles: col1 | col2 | (col3+col4 tight) | (col5+col6 tight) | col7
const COLUMN_TRACK = [1, 3, 6, 7, 10, 11, 14]
const TOTAL_TRACKS = 14
const SPACER_TRACKS = new Set([2, 4, 5, 8, 9, 12, 13])

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

type ConflictSeat = {
  seat: number
  shifts: ('M' | 'A' | 'E')[]
  occupants: SlotOccupant[]
}

function isVisible(status: string) {
  const s = status?.toLowerCase() || ''
  return s.includes('active') || s.includes('expired')
}

function isExpiredStatus(status: string) {
  return (status?.toLowerCase() || '').includes('expired')
}

function latestOccupant(occupants: SlotOccupant[]): SlotOccupant | null {
  if (!occupants.length) return null
  return occupants.reduce((a, b) =>
    new Date(a.expiry) >= new Date(b.expiry) ? a : b
  )
}

function slotColor(occupants: SlotOccupant[]): { bg: string; color: string; border: string } {
  if (!occupants.length) return { bg: '#f1f5f9', color: '#94a3b8', border: '#e2e8f0' }
  if (occupants.length > 1) return { bg: '#fef9c3', color: '#854d0e', border: '#fde68a' }
  if (occupants[0].status?.toLowerCase().includes('expired')) {
    return { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
  }
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

  // ── CONFLICTS — grouped per seat (not per seat×shift) ──
  const conflictSeats = useMemo(() => {
    const bySeat: Record<number, ConflictSeat> = {}
    Object.entries(seatMap).forEach(([seatStr, slot]) => {
      const seat = parseInt(seatStr)
      ;(['M', 'A', 'E'] as const).forEach(sh => {
        if (slot[sh].length > 1) {
          if (!bySeat[seat]) bySeat[seat] = { seat, shifts: [], occupants: [] }
          bySeat[seat].shifts.push(sh)
          slot[sh].forEach(o => {
            if (!bySeat[seat].occupants.some(x => x.mobile === o.mobile)) {
              bySeat[seat].occupants.push(o)
            }
          })
        }
      })
    })
    return Object.values(bySeat).sort((a, b) => a.seat - b.seat)
  }, [seatMap])

  // ── STATUS COUNTS — replaces shift-wise vacancy cards ──
  const statusCounts = useMemo(() => {
    let reservedActive = 0, reservedExpired = 0, unreservedActive = 0, unreservedExpired = 0
    records.forEach(r => {
      const seatNum = parseInt(r.latest_seat)
      const hasSeat = !isNaN(seatNum) && seatNum >= 1 && seatNum <= 92
      const expired = isExpiredStatus(r.status)
      if (hasSeat) {
        if (expired) reservedExpired++
        else reservedActive++
      } else {
        if (expired) unreservedExpired++
        else unreservedActive++
      }
    })
    return { reservedActive, reservedExpired, unreservedActive, unreservedExpired }
  }, [records])

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
                🪑 <span>Unreserved</span>
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
              {conflictSeats.length > 0 ? '⚠️ ' : '✓'} <span>Conflicts</span>
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

        {/* ── STATUS CARDS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-5">
          {[
            { label: 'Reserved',   sub: 'Active',   count: statusCounts.reservedActive,   color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
            { label: 'Reserved',   sub: 'Expired',  count: statusCounts.reservedExpired,  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            { label: 'Unreserved', sub: 'Active',   count: statusCounts.unreservedActive, color: T.accent,  bg: T.accentLight, border: T.accentBorder },
            { label: 'Unreserved', sub: 'Expired',  count: statusCounts.unreservedExpired, color: '#78716c', bg: '#f5f5f4', border: '#e7e5e4' },
          ].map(({ label, sub, count, color, bg, border }, i) => (
            <div key={i} className="rounded-xl p-3 md:p-4" style={{ background: bg, border: `1px solid ${border}` }}>
              <p className="text-[9px] md:text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color }}>{label}</p>
              <p className="text-[9px] md:text-[10px] mb-1 md:mb-2" style={{ color, opacity: 0.7 }}>{sub}</p>
              <p className="text-2xl md:text-3xl font-bold" style={{ color, fontFamily: "'Georgia', serif" }}>{count}</p>
              <p className="text-[9px] md:text-[10px] mt-0.5 md:mt-1" style={{ color, opacity: 0.6 }}>students</p>
            </div>
          ))}
        </div>

        {/* ── CONTROLS ── */}
        <div className="flex gap-2 md:gap-3 mb-4 flex-wrap items-center">
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
            { bg: '#fee2e2', border: '#fca5a5', label: 'Expied' },
            { bg: '#f1f5f9', border: '#e2e8f0', label: 'Vacant' },
            { bg: '#fef9c3', border: '#fde68a', label: 'Conflict' },
          ].map(({ bg, border, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded inline-block shrink-0"
                style={{ background: bg, border: `1px solid ${border}` }}/>
              {label}
            </span>
          ))}
          <span className="text-[10px]" style={{ color: T.textMuted }}>M · A · E = shifts · tap name to open student</span>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3"
              style={{ borderColor: T.accent, borderTopColor: 'transparent' }}/>
            <p className="text-sm" style={{ color: T.textMuted }}>Loading seats…</p>
          </div>
        ) : (
          /* ── PHYSICAL FLOOR-PLAN GRID ──
             Columns match the real room layout (see SEAT_LAYOUT above), not a
             plain sequential 1–92 grid. Each column scrolls together; shorter
             columns leave blank space at the bottom to keep rows aligned. */
          <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
            {(() => {
              const cardW = shiftView === 'all' ? 86 : 108
              const spacerW = 16
              const rowsToShow = shiftView === 'all' ? (['M', 'A', 'E'] as const) : ([shiftView] as const)
              const gridTemplateColumns = Array.from({ length: TOTAL_TRACKS }, (_, i) =>
                SPACER_TRACKS.has(i + 1) ? `${spacerW}px` : `${cardW}px`
              ).join(' ')
              const totalWidth = Array.from({ length: TOTAL_TRACKS }, (_, i) =>
                SPACER_TRACKS.has(i + 1) ? spacerW : cardW
              ).reduce((a, b) => a + b, 0) + (TOTAL_TRACKS - 1) * 6

              return (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns,
                    gridAutoRows: 'min-content',
                    gap: '6px',
                    minWidth: `${totalWidth}px`,
                  }}>
                  {SEAT_LAYOUT.map((col, ci) =>
                    Array.from({ length: MAX_COL_LEN }, (_, ri) => {
                      const seatNum = col[ri]
                      const gridColumn = COLUMN_TRACK[ci]
                      const gridRow = ri + 1

                      if (seatNum === undefined || seatNum === 0) {
                        return <div key={`${ci}-${ri}`} style={{ gridColumn, gridRow }} />
                      }

                      const slot = seatMap[seatNum]
                      const isHighlighted = highlightedSeats.has(seatNum)
                      const hasConflict = conflictSeats.some(c => c.seat === seatNum)
                      const isVacantAll = slot.M.length === 0 && slot.A.length === 0 && slot.E.length === 0

                      const outline = hasConflict ? '#eab308' : isHighlighted ? '#eab308' : T.border

                      return (
                        <div key={seatNum}
                          style={{
                            gridColumn, gridRow,
                            background: T.surface,
                            border: `1px solid ${outline}`,
                            borderRadius: '4px',
                            overflow: 'hidden',
                          }}>
                          {/* Seat number band — flat, spreadsheet-style header cell */}
                          <div className="flex items-center justify-between px-1.5 py-0.5"
                            style={{
                              background: isVacantAll ? '#f1f5f9' : hasConflict ? '#fef08a' : T.accentLight,
                              borderBottom: `1px solid ${outline}`,
                            }}>
                            <span className="font-bold"
                              style={{
                                fontSize: '10px',
                                color: isVacantAll ? '#94a3b8' : hasConflict ? '#854d0e' : T.accent,
                                fontFamily: "'Georgia', serif",
                              }}>
                              {seatNum}
                            </span>
                            {hasConflict && <span style={{ fontSize: '9px', fontWeight: 700, color: '#854d0e' }}>⚠</span>}
                          </div>

                          {/* Shift rows — full-width flat fill, like an Excel cell, no pill/rounding */}
                          <div>
                            {rowsToShow.map(sh => {
                              const occupants = slot[sh]
                              const display = latestOccupant(occupants)
                              const sc = slotColor(occupants)

                              const rawLabel = !display
                                ? '—'
                                : occupants.length > 1
                                  ? `${display.name.split(' ')[0]} +${occupants.length - 1}`
                                  : display.name.split(' ')[0]

                              return (
                                <div key={sh} className="flex items-center gap-1 px-1.5"
                                  style={{
                                    background: sc.bg,
                                    borderTop: `1px solid ${sc.border}`,
                                    height: '20px',
                                  }}>
                                  <span style={{ fontSize: '8px', fontWeight: 700, color: sc.color, minWidth: '8px' }}>{sh}</span>
                                  {display ? (
                                    <Link
                                      href={`/student/${display.mobile}`}
                                      className="truncate hover:underline"
                                      style={{ fontSize: '9px', color: sc.color, lineHeight: 1, flex: 1 }}
                                      title={display.name}>
                                      {rawLabel}
                                    </Link>
                                  ) : (
                                    <span className="truncate" style={{ fontSize: '9px', color: sc.color, flex: 1 }}>—</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )
            })()}
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
                        <td className="px-3 py-2.5 text-xs font-medium" style={{ color: T.text }}>
                          <Link
                            href={`/student/${r.mobile_number}`}
                            className="hover:underline"
                            style={{ color: T.accent }}
                            onClick={() => setShowUnreservedModal(false)}>
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: T.textSub }}>{r.mobile_number}</td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: T.textSub }}>{r.latest_shift}</td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{
                              background: isExpiredStatus(r.status) ? '#fee2e2' : T.accentLight,
                              color: isExpiredStatus(r.status) ? '#991b1b' : T.accent,
                            }}>
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

      {/* ── CONFLICTS MODAL — one card per seat, not per shift ── */}
      {showConflictsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="h-[3px] rounded-t-2xl"
              style={{ background: `linear-gradient(90deg, transparent, #eab308, transparent)` }}/>
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="w-10 h-1 rounded-full" style={{ background: T.border }}/>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-base" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                    ⚠️ {conflictSeats.length} Conflict{conflictSeats.length !== 1 ? 's' : ''}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>
                    Seats double-booked for one or more shifts
                  </p>
                </div>
                <button onClick={() => setShowConflictsModal(false)} className="text-lg p-1" style={{ color: T.textMuted }}>✕</button>
              </div>

              {conflictSeats.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: T.textMuted }}>No conflicts right now 🎉</p>
              ) : (
                <div className="space-y-3">
                  {conflictSeats.map(c => (
                    <div key={c.seat} className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid #fde68a' }}>
                      <div className="px-3 py-2 flex items-center justify-between"
                        style={{ background: '#fef9c3' }}>
                        <span className="text-sm font-bold" style={{ color: '#854d0e', fontFamily: "'Georgia', serif" }}>
                          Seat {c.seat}
                        </span>
                        <span className="text-[10px] font-semibold" style={{ color: '#854d0e' }}>
                          {c.shifts.map(sh => shiftFullName[sh]).join(' · ')}
                        </span>
                      </div>
                      <div style={{ background: T.surface }}>
                        {c.occupants.map((o, i) => (
                          <div key={i} className="px-3 py-2 flex items-center justify-between"
                            style={{ borderTop: i > 0 ? `1px solid ${T.border}` : undefined }}>
                            <div>
                              <Link href={`/student/${o.mobile}`} className="text-xs font-medium hover:underline"
                                style={{ color: T.accent }}
                                onClick={() => setShowConflictsModal(false)}>
                                {o.name}
                              </Link>
                              <p className="text-[10px]" style={{ color: T.textMuted }}>{o.mobile}</p>
                            </div>
                            <div className="text-right">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{
                                  background: isExpiredStatus(o.status) ? '#fee2e2' : '#dcfce7',
                                  color: isExpiredStatus(o.status) ? '#991b1b' : '#166534',
                                }}>
                                {o.status}
                              </span>
                              <p className="text-[9px] mt-0.5" style={{ color: T.textMuted }}>till {formatDate(o.expiry)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
