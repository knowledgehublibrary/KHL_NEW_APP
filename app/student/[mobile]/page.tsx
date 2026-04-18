'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams, useRouter } from 'next/navigation'

function getProxyUrl(url: string) {
  if (!url) return ''
  return `/api/image?url=${encodeURIComponent(url)}`
}

export default function StudentDetail() {
  const { mobile } = useParams()
  const router = useRouter()

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showImageView, setShowImageView] = useState(false)

  useEffect(() => {
    if (mobile) fetchStudent()
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

  if (loading) return <p className="p-6">Loading...</p>
  if (!data.length) return <p className="p-6">No data found</p>

  const student = data[0]

  // 🔥 SUMMARY CALC
  const totalFees = data.reduce((s, r) => s + (r.final_fees || 0), 0)
  const totalPaid = data.reduce((s, r) => s + (r.fees_submitted || 0), 0)
  const totalDue = data.reduce((s, r) => s + (r.due_fees || 0), 0)

  // 🔥 IMAGE VIEW
  if (showImageView) {
    return (
      <div className="min-h-screen bg-black">
        <button
          onClick={() => setShowImageView(false)}
          className="text-white p-4"
        >
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

      {/* 🔥 PAGE BACK BUTTON */}
      <button
        onClick={() => router.back()}
        className="mb-3 flex items-center gap-1 text-sm text-gray-600 hover:text-black"
      >
        ← Back
      </button>

      {/* 🔥 HEADER */}
      <div className="bg-white p-5 rounded-xl shadow mb-4 flex items-center gap-4">

        <img
          src={getProxyUrl(student.photo) || '/default-avatar.png'}
          onClick={() => student.photo && setShowImageView(true)}
          onError={(e) => {
            console.log('Image failed:', student.photo)
            e.currentTarget.src = '/default-avatar.png'
          }}
          className="w-20 h-20 rounded-full object-cover border cursor-pointer"
        />

        <div>
          <h1 className="text-xl font-bold">{student.name}</h1>
          <p className="text-gray-500">{mobile}</p>

          <div className="flex gap-2 mt-2 flex-wrap text-xs">
            <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
              {student.status}
            </span>
            <span className="bg-gray-100 px-2 py-1 rounded">
              Exp: {student.expiry || '-'}
            </span>
          </div>
        </div>
      </div>

      {/* 🔥 SUMMARY */}
      <div className="bg-white rounded-xl shadow mb-4 p-4 text-sm">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

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
      </div>

      {/* 🔥 TABLE */}
      <div className="bg-white rounded-xl shadow overflow-auto">

        <table className="min-w-[800px] w-full text-sm">

          <thead className="bg-gray-100 text-gray-600 text-xs">
            <tr>
              <th className="p-2 text-left">Reg ID</th>
              <th className="p-2">Start</th>
              <th className="p-2">Expiry</th>
              <th className="p-2">Seat</th>
              <th className="p-2">Shift</th>
              <th className="p-2">Fees</th>
              <th className="p-2">Paid</th>
              <th className="p-2">Due</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>

          <tbody>
            {[...data]
              .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
              .map((row) => (
                <tr key={row.register_id} className="border-t hover:bg-gray-50">

                  <td className="p-2">{row.register_id}</td>
                  <td className="p-2">{row.start_date}</td>
                  <td className="p-2">{row.expiry}</td>
                  <td className="p-2">{row.seat}</td>
                  <td className="p-2">{row.shift}</td>
                  <td className="p-2">₹{row.final_fees}</td>
                  <td className="p-2">₹{row.fees_submitted || 0}</td>
                  <td className="p-2 text-red-600">
                    ₹{row.due_fees || 0}
                  </td>
                  <td className="p-2">
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                      {row.status}
                    </span>
                  </td>

                </tr>
              ))}
          </tbody>

        </table>
      </div>

    </div>
  )
}