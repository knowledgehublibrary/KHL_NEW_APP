'use client'

//export const dynamic = 'force-dynamic'

import { useEffect, useState, useMemo, useTransition, memo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

let cachedStudents: any[] | null = null

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyxI48i0cFx3c4-MRADfa5nQKQJLIzJR8xAwB0UArEe0_arfxRObvjZA3Tccc6pRE4/exec'
const RENEW_FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSc5KbtfqUpgRuohNyQdhVb-xahCRVTBizCXPobr0vyErzvX_Q/viewform'
const PHOTO_FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSfq6Ajw4dxXw1PiwLR_Bu6GhNccUXSRTSo6yQgj_2o6SpZDkw/viewform'
const PHOTO_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzX-eQ5-UcKiDY1Aa15KnXG52gEK33tkIVAXaWM8lN5CFxdnMyZXqVng0rfnfWYh-vG/exec'

// ─── WHATSAPP INVITE CONFIG ─────────────────────────────────────────────────
const GOOGLE_REVIEW_URL = 'https://g.co/kgs/iMBXRFr'
const WHATSAPP_GROUP_MALE = 'https://chat.whatsapp.com/H23JTiAuQbN9TmlIQeA64z?s=cl&p=a&ilr=0&amv=3'
const WHATSAPP_GROUP_FEMALE = 'https://chat.whatsapp.com/IlYbehz9Lgh8FaaEK2cSNd?s=cl&p=a&ilr=0&amv=3'
const LIBRARY_CONTACT = '9329719892'

function buildWhatsAppInviteMessage(name: string, gender: string) {
  const groupLink = gender === 'Female' ? WHATSAPP_GROUP_FEMALE : WHATSAPP_GROUP_MALE
  return `Hi ${name} 🙏
Thank you for joining Knowledge Hub Library! We're delighted to have you with us. 📚✨
Please join our WhatsApp group to stay updated with announcements, holidays & library updates: 👉 ${groupLink}
📞 For any issues, reach us at: ${LIBRARY_CONTACT} ⭐ Loved your experience? Do rate us on Google: ${GOOGLE_REVIEW_URL}
Discover, Learn & Grow with us!!🌟 — Knowledge Hub Library`
}

function getWhatsAppSendUrl(mobile: string, message: string) {
  return `https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`
}

const T = {
  bg: '#faf8f5', surface: '#ffffff',
  border: '#ede8e1', borderHover: '#ddd4c8',
  accent: '#c47b3a', accentLight: '#fdf0e4', accentBorder: '#f0d4b0',
  text: '#1c1917', textSub: '#78716c', textMuted: '#a8a29e',
}

const SHIFTS = ['6 AM - 12 PM', '12 PM - 6 PM', '6 PM - 11 PM']

// ─── FEES CONFIG TYPES ────────────────────────────────────────────────────────
interface FeeConfig {
  seat_type: 'unreserved' | 'reserved'
  months: number
  amount: number
  referral_amount: number  // ← NEW
}

/** Derive seat type from seat string */
function getSeatType(seat: string): 'unreserved' | 'reserved' {
  const n = parseInt(seat)
  return isNaN(n) || n === 0 ? 'unreserved' : 'reserved'
}

/** Look up fee for a given seat + months combo. Returns null if not found in config. */
function lookupFee(feeConfigs: FeeConfig[], seat: string, months: string): number | null {
  const seatType = getSeatType(seat)
  const m = parseInt(months)
  if (isNaN(m)) return null
  const entry = feeConfigs.find(f => f.seat_type === seatType && f.months === m)
  return entry ? entry.amount : null
}

// ─── NEW: Look up referral_amount for a seat + months combo ──────────────────
/** Returns 0 for unreserved or if not found */
function lookupReferralAmount(feeConfigs: FeeConfig[], seat: string, months: string): number {
  const seatType = getSeatType(seat)
  if (seatType === 'unreserved') return 0
  const m = parseInt(months)
  if (isNaN(m)) return 0
  const entry = feeConfigs.find(f => f.seat_type === seatType && f.months === m)
  return entry ? (entry.referral_amount ?? 0) : 0
}

/** Get valid month options for a given seat type */
function getValidMonths(feeConfigs: FeeConfig[], seat: string): number[] {
  const seatType = getSeatType(seat)
  return feeConfigs
    .filter(f => f.seat_type === seatType)
    .map(f => f.months)
    .sort((a, b) => a - b)
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

/** Days until expiry (positive = future, negative = already past, null = no date) */
function getExpiryDiffDays(dateStr: string): number | null {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  if (isNaN(expiry.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  expiry.setHours(0, 0, 0, 0)
  return Math.round((expiry.getTime() - today.getTime()) / 86400000)
}

/** Pretty date for the expiry ribbon, e.g. "19 Jun 2026" */
function formatExpiryDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Trim + convert any casing to Title Case */
function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

async function pingAppsScript() {
  try {
    await fetch(APPS_SCRIPT_URL, { method: 'GET', mode: 'no-cors' })
  } catch (e) {
    console.warn('Apps Script ping failed:', e)
  }
}

// ─── SEAT OCCUPANCY HELPERS ───────────────────────────────────────────────────
async function fetchSeatOccupants(seat: string) {
  if (!seat || seat === '0') return []
  const { data, error } = await supabase
    .from('v_student_summary')
    .select('name, mobile_number, status, latest_seat, latest_shift')
    .eq('latest_seat', seat)
  if (error || !data) return []
  return data.filter(
    (s) => s.status?.includes('Active') || s.status?.includes('Expired')
  )
}

function formatOccupants(list: any[], excludeMobile?: string): string | null {
  const filtered = excludeMobile ? list.filter((s) => s.mobile_number !== excludeMobile) : list
  if (filtered.length === 0) return null
  if (filtered.length === 1) return filtered[0].name
  return `${filtered[0].name}+${filtered.length - 1}`
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
function ConfirmModal({ message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: {
  message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(28,25,23,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full sm:max-w-xs rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="h-[3px] rounded-t-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${danger ? '#dc2626' : T.accent}, transparent)` }} />
        <div className="p-6 pb-[max(24px,env(safe-area-inset-bottom,24px))]">
          <p className="text-sm font-medium text-center mb-6" style={{ color: T.text }}>{message}</p>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-3 rounded-xl text-sm font-medium"
              style={{ border: `1px solid ${T.border}`, color: T.textSub }}>
              Cancel
            </button>
            <button onClick={onConfirm}
              className="flex-1 py-3 rounded-xl text-sm font-semibold"
              style={{ background: danger ? '#dc2626' : T.accent, color: 'white' }}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── WHATSAPP INVITE MODAL ────────────────────────────────────────────────────
function InviteWhatsAppModal({ student, onClose }: {
  student: { name: string; mobile: string; gender: string }; onClose: () => void
}) {
  const waUrl = getWhatsAppSendUrl(student.mobile, buildWhatsAppInviteMessage(student.name, student.gender))

  const handleSend = () => {
    window.open(waUrl, '_blank')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(28,25,23,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="h-[3px] rounded-t-2xl" style={{ background: 'linear-gradient(90deg, transparent, #25D366, transparent)' }} />
        <div className="p-6 pb-[max(24px,env(safe-area-inset-bottom,24px))] text-center">
          <p className="text-4xl mb-2">🎉</p>
          <h3 className="font-bold text-lg mb-1" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
            Admission Successful!
          </h3>
          <p className="text-sm mb-6" style={{ color: T.textSub }}>
            Invite <span className="font-semibold" style={{ color: T.text }}>{student.name}</span> to our WhatsApp community
          </p>
          <button onClick={handleSend}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold"
            style={{ background: '#25D366', color: 'white' }}>
            📲 Send WhatsApp Invite
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() || ''
  let bg = '#fef9c3', color = '#854d0e', border = '#fde68a'
  if (s.includes('expired')) { bg = '#fee2e2'; color = '#991b1b'; border = '#fca5a5' }
  else if (s.includes('active')) { bg = '#dcfce7'; color = '#166534'; border = '#86efac' }
  else if (s.includes('blocked')) { bg = '#f3f4f6'; color = '#4b5563'; border = '#d1d5db' }
  else if (s.includes('freeze')) { bg = '#e0f2fe'; color = '#075985'; border = '#7dd3fc' }
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {status}
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-5">
      <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: T.textMuted }}>
        {children}
      </span>
      <div className="flex-1 h-px" style={{ background: T.border }} />
    </div>
  )
}

function NewAdmissionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
      style={{ background: T.accent, color: 'white', boxShadow: `0 2px 12px ${T.accent}50` }}>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      New Admission
    </button>
  )
}

// ─── SEAT STATUS LINE (shared UI for both popups) ─────────────────────────────
function SeatStatusLine({ seat, checking, occupantLabel }: {
  seat: string; checking: boolean; occupantLabel: string | null
}) {
  if (!seat || seat === '0') return null
  return (
    <p className="text-[10px] mt-1.5 font-medium" style={{ color: occupantLabel ? '#b45309' : T.textMuted }}>
      {checking
        ? 'Checking seat…'
        : occupantLabel
          ? `💺 ${occupantLabel} currently on this seat`
          : '✓ No one else on this seat'}
    </p>
  )
}

// ─── MONTHS PILLS (shared UI for both popups) ─────────────────────────────────
function MonthsPills({
  feeConfigs, feeConfigsLoading, seat, months, isAdmin,
  customMonths, showCustom,
  onSelectMonth, onCustomMonthsChange, onToggleCustom,
}: {
  feeConfigs: FeeConfig[]
  feeConfigsLoading: boolean
  seat: string
  months: string
  isAdmin: boolean
  customMonths: string
  showCustom: boolean
  onSelectMonth: (m: number) => void
  onCustomMonthsChange: (val: string) => void
  onToggleCustom: () => void
}) {
  const validMonths = getValidMonths(feeConfigs, seat)
  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }

  if (feeConfigsLoading) {
    return <div className="h-10 rounded-xl animate-pulse" style={{ background: T.border }} />
  }

  return (
    <div>
      <select
        value={showCustom ? 'custom' : months}
        onChange={(e) => {
          if (e.target.value === 'custom') {
            onToggleCustom()
          } else {
            onSelectMonth(parseInt(e.target.value))
          }
        }}
        className="w-full px-3 py-2.5 rounded-xl focus:outline-none appearance-none"
        style={inputStyle}
      >
        {validMonths.map((m) => (
          <option key={m} value={m}>{m} Month{m !== 1 ? 's' : ''}</option>
        ))}
        {isAdmin && <option value="custom">✏️ Custom</option>}
      </select>

      {validMonths.length === 0 && (
        <p className="text-xs mt-1" style={{ color: '#dc2626' }}>
          No fee plans configured for this seat type.
          {isAdmin ? ' Use Custom option.' : ' Contact admin.'}
        </p>
      )}

      {/* Custom months input — admin only */}
      {showCustom && isAdmin && (
        <div className="mt-2">
          <input
            type="number"
            value={customMonths}
            onChange={(e) => onCustomMonthsChange(e.target.value)}
            min="1"
            placeholder="Enter months"
            className="w-full px-3 py-2.5 rounded-xl focus:outline-none text-sm"
            style={{ background: '#fefce8', border: '1px solid #fde047', color: T.text, fontSize: '16px' }}
          />
          <p className="text-[10px] mt-1" style={{ color: '#854d0e' }}>
            ⚠️ Admin override — fees must be entered manually
          </p>
        </div>
      )}
    </div>
  )
}

// ─── FEES DISPLAY (shared UI for both popups) ─────────────────────────────────
function FeesDisplay({
  feeConfigs, feeConfigsLoading, seat, months, showCustom,
  finalFees, feesSubmitted, isAdmin,
  feesOverride, onToggleOverride,
  onFinalFeesChange, onFeesSubmittedChange,
  labelCls, inputCls,
}: {
  feeConfigs: FeeConfig[]
  feeConfigsLoading: boolean
  seat: string
  months: string
  showCustom: boolean
  finalFees: string
  feesSubmitted: string
  isAdmin: boolean
  feesOverride: boolean
  onToggleOverride: () => void
  onFinalFeesChange: (val: string) => void
  onFeesSubmittedChange: (val: string) => void
  labelCls: string
  inputCls: string
}) {
  const resolvedFee = lookupFee(feeConfigs, seat, months)
  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }
  const readonlyStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }
  const overrideStyle: React.CSSProperties = { background: '#fefce8', border: '1px solid #fde047', color: T.text, fontSize: '16px' }

  const showFeeReadonly = !feesOverride && !showCustom && resolvedFee !== null && !feeConfigsLoading

  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className={labelCls} style={{ color: T.textSub, marginBottom: 0 }}>Final Fees *</label>
          {isAdmin && (
            <button
              type="button"
              onClick={onToggleOverride}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-lg"
              style={{
                color: feesOverride ? '#854d0e' : T.textMuted,
                background: feesOverride ? '#fefce8' : 'transparent',
                border: `1px solid ${feesOverride ? '#fde047' : T.border}`,
              }}
            >
              {feesOverride ? '🔓 Override on' : '✏️ Override'}
            </button>
          )}
        </div>

        {feeConfigsLoading ? (
          <div className="h-10 rounded-xl animate-pulse" style={{ background: T.border }} />
        ) : showFeeReadonly ? (
          <div>
            <div className="px-3 py-2.5 rounded-xl text-sm font-semibold" style={readonlyStyle}>
              ₹{finalFees || resolvedFee}
            </div>
            <p className="text-[10px] mt-1" style={{ color: T.textMuted }}>
              {getSeatType(seat) === 'reserved' ? '🪑 Reserved' : '🔓 Unreserved'} · {months} month{parseInt(months) !== 1 ? 's' : ''}
            </p>
          </div>
        ) : showCustom || resolvedFee === null || feesOverride ? (
          <div>
            <input
              type="number"
              value={finalFees}
              onChange={(e) => onFinalFeesChange(e.target.value)}
              className={inputCls}
              style={feesOverride ? overrideStyle : inputStyle}
              placeholder="Enter fees"
            />
            {feesOverride && (
              <p className="text-[10px] mt-1" style={{ color: '#854d0e' }}>⚠️ Admin override active</p>
            )}
            {showCustom && !feesOverride && (
              <p className="text-[10px] mt-1" style={{ color: '#854d0e' }}>Enter fees for custom months</p>
            )}
            {resolvedFee === null && !showCustom && !feesOverride && (
              <p className="text-[10px] mt-1" style={{ color: '#dc2626' }}>No fee configured for this combo</p>
            )}
          </div>
        ) : null}
      </div>

      <div>
        <label className={labelCls} style={{ color: T.textSub }}>Fees Submitted *</label>
        <input
          type="number"
          value={feesSubmitted}
          onChange={(e) => onFeesSubmittedChange(e.target.value)}
          className={inputCls}
          style={inputStyle}
          placeholder="Amount paid"
        />
      </div>
    </div>
  )
}

// ─── STUDENT CARD ─────────────────────────────────────────────────────────────
const StudentCard = memo(({
  s, selectable, selected, onToggle, onRenew, role, highlight,
}: {
  s: any; selectable: boolean; selected: boolean
  onToggle: (mobile: string) => void; onRenew: (s: any) => void; role: string
  highlight?: 'yellow' | 'red' | null
}) => {
  const isPrivileged = role === 'admin' || role === 'manager' || role === 'partner'
  const canRenew = isPrivileged && s.status?.toLowerCase().includes('expired')
  const statusDot = s.status?.includes('Active') ? '#16a34a'
    : s.status?.includes('Blocked') ? '#9ca3af'
      : s.status?.toLowerCase().includes('freeze') ? '#0ea5e9'
        : '#dc2626'

  const innerContent = (
    <>
      {selectable && (
        <div className="absolute top-3 right-3 z-10 w-5 h-5 rounded-md flex items-center justify-center"
          style={{ background: selected ? T.accent : 'transparent', border: `2px solid ${selected ? T.accent : T.borderHover}` }}>
          {selected && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </div>
      )}
      <div className="flex items-center gap-4 p-4">
        <div className="relative shrink-0">
          <img loading="lazy" src={getProxyUrl(s.image_url) || '/default-avatar.png'}
            onError={(e) => { e.currentTarget.src = '/default-avatar.png' }}
            className="w-14 h-14 rounded-xl object-cover" style={{ border: `1px solid ${T.border}` }} />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2"
            style={{ borderColor: T.surface, background: statusDot }} />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <p className="font-semibold truncate" style={{ color: T.text, fontFamily: "'Georgia', serif", fontSize: '15px' }}>{s.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color: T.textSub }}>
              {s.mobile_number}
            </span>
            <a
              href={`tel:${s.mobile_number}`}
              onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation() }}
              onTouchEnd={(e) => { e.stopPropagation(); window.location.href = `tel:${s.mobile_number}` }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: T.accentLight, color: T.accent, border: `1px solid ${T.accentBorder}`, textDecoration: 'none' }}
            >
              📞 Call
            </a>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={s.status} />
            {s.total_due > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}>
                Due ₹{s.total_due}
              </span>
            )}
            <span className="text-[10px]" style={{ color: T.textMuted }}>📄 {s.total_admissions}</span>
            {s.latest_expiry && (
              <span className="text-[10px] font-medium" style={{ color: T.textMuted }}>
                📅 {formatExpiryDate(s.latest_expiry)}
              </span>
            )}
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

  const router = useRouter()

  const highlightBg = highlight === 'yellow' ? '#fefce8' : highlight === 'red' ? '#fef2f2' : T.surface
  const highlightBorder = highlight === 'yellow' ? '#fde047' : highlight === 'red' ? '#fca5a5' : T.border

  const baseStyle: React.CSSProperties = {
    background: selected ? T.accentLight : highlightBg,
    border: `1px solid ${selected ? T.accentBorder : highlightBorder}`,
    boxShadow: selected ? `0 0 0 2px ${T.accentBorder}` : highlight ? `0 0 0 1px ${highlightBorder}` : '0 1px 3px rgba(0,0,0,0.06)',
  }

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('a') || target.closest('button')) return
    router.push(`/student/${s.mobile_number}`)
  }

  if (selectable) {
    return (
      <div className="relative rounded-2xl overflow-hidden cursor-pointer select-none" style={baseStyle}
        onClick={() => onToggle(s.mobile_number)}>{innerContent}</div>
    )
  }
  return (
    <div
      className="relative rounded-2xl overflow-hidden cursor-pointer hover:bg-orange-50/40 transition-colors"
      style={baseStyle}
      onClick={handleCardClick}
    >
      {innerContent}
    </div>
  )
})
StudentCard.displayName = 'StudentCard'

