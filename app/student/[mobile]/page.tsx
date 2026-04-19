'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams, useRouter } from 'next/navigation'

function getProxyUrl(url: string) {
  if (!url) return ''
  return `/api/image?url=${encodeURIComponent(url)}`
}

// ✅ FORMAT FOR UI
function formatDate(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ✅ FORMAT FOR DB
function formatDateForDB() {
  return new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// 🔥 NEW FUNCTION (ADDED ONLY)
function getWhatsappLink(name: string, mobile: string, due: number, expiry: string) {
  const today = new Date()
  const exp = new Date(expiry)

  let message = ''

  if (due > 0 && exp < today) {
    message = `Hi ${name}, your plan was *expired on ${formatDate(expiry)}* and your *last due fees is Rs.${due}*.`
  } else if (due > 0) {
    message = `Hi ${name}, your *due fees is Rs.${due}*.`
  } else if (exp < today) {
    message = `Hi ${name}, your plan was *expired on ${formatDate(expiry)}*. Renew today!!`
  } else {
    return ''
  }

  const finalMsg = `${message}
_Knowledge Hub Library_
https://g.co/kgs/iMBXRFr`

  return `https://wa.me/91${mobile}?text=${encodeURIComponent(finalMsg)}`
}

export default function StudentDetail() {
  const params = useParams()
  const mobile = params?.mobile as string
  const router = useRouter()

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showImageView, setShowImageView] = useState(false)

  const [role, setRole] = useState('')
  const [userName, setUserName] = useState('')

  const [showPopup, setShowPopup] = useState(false)
  const [dueAmount, setDueAmount] = useState(0)
  const [mode, setMode] = useState('Cash')

  const [isBlocked, setIsBlocked] = useState(false)

  // 🔥 NEW STATES (ADDED ONLY)
  const [isFrozen, setIsFrozen] = useState(false)
  const [hasEverFrozen, setHasEverFrozen] = useState(false)
  const [showFreezePopup, setShowFreezePopup] = useState(false)
  const [freezeDate, setFreezeDate] = useState(formatDateForDB())

  useEffect(() => {
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession()

      if (!sessionData.session) {
        router.push('/login')
        return
      }

      const user = sessionData.session.user

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, name')
        .eq('id', user.id)
        .single()

      setRole(profile?.role || '')
      setUserName(profile?.name || '')

      if (mobile) {
        fetchStudent()
        checkBlocked()
      }
    }

    init()
  }, [mobile])

  async function fetchStudent() {
    setLoading(true)

    const { data, error } = await supabase
      .from('v_admission_details')
      .select('*')
      .eq('mobile_number', mobile)
      .order('start_date', { ascending: true })

    if (!error) setData(data || [])
    setLoading(false)
  }

  async function checkBlocked() {
    const { data } = await supabase
      .schema('library_management')
      .from('blocked')
      .select('*')
      .eq('mobile_number', mobile)
      .single()

    if (data && !data.is_unblocked) {
      setIsBlocked(true)
    }
  }

  // 🔥 NEW FUNCTION (FREEZE CHECK)
  async function checkFreeze() {
    const latest = data[data.length - 1]
    if (!latest?.register_id) return

    const { data: freezeData } = await supabase
      .schema('library_management')
      .from('freeeze')
      .select('*')
      .eq('register_id', latest.register_id)
      .maybeSingle()

    if (freezeData) {
      setHasEverFrozen(true)
      setIsFrozen(!freezeData.unfreeze_date)
    } else {
      setHasEverFrozen(false)
      setIsFrozen(false)
    }
  }

  // 🔥 NEW EFFECT (ADDED ONLY)
  useEffect(() => {
    if (data.length) {
      checkFreeze()
    }
  }, [data])

  async function handleBlockToggle() {
    const totalDue = data.reduce((s, r) => s + (r.due_fees || 0), 0)

    if (!isBlocked && totalDue > 0) {
      alert('Cannot block user with pending due')
      return
    }

    const { data: existing } = await supabase
      .schema('library_management')
      .from('blocked')
      .select('*')
      .eq('mobile_number', mobile)
      .maybeSingle()

    if (!existing) {
      await supabase.schema('library_management').from('blocked').insert([
        { mobile_number: mobile, created_by: userName },
      ])
      setIsBlocked(true)
    } else {
      if (existing.is_unblocked) {
        await supabase
          .schema('library_management')
          .from('blocked')
          .update({
            is_unblocked: false,
            created_by: userName,
            created_at: new Date().toISOString(),
            unblocked_by: null,
          })
          .eq('mobile_number', mobile)

        setIsBlocked(true)
      } else {
        await supabase
          .schema('library_management')
          .from('blocked')
          .update({
            is_unblocked: true,
            unblocked_by: userName,
          })
          .eq('mobile_number', mobile)

        setIsBlocked(false)
      }
    }

    fetchStudent()
    checkBlocked()
  }

  async function submitDue() {
    const latest = data[data.length - 1]

    const { error } = await supabase
      .schema('library_management')
      .from('due_submission')
      .insert([
        {
          register_id: latest.register_id,
          due_fees_submitted: dueAmount,
          due_fees_submitted_date: formatDateForDB(),
          due_fees_mode: mode,
          created_by: userName,
        },
      ])

    if (error) {
      alert(error.message)
    } else {
      alert('Saved')
      setShowPopup(false)
      fetchStudent()
    }
  }

  // 🔥 FREEZE
  async function handleFreeze() {
    const latest = data[data.length - 1]

    await supabase
      .schema('library_management')
      .from('freeeze')
      .upsert([
        {
          register_id: latest.register_id,
          freeze_date: freezeDate,
          created_by: userName,
          unfreeze_date: null,
          unfreeze_by: null,
        },
      ])

    setShowFreezePopup(false)
    fetchStudent()
    checkFreeze()
  }

  // 🔥 UNFREEZE
  async function handleUnfreeze() {
    const latest = data[data.length - 1]

    await supabase
      .schema('library_management')
      .from('freeeze')
      .update({
        unfreeze_date: freezeDate,
        unfreeze_by: userName,
      })
      .eq('register_id', latest.register_id)

    setShowFreezePopup(false)
    fetchStudent()
    checkFreeze()
  }

  if (loading) return <p className="p-6">Loading...</p>
  if (!data.length) return <p className="p-6">No data found</p>

  const student = data[0]

  const latestRecord = [...data].sort(
    (a, b) => new Date(b.expiry).getTime() - new Date(a.expiry).getTime()
  )[0]

  // 👁️ VIEWER sees only the latest record; admin/manager see all
  const displayData = role === 'viewer' ? [latestRecord] : data

  const totalFees = displayData.reduce((s, r) => s + (r.final_fees || 0), 0)
  const totalPaid = displayData.reduce((s, r) => s + (r.fees_submitted || 0), 0)
  const totalDue = displayData.reduce((s, r) => s + (r.due_fees || 0), 0)

  // 🔥 NEW LOGIC (ADDED ONLY)
  const today = new Date()
  const expiryDate = new Date(latestRecord?.expiry)
  const isExpired = expiryDate < today
  const hasDue = totalDue > 0

  const showWhatsapp = hasDue || isExpired

  const whatsappLink = getWhatsappLink(
    student.name,
    mobile,
    totalDue,
    latestRecord?.expiry
  )

  const isActive = latestRecord?.status?.toLowerCase().includes('active')

  const canFreeze =
    (role === 'admin' || role === 'manager') &&
    isActive &&
    !hasDue &&
    !hasEverFrozen

  const canUnfreeze =
    (role === 'admin' || role === 'manager') &&
    isFrozen

  if (showImageView) {
    return (
      <div className="min-h-screen bg-black">
        <button onClick={() => setShowImageView(false)} className="text-white p-4">
          ← Back
        </button>

        <div className="flex justify-center">
          <img
            src={getProxyUrl(student.photo) || '/default-avatar.png'}
            onError={(e) => (e.currentTarget.src = '/default-avatar.png')}
            className="max-h-[90vh]"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 text-gray-800">

      <button
        onClick={() => router.back()}
        className="mb-3 text-sm text-gray-600 hover:text-black"
      >
        ← Back
      </button>

      {/* HEADER */}
      <div className="bg-white p-5 rounded-xl shadow mb-4 flex justify-between">
        <div className="flex gap-4">
          <img
            src={getProxyUrl(student.photo) || '/default-avatar.png'}
            onClick={() => student.photo && setShowImageView(true)}
            className="w-20 h-20 rounded-full object-cover border cursor-pointer"
          />

          <div>
            <h1 className="text-xl font-bold">{student.name}</h1>

            <div className="flex items-center gap-3 flex-wrap">
              <a href={`tel:${mobile}`} className="text-blue-600 font-medium">
                📞 {mobile}
              </a>

              {showWhatsapp && whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  className="bg-green-500 text-white px-3 py-1 rounded text-xs"
                >
                  WhatsApp
                </a>
              )}
            </div>

            <div className="flex gap-2 mt-2 text-xs">
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                {latestRecord?.status}
              </span>
              <span className="bg-gray-100 px-2 py-1 rounded">
                Exp: {formatDate(latestRecord?.expiry)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ACTION BAR */}
      <div className="bg-white rounded-xl shadow mb-4 p-3 flex justify-between items-center flex-wrap gap-2">
        <div className="text-sm text-gray-500">Quick Actions</div>

        <div className="flex gap-2 flex-wrap">

          {(role === 'admin' || role === 'manager') && totalDue > 0 && (
            <button
              onClick={() => {
                setDueAmount(totalDue)
                setShowPopup(true)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              Submit Due
            </button>
          )}

          {(role === 'admin' || role === 'manager') && (
            <button
              onClick={handleBlockToggle}
              className={`px-4 py-2 rounded-lg text-white text-sm ${
                isBlocked ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              {isBlocked ? 'Unblock User' : 'Block User'}
            </button>
          )}

          {canFreeze && (
            <button
              onClick={() => setShowFreezePopup(true)}
              className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm"
            >
              Freeze
            </button>
          )}

          {canUnfreeze && (
            <button
              onClick={() => setShowFreezePopup(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              Unfreeze
            </button>
          )}

        </div>
      </div>

      {/* SUMMARY */}
      <div className="bg-white rounded-xl shadow mb-4 p-4 text-sm grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><p>Total Admissions</p><p>{displayData.length}</p></div>
        <div><p>Total Fees</p><p>₹{totalFees}</p></div>
        <div><p>Paid</p><p className="text-green-600">₹{totalPaid}</p></div>
        <div><p>Due</p><p className="text-red-600">₹{totalDue}</p></div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow overflow-auto">
        <table className="min-w-[800px] w-full text-sm border">
          <thead className="bg-gray-100 text-xs">
            <tr>
              <th className="p-2 border">Reg ID</th>
              <th className="p-2 border">Start</th>
              <th className="p-2 border">Expiry</th>
              <th className="p-2 border">Seat</th>
              <th className="p-2 border">Shift</th>
              <th className="p-2 border">Fees</th>
              <th className="p-2 border">Paid</th>
              <th className="p-2 border">Due</th>
              <th className="p-2 border">Status</th>
            </tr>
          </thead>

          <tbody>
            {[...displayData].sort((a,b)=>new Date(b.start_date).getTime()-new Date(a.start_date).getTime())
              .map((row) => (
                <tr key={row.register_id}>
                  <td className="p-2 border">{row.register_id}</td>
                  <td className="p-2 border">{formatDate(row.start_date)}</td>
                  <td className="p-2 border">{formatDate(row.expiry)}</td>
                  <td className="p-2 border">{row.seat}</td>
                  <td className="p-2 border">{row.shift}</td>
                  <td className="p-2 border">₹{row.final_fees}</td>
                  <td className="p-2 border">₹{row.fees_submitted || 0}</td>
                  <td className="p-2 border text-red-600">₹{row.due_fees || 0}</td>
                  <td className="p-2 border">{row.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* SUBMIT DUE POPUP */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-5 rounded-xl w-[90%] max-w-sm">
            <h2 className="mb-3 font-semibold">Submit Due</h2>

            <input
              type="number"
              value={dueAmount}
              onChange={(e) => setDueAmount(Number(e.target.value))}
              className="w-full border p-2 mb-3 rounded"
            />

            <input
              value={formatDateForDB()}
              disabled
              className="w-full border p-2 mb-3 rounded bg-gray-100"
            />

            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full border p-2 mb-4 rounded"
            >
              <option>Cash</option>
              <option>Online</option>
            </select>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowPopup(false)}>Cancel</button>
              <button onClick={submitDue} className="bg-green-600 text-white px-3 py-1 rounded">
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FREEZE POPUP */}
      {showFreezePopup && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-5 rounded-xl w-[90%] max-w-sm">
            <h2 className="mb-3 font-semibold">
              {isFrozen ? 'Unfreeze Student' : 'Freeze Student'}
            </h2>

            <input
              value={freezeDate}
              onChange={(e) => setFreezeDate(e.target.value)}
              className="w-full border p-2 mb-4 rounded"
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowFreezePopup(false)}>Cancel</button>

              {!isFrozen ? (
                <button
                  onClick={handleFreeze}
                  className="bg-yellow-500 text-white px-3 py-1 rounded"
                >
                  Freeze
                </button>
              ) : (
                <button
                  onClick={handleUnfreeze}
                  className="bg-green-600 text-white px-3 py-1 rounded"
                >
                  Unfreeze
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
