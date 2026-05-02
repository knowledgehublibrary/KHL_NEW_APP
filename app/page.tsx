return (Date.now() - new Date(dateStr).getTime()) / 86400000 > 20
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
@@ -470,7 +478,407 @@ function clearDraft() {
try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}

// ─── AADHAAR SCANNER MODAL ────────────────────────────────────────────────────
// Uses Tesseract.js (browser-only OCR) — NO image ever leaves the device.
// Privacy-safe: Aadhaar photo is processed entirely in the user's browser.

type AadhaarData = {
  name: string
  dob: string       // YYYY-MM-DD
  gender: string
  aadhaar: string   // 12 digits
  address: string
}

function AadhaarScannerModal({ onClose, onExtracted }: {
  onClose: () => void
  onExtracted: (data: Partial<AadhaarData>) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  type Phase = 'front' | 'back' | 'processing' | 'review' | 'error' | 'nocamera'
  const [phase, setPhase] = useState<Phase>('front')
  const [frontImageData, setFrontImageData] = useState<string>('')  // data URL, never sent anywhere
  const [extracted, setExtracted] = useState<Partial<AadhaarData>>({})
  const [ocrError, setOcrError] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [ocrProgress, setOcrProgress] = useState(0)

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [facingMode])

  const startCamera = async () => {
    stopCamera()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => setCameraReady(true)
      }
    } catch {
      setPhase('nocamera')
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraReady(false)
  }

  const captureFrame = (): string => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return ''
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    return canvas.toDataURL('image/png')  // stays in browser memory only
  }

  const handleCaptureFront = () => {
    const dataUrl = captureFrame()
    if (!dataUrl) return
    setFrontImageData(dataUrl)
    setPhase('back')
  }

  const handleCaptureBack = async () => {
    const backDataUrl = captureFrame()
    if (!backDataUrl || !frontImageData) return
    setPhase('processing')
    setOcrProgress(0)
    stopCamera()

    try {
      // Dynamically load Tesseract.js — only loaded when user opens scanner
      // @ts-ignore
      const Tesseract = await import('tesseract.js')

      const processImage = async (dataUrl: string, label: string): Promise<string> => {
        const result = await Tesseract.recognize(dataUrl, 'eng', {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              setOcrProgress(prev => Math.max(prev, label === 'front' ? m.progress * 50 : 50 + m.progress * 50))
            }
          }
        })
        return result.data.text
      }

      const [frontText, backText] = await Promise.all([
        processImage(frontImageData, 'front'),
        processImage(backDataUrl, 'back'),
      ])

      const combined = frontText + '\n' + backText
      const parsed = parseAadhaarText(combined)
      setExtracted(parsed)
      setPhase('review')
    } catch (e) {
      console.error('OCR error:', e)
      setOcrError('OCR failed. Make sure tesseract.js is installed: npm install tesseract.js')
      setPhase('error')
    }
  }

  // ── Parse raw OCR text to extract Aadhaar fields ──────────────────────────
  const parseAadhaarText = (text: string): Partial<AadhaarData> => {
    const result: Partial<AadhaarData> = {}
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

    // Aadhaar number: 4-4-4 digit pattern
    const aadhaarMatch = text.match(/\b(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b/)
    if (aadhaarMatch) {
      result.aadhaar = aadhaarMatch[1].replace(/[\s\-]/g, '')
    }

    // DOB: DD/MM/YYYY or DD-MM-YYYY
    const dobMatch = text.match(/(?:DOB|Date of Birth|D\.O\.B)[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i)
      || text.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/)
    if (dobMatch) {
      const parts = dobMatch[1].split(/[\/\-]/)
      if (parts.length === 3) {
        result.dob = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
      }
    }

    // Gender
    if (/\bMale\b/i.test(text)) result.gender = 'Male'
    else if (/\bFemale\b/i.test(text)) result.gender = 'Female'

    // Name: usually the line after "Government of India" or before DOB line
    // Strategy: find a line with 2-4 capitalized words, not containing digits or known keywords
    const skipKeywords = /government|india|aadhaar|uidai|enrollment|enrolment|address|village|district|state|pin|dob|date|male|female|mobile|phone|\d/i
    for (const line of lines) {
      const words = line.split(/\s+/)
      const allCaps = words.every(w => /^[A-Z][a-zA-Z]+$/.test(w))
      if (
        words.length >= 2 && words.length <= 5 &&
        !skipKeywords.test(line) &&
        /^[A-Za-z\s]+$/.test(line) &&
        line.length > 4
      ) {
        result.name = toTitleCase(line)
        break
      }
    }

    // Address: lines after "Address:" or "S/O" "W/O" "D/O", join them
    const addrStartIdx = lines.findIndex(l => /^(Address|S\/O|W\/O|D\/O|C\/O)/i.test(l))
    if (addrStartIdx !== -1) {
      const addrLines = lines.slice(addrStartIdx, addrStartIdx + 6).join(', ')
      result.address = addrLines.replace(/^Address[:\s]*/i, '').trim()
    }

    return result
  }

  const handleUse = () => {
    onExtracted(extracted)
    onClose()
  }

  const inputStyle: React.CSSProperties = {
    background: T.bg, border: `1px solid ${T.border}`, color: T.text,
    fontSize: '15px', width: '100%', padding: '8px 12px', borderRadius: '10px', outline: 'none',
  }
  const labelCls = 'text-[10px] uppercase tracking-widest mb-1 block font-medium'

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(28,25,23,0.8)', backdropFilter: 'blur(8px)' }}>
      <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: T.surface, border: `1px solid ${T.border}`, maxHeight: 'calc(100dvh - 40px)' }}>

        <div className="h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${T.border}` }}>
          <div>
            <h3 className="font-bold text-base" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
              📇 Scan Aadhaar Card
            </h3>
            <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>
              {phase === 'front' && 'Step 1/2 — Capture the FRONT of the card'}
              {phase === 'back' && 'Step 2/2 — Capture the BACK of the card'}
              {phase === 'processing' && 'Reading card with OCR… (runs in your browser, nothing is uploaded)'}
              {phase === 'review' && 'Review extracted details before using'}
              {phase === 'error' && 'Something went wrong'}
              {phase === 'nocamera' && 'Camera not available'}
            </p>
          </div>
          <button onClick={() => { stopCamera(); onClose() }} className="text-xl p-1" style={{ color: T.textMuted }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">

          {/* Privacy notice */}
          {(phase === 'front' || phase === 'back') && (
            <div className="mb-3 px-3 py-2 rounded-xl text-[10px] font-medium flex items-start gap-2"
              style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534' }}>
              <span className="shrink-0 mt-0.5">🔒</span>
              <span>100% private — OCR runs in your browser. The Aadhaar image never leaves your device.</span>
            </div>
          )}

          {/* Camera view */}
          {(phase === 'front' || phase === 'back') && (
            <>
              <div className="relative rounded-2xl overflow-hidden mb-4 bg-black"
                style={{ aspectRatio: '16/9', border: `2px solid ${T.accentBorder}` }}>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {/* Aadhaar card aspect-ratio guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="rounded-lg"
                    style={{
                      width: '85%', aspectRatio: '1.586',
                      border: '2px dashed rgba(196,123,58,0.9)',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                    }} />
                </div>
                <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
                  <span className="text-white text-[10px] font-semibold px-3 py-1 rounded-full"
                    style={{ background: 'rgba(196,123,58,0.9)' }}>
                    {phase === 'front' ? 'FRONT side — align card in frame' : 'BACK side — align card in frame'}
                  </span>
                </div>
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="w-6 h-6 border-2 rounded-full animate-spin"
                      style={{ borderColor: T.accentBorder, borderTopColor: T.accent }} />
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />

              {phase === 'back' && (
                <div className="mb-3 px-3 py-2 rounded-xl text-xs font-medium"
                  style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534' }}>
                  ✓ Front captured — flip the card and capture the back
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setFacingMode(f => f === 'environment' ? 'user' : 'environment')}
                  className="px-3 py-3 rounded-xl text-sm font-medium"
                  style={{ border: `1px solid ${T.border}`, color: T.textSub, background: T.bg }}>
                  🔄
                </button>
                <button
                  onClick={phase === 'front' ? handleCaptureFront : handleCaptureBack}
                  disabled={!cameraReady}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: T.accent, color: 'white' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {phase === 'front' ? 'Capture Front' : 'Capture Back & Extract'}
                </button>
              </div>
            </>
          )}

          {/* Processing */}
          {phase === 'processing' && (
            <div className="flex flex-col items-center justify-center py-10 gap-5">
              <div className="relative w-16 h-16">
                <svg className="animate-spin w-16 h-16" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="32" r="28" stroke={T.accentBorder} strokeWidth="4" />
                  <path d="M32 4a28 28 0 0128 28" stroke={T.accent} strokeWidth="4" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold" style={{ color: T.accent }}>{Math.round(ocrProgress)}%</span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold mb-1" style={{ color: T.text }}>Running OCR in browser…</p>
                <p className="text-xs" style={{ color: T.textMuted }}>Nothing is sent to any server</p>
              </div>
              <div className="w-full rounded-full overflow-hidden h-2" style={{ background: T.accentBorder }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${ocrProgress}%`, background: T.accent }} />
              </div>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">⚠️</p>
              <p className="text-sm font-medium mb-1" style={{ color: '#991b1b' }}>OCR Failed</p>
              <p className="text-xs mb-4" style={{ color: T.textMuted }}>{ocrError}</p>
              <button onClick={() => { setPhase('front'); setFrontImageData(''); setOcrError(''); startCamera() }}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: T.accent, color: 'white' }}>
                Try Again
              </button>
            </div>
          )}

          {/* No camera */}
          {phase === 'nocamera' && (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">📵</p>
              <p className="text-sm font-medium mb-1" style={{ color: T.text }}>Camera not accessible</p>
              <p className="text-xs" style={{ color: T.textMuted }}>
                Please allow camera permissions in your browser settings and try again.
              </p>
            </div>
          )}

          {/* Review */}
          {phase === 'review' && (
            <div>
              <div className="mb-4 px-3 py-2.5 rounded-xl text-xs font-medium"
                style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534' }}>
                ✓ OCR complete — review and correct any fields before using
              </div>
              <div className="space-y-3">
                <div>
                  <label className={labelCls} style={{ color: T.textSub }}>Name</label>
                  <input value={extracted.name || ''} style={inputStyle}
                    placeholder="Not detected"
                    onChange={e => setExtracted(d => ({ ...d, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} style={{ color: T.textSub }}>Date of Birth</label>
                    <input type="date" value={extracted.dob || ''} style={inputStyle}
                      onChange={e => setExtracted(d => ({ ...d, dob: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls} style={{ color: T.textSub }}>Gender</label>
                    <select value={extracted.gender || ''} style={inputStyle}
                      onChange={e => setExtracted(d => ({ ...d, gender: e.target.value }))}>
                      <option value="">Select…</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls} style={{ color: T.textSub }}>Aadhaar Number (12 digits)</label>
                  <input value={extracted.aadhaar || ''} style={inputStyle}
                    placeholder="Not detected"
                    maxLength={12}
                    onChange={e => setExtracted(d => ({ ...d, aadhaar: e.target.value.replace(/\D/g,'').slice(0,12) }))} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: T.textSub }}>Address</label>
                  <textarea value={extracted.address || ''} rows={3}
                    placeholder="Not detected"
                    style={{ ...inputStyle, resize: 'none' }}
                    onChange={e => setExtracted(d => ({ ...d, address: e.target.value }))} />
                </div>
              </div>
              <p className="text-[10px] mt-3" style={{ color: T.textMuted }}>
                ℹ️ OCR accuracy depends on image quality. Always verify before saving.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'review' && (
          <div className="shrink-0 flex gap-3 p-4"
            style={{ borderTop: `1px solid ${T.border}`, paddingBottom: 'max(16px, env(safe-area-inset-bottom,16px))' }}>
            <button onClick={() => { stopCamera(); onClose() }}
              className="flex-1 py-3 rounded-xl text-sm"
              style={{ border: `1px solid ${T.border}`, color: T.textSub }}>
              Cancel
            </button>
            <button onClick={handleUse}
              className="flex-[2] py-3 rounded-xl text-sm font-semibold"
              style={{ background: T.accent, color: 'white' }}>
              ✓ Use These Details
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── NEW ADMISSION POPUP ──────────────────────────────────────────────────────
// CHANGES vs original:
//  1. Photo section is FIRST — before all other fields
//  2. All fields below photo are locked (dimmed + non-interactive) until photo is verified
//  3. Aadhaar scanner button auto-fills personal fields using browser-side OCR
//  4. Name auto title-cases on blur (trim + proper case)

function NewAdmissionPopup({ userName, onClose, onSuccess }: {
userName: string; onClose: () => void; onSuccess: () => void
}) {
@@ -479,6 +887,7 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
const [regId, setRegId] = useState('')
const [regIdLoading, setRegIdLoading] = useState(true)

  // ── Photo ──────────────────────────────────────────────────────────────────
const [photoVerified, setPhotoVerified] = useState(false)
const [photoUrl, setPhotoUrl] = useState('')
const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
@@ -487,7 +896,12 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
const [pollCountdown, setPollCountdown] = useState(5)
const [photoError, setPhotoError] = useState('')
const pollingRef = useRef<{ stop: () => void } | null>(null)
  const [instantChecking, setInstantChecking] = useState(false)

  // ── Aadhaar scanner ────────────────────────────────────────────────────────
  const [showAadhaarScanner, setShowAadhaarScanner] = useState(false)

  // ── Personal fields ────────────────────────────────────────────────────────
const [name, setName]       = useState(draft.name || '')
const [mobile, setMobile]   = useState(draft.mobile || '')
const [mobileError, setMobileError] = useState('')
@@ -497,6 +911,7 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
const [dob, setDob]         = useState(draft.dob || '')
const [aadhar, setAadhar]   = useState(draft.aadhar || '')

  // ── Admission fields ───────────────────────────────────────────────────────
const now = new Date().toISOString()
const [startDate, setStartDate]           = useState(draft.startDate || toInputDate(now))
const [months, setMonths]                 = useState(draft.months || '1')
@@ -512,6 +927,9 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {

const minFees = Math.round(500 * parseFloat(months || '1'))

  // Fields below photo locked until verified
  const fieldsLocked = !photoVerified

useEffect(() => {
const fetchRegId = async () => {
setRegIdLoading(true)
@@ -530,7 +948,7 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {

const sd = (patch: Record<string, any>) => saveDraft(patch)

  // 1️⃣ Single fetch — used by both polling and instant verify
  // ── Photo polling logic (unchanged from original) ──────────────────────────
const doSingleCheck = async (): Promise<boolean> => {
try {
const res = await fetch(`${PHOTO_SCRIPT_URL}?action=getPhotoUrl&register_id=${encodeURIComponent(regId)}`)
@@ -547,12 +965,10 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
return false
}

  // 2️⃣ Polling loop — called after the 30s countdown ends
const beginPolling = (stopped: { value: boolean }) => {
setPhotoPhase('polling')
const startedAt = Date.now()
const MAX_MS = 3 * 60 * 1000

const runCycle = async () => {
if (stopped.value) return
if (Date.now() - startedAt > MAX_MS) {
@@ -562,79 +978,72 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
}
const found = await doSingleCheck()
if (found) return

      let c = 5
      setPollCountdown(c)
      let c = 5; setPollCountdown(c)
const tick = setInterval(() => {
if (stopped.value) { clearInterval(tick); return }
        c -= 1
        setPollCountdown(c)
        c -= 1; setPollCountdown(c)
if (c <= 0) { clearInterval(tick); runCycle() }
}, 1000)
}

runCycle()
}

  // 3️⃣ Auto-flow — triggered by "Open Upload Form": starts 30s countdown then polling
const startAutoFlow = () => {
if (!regId || photoPhase === 'countdown' || photoPhase === 'polling') return
    setPhotoError('')
    setPhotoVerified(false)
    setPhotoUrl('')
    setPhotoPreviewUrl('')
    setPhotoPhase('countdown')
    setPhotoCountdown(30)

    setPhotoError(''); setPhotoVerified(false); setPhotoUrl(''); setPhotoPreviewUrl('')
    setPhotoPhase('countdown'); setPhotoCountdown(30)
const stopped = { value: false }
pollingRef.current = { stop: () => { stopped.value = true } }

let remaining = 30
    const countdownTimer = setInterval(() => {
      if (stopped.value) { clearInterval(countdownTimer); return }
      remaining -= 1
      setPhotoCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(countdownTimer)
        if (!stopped.value) beginPolling(stopped)
      }
    const t = setInterval(() => {
      if (stopped.value) { clearInterval(t); return }
      remaining -= 1; setPhotoCountdown(remaining)
      if (remaining <= 0) { clearInterval(t); if (!stopped.value) beginPolling(stopped) }
}, 1000)
}

  // 4️⃣ Instant verify — manual button, no timer, single check only
  const [instantChecking, setInstantChecking] = useState(false)
const instantVerify = async () => {
if (!regId || instantChecking) return
    setInstantChecking(true)
    setPhotoError('')
    setInstantChecking(true); setPhotoError('')
const found = await doSingleCheck()
if (!found) setPhotoError('Photo not found. Please make sure you submitted the form and try again.')
setInstantChecking(false)
}

  // 5️⃣ Opens the upload form tab and simultaneously kicks off the auto-flow
const openPhotoForm = () => {
if (!regId) return
window.open(`${PHOTO_FORM_BASE}?usp=pp_url&entry.754882253=${encodeURIComponent(regId)}`, '_blank')
startAutoFlow()
}

  // ── Aadhaar scanner callback ───────────────────────────────────────────────
  const handleAadhaarExtracted = (data: Partial<AadhaarData>) => {
    if (data.name)    { const f = toTitleCase(data.name); setName(f); sd({ name: f }) }
    if (data.dob)     { setDob(data.dob); sd({ dob: data.dob }) }
    if (data.gender)  { setGender(data.gender); sd({ gender: data.gender }) }
    if (data.aadhaar) { setAadhar(data.aadhaar); sd({ aadhar: data.aadhaar }) }
    if (data.address) { setAddress(data.address); sd({ address: data.address }) }
  }

  // ── Name: auto title-case on blur ──────────────────────────────────────────
  const handleNameBlur = () => {
    if (!name.trim()) return
    const formatted = toTitleCase(name)
    setName(formatted)
    sd({ name: formatted })
  }

  // ── Mobile lookup ──────────────────────────────────────────────────────────
const handleMobileChange = async (val: string) => {
const digits = val.replace(/\D/g, '').slice(0, 10)
    setMobile(digits); sd({ mobile: digits })
    setMobileError('')
    setExistingStudent(null)

    setMobile(digits); sd({ mobile: digits }); setMobileError(''); setExistingStudent(null)
if (digits.length === 10) {
const { data, error: qErr } = await supabase
.from('v_student_summary')
.select('name, mobile_number, status, image_url')
.eq('mobile_number', digits)
.maybeSingle()
      if (!qErr && data) {
        setMobileError('exists')
        setExistingStudent(data)
      }
      if (!qErr && data) { setMobileError('exists'); setExistingStudent(data) }
}
}

@@ -655,9 +1064,7 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
if (error.startsWith('Minimum fees')) setError('')
} else if (currentFees < newMin) {
setError(`Minimum fees for ${val} month(s) is ₹${newMin}`)
    } else if (error.startsWith('Minimum fees')) {
      setError('')
    }
    } else if (error.startsWith('Minimum fees')) { setError('') }
}

const handleFeesChange = (val: string) => {
@@ -671,8 +1078,7 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
const toggleShift = (shift: string) => {
setSelectedShifts(prev => {
const next = prev.includes(shift) ? prev.filter(x => x !== shift) : [...prev, shift]
      sd({ selectedShifts: next })
      return next
      sd({ selectedShifts: next }); return next
})
}

@@ -726,10 +1132,11 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
const labelCls = "text-[10px] uppercase tracking-widest mb-1.5 block font-medium"
const inputCls = "w-full px-3 py-2.5 rounded-xl focus:outline-none"

  // ── Photo section UI ───────────────────────────────────────────────────────
const PhotoSection = () => {
if (photoVerified) {
return (
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
        <div className="rounded-2xl p-4 mb-2" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>
<div className="flex items-center gap-3">
<div className="w-16 h-16 rounded-xl overflow-hidden shrink-0" style={{ border: '2px solid #86efac' }}>
{photoPreviewUrl
@@ -741,6 +1148,9 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
<div className="flex-1">
<p className="text-xs font-semibold" style={{ color: '#166534' }}>✓ Photo verified</p>
<p className="text-[10px] mt-0.5" style={{ color: '#16a34a' }}>Linked to Register ID {regId}</p>
              <p className="text-[10px] mt-1 font-medium" style={{ color: '#166534' }}>
                ✅ All fields are now unlocked
              </p>
</div>
<button
onClick={() => {
@@ -759,10 +1169,9 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {

if (photoPhase === 'countdown') {
return (
        <div className="rounded-2xl p-4 mb-4" style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
        <div className="rounded-2xl p-4 mb-2" style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
<div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: T.accent }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: T.accent }}>
<span className="text-white text-sm font-bold">{photoCountdown}</span>
</div>
<div>
@@ -780,7 +1189,7 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {

if (photoPhase === 'polling') {
return (
        <div className="rounded-2xl p-4 mb-4" style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
        <div className="rounded-2xl p-4 mb-2" style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
<div className="flex items-center gap-3">
<div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
style={{ background: T.surface, border: `2px solid ${T.accent}` }}>
@@ -802,14 +1211,14 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
}

return (
      <div className="rounded-2xl p-4 mb-4" style={{
      <div className="rounded-2xl p-4 mb-2" style={{
background: photoPhase === 'failed' ? '#fef2f2' : T.accentLight,
border: `1px solid ${photoPhase === 'failed' ? '#fecaca' : T.accentBorder}`,
}}>
        <p className="text-xs mb-3" style={{ color: T.textSub }}>
        <p className="text-xs mb-3 font-medium" style={{ color: T.text }}>
{photoPhase === 'failed'
            ? 'Photo not found after 3 minutes. Re-upload via the form or verify manually if you already uploaded.'
            : 'Open the upload form — the timer will start automatically once you click it.'}
            ? '⚠️ Photo not found after 3 minutes. Re-upload or verify manually if already uploaded.'
            : '📸 Upload the student photo first — the rest of the form unlocks after verification.'}
</p>
<div className="flex gap-2 flex-wrap">
<button onClick={openPhotoForm} disabled={regIdLoading || !regId}
@@ -841,259 +1250,318 @@ function NewAdmissionPopup({ userName, onClose, onSuccess }: {
}

return (
    <ModalShell onBackdropClick={onClose}>
      <div className="h-[3px] rounded-t-2xl shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }} />
      <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: T.border }} />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6" style={{ WebkitOverflowScrolling: 'touch' as any }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>New Admission</h2>
            <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>All fields marked * are required</p>
          </div>
          <button onClick={onClose} className="text-xl p-1" style={{ color: T.textMuted }}>✕</button>
    <>
      <ModalShell onBackdropClick={onClose}>
        <div className="h-[3px] rounded-t-2xl shrink-0"
          style={{ background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)` }} />
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: T.border }} />
</div>

        {Object.keys(draft).length > 0 && (
          <div className="mb-4 px-3 py-2 rounded-xl flex items-center justify-between"
            style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}` }}>
            <p className="text-[10px]" style={{ color: T.accent }}>📝 Draft restored from your last session</p>
            <button onClick={() => { clearDraft(); onClose() }}
              className="text-[10px] underline ml-2" style={{ color: T.textMuted }}>
              Discard
            </button>
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6"
          style={{ WebkitOverflowScrolling: 'touch' as any }}>

          {/* Title */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="font-bold text-xl" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>New Admission</h2>
              <p className="text-xs mt-0.5" style={{ color: T.textMuted }}>Upload photo first — remaining fields unlock after verification</p>
            </div>
            <button onClick={onClose} className="text-xl p-1" style={{ color: T.textMuted }}>✕</button>
</div>
        )}

        <div className="mb-3 px-3 py-2.5 rounded-xl text-xs" style={readonlyStyle}>
          🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </div>
          {/* Draft restored banner */}
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

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Register ID</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>
            {regIdLoading
              ? <span className="animate-pulse text-xs">Fetching…</span>
              : <span className="font-semibold" style={{ color: T.text }}>{regId || '—'}</span>}
          {/* Timestamp */}
          <div className="mb-3 px-3 py-2.5 rounded-xl text-xs" style={readonlyStyle}>
            🕐 {new Date(now).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
</div>
        </div>

        <SectionLabel>👤 Personal Details</SectionLabel>
          {/* Register ID */}
          <div className="mb-4">
            <label className={labelCls} style={{ color: T.textSub }}>Register ID</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>
              {regIdLoading
                ? <span className="animate-pulse text-xs">Fetching…</span>
                : <span className="font-semibold" style={{ color: T.text }}>{regId || '—'}</span>}
            </div>
          </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Full Name *</label>
          <input type="text" value={name}
            onChange={(e) => { setName(e.target.value); sd({ name: e.target.value }) }}
            placeholder="Enter full name" className={inputCls} style={inputStyle} />
        </div>
          {/* ── PHOTO FIRST ───────────────────────────────────────────────────── */}
          <SectionLabel>📸 Photo Upload — Complete First</SectionLabel>
          <PhotoSection />

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Mobile Number *</label>
          <input type="tel" value={mobile} onChange={(e) => handleMobileChange(e.target.value)}
            placeholder="10-digit mobile" maxLength={10} className={inputCls}
            style={existingStudent ? errorInputStyle : inputStyle} />
          {existingStudent && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: T.textMuted }}>
                Number already registered for:
              </p>
              <Link
                href={`/student/${existingStudent.mobile_number}`}
                onClick={onClose}
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
                  <p className="text-sm font-semibold truncate" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                    {existingStudent.name}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>{existingStudent.mobile_number}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={existingStudent.status} />
                  <span className="text-[10px]" style={{ color: T.textMuted }}>Tap to view →</span>
                </div>
              </Link>
          {/* Lock hint when photo not yet verified */}
          {fieldsLocked && (
            <div className="mt-3 mb-1 px-4 py-3 rounded-xl text-center text-xs font-medium"
              style={{ background: '#fafafa', border: `1px dashed ${T.borderHover}`, color: T.textMuted }}>
              🔒 Verify photo above to unlock the rest of the form
</div>
)}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Gender *</label>
            <select value={gender}
              onChange={(e) => { setGender(e.target.value); sd({ gender: e.target.value }) }}
              className={inputCls + ' appearance-none'} style={inputStyle}>
              <option value="">Select…</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Date of Birth *</label>
            <input type="date" value={dob}
              onChange={(e) => { setDob(e.target.value); sd({ dob: e.target.value }) }}
              max={toInputDate(new Date().toISOString())} className={inputCls} style={inputStyle} />
          </div>
        </div>
          {/* ── ALL OTHER FIELDS — locked until photo verified ─────────────────── */}
          <div style={{
            opacity: fieldsLocked ? 0.35 : 1,
            pointerEvents: fieldsLocked ? 'none' : 'auto',
            transition: 'opacity 0.35s ease',
          }}>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>
            Aadhar Number <span className="text-[9px] normal-case tracking-normal" style={{ color: T.textMuted }}>(12 digits, optional)</span>
          </label>
          <input type="text" value={aadhar}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 12); setAadhar(v); sd({ aadhar: v }) }}
            placeholder="xxxxxxxxxxxx" className={inputCls} style={inputStyle} />
        </div>
            <SectionLabel>👤 Personal Details</SectionLabel>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Address</label>
          <textarea value={address}
            onChange={(e) => { setAddress(e.target.value); sd({ address: e.target.value }) }}
            rows={2} placeholder="Full address (optional)" className={inputCls + ' resize-none'} style={inputStyle} />
        </div>
            {/* Aadhaar scan button */}
            <button
              onClick={() => setShowAadhaarScanner(true)}
              className="w-full mb-4 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
              style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}`, color: T.accent }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              📇 Scan Aadhaar Card — Auto-fill Details
            </button>

        <SectionLabel>📋 Admission Details</SectionLabel>
            {/* Name */}
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
          <label className={labelCls} style={{ color: T.textSub }}>Admission</label>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>New</div>
        </div>
            {/* Mobile */}
            <div className="mb-4">
              <label className={labelCls} style={{ color: T.textSub }}>Mobile Number *</label>
              <input type="tel" value={mobile} onChange={(e) => handleMobileChange(e.target.value)}
                placeholder="10-digit mobile" maxLength={10} className={inputCls}
                style={existingStudent ? errorInputStyle : inputStyle} />
              {existingStudent && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: T.textMuted }}>
                    Number already registered for:
                  </p>
                  <Link
                    href={`/student/${existingStudent.mobile_number}`}
                    onClick={onClose}
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
                      <p className="text-sm font-semibold truncate" style={{ color: T.text, fontFamily: "'Georgia', serif" }}>
                        {existingStudent.name}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>{existingStudent.mobile_number}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={existingStudent.status} />
                      <span className="text-[10px]" style={{ color: T.textMuted }}>Tap to view →</span>
                    </div>
                  </Link>
                </div>
              )}
            </div>

        <div className="mb-4">
          <label className={labelCls} style={{ color: T.textSub }}>Start Date *</label>
          <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)}
            className={inputCls} style={inputStyle} />
        </div>
            {/* Gender + DOB */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className={labelCls} style={{ color: T.textSub }}>Gender *</label>
                <select value={gender}
                  onChange={(e) => { setGender(e.target.value); sd({ gender: e.target.value }) }}
                  className={inputCls + ' appearance-none'} style={inputStyle}>
                  <option value="">Select…</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: T.textSub }}>Date of Birth *</label>
                <input type="date" value={dob}
                  onChange={(e) => { setDob(e.target.value); sd({ dob: e.target.value }) }}
                  max={toInputDate(new Date().toISOString())} className={inputCls} style={inputStyle} />
              </div>
            </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Months *</label>
            <input type="number" value={months} onChange={(e) => handleMonthsChange(e.target.value)}
              min="1" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Seat (0–92) *</label>
            <input type="number" value={seat}
              onChange={(e) => { setSeat(e.target.value); sd({ seat: e.target.value }) }}
              min="0" max="92" className={inputCls} style={inputStyle} />
          </div>
        </div>
            {/* Aadhar */}
            <div className="mb-4">
              <label className={labelCls} style={{ color: T.textSub }}>
                Aadhar Number <span className="text-[9px] normal-case tracking-normal" style={{ color: T.textMuted }}>(12 digits, optional)</span>
              </label>
              <input type="text" value={aadhar}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 12); setAadhar(v); sd({ aadhar: v }) }}
                placeholder="xxxxxxxxxxxx" className={inputCls} style={inputStyle} />
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
            {/* Address */}
            <div className="mb-4">
              <label className={labelCls} style={{ color: T.textSub }}>Address</label>
              <textarea value={address}
                onChange={(e) => { setAddress(e.target.value); sd({ address: e.target.value }) }}
                rows={2} placeholder="Full address (optional)" className={inputCls + ' resize-none'} style={inputStyle} />
            </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>
              Final Fees *
              <span className="ml-1 text-[9px]" style={{ color: T.textMuted }}>min ₹{minFees}</span>
            </label>
            <input type="number" value={finalFees} onChange={(e) => handleFeesChange(e.target.value)}
              className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Fees Submitted *</label>
            <input type="number" value={feesSubmitted}
              onChange={(e) => { setFeesSubmitted(e.target.value); sd({ feesSubmitted: e.target.value }) }}
              className={inputCls} style={inputStyle} />
          </div>
        </div>
            <SectionLabel>📋 Admission Details</SectionLabel>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Payment Mode</label>
            <select value={mode}
              onChange={(e) => { setMode(e.target.value); sd({ mode: e.target.value }) }}
              className={inputCls + ' appearance-none'} style={inputStyle}>
              <option value="Cash">Cash</option>
              <option value="Online">Online</option>
            </select>
          </div>
          <div>
            <label className={labelCls} style={{ color: T.textSub }}>Created By</label>
            <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{userName}</div>
          </div>
        </div>
            <div className="mb-4">
              <label className={labelCls} style={{ color: T.textSub }}>Admission</label>
              <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>New</div>
            </div>

        <div className="mb-5">
          <label className={labelCls} style={{ color: T.textSub }}>Comment (optional)</label>
          <textarea value={comment}
            onChange={(e) => { setComment(e.target.value); sd({ comment: e.target.value }) }}
            rows={2} placeholder="Any notes…" className={inputCls + ' resize-none'} style={inputStyle} />
        </div>
            <div className="mb-4">
              <label className={labelCls} style={{ color: T.textSub }}>Start Date *</label>
              <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>

        <SectionLabel>📸 Photo Upload *</SectionLabel>
        <PhotoSection />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className={labelCls} style={{ color: T.textSub }}>Months *</label>
                <input type="number" value={months} onChange={(e) => handleMonthsChange(e.target.value)}
                  min="1" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={{ color: T.textSub }}>Seat (0–92) *</label>
                <input type="number" value={seat}
                  onChange={(e) => { setSeat(e.target.value); sd({ seat: e.target.value }) }}
                  min="0" max="92" className={inputCls} style={inputStyle} />
              </div>
            </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
            <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
          </div>
        )}
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

        {!photoVerified && photoPhase === 'idle' && (
          <div className="mb-2 px-4 py-2.5 rounded-xl text-xs"
            style={{ background: T.accentLight, border: `1px solid ${T.accentBorder}`, color: T.accent }}>
            📸 Click "Open Upload Form" above — the timer starts automatically.
          </div>
        )}
      </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className={labelCls} style={{ color: T.textSub }}>
                  Final Fees *
                  <span className="ml-1 text-[9px]" style={{ color: T.textMuted }}>min ₹{minFees}</span>
                </label>
                <input type="number" value={finalFees} onChange={(e) => handleFeesChange(e.target.value)}
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className={labelCls} style={{ color: T.textSub }}>Fees Submitted *</label>
                <input type="number" value={feesSubmitted}
                  onChange={(e) => { setFeesSubmitted(e.target.value); sd({ feesSubmitted: e.target.value }) }}
                  className={inputCls} style={inputStyle} />
              </div>
            </div>

      <div className="shrink-0 flex gap-3 p-4 pt-3"
        style={{ borderTop: `1px solid ${T.border}`, background: T.surface, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
        <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm"
          style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={!photoVerified || saving || regIdLoading || !!mobileError}
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
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className={labelCls} style={{ color: T.textSub }}>Payment Mode</label>
                <select value={mode}
                  onChange={(e) => { setMode(e.target.value); sd({ mode: e.target.value }) }}
                  className={inputCls + ' appearance-none'} style={inputStyle}>
                  <option value="Cash">Cash</option>
                  <option value="Online">Online</option>
                </select>
              </div>
              <div>
                <label className={labelCls} style={{ color: T.textSub }}>Created By</label>
                <div className="px-3 py-2.5 rounded-xl text-sm" style={readonlyStyle}>{userName}</div>
              </div>
            </div>

            <div className="mb-5">
              <label className={labelCls} style={{ color: T.textSub }}>Comment (optional)</label>
              <textarea value={comment}
                onChange={(e) => { setComment(e.target.value); sd({ comment: e.target.value }) }}
                rows={2} placeholder="Any notes…" className={inputCls + ' resize-none'} style={inputStyle} />
            </div>

          </div>{/* end locked section */}

          {error && (
            <div className="mb-4 px-4 py-2.5 rounded-xl" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }}>
              <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-3 p-4 pt-3"
          style={{ borderTop: `1px solid ${T.border}`, background: T.surface, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm"
            style={{ border: `1px solid ${T.border}`, color: T.textSub }}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!photoVerified || saving || regIdLoading || !!mobileError}
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

      {/* Aadhaar scanner — rendered above everything else */}
      {showAadhaarScanner && (
        <AadhaarScannerModal
          onClose={() => setShowAadhaarScanner(false)}
          onExtracted={handleAadhaarExtracted}
        />
      )}
    </>
)
}

@@ -1154,7 +1622,6 @@ export default function Home() {
return () => clearTimeout(t)
}, [searchInput])

  // Restore persisted state client-side before paint — avoids hydration mismatch
useLayoutEffect(() => {
try {
const saved = sessionStorage.getItem('dashboard_filter') || 'active'