// ─── MODAL SHELL ──────────────────────────────────────────────────────────────
function ModalShell({ onBackdropClick, children }: {
  onBackdropClick: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onBackdropClick() }}>
      <div
        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          maxHeight: 'calc(100dvh - 60px)',
        }}>
        {children}
      </div>
    </div>
  )
}

// ─── REFERRER CARD (non-clickable, shown in New Admission) ───────────────────
function ReferrerCard({ student }: { student: any }) {
  const isActive = student.status?.toLowerCase().includes('active')
  const hasReservedSeat = parseInt(student.latest_seat) > 0

  const statusDot = isActive ? '#16a34a'
    : student.status?.toLowerCase().includes('blocked') ? '#9ca3af'
      : student.status?.toLowerCase().includes('freeze') ? '#0ea5e9'
        : '#dc2626'

  const cardBg = isActive && hasReservedSeat ? '#f0fdf4' : '#fef2f2'
  const cardBorder = isActive && hasReservedSeat ? '#86efac' : '#fca5a5'

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
      <div className="flex items-center gap-4 p-4">
        <div className="relative shrink-0">
          <img loading="lazy" src={getProxyUrl(student.image_url) || '/default-avatar.png'}
            onError={(e) => { e.currentTarget.src = '/default-avatar.png' }}
            className="w-14 h-14 rounded-xl object-cover" style={{ border: `1px solid ${T.border}` }} />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2"
            style={{ borderColor: T.surface, background: statusDot }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate" style={{ color: T.text, fontFamily: "'Georgia', serif", fontSize: '15px' }}>
            {student.name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: T.textSub }}>{student.mobile_number}</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={student.status} />
            {student.latest_seat && parseInt(student.latest_seat) > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: '#e0f2fe', color: '#075985', border: '1px solid #7dd3fc' }}>
                🪑 Seat {student.latest_seat}
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Status message */}
      {!isActive && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs font-semibold" style={{ color: '#991b1b' }}>
            ❌ Referrer is {student.status?.toLowerCase()} — referral will not be counted
          </p>
        </div>
      )}
      {isActive && !hasReservedSeat && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs font-semibold" style={{ color: '#991b1b' }}>
            ❌ Referrer has no reserved seat — referral will not be counted
          </p>
        </div>
      )}
      {isActive && hasReservedSeat && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-xs font-semibold" style={{ color: '#166534' }}>
            ✅ Referrer is active with a reserved seat — referral is valid
          </p>
        </div>
      )}
    </div>
  )
}

