'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// 🔥 GLOBAL CACHE
let cachedStudents: any[] | null = null

// 🔥 IMAGE PROXY
function getProxyUrl(url: string) {
  if (!url) return ''
  return `/api/image?url=${encodeURIComponent(url)}`
}

export default function Home() {
  const router = useRouter()

  const [students, setStudents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)

  // 🔐 USER STATE
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')

  // 🚀 AUTH CHECK + FETCH USER
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getSession()

      if (!data.session) {
        router.push('/login')
        return
      }

      const user = data.session.user

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, role')
        .eq('id', user.id)
        .single()

      setUserName(profile?.name || '')
      setRole(profile?.role || '')
    }

    checkUser()
  }, [])

  // 🚀 DEBOUNCE SEARCH
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchInput])

  // 🚀 INITIAL FETCH
  useEffect(() => {
    if (!loaded) {
      fetchStudents()
      setLoaded(true)
    }
  }, [loaded])

  async function fetchStudents() {
    if (cachedStudents) {
      setStudents(cachedStudents)
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('v_student_summary')
      .select('*')

    if (!error) {
      setStudents(data || [])
      cachedStudents = data
    }

    setLoading(false)
    console.log('DATA:', data)
    console.log('ERROR:', error)
  }

  // 🚀 MEMO FILTER
  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSearch =
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.mobile_number?.includes(search)

         // 🚫 ROLE BASED FILTER
      // if (role === 'viewer' && s.status?.toLowerCase().includes('blocked')) {
      //   return false
      // }

      if (filter === 'all') return matchSearch
      return matchSearch && s.status?.toLowerCase().includes(filter)
    })
  }, [students, search, filter])

  // 📊 STATS
  const stats = useMemo(() => {
    return {
      total: students.length,
      active: students.filter(s => s.status?.includes('Active')).length,
      expired: students.filter(s => s.status?.includes('Expired')).length,
      due: students.filter(s => s.status?.includes('Due')).length,
    }
  }, [students])

  // 🔴 LOGOUT
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 text-gray-800">

      {/* 🔥 HEADER BAR */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">
          📚 Library Dashboard
        </h1>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-sm md:text-base">
              {userName}
            </p>
            <p className="text-xs text-gray-500">
              {role}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-3 py-1 rounded text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      {/* 📊 DASHBOARD */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded shadow">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-xl font-bold">{stats.total}</p>
        </div>

        <div className="bg-green-100 p-4 rounded">
          <p>Active</p>
          <p className="font-bold">{stats.active}</p>
        </div>

        <div className="bg-red-100 p-4 rounded">
          <p>Expired</p>
          <p className="font-bold">{stats.expired}</p>
        </div>

        <div className="bg-yellow-100 p-4 rounded">
          <p>Due</p>
          <p className="font-bold">{stats.due}</p>
        </div>
      </div>

      {/* SEARCH */}
      <input
        type="text"
        placeholder="Search by name or mobile..."
        className="w-full p-3 border rounded-lg mb-5"
        onChange={(e) => setSearchInput(e.target.value)}
      />

      {/* FILTERS */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['all', 'active', 'expired', 'due', 'blocked'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg border ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white hover:bg-gray-100'
            }`}
          >
            {f.toUpperCase()}
          </button>
        ))}
      </div>

      {/* LOADING */}
      {loading && <p>Loading...</p>}

      {/* EMPTY */}
      {!loading && filtered.length === 0 && (
        <p className="text-gray-500">No students found</p>
      )}

      {/* LIST */}
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((s) => (
          <Link
            key={s.mobile_number}
            href={`/student/${s.mobile_number}`}
            className="bg-white p-4 rounded-xl shadow hover:shadow-md transition flex items-center gap-4"
          >
            <img
              loading="lazy"
              src={getProxyUrl(s.image_url) || '/default-avatar.png'}
              onError={(e) => {
                e.currentTarget.src = '/default-avatar.png'
              }}
              className="w-14 h-14 rounded-lg object-cover shadow"
            />

            <div className="flex-1">
              <p className="font-semibold text-lg">{s.name}</p>
              <p className="text-sm text-gray-500">{s.mobile_number}</p>

              <div className="mt-2 flex items-center gap-3 flex-wrap">

                <span
                  className={`text-xs px-2 py-1 rounded ${
                    s.status?.includes('Expired')
                      ? 'bg-red-100 text-red-700'
                      : s.status?.includes('Active')
                      ? 'bg-green-100 text-green-700'
                      : s.status?.includes('Blocked')
                      ? 'bg-gray-200 text-gray-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {s.status}
                </span>

                <span className="text-sm font-medium">
                  💰 ₹{s.total_due || 0}
                </span>

                <span className="text-xs text-gray-500">
                  📄 {s.total_admissions} records
                </span>

              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}