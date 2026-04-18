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

export default function StudentDetail() {
  const { mobile } = useParams()
  const router = useRouter()

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showImageView, setShowImageView] = useState(false)

  const [role, setRole] = useState('')
  const [userName, setUserName] = useState('') // ✅ NEW

  const [showPopup, setShowPopup] = useState(false)
  const [dueAmount, setDueAmount] = useState(0)
  const [mode, setMode] = useState('Cash')

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
      setUserName(profile?.name || '') // ✅ SET NAME

      if (mobile) fetchStudent()
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

  async function submitDue() {
    const latest = data[data.length - 1]

    const { error } = await supabase
      .schema('library_management')
      .from('due_submission')
      .insert([
        {
          register_id: latest.register_id,
          due_fees_submitted: dueAmount,
          due_fees_submitted_date: formatDateForDB(), // ✅ FIXED
          due_fees_mode: mode,
          created_by: userName, // ✅ NEW
        }
      ])

    if (error) {
      alert(error.message)
    } else {
      alert('Saved')
      setShowPopup(false)
      fetchStudent()
    }
  }

  if (loading) return <p className="p-6">Loading...</p>
  if (!data.length) return <p className="p-6">No data found</p>

  const student = data[0]

  // ✅ LATEST RECORD
  const latestRecord = [...data].sort(
    (a, b) => new Date(b.expiry).getTime() - new Date(a.expiry).getTime()
  )[0]

  const totalFees = data.reduce((s, r) => s + (r.final_fees || 0), 0)
  const totalPaid = data.reduce((s, r) => s + (r.fees_submitted || 0), 0)
  const totalDue = data.reduce((s, r) => s + (r.due_fees || 0), 0)

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
            <p className="text-gray-500">{mobile}</p>

            <div className="flex gap-2 mt-2 text-xs">

              <span
                className={`px-2 py-1 rounded ${
                  latestRecord?.status?.includes('Expired')
                    ? 'bg-red-100 text-red-700'
                    : latestRecord?.status?.includes('Active')
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {latestRecord?.status}
              </span>

              <span className="bg-gray-100 px-2 py-1 rounded">
                Exp: {formatDate(latestRecord?.expiry)}
              </span>

            </div>
          </div>
        </div>

        {(role === 'admin' || role === 'manager') && totalDue > 0 && (
          <button
            onClick={() => {
              setDueAmount(totalDue)
              setShowPopup(true)
            }}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
          >
            Submit Due
          </button>
        )}
      </div>

      {/* SUMMARY */}
      <div className="bg-white rounded-xl shadow mb-4 p-4 text-sm grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <p className="text-gray-500 text-xs">Total Admissions</p>
          <p className="font-semibold">{data.length}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Total Fees</p>
          <p className="font-semibold">₹{totalFees}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Paid</p>
          <p className="font-semibold text-green-600">₹{totalPaid}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Due</p>
          <p className="font-semibold text-red-600">₹{totalDue}</p>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow overflow-auto">

        <table className="min-w-[800px] w-full text-sm border">

          <thead className="bg-gray-100 text-xs">
            <tr>
              <th className="p-2 border text-left">Reg ID</th>
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
            {[...data]
              .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
              .map((row) => (
                <tr key={row.register_id} className="hover:bg-gray-50">

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

      {/* POPUP */}
      {showPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center">
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
              <button
                onClick={submitDue}
                className="bg-green-600 text-white px-3 py-1 rounded"
              >
                Submit
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