// ─── RENEW POPUP ──────────────────────────────────────────────────────────────
function RenewPopup({ student, userName, role, onClose, onSuccess }: {
  student: any; userName: string; role: string; onClose: () => void; onSuccess: () => void
}) {
  const isAdmin = role === 'admin'
  const [saving, setSaving] = useState(false)
  const [regId, setRegId] = useState('')
  const [regIdLoading, setRegIdLoading] = useState(true)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  // ── Fee config ─────────────────────────────────────────────────────────────
  const [feeConfigs, setFeeConfigs] = useState<FeeConfig[]>([])
  const [feeConfigsLoading, setFeeConfigsLoading] = useState(true)

  const latestExpiry = toInputDate(student.latest_expiry || '')
  const [startDate, setStartDate] = useState(latestExpiry)

  const [months, setMonths] = useState(student.latest_months?.toString() || '1')
  const [showCustom, setShowCustom] = useState(false)
  const [customMonths, setCustomMonths] = useState('')
  const [feesOverride, setFeesOverride] = useState(false)

  const [seat, setSeat] = useState(student.latest_seat?.toString() || '')
  const [selectedShifts, setSelectedShifts] = useState<string[]>(
    student.latest_shift ? student.latest_shift.split(', ').map((x: string) => x.trim()) : []
  )
  const [finalFees, setFinalFees] = useState('')
  const [feesSubmitted, setFeesSubmitted] = useState('')
  const [mode, setMode] = useState('Cash')
  const [comment, setComment] = useState('')
  const now = new Date().toISOString()

  // ── REFERRAL: pending discount for this student (as referrer) ─────────────
  const [pendingReferralAmount, setPendingReferralAmount] = useState(0)
  const [referralLoaded, setReferralLoaded] = useState(false)
  const isReservedSeatRenew = parseInt(seat) > 0

  // ── Seat occupancy check ───────────────────────────────────────────────────
  const [seatOccupants, setSeatOccupants] = useState<any[]>([])
  const [seatChecking, setSeatChecking] = useState(false)

  useEffect(() => {
    let active = true
    setSeatChecking(true)
    const t = setTimeout(async () => {
      const occ = await fetchSeatOccupants(seat)
      if (active) { setSeatOccupants(occ); setSeatChecking(false) }
    }, 350)
    return () => { active = false; clearTimeout(t) }
  }, [seat])

  const seatOccupantLabel = formatOccupants(seatOccupants, student.mobile_number)

  // ── Load fee configs ───────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setFeeConfigsLoading(true)
      const { data } = await supabase
        .schema('library_management')
        .from('fees_config')
        .select('seat_type, months, amount, referral_amount')  // ← updated
        .eq('is_active', true)
        .order('seat_type')
        .order('months')
      setFeeConfigs((data as FeeConfig[]) || [])
      setFeeConfigsLoading(false)
    }
    load()
  }, [])

  // ── Load pending referral discounts for this student ──────────────────────
  useEffect(() => {
    const loadReferral = async () => {
      const { data } = await supabase
        .schema('library_management')
        .from('referral_discounts')
        .select('amount')
        .eq('referrer_mobile', student.mobile_number)
        .eq('status', 'pending')
      const total = (data || []).reduce((sum: number, r: any) => sum + (r.amount || 0), 0)
      setPendingReferralAmount(total)
      setReferralLoaded(true)
    }
    loadReferral()
  }, [student.mobile_number])

  // ── Auto-resolve fees when seat/months/configs change ─────────────────────
  useEffect(() => {
    if (feeConfigsLoading || feesOverride || showCustom) return
    const fee = lookupFee(feeConfigs, seat, months)
    if (fee !== null) {
      setFinalFees(fee.toString())
      setFeesSubmitted(fee.toString())
    } else {
      setFinalFees('')
      setFeesSubmitted('')
    }
  }, [seat, months, feeConfigs, feeConfigsLoading, feesOverride, showCustom])

  // ── Auto-apply referral discount to fees_submitted (reserved seat only) ───
  useEffect(() => {
    if (!referralLoaded || pendingReferralAmount === 0) return
    if (feesOverride || showCustom || feeConfigsLoading) return
    if (!isReservedSeatRenew) return
    const fee = lookupFee(feeConfigs, seat, months)
    if (fee !== null) {
      const discounted = Math.max(0, fee - pendingReferralAmount)
      setFinalFees(discounted.toString())
      setFeesSubmitted(discounted.toString())
    }
  }, [referralLoaded, pendingReferralAmount, seat, months, feeConfigs, feeConfigsLoading, feesOverride, showCustom, isReservedSeatRenew])

  // ── When seat type changes, reset months to first valid option ─────────────
  const prevSeatTypeRef = useRef<string>('')
  useEffect(() => {
    const newType = getSeatType(seat)
    if (newType !== prevSeatTypeRef.current && !feeConfigsLoading) {
      prevSeatTypeRef.current = newType
      const validMs = getValidMonths(feeConfigs, seat)
      if (validMs.length > 0 && !showCustom) {
        setMonths(validMs[0].toString())
      }
    }
  }, [seat, feeConfigs, feeConfigsLoading])

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

  const handleStartDateChange = (val: string) => {
    setStartDate(val)
    if (isDateOlderThan20Days(val)) setError('Start date cannot be older than 20 days')
    else if (error.includes('Start date')) setError('')
  }

  const handleSelectMonth = (m: number) => {
    setShowCustom(false)
    setCustomMonths('')
    setMonths(m.toString())
  }

  const handleToggleCustom = () => {
    const next = !showCustom
    setShowCustom(next)
    if (next) {
      setCustomMonths('')
      setFinalFees('')
      setFeesSubmitted('')
    } else {
      setCustomMonths('')
      const validMs = getValidMonths(feeConfigs, seat)
      if (validMs.length > 0) setMonths(validMs[0].toString())
    }
  }

  const handleCustomMonthsChange = (val: string) => {
    setCustomMonths(val)
    setMonths(val)
  }

  const handleToggleFeesOverride = () => {
    const next = !feesOverride
    setFeesOverride(next)
    if (!next) {
      const fee = lookupFee(feeConfigs, seat, months)
      if (fee !== null) { setFinalFees(fee.toString()); setFeesSubmitted(fee.toString()) }
      else { setFinalFees(''); setFeesSubmitted('') }
    }
  }

  const handleSubmit = async () => {
    setWarning('')
    setError('')

    if (!startDate || !months || !seat || selectedShifts.length === 0 || !finalFees || !feesSubmitted) {
      setError('Please fill all required fields'); return
    }
    const seatNum = parseInt(seat)
    if (isNaN(seatNum) || seatNum < 0 || seatNum > 92) { setError('Seat must be between 0 and 92'); return }
    if (isNaN(parseFloat(months)) || parseFloat(months) < 1) { setError('Months must be at least 1'); return }

    if (!feesOverride && !showCustom) {
      const expectedFee = lookupFee(feeConfigs, seat, months)
      if (expectedFee === null) {
        if (!isAdmin) { setError('No fee plan configured for this seat + month combination. Contact admin.'); return }
        else setWarning('⚠️ No fee plan found for this combo. Proceeding as admin override.')
      } else if (parseFloat(finalFees) !== expectedFee) {
        if (!isAdmin) { setError(`Fees must be ₹${expectedFee} for this plan.`); return }
        else setWarning(`⚠️ Fees differ from configured ₹${expectedFee}. Proceeding as admin override.`)
      }
    }

    if (isDateOlderThan20Days(startDate)) {
      if (!isAdmin) { setError('Start date cannot be older than 20 days'); return }
      else setWarning(w => w ? w + ' Start date is older than 20 days.' : '⚠️ Start date is older than 20 days. Proceeding as admin override.')
    }

    if (!regId) { setError('Register ID not loaded'); return }
    setSaving(true)

    const payload = {
      timestamp: now, name: student.name, mobile_number: student.mobile_number,
      admission: 'Renew', address: null, gender: null, date_of_birth: null, aadhar_number: null, photo: null,
      start_date: startDate, months: parseFloat(months), seat, shift: selectedShifts.join(', '),
      final_fees: parseFloat(finalFees), fees_submitted: parseFloat(feesSubmitted),
      mode, register_id: regId, comment: comment || null, created_by: userName,
    }

    const { error: insertError } = await supabase.schema('library_management').from('admission_responses').insert([payload])
    if (insertError) { setError(insertError.message); setSaving(false); return }

    // ── REFERRAL STEP 1: Apply pending discounts if reserved seat ─────────────
    if (isReservedSeatRenew && pendingReferralAmount > 0) {
      await supabase
        .schema('library_management')
        .from('referral_discounts')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString(),
          referrer_reg_id: regId,  // ← Naman's renewal register_id
        })
        .eq('referrer_mobile', student.mobile_number)
        .eq('status', 'pending')
    }
    
    // ── REFERRAL STEP 2: Credit referrer if this student was referred ─────────
    if (isReservedSeatRenew) {
      const { data: originalAdmission } = await supabase
        .schema('library_management')
        .from('admission_responses')
        .select('referred_by_mobile, register_id')
        .eq('mobile_number', student.mobile_number)
        .eq('admission', 'New')
        .not('referred_by_mobile', 'is', null)
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle()
    
      if (originalAdmission?.referred_by_mobile) {
        const referralAmt = lookupReferralAmount(feeConfigs, seat, months)
        if (referralAmt > 0) {
          await supabase.schema('library_management').from('referral_discounts').insert([{
            referrer_mobile: originalAdmission.referred_by_mobile,
            referred_mobile: student.mobile_number,
            referred_reg_id: regId,  // ← this renewal's register_id
            amount: referralAmt,
            status: 'pending',
          }])
        }
      }
    }

    pingAppsScript()
    onSuccess(); onClose()
  }

  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }
  const readonlyStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }
  const labelCls = "text-[10px] uppercase tracking-widest mb-1.5 block font-medium"
  const inputCls = "w-full px-3 py-2.5 rounded-xl focus:outline-none"

  return (
    <ModalShell onBackdropClick={onClose}>
      <div className="h-[3px] rounded-t-2xl shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }} />
      <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: T.border }} />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6" style={{ WebkitOverflowScrolling: 'touch' as any }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>Renew Membership</h2>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>All fields marked * are required</p>
          </div>
          <button onClick={onClose} className="text-xl p-1" style={{ color: T.textMuted }}>✕</button>
        </div>
        <div className="mb-5 px-3 py-2.5 rounded-xl text-xs" style={readonlyStyle}>
          🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Name</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{student.name}</div>
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Mobile</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{student.mobile_number}</div>
          </div>
        </div>
        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Register ID</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>
            {regIdLoading ? <span className="animate-pulse">Fetching…</span> : regId || '—'}
          </div>
        </div>
        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Start Date *</label>
          <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} className={inputCls} style={inputStyle} />
        </div>

        {/* Seat + Months side-by-side */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Seat (0–92) *</label>
            <input type="number" value={seat} onChange={(e) => setSeat(e.target.value)} min="0" max="92" className={inputCls} style={inputStyle} />
            <SeatStatusLine seat={seat} checking={seatChecking} occupantLabel={seatOccupantLabel} />
            {seat !== '' && (
              <p className="text-[10px] mt-1" style={{ color: T.textMuted }}>
                {getSeatType(seat) === 'reserved' ? '🪑 Reserved seat' : '🔓 Unreserved (walk-in)'}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Months *</label>
            <MonthsPills
              feeConfigs={feeConfigs}
              feeConfigsLoading={feeConfigsLoading}
              seat={seat}
              months={months}
              isAdmin={isAdmin}
              customMonths={customMonths}
              showCustom={showCustom}
              onSelectMonth={handleSelectMonth}
              onCustomMonthsChange={handleCustomMonthsChange}
              onToggleCustom={handleToggleCustom}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Shift *</label>
          <div className="space-y-2">
            {SHIFTS.map((shift) => {
              const checked = selectedShifts.includes(shift)
              return (
                <label key={shift} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                  style={{ background: checked ? T.accentLight : T.bg, border: `1px solid ${checked ? T.accentBorder : T.border}` }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleShift(shift)} className="hidden" />
                  <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                    style={{ background: checked ? T.accent : 'transparent', border: `2px solid ${checked ? T.accent : T.borderHover}` }}>
                    {checked && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-sm" style={{ color: checked ? T.text : T.textSub }}>{shift}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* ── REFERRAL DISCOUNT BANNER ─────────────────────────────────────── */}
        {referralLoaded && pendingReferralAmount > 0 && (
          <div className="mb-4 px-4 py-3 rounded-xl"
            style={{
              background: isReservedSeatRenew ? '#f0fdf4' : '#fefce8',
              border: `1px solid ${isReservedSeatRenew ? '#86efac' : '#fde047'}`,
            }}>
            {isReservedSeatRenew ? (
              <>
                <p className="text-xs font-semibold" style={{ color: '#166534' }}>
                  🎁 Referral discount of ₹{pendingReferralAmount} applied!
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#16a34a' }}>
                  Original fees ₹{lookupFee(feeConfigs, seat, months) ?? '—'} — you pay ₹{Math.max(0, (lookupFee(feeConfigs, seat, months) ?? 0) - pendingReferralAmount)} after discount
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold" style={{ color: '#854d0e' }}>
                  🎁 You have ₹{pendingReferralAmount} referral discount pending
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#92400e' }}>
                  Cannot claim for unreserved seat — switch to a reserved seat to use your discount
                </p>
              </>
            )}
          </div>
        )}

        {/* Fees */}
        <FeesDisplay
          feeConfigs={feeConfigs}
          feeConfigsLoading={feeConfigsLoading}
          seat={seat}
          months={months}
          showCustom={showCustom}
          finalFees={finalFees}
          feesSubmitted={feesSubmitted}
          isAdmin={isAdmin}
          feesOverride={feesOverride}
          onToggleOverride={handleToggleFeesOverride}
          onFinalFeesChange={(val) => setFinalFees(val)}
          onFeesSubmittedChange={(val) => setFeesSubmitted(val)}
          labelCls={labelCls}
          inputCls={inputCls}
        />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Payment Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={inputCls + ' appearance-none'} style={inputStyle}>
              <option value="Cash">Cash</option>
              <option value="Online">Online</option>
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
            placeholder="Any notes…" className={inputCls + ' resize-none'} style={inputStyle} />
        </div>
        <div className="mb-2">
          <label className={labelCls} style={{ color: T.textSub }}>Created By</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{userName}</div>
        </div>
        {warning && (
          <div className="mt-4 px-4 py-2.5 rounded-xl" style={{ background: '#fefce8', border: '1px solid #fde047' }}>
            <p className="text-sm" style={{ color: '#854d0e' }}>{warning}</p>
          </div>
        )}
        {error && (
          <div className="mt-4 px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
            <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
          </div>
        )}
      </div>
      <div className="shrink-0 flex gap-3 p-4 pt-3"
        style={{ borderTop: `1px solid ${T.border}`, background: T.surface, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
        <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm"
          style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving || regIdLoading || feeConfigsLoading}
          className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: T.accent, color: 'white' }}>
          {saving
            ? <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Saving…
              </span>
            : '✓ Confirm Renewal'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── DRAFT HELPERS ────────────────────────────────────────────────────────────
const DRAFT_KEY = 'new_admission_draft'

function getDrivePreviewUrl(driveUrl: string): string {
  if (!driveUrl) return ''
  try {
    const idMatch = driveUrl.match(/[?&]id=([^&]+)/) || driveUrl.match(/\/d\/([^/]+)/)
    if (idMatch?.[1]) return `https://lh3.googleusercontent.com/d/${idMatch[1]}`
  } catch {}
  return driveUrl
}

function loadDraft(): Record<string, any> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveDraft(patch: Record<string, any>) {
  try {
    const current = loadDraft()
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...current, ...patch }))
  } catch {}
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}


// ─── NEW ADMISSION POPUP ──────────────────────────────────────────────────────
function NewAdmissionPopup({ userName, role, onClose, onSuccess }: {
  userName: string; role: string; onClose: () => void
  onSuccess: (student: { name: string; mobile: string; gender: string }) => void
}) {
  const isAdmin = role === 'admin'
  const draft = loadDraft()

  const [regId, setRegId] = useState('')
  const [regIdLoading, setRegIdLoading] = useState(true)

  // ── Fee config ─────────────────────────────────────────────────────────────
  const [feeConfigs, setFeeConfigs] = useState<FeeConfig[]>([])
  const [feeConfigsLoading, setFeeConfigsLoading] = useState(true)

  // ── Photo ──────────────────────────────────────────────────────────────────
  const [photoVerified, setPhotoVerified] = useState(false)
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
  const [photoPhase, setPhotoPhase] = useState<'idle' | 'countdown' | 'polling' | 'done' | 'failed'>('idle')
  const [photoCountdown, setPhotoCountdown] = useState(30)
  const [pollCountdown, setPollCountdown] = useState(5)
  const [photoError, setPhotoError] = useState('')
  const pollingRef = useRef<{ stop: () => void } | null>(null)
  const [instantChecking, setInstantChecking] = useState(false)

  // ── Personal fields ────────────────────────────────────────────────────────
  const [name, setName] = useState(draft.name || '')
  const [mobile, setMobile] = useState(draft.mobile || '')
  const [mobileError, setMobileError] = useState('')
  const [existingStudent, setExistingStudent] = useState<any | null>(null)
  const [address, setAddress] = useState(draft.address || '')
  const [gender, setGender] = useState(draft.gender || '')
  const [dob, setDob] = useState(draft.dob || '')
  const [aadhar, setAadhar] = useState(draft.aadhar || '')

  // ── Admission fields ───────────────────────────────────────────────────────
  const now = new Date().toISOString()
  const [startDate, setStartDate] = useState(draft.startDate || toInputDate(now))
  const [months, setMonths] = useState(draft.months || '1')
  const [showCustom, setShowCustom] = useState(false)
  const [customMonths, setCustomMonths] = useState('')
  const [feesOverride, setFeesOverride] = useState(false)
  const [seat, setSeat] = useState(draft.seat ?? '0')
  const [selectedShifts, setSelectedShifts] = useState<string[]>(draft.selectedShifts || [...SHIFTS])
  const [finalFees, setFinalFees] = useState(draft.finalFees || '')
  const [feesSubmitted, setFeesSubmitted] = useState(draft.feesSubmitted || '')
  const [mode, setMode] = useState(draft.mode || 'Cash')
  const [comment, setComment] = useState(draft.comment || '')

  // ── REFERRAL fields ────────────────────────────────────────────────────────
  const [referralMobile, setReferralMobile] = useState('')
  const [referrerStudent, setReferrerStudent] = useState<any | null>(null)
  const [referrerLoading, setReferrerLoading] = useState(false)

  const isReservedSeat = parseInt(seat) > 0
  const referralValid = !!referrerStudent &&
    referrerStudent.status?.toLowerCase().includes('active') &&
    parseInt(referrerStudent.latest_seat) > 0

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  // Gate 1: mobile must be 10 digits and not a duplicate
  const mobileOk = mobile.length === 10 && !existingStudent
  // Gate 2: photo must be verified (only reachable after mobileOk)
  const fieldsLocked = !photoVerified

  // ── Seat occupancy check ───────────────────────────────────────────────────
  const [seatOccupants, setSeatOccupants] = useState<any[]>([])
  const [seatChecking, setSeatChecking] = useState(false)

  useEffect(() => {
    let active = true
    setSeatChecking(true)
    const t = setTimeout(async () => {
      const occ = await fetchSeatOccupants(seat)
      if (active) { setSeatOccupants(occ); setSeatChecking(false) }
    }, 350)
    return () => { active = false; clearTimeout(t) }
  }, [seat])

  const seatOccupantLabel = formatOccupants(seatOccupants)

  // ── Load fee configs once on mount ────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setFeeConfigsLoading(true)
      const { data } = await supabase
        .schema('library_management')
        .from('fees_config')
        .select('seat_type, months, amount, referral_amount')  // ← updated
        .eq('is_active', true)
        .order('seat_type')
        .order('months')
      setFeeConfigs((data as FeeConfig[]) || [])
      setFeeConfigsLoading(false)
    }
    load()
  }, [])

  // ── Auto-resolve fees when seat/months/configs change ─────────────────────
  useEffect(() => {
    if (feeConfigsLoading || feesOverride || showCustom) return
    const fee = lookupFee(feeConfigs, seat, months)
    if (fee !== null) {
      setFinalFees(fee.toString())
      setFeesSubmitted(fee.toString())
      sd({ finalFees: fee.toString(), feesSubmitted: fee.toString() })
    } else {
      setFinalFees('')
      setFeesSubmitted('')
      sd({ finalFees: '', feesSubmitted: '' })
    }
  }, [seat, months, feeConfigs, feeConfigsLoading, feesOverride, showCustom])

  // ── When seat type changes, reset months to first valid option ─────────────
  const prevSeatTypeRef = useRef<string>('')
  useEffect(() => {
    const newType = getSeatType(seat)
    if (newType !== prevSeatTypeRef.current && !feeConfigsLoading) {
      prevSeatTypeRef.current = newType
      const validMs = getValidMonths(feeConfigs, seat)
      if (validMs.length > 0 && !showCustom) {
        const newM = validMs[0].toString()
        setMonths(newM)
        sd({ months: newM })
      }
    }
  }, [seat, feeConfigs, feeConfigsLoading])

  // ── Clear referral if seat changes to unreserved ───────────────────────────
  useEffect(() => {
    if (!isReservedSeat) {
      setReferralMobile('')
      setReferrerStudent(null)
    }
  }, [isReservedSeat])

  // ── Referral mobile lookup ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isReservedSeat) return
    if (referralMobile.length !== 10) { setReferrerStudent(null); return }
    if (referralMobile === mobile) { setReferrerStudent(null); return }

    let active = true
    setReferrerLoading(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('v_student_summary')
        .select('name, mobile_number, status, image_url, latest_seat')
        .eq('mobile_number', referralMobile)
        .maybeSingle()
      if (active) {
        setReferrerStudent(data || null)
        setReferrerLoading(false)
      }
    }, 400)
    return () => { active = false; clearTimeout(t) }
  }, [referralMobile, mobile, isReservedSeat])

  useEffect(() => {
    const fetchRegId = async () => {
      setRegIdLoading(true)
      const { data: lastRecord } = await supabase
        .schema('library_management').from('admission_responses')
        .select('register_id').order('id', { ascending: false }).limit(1).maybeSingle()
      if (lastRecord?.register_id) {
        const { data: nextId } = await supabase.rpc('get_next_reg_id', { current_val: lastRecord.register_id })
        setRegId(nextId || '')
      }
      setRegIdLoading(false)
    }
    fetchRegId()
    return () => { pollingRef.current?.stop() }
  }, [])

  const sd = (patch: Record<string, any>) => saveDraft(patch)

  const doSingleCheck = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${PHOTO_SCRIPT_URL}?action=getPhotoUrl&register_id=${encodeURIComponent(regId)}`)
      const json = await res.json()
      if (json.status === 'found' && json.url) {
        setPhotoUrl(json.url)
        setPhotoPreviewUrl(getDrivePreviewUrl(json.url))
        setPhotoVerified(true)
        setPhotoPhase('done')
        setPhotoError('')
        return true
      }
    } catch {}
    return false
  }

  const beginPolling = (stopped: { value: boolean }) => {
    setPhotoPhase('polling')
    const startedAt = Date.now()
    const MAX_MS = 3 * 60 * 1000
    const runCycle = async () => {
      if (stopped.value) return
      if (Date.now() - startedAt > MAX_MS) {
        setPhotoPhase('failed')
        setPhotoError('Photo not found after 3 minutes. Please re-upload and try again.')
        return
      }
      const found = await doSingleCheck()
      if (found) return
      let c = 5; setPollCountdown(c)
      const tick = setInterval(() => {
        if (stopped.value) { clearInterval(tick); return }
        c -= 1; setPollCountdown(c)
        if (c <= 0) { clearInterval(tick); runCycle() }
      }, 1000)
    }
    runCycle()
  }

  const startAutoFlow = () => {
    if (!regId || photoPhase === 'countdown' || photoPhase === 'polling') return
    setPhotoError(''); setPhotoVerified(false); setPhotoUrl(''); setPhotoPreviewUrl('')
    setPhotoPhase('countdown'); setPhotoCountdown(30)
    const stopped = { value: false }
    pollingRef.current = { stop: () => { stopped.value = true } }
    let remaining = 30
    const t = setInterval(() => {
      if (stopped.value) { clearInterval(t); return }
      remaining -= 1; setPhotoCountdown(remaining)
      if (remaining <= 0) { clearInterval(t); if (!stopped.value) beginPolling(stopped) }
    }, 1000)
  }

  const instantVerify = async () => {
    if (!regId || instantChecking) return
    setInstantChecking(true); setPhotoError('')
    const found = await doSingleCheck()
    if (!found) setPhotoError('Photo not found. Please make sure you submitted the form and try again.')
    setInstantChecking(false)
  }

  const openPhotoForm = () => {
    if (!regId) return
    if (!mobileOk) return
    window.open(`${PHOTO_FORM_BASE}?usp=pp_url&entry.754882253=${encodeURIComponent(regId)}`, '_blank')
    startAutoFlow()
  }

  const handleNameBlur = () => {
    if (!name.trim()) return
    const formatted = toTitleCase(name)
    setName(formatted)
    sd({ name: formatted })
  }

  const handleMobileChange = async (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10)
    setMobile(digits); sd({ mobile: digits }); setMobileError(''); setExistingStudent(null)

    if (photoVerified || photoPhase !== 'idle') {
      pollingRef.current?.stop()
      setPhotoVerified(false); setPhotoUrl(''); setPhotoPreviewUrl('')
      setPhotoPhase('idle'); setPhotoError('')
    }

    if (digits.length === 10) {
      const { data, error: qErr } = await supabase
        .from('v_student_summary')
        .select('name, mobile_number, status, image_url')
        .eq('mobile_number', digits)
        .maybeSingle()
      if (!qErr && data) { setMobileError('exists'); setExistingStudent(data) }
    }
  }

  const handleStartDateChange = (val: string) => {
    setStartDate(val); sd({ startDate: val })
    if (isDateOlderThan20Days(val)) setError('Start date cannot be older than 20 days')
    else if (error.includes('Start date')) setError('')
  }

  const handleSelectMonth = (m: number) => {
    setShowCustom(false)
    setCustomMonths('')
    const val = m.toString()
    setMonths(val)
    sd({ months: val })
  }

  const handleToggleCustom = () => {
    const next = !showCustom
    setShowCustom(next)
    if (next) {
      setCustomMonths('')
      setFinalFees('')
      setFeesSubmitted('')
      sd({ finalFees: '', feesSubmitted: '' })
    } else {
      setCustomMonths('')
      const validMs = getValidMonths(feeConfigs, seat)
      if (validMs.length > 0) {
        const newM = validMs[0].toString()
        setMonths(newM)
        sd({ months: newM })
      }
    }
  }

  const handleCustomMonthsChange = (val: string) => {
    setCustomMonths(val)
    setMonths(val)
    sd({ months: val })
  }

  const handleToggleFeesOverride = () => {
    const next = !feesOverride
    setFeesOverride(next)
    if (!next) {
      const fee = lookupFee(feeConfigs, seat, months)
      if (fee !== null) {
        setFinalFees(fee.toString())
        setFeesSubmitted(fee.toString())
        sd({ finalFees: fee.toString(), feesSubmitted: fee.toString() })
      } else {
        setFinalFees('')
        setFeesSubmitted('')
        sd({ finalFees: '', feesSubmitted: '' })
      }
    }
  }

  const toggleShift = (shift: string) => {
    setSelectedShifts(prev => {
      const next = prev.includes(shift) ? prev.filter(x => x !== shift) : [...prev, shift]
      sd({ selectedShifts: next }); return next
    })
  }

  const handleSubmit = async () => {
    setError('')
    setWarning('')
    if (!name.trim() || name.trim().length < 2) { setError('Name must be at least 2 characters.'); return }
    if (mobile.length !== 10) { setError('Mobile number must be exactly 10 digits.'); return }
    if (mobileError === 'exists') { setError('This mobile is already registered. View the student card above.'); return }
    if (!gender) { setError('Please select a gender.'); return }
    if (!dob) { setError('Date of birth is required.'); return }
    if (new Date(dob) >= new Date()) { setError('Date of birth must be in the past.'); return }
    if (aadhar && aadhar.replace(/\D/g, '').length !== 12) { setError('Aadhar number must be 12 digits.'); return }
    if (!startDate) { setError('Start date is required.'); return }
    if (isDateOlderThan20Days(startDate)) {
      if (!isAdmin) { setError('Start date cannot be older than 20 days.'); return }
      else setWarning('⚠️ Start date is older than 20 days. Proceeding as admin override.')
    }
    if (!months || parseFloat(months) < 1) { setError('Months must be at least 1.'); return }
    const seatNum = parseInt(seat)
    if (isNaN(seatNum) || seatNum < 0 || seatNum > 92) { setError('Seat must be between 0 and 92.'); return }
    if (selectedShifts.length === 0) { setError('Please select at least one shift.'); return }

    if (!finalFees) { setError('Fees are required.'); return }
    if (!feesOverride && !showCustom) {
      const expectedFee = lookupFee(feeConfigs, seat, months)
      if (expectedFee === null) {
        if (!isAdmin) { setError('No fee plan configured for this seat + month combination. Contact admin.'); return }
        else setWarning(w => w ? w : '⚠️ No fee plan found for this combo. Proceeding as admin override.')
      } else if (parseFloat(finalFees) !== expectedFee) {
        if (!isAdmin) { setError(`Fees must be ₹${expectedFee} for this plan.`); return }
        else setWarning(`⚠️ Fees differ from configured ₹${expectedFee}. Proceeding as admin override.`)
      }
    }

    if (!feesSubmitted) { setError('Fees Submitted is required.'); return }
    if (!regId) { setError('Register ID not loaded yet. Please wait.'); return }
    if (!photoVerified || !photoUrl) { setError('Please verify the student photo before submitting.'); return }

    setSaving(true)

    // Determine if referral is valid and should be saved
    const referredByMobile = (isReservedSeat && referralValid && referralMobile) ? referralMobile : null

    const payload = {
      timestamp: now, name: name.trim(), mobile_number: mobile,
      admission: 'New', address: address.trim() || null, gender,
      date_of_birth: dob || null, aadhar_number: aadhar.replace(/\D/g, '') || null,
      photo: photoUrl,
      start_date: startDate, months: parseFloat(months),
      seat: seat.toString(), shift: selectedShifts.join(', '),
      final_fees: parseFloat(finalFees), fees_submitted: parseFloat(feesSubmitted),
      mode, register_id: regId, comment: comment.trim() || null, created_by: userName,
      referred_by_mobile: referredByMobile,  // ← NEW
    }

    const { error: insertError, data: insertedRows } = await supabase
      .schema('library_management').from('admission_responses').insert([payload]).select('id')
    if (insertError) { setError(insertError.message); setSaving(false); return }

    // ── REFERRAL: Create pending discount row for referrer ─────────────────
    if (referredByMobile) {
      const referralAmt = lookupReferralAmount(feeConfigs, seat, months)
      if (referralAmt > 0) {
        const admissionId = insertedRows?.[0]?.id || null
        await supabase.schema('library_management').from('referral_discounts').insert([{
          referrer_mobile: referredByMobile,
          referred_mobile: mobile,
          referred_reg_id: regId,
          amount: referralAmt,
          status: 'pending',
        }])
      }
    }

    pingAppsScript()
    clearDraft()
    pollingRef.current?.stop()
    onSuccess({ name: name.trim(), mobile, gender })
    onClose()
  }

  const inputStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }
  const readonlyStyle: React.CSSProperties = { background: T.bg, border: `1px solid ${T.border}`, color: T.textMuted }
  const errorInputStyle: React.CSSProperties = { ...inputStyle, border: '1px solid #fca5a5' }
  const labelCls = "text-[10px] uppercase tracking-widest mb-1.5 block font-medium"
  const inputCls = "w-full px-3 py-2.5 rounded-xl focus:outline-none"

  // ── Photo section ──────────────────────────────────────────────────────────
  const PhotoSection = () => {
    if (photoVerified) {
      return (
        <div className="rounded-2xl p-4 mb-2" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ border: '2px solid #86efac' }}>
              {photoPreviewUrl
                ? <img src={photoPreviewUrl} alt="Student" className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none' }} />
                : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ background: '#dcfce7' }}>📷</div>
              }
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold" style={{ color: '#166534' }}>✓ Photo verified</p>
              <p className="text-[10px] mt-0.5" style={{ color: '#16a34a' }}>Linked to Register ID {regId}</p>
              <p className="text-[10px] mt-1 font-medium" style={{ color: '#166534' }}>✅ All fields are now unlocked</p>
            </div>
            <button
              onClick={() => {
                pollingRef.current?.stop()
                setPhotoVerified(false); setPhotoUrl(''); setPhotoPreviewUrl('')
                setPhotoPhase('idle'); setPhotoError('')
              }}
              className="text-xs px-2.5 py-1 rounded-lg"
              style={{ color: '#dc2626', border: '1px solid #fca5a5', background: '#fff' }}>
              Re-upload
            </button>
          </div>
        </div>
      )
    }

    if (photoPhase === 'countdown') {
      return (
        <div className="rounded-2xl p-4 mb-2" style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: T.accent }}>
              <span className="text-white text-sm font-bold">{photoCountdown}</span>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: T.text }}>Waiting for upload…</p>
              <p className="text-[10px]" style={{ color: T.textMuted }}>Upload the photo in the new tab, checking in {photoCountdown}s</p>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: T.accentBorder }}>
            <div className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${((30 - photoCountdown) / 30) * 100}%`, background: T.accent }} />
          </div>
        </div>
      )
    }

    if (photoPhase === 'polling') {
      return (
        <div className="rounded-2xl p-4 mb-2" style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: T.surface, border: `2px solid ${T.accent}` }}>
              <span className="text-sm font-bold" style={{ color: T.accent }}>{pollCountdown}</span>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: T.text }}>Checking for photo…</p>
              <p className="text-[10px]" style={{ color: T.textMuted }}>Next check in {pollCountdown}s</p>
            </div>
            <div className="ml-auto">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" style={{ color: T.accent }}>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="rounded-2xl p-4 mb-2" style={{
        background: photoPhase === 'failed' ? '#fef2f2' : T.accentLight,
        border: `1px solid ${photoPhase === 'failed' ? '#fecaca' : T.accentBorder}`,
      }}>
        <p className="text-xs mb-3 font-medium" style={{ color: T.text }}>
          {photoPhase === 'failed'
            ? '⚠️ Photo not found after 3 minutes. Re-upload or verify manually if already uploaded.'
            : '📸 Upload the student photo — the rest of the form unlocks after verification.'}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={openPhotoForm} disabled={regIdLoading || !regId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
            style={{ background: T.accent, color: 'white' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open Upload Form ↗
          </button>
          <button onClick={instantVerify} disabled={regIdLoading || !regId || instantChecking}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
            {instantChecking
              ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            }
            {instantChecking ? 'Checking…' : 'Already Uploaded? Verify'}
          </button>
        </div>
        {photoError && <p className="text-xs mt-2.5 font-medium" style={{ color: '#dc2626' }}>{photoError}</p>}
      </div>
    )
  }

  return (
    <ModalShell onBackdropClick={onClose}>
      <div className="h-[3px] rounded-t-2xl shrink-0"
        style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }} />
      <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: T.border }} />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6"
        style={{ WebkitOverflowScrolling: 'touch' as any }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>New Admission</h2>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>Verify mobile → upload photo → fill details</p>
          </div>
          <button onClick={onClose} className="text-xl p-1" style={{ color: T.textMuted }}>✕</button>
        </div>

        {/* Draft banner */}
        {Object.keys(draft).length > 0 && (
          <div className="mb-4 px-3 py-2 rounded-xl flex items-center justify-between"
            style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
            <p className="text-[10px]" style={{ color: T.accent }}>📝 Draft restored from your last session</p>
            <button onClick={() => { clearDraft(); onClose() }}
              className="text-[10px] underline ml-2" style={{ color: T.textMuted }}>
              Discard
            </button>
          </div>
        )}

        {/* Timestamp */}
        <div className="mb-4 px-3 py-2.5 rounded-xl text-xs" style={readonlyStyle}>
          🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>

        {/* Register ID */}
        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Register ID</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>
            {regIdLoading
              ? <span className="animate-pulse text-xs">Fetching…</span>
              : <span className="font-semibold" style={{ color: T.text }}>{regId || '—'}</span>}
          </div>
        </div>

        {/* STEP 1 — Mobile */}
        <SectionLabel>📱 Step 1 — Verify Mobile Number</SectionLabel>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Mobile Number *</label>
          <input
            type="tel"
            value={mobile}
            onChange={(e) => handleMobileChange(e.target.value)}
            placeholder="10-digit mobile"
            maxLength={10}
            className={inputCls}
            style={existingStudent ? errorInputStyle : inputStyle}
          />
          {mobile.length === 10 && !existingStudent && (
            <p className="text-[10px] mt-1.5 font-semibold" style={{ color: '#166534' }}>
              ✅ Mobile number is available — proceed to upload photo
            </p>
          )}
          {existingStudent && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: T.textMuted }}>
                Number already registered for:
              </p>
              <Link
                href={`/student/${existingStudent.mobile_number}`}
                onClick={() => { clearDraft(); onClose() }}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}`, textDecoration: 'none' }}>
                <div className="relative shrink-0">
                  <img
                    src={getProxyUrl(existingStudent.image_url) || '/default-avatar.png'}
                    onError={(e) => { e.currentTarget.src = '/default-avatar.png' }}
                    className="w-10 h-10 rounded-lg object-cover"
                    style={{ border: `1px solid ${T.border}` }} />
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                    style={{
                      borderColor: T.surface,
                      background: existingStudent.status?.includes('Active') ? '#16a34a'
                        : existingStudent.status?.toLowerCase().includes('freeze') ? '#0ea5e9'
                        : existingStudent.status?.toLowerCase().includes('blocked') ? '#9ca3af'
                        : '#dc2626',
                    }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: T.text }}>{existingStudent.name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>{existingStudent.mobile_number}</p>
                  <div className="mt-1">
                    <StatusBadge status={existingStudent.status} />
                  </div>
                </div>
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  strokeWidth={2} style={{ color: T.accent }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <p className="text-[10px] mt-1.5 font-medium" style={{ color: '#991b1b' }}>
                ❌ Duplicate number — photo upload is blocked. Use a different mobile number.
              </p>
            </div>
          )}
        </div>

        {/* STEP 2 — Photo */}
        <SectionLabel>📸 Step 2 — Upload Photo</SectionLabel>

        {!mobileOk ? (
          <div className="mt-1 mb-4 px-4 py-3 rounded-xl text-center text-xs font-medium"
            style={{ background: '#fafafa', border: `1px dashed ${T.borderHover}`, color: T.textMuted }}>
            🔒 {mobile.length < 10
              ? 'Enter a valid 10-digit mobile number to unlock photo upload'
              : 'Duplicate mobile number — enter a unique number to unlock photo upload'}
          </div>
        ) : (
          <PhotoSection />
        )}

        {/* STEP 3 — Rest of form lock hint */}
        {mobileOk && fieldsLocked && (
          <div className="mt-3 mb-1 px-4 py-3 rounded-xl text-center text-xs font-medium"
            style={{ background: '#fafafa', border: `1px dashed ${T.borderHover}`, color: T.textMuted }}>
            🔒 Verify photo above to unlock the rest of the form
          </div>
        )}

        <div style={{
          opacity: fieldsLocked ? 0.35 : 1,
          pointerEvents: fieldsLocked ? 'none' : 'auto',
          transition: 'opacity 0.35s ease',
        }}>
          <SectionLabel>👤 Personal Details</SectionLabel>

          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); sd({ name: e.target.value }) }}
              onBlur={handleNameBlur}
              placeholder="Enter full name"
              className={inputCls}
              style={inputStyle}
            />
            {name.trim() && toTitleCase(name) !== name && (
              <p className="text-[10px] mt-1" style={{ color: T.textMuted }}>
                Will save as: <span className="font-semibold" style={{ color: T.text }}>{toTitleCase(name)}</span>
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Address</label>
            <input type="text" value={address}
              onChange={(e) => { setAddress(e.target.value); sd({ address: e.target.value }) }}
              placeholder="Optional" className={inputCls} style={inputStyle} />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Gender *</label>
              <select value={gender} onChange={(e) => { setGender(e.target.value); sd({ gender: e.target.value }) }}
                className={inputCls + ' appearance-none'} style={inputStyle}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Date of Birth *</label>
              <input type="date" value={dob}
                onChange={(e) => { setDob(e.target.value); sd({ dob: e.target.value }) }}
                className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Aadhar Number (optional)</label>
            <input type="text" value={aadhar} maxLength={14}
              onChange={(e) => { setAadhar(e.target.value); sd({ aadhar: e.target.value }) }}
              placeholder="12-digit aadhar" className={inputCls} style={inputStyle} />
          </div>

          <SectionLabel>📋 Admission Details</SectionLabel>

          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Start Date *</label>
            <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)}
              className={inputCls} style={inputStyle} />
          </div>

          {/* Seat + Months */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Seat (0–92) *</label>
              <input type="number" value={seat} onChange={(e) => { setSeat(e.target.value); sd({ seat: e.target.value }) }}
                min="0" max="92" className={inputCls} style={inputStyle} />
              <SeatStatusLine seat={seat} checking={seatChecking} occupantLabel={seatOccupantLabel} />
              {seat !== '' && (
                <p className="text-[10px] mt-1" style={{ color: T.textMuted }}>
                  {getSeatType(seat) === 'reserved' ? '🪑 Reserved seat' : '🔓 Unreserved (walk-in)'}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Months *</label>
              <MonthsPills
                feeConfigs={feeConfigs}
                feeConfigsLoading={feeConfigsLoading}
                seat={seat}
                months={months}
                isAdmin={isAdmin}
                customMonths={customMonths}
                showCustom={showCustom}
                onSelectMonth={handleSelectMonth}
                onCustomMonthsChange={handleCustomMonthsChange}
                onToggleCustom={handleToggleCustom}
              />
            </div>
          </div>

          {/* Shift */}
          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Shift *</label>
            <div className="space-y-2">
              {SHIFTS.map((shift) => {
                const checked = selectedShifts.includes(shift)
                return (
                  <label key={shift} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                    style={{ background: checked ? T.accentLight : T.bg, border: `1px solid ${checked ? T.accentBorder : T.border}` }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleShift(shift)} className="hidden" />
                    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                      style={{ background: checked ? T.accent : 'transparent', border: `2px solid ${checked ? T.accent : T.borderHover}` }}>
                      {checked && <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className="text-sm" style={{ color: checked ? T.text : T.textSub }}>{shift}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* ── REFERRAL SECTION ──────────────────────────────────────────── */}
          <SectionLabel>🤝 Referral (optional)</SectionLabel>

          <div className="mb-4">
            {!isReservedSeat ? (
              <div className="px-4 py-3 rounded-xl text-center text-xs font-medium"
                style={{ background: '#fafafa', border: `1px dashed ${T.borderHover}`, color: T.textMuted }}>
                🔒 Referral is only available for reserved seats (seat &gt; 0)
              </div>
            ) : (
              <>
                <label className={labelCls} style={{ color: T.textSub }}>Referrer's Mobile Number</label>
                <input
                  type="tel"
                  value={referralMobile}
                  onChange={(e) => setReferralMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Enter referrer's 10-digit mobile (optional)"
                  maxLength={10}
                  className={inputCls}
                  style={inputStyle}
                />
                {referralMobile === mobile && mobile.length === 10 && (
                  <p className="text-[10px] mt-1.5 font-medium" style={{ color: '#991b1b' }}>
                    ❌ A student cannot refer themselves
                  </p>
                )}
                {referrerLoading && (
                  <p className="text-[10px] mt-1.5 font-medium animate-pulse" style={{ color: T.textMuted }}>
                    Looking up referrer…
                  </p>
                )}
                {!referrerLoading && referrerStudent && referralMobile !== mobile && (
                  <div className="mt-2">
                    <ReferrerCard student={referrerStudent} />
                  </div>
                )}
                {!referrerLoading && referralMobile.length === 10 && !referrerStudent && referralMobile !== mobile && (
                  <p className="text-[10px] mt-1.5 font-medium" style={{ color: '#991b1b' }}>
                    ❌ No student found with this mobile number
                  </p>
                )}
                {referralMobile.length === 0 && (
                  <p className="text-[10px] mt-1" style={{ color: T.textMuted }}>
                    Leave blank if no referral
                  </p>
                )}
              </>
            )}
          </div>

          {/* Fees */}
          <FeesDisplay
            feeConfigs={feeConfigs}
            feeConfigsLoading={feeConfigsLoading}
            seat={seat}
            months={months}
            showCustom={showCustom}
            finalFees={finalFees}
            feesSubmitted={feesSubmitted}
            isAdmin={isAdmin}
            feesOverride={feesOverride}
            onToggleOverride={handleToggleFeesOverride}
            onFinalFeesChange={(val) => { setFinalFees(val); sd({ finalFees: val }) }}
            onFeesSubmittedChange={(val) => { setFeesSubmitted(val); sd({ feesSubmitted: val }) }}
            labelCls={labelCls}
            inputCls={inputCls}
          />

          {/* Payment Mode + Admission type */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Payment Mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}
                className={inputCls + ' appearance-none'} style={inputStyle}>
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: T.textSub }}>Admission</label>
              <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>New</div>
            </div>
          </div>

          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Comment (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
              placeholder="Any notes…" className={inputCls + ' resize-none'} style={inputStyle} />
          </div>

          <div className="mb-2">
            <label className={labelCls} style={{ color: T.textSub }}>Created By</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{userName}</div>
          </div>
        </div>

        {warning && (
          <div className="mt-4 px-4 py-2.5 rounded-xl" style={{ background: '#fefce8', border: '1px solid #fde047' }}>
            <p className="text-sm" style={{ color: '#854d0e' }}>{warning}</p>
          </div>
        )}
        {error && (
          <div className="mt-4 px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
            <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
          </div>
        )}
      </div>

      <div className="shrink-0 flex gap-3 p-4 pt-3"
        style={{ borderTop: `1px solid ${T.border}`, background: T.surface, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
        <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm"
          style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
        <button onClick={handleSubmit} disabled={saving || regIdLoading || feeConfigsLoading}
          className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
          style={{ background: T.accent, color: 'white' }}>
          {saving
            ? <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Saving…
              </span>
            : '✓ Confirm Admission'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const scrollRestoredRef = useRef(false)
  const lastFetchRef = useRef<number>(0)

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
  const [showNewAdmission, setShowNewAdmission] = useState(false)
  const [inviteStudent, setInviteStudent] = useState<{ name: string; mobile: string; gender: string } | null>(null)

  const [confirmModal, setConfirmModal] = useState<{
    message: string; confirmLabel: string; danger: boolean; onConfirm: () => void
  } | null>(null)

  useEffect(() => {
    try {
      const savedFilter = sessionStorage.getItem('dashboard_filter') || 'active'
      const savedSearch = sessionStorage.getItem('dashboard_search') || ''
      setFilter(savedFilter)
      setSelectedCard(savedFilter)
      setSearch(savedSearch)
      setSearchInput(savedSearch)
      const hasDraft = (() => {
        try { const d = sessionStorage.getItem('new_admission_draft'); return !!d && Object.keys(JSON.parse(d)).length > 0 } catch { return false }
      })()
      setShowNewAdmission(hasDraft)
    } catch {}
  }, [])

  useEffect(() => {
    let profileFetched = false

    const fetchProfile = async (userId: string) => {
      if (profileFetched) return
      profileFetched = true
      const { data: profile } = await supabase.from('profiles').select('name, role').eq('id', userId).single()
      setUserName(profile?.name || '')
      setRole(profile?.role || '')
      fetchStudents()
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) fetchProfile(data.session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        fetchProfile(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        router.push('/login')
      } else if (event === 'INITIAL_SESSION' && !session) {
        router.push('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => startTransition(() => setSearch(searchInput)), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => { sessionStorage.setItem('dashboard_filter', filter) }, [filter])
  useEffect(() => { sessionStorage.setItem('dashboard_search', searchInput) }, [searchInput])

  useEffect(() => {
    const handleScroll = () => { sessionStorage.setItem('dashboard_scroll', String(window.scrollY)) }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        if (now - lastFetchRef.current > 2 * 60 * 1000) {
          cachedStudents = null
          fetchStudents(true)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  useEffect(() => { setBulkMode(false); setSelectedMobiles(new Set()) }, [filter])

  async function fetchStudents(invalidate = false) {
    if (!invalidate && cachedStudents) { setStudents(cachedStudents); setLoading(false); return }
    setLoading(true)
    lastFetchRef.current = Date.now()
    const { data, error } = await supabase.from('v_student_summary').select('*')
    if (!error) { setStudents(data || []); cachedStudents = data }
    setLoading(false)
    if (!scrollRestoredRef.current) {
      scrollRestoredRef.current = true
      try {
        const savedScroll = parseInt(sessionStorage.getItem('dashboard_scroll') || '0', 10)
        if (savedScroll > 0) requestAnimationFrame(() => window.scrollTo({ top: savedScroll, behavior: 'instant' }))
      } catch {}
    }
  }

  const filtered = useMemo(() => {
    const result = students.filter((s) => {
      const matchSearch = s.name?.toLowerCase().includes(search.toLowerCase()) || s.mobile_number?.includes(search)
      if (filter === 'all') return matchSearch
      if (filter === 'frozen') return matchSearch && s.status?.toLowerCase().includes('freeze')
      return matchSearch && s.status?.toLowerCase().includes(filter)
    })
    if (filter === 'expired') {
      result.sort((a, b) => {
        const da = a.latest_expiry ? new Date(a.latest_expiry).getTime() : 0
        const db = b.latest_expiry ? new Date(b.latest_expiry).getTime() : 0
        return db - da
      })
    } else if (filter === 'active') {
      result.sort((a, b) => {
        const diffA = getExpiryDiffDays(a.latest_expiry)
        const diffB = getExpiryDiffDays(b.latest_expiry)
        const groupA = diffA !== null && diffA <= 7 ? 0 : 1
        const groupB = diffB !== null && diffB <= 7 ? 0 : 1
        if (groupA !== groupB) return groupA - groupB
        const da = a.latest_expiry ? new Date(a.latest_expiry).getTime() : Infinity
        const db = b.latest_expiry ? new Date(b.latest_expiry).getTime() : Infinity
        return da - db
      })
    }
    return result
  }, [students, search, filter])

  const stats = useMemo(() => ({
    total: students.length,
    active: students.filter(s => s.status?.includes('Active')).length,
    expired: students.filter(s => s.status?.includes('Expired')).length,
    due: students.filter(s => s.status?.includes('Due')).length,
    blocked: students.filter(s => s.status?.toLowerCase().includes('blocked')).length,
    frozen: students.filter(s => s.status?.toLowerCase().includes('freeze')).length,
  }), [students])

  const handleLogout = async () => { await supabase.auth.signOut(); router.push('/login') }

  const toggleSelect = useCallback((mobile: string) => {
    setSelectedMobiles(prev => { const next = new Set(prev); next.has(mobile) ? next.delete(mobile) : next.add(mobile); return next })
  }, [])

  const bulkBlockEligible = useMemo(() =>
    filtered.filter(s => s.status?.toLowerCase().includes('expired') && !(s.total_due > 0)), [filtered])

  const selectAll = () =>
    setSelectedMobiles(new Set(filter === 'blocked' ? filtered.map(s => s.mobile_number) : bulkBlockEligible.map(s => s.mobile_number)))

  const executeBulkBlock = async () => {
    setBulkLoading(true)
    for (const mobile of Array.from(selectedMobiles)) {
      const { data: existing } = await supabase.schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).maybeSingle()
      if (!existing) await supabase.schema('library_management').from('blocked').insert([{ mobile_number: mobile, created_by: userName }])
      else if (existing.is_unblocked) await supabase.schema('library_management').from('blocked').update({ is_unblocked: false, created_by: userName, created_at: new Date().toISOString(), unblocked_by: null }).eq('mobile_number', mobile)
    }
    setBulkLoading(false); setBulkMode(false); setSelectedMobiles(new Set())
    cachedStudents = null; fetchStudents(true)
  }

  const executeBulkUnblock = async () => {
    setBulkLoading(true)
    for (const mobile of Array.from(selectedMobiles)) {
      const { data: existing } = await supabase.schema('library_management').from('blocked').select('*').eq('mobile_number', mobile).maybeSingle()
      if (existing && !existing.is_unblocked) await supabase.schema('library_management').from('blocked').update({ is_unblocked: true, unblocked_by: userName }).eq('mobile_number', mobile)
    }
    setBulkLoading(false); setBulkMode(false); setSelectedMobiles(new Set())
    cachedStudents = null; fetchStudents(true)
  }

  const handleBulkBlock = () => {
    if (selectedMobiles.size === 0) return
    setConfirmModal({
      message: `Block ${selectedMobiles.size} student${selectedMobiles.size !== 1 ? 's' : ''}?`,
      confirmLabel: `🔒 Block ${selectedMobiles.size}`,
      danger: true,
      onConfirm: () => { setConfirmModal(null); executeBulkBlock() },
    })
  }

  const handleBulkUnblock = () => {
    if (selectedMobiles.size === 0) return
    setConfirmModal({
      message: `Unblock ${selectedMobiles.size} student${selectedMobiles.size !== 1 ? 's' : ''}?`,
      confirmLabel: `🔓 Unblock ${selectedMobiles.size}`,
      danger: false,
      onConfirm: () => { setConfirmModal(null); executeBulkUnblock() },
    })
  }

  const isPrivileged = role === 'admin' || role === 'manager' || role === 'partner'
  const canSeeLedger = role === 'admin' || role === 'partner' || role === 'manager'
  const showBulkBlock = isPrivileged && filter === 'expired'
  const showBulkUnblock = isPrivileged && filter === 'blocked'

  const CARDS = [
    { key: 'active',  label: 'Active',  count: stats.active,  color: '#16a34a', lightBg: '#f0fdf4', border: '#bbf7d0' },
    { key: 'expired', label: 'Expired', count: stats.expired, color: '#dc2626', lightBg: '#fef2f2', border: '#fecaca' },
    { key: 'due',     label: 'Due',     count: stats.due,     color: '#d97706', lightBg: '#fffbeb', border: '#fde68a' },
    { key: 'frozen',  label: 'Frozen',  count: stats.frozen,  color: '#0284c7', lightBg: '#f0f9ff', border: '#bae6fd' },
    { key: 'blocked', label: 'Blocked', count: stats.blocked, color: '#6b7280', lightBg: '#f9fafb', border: '#e5e7eb' },
    { key: 'all',     label: 'All',     count: stats.total,   color: T.accent,  lightBg: T.accentLight, border: T.accentBorder },
  ]

  return (
    <>
      <div className="min-h-screen" style={{ background: T.bg }}>
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${T.accent}, #e8a87c, ${T.accent})` }} />

        <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">

          <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold"
                style={{ color: T.text, fontFamily: "'Georgia', serif", letterSpacing: '-0.5px' }}>
                📚 Knowledge Hub Library
              </h1>
              <p className="text-[10px] mt-1 tracking-[0.2em] uppercase font-medium" style={{ color: T.textMuted }}>Library Dashboard</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link href="/seatmap" className="px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                🗺️ Seat Map
              </Link>

              {isPrivileged && (
                <>
                  {canSeeLedger && (
                    <Link href="/admissions" className="px-3 py-2 rounded-xl text-xs font-medium"
                      style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                      📋 Ledger
                    </Link>
                  )}
                  {role === 'admin' && (
                    <Link href="/admin_ledger" className="px-3 py-2 rounded-xl text-xs font-medium"
                      style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                      🏦 Admin Ledger
                    </Link>
                  )}
                  <Link href="/expenses" className="px-3 py-2 rounded-xl text-xs font-medium"
                    style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textSub }}>
                    💸 Expenses
                  </Link>
                  <NewAdmissionButton onClick={() => setShowNewAdmission(true)} />
                </>
              )}

              <div className="flex items-center gap-2 ml-1">
                <p className="text-sm font-semibold" style={{ color: T.text }}>{userName}</p>
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
                  style={{
                    background: active ? lightBg : T.surface,
                    border: `1px solid ${active ? border : T.border}`,
                    transform: active ? 'scale(1.03)' : 'scale(1)',
                    boxShadow: active ? `0 4px 16px ${color}20` : '0 1px 3px rgba(0,0,0,0.05)',
                  }}>
                  {active && (
                    <div className="absolute top-0 inset-x-0 h-[3px]"
                      style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
                  )}
                  <p className="text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: active ? color : T.textMuted }}>{label}</p>
                  <p className="text-2xl md:text-3xl font-bold mt-0.5"
                    style={{ fontFamily: "'Georgia', serif", color: active ? color : T.text }}>{count}</p>
                </button>
              )
            })}
          </div>

          {/* SEARCH + BULK CONTROLS */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <input
              type="text"
              value={searchInput}
              placeholder="Search by name or mobile…"
              className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl focus:outline-none"
              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: '16px' }}
              onFocus={e => (e.currentTarget.style.borderColor = T.accent)}
              onBlur={e => (e.currentTarget.style.borderColor = T.border)}
              onChange={(e) => setSearchInput(e.target.value)} />
            {showBulkBlock && (
              <button onClick={() => { setBulkMode(m => !m); setSelectedMobiles(new Set()) }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  background: bulkMode ? '#fee2e2' : '#fff1f2',
                  border: `1px solid ${bulkMode ? '#fca5a5' : '#fecdd3'}`,
                  color: '#dc2626',
                }}>
                {bulkMode ? '✕ Cancel' : '🔒 Bulk Block'}
              </button>
            )}
            {showBulkUnblock && (
              <button onClick={() => { setBulkMode(m => !m); setSelectedMobiles(new Set()) }}
                className="px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  background: bulkMode ? '#dcfce7' : '#f0fdf4',
                  border: `1px solid ${bulkMode ? '#86efac' : '#bbf7d0'}`,
                  color: '#16a34a',
                }}>
                {bulkMode ? '✕ Cancel' : '🔓 Bulk Unblock'}
              </button>
            )}
          </div>

          {/* BULK ACTION BAR */}
          {bulkMode && (
            <div className="mb-3 flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl"
              style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <span className="text-sm" style={{ color: T.textSub }}>{selectedMobiles.size} selected</span>
              <button onClick={selectAll} className="text-xs font-medium hover:underline" style={{ color: T.accent }}>
                Select All Eligible
              </button>
              <button onClick={() => setSelectedMobiles(new Set())} className="text-xs hover:underline" style={{ color: T.textMuted }}>
                Clear
              </button>
              <div className="ml-auto flex gap-2">
                {showBulkBlock && (
                  <button onClick={handleBulkBlock} disabled={selectedMobiles.size === 0 || bulkLoading}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                    style={{ background: '#dc2626', color: 'white' }}>
                    {bulkLoading ? 'Blocking…' : `Block ${selectedMobiles.size}`}
                  </button>
                )}
                {showBulkUnblock && (
                  <button onClick={handleBulkUnblock} disabled={selectedMobiles.size === 0 || bulkLoading}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                    style={{ background: '#16a34a', color: 'white' }}>
                    {bulkLoading ? 'Unblocking…' : `Unblock ${selectedMobiles.size}`}
                  </button>
                )}
              </div>
            </div>
          )}
          {bulkMode && showBulkBlock && (
            <p className="text-[10px] mb-3" style={{ color: T.textMuted }}>
              ⚠️ Only expired students with no pending dues can be bulk blocked.
            </p>
          )}

          {/* STUDENT LIST */}
          {loading && (
            <div className="text-center py-20">
              <div className="inline-block w-6 h-6 border-2 rounded-full animate-spin mb-3"
                style={{ borderColor: T.accent, borderTopColor: 'transparent' }} />
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
              const isEligibleForBulk = filter === 'blocked'
                ? true
                : (s.status?.toLowerCase().includes('expired') && !(s.total_due > 0))

              const diffDays = getExpiryDiffDays(s.latest_expiry)
              let highlight: 'yellow' | 'red' | null = null
              if (diffDays !== null) {
                if (filter === 'active' && diffDays <= 7) highlight = 'yellow'
                else if (filter === 'expired') highlight = (-diffDays) <= 7 ? 'yellow' : 'red'
              }

              return (
                <StudentCard
                  key={s.mobile_number}
                  s={s}
                  selectable={bulkMode && isEligibleForBulk}
                  selected={selectedMobiles.has(s.mobile_number)}
                  onToggle={toggleSelect}
                  onRenew={setRenewStudent}
                  role={role}
                  highlight={highlight} />
              )
            })}
          </div>
        </div>
      </div>

      {showNewAdmission && (
        <NewAdmissionPopup
          userName={userName}
          role={role}
          onClose={() => setShowNewAdmission(false)}
          onSuccess={(student) => {
            cachedStudents = null
            fetchStudents(true)
            setInviteStudent(student)
          }} />
      )}

      {renewStudent && (
        <RenewPopup
          student={renewStudent}
          userName={userName}
          role={role}
          onClose={() => setRenewStudent(null)}
          onSuccess={() => { cachedStudents = null; fetchStudents(true) }} />
      )}

      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)} />
      )}

      {inviteStudent && (
        <InviteWhatsAppModal
          student={inviteStudent}
          onClose={() => setInviteStudent(null)} />
      )}
    </>
  )
}
