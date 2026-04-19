'use client'

import { useEffect, useState, useMemo, useTransition, memo } from 'react'
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

// 🔥 MEMOIZED STUDENT CARD — only re-renders if its own data changes
const StudentCard = memo(({ s }: { s: any }) => (
  <Link
    href={`/student/${s.mobile_number}`}
    className="bg-white p-4 rounded-xl shadow hover:shadow-md transition flex items-center gap-4"
  >
    <img
      loading="lazy"
      src={getProxyUrl(s.image_url) || '/default-avatar.png'}
      onError={(e) => { e.currentTarget.src = '/default-avatar.png' }}
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
              : s.status?.toLowerCase().includes('freeze')
              ? 'bg-blue-100 text-blue-700'
              : 'bg-yellow-100 text-yellow-700'
          }`}
        >
          {s.status}
        </span>

        <span className="text-sm font-medium">💰 ₹{s.total_due || 0}</span>
        <span className="text-xs text-gray-500">📄 {s.total_admissions} records</span>
      </div>
    </div>
  </Link>
))

StudentCard.displayName = 'StudentCard'

export default function Home() {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [students, setStudents] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filter, setFilter] = useState('active')
  const [selectedCard, setSelectedCard] = useState('active')
  const [loading, setLoading] = useState(true)

  // 🔐 USER STATE
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')

  // 🚀 AUTH CHECK + FETCH — merged into one effect, removed redundant loaded state
  useEffect(() => {
    const init = async () => {
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

      fetchStudents()
    }

    init()
  }, [])

  // 🚀 DEBOUNCE SEARCH — also wrapped in transition so it doesn't block UI
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => setSearch(searchInput))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

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
  }

  // 🚀 MEMO FILTER
  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSearch =
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.mobile_number?.includes(search)

      const isFrozen = s.status?.toLowerCase().includes('freeze')

      if (filter === 'all') return matchSearch
      if (filter === 'frozen') return matchSearch && isFrozen
      return matchSearch && s.status?.toLowerCase().includes(filter)
    })
  }, [students, search, filter])

  // 📊 STATS
  const stats = useMemo(() => ({
    total:   students.length,
    active:  students.filter(s => s.status?.includes('Active')).length,
    expired: students.filter(s => s.status?.includes('Expired')).length,
    due:     students.filter(s => s.status?.includes('Due')).length,
    blocked: students.filter(s => s.status?.toLowerCase().includes('blocked')).length,
    frozen:  students.filter(s => s.status?.toLowerCase().includes('freeze')).length,
  }), [students])

  // 🔴 LOGOUT
  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const CARDS = [
    { key: 'active',  label: 'Active',  count: stats.active,  bg: 'bg-green-50',  activeBg: 'bg-green-500',  text: 'text-green-700',  activeText: 'text-white' },
    { key: 'expired', label: 'Expired', count: stats.expired, bg: 'bg-red-50',    activeBg: 'bg-red-500',    text: 'text-red-700',    activeText: 'text-white' },
    { key: 'due',     label: 'Due',     count: stats.due,     bg: 'bg-yellow-50', activeBg: 'bg-yellow-500', text: 'text-yellow-700', activeText: 'text-white' },
    { key: 'frozen',  label: 'Frozen',  count: stats.frozen,  bg: 'bg-blue-50',   activeBg: 'bg-blue-500',   text: 'text-blue-700',   activeText: 'text-white' },
    { key: 'blocked', label: 'Blocked', count: stats.blocked, bg: 'bg-gray-100',  activeBg: 'bg-gray-600',   text: 'text-gray-600',   activeText: 'text-white' },
    { key: 'all',     label: 'All',     count: stats.total,   bg: 'bg-white',     activeBg: 'bg-gray-800',   text: 'text-gray-700',   activeText: 'text-white' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 text-gray-800">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">📚 Library Dashboard</h1>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-sm md:text-base">{userName}</p>
            <p className="text-xs text-gray-500">{role}</p>
          </div>
          <button onClick={handleLogout} className="bg-red-500 text-white px-3 py-1 rounded text-sm">
            Logout
          </button>
        </div>
      </div>

      {/* 📊 CLICKABLE STAT CARDS = FILTERS */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mb-6">
        {CARDS.map(({ key, label, count, bg, activeBg, text, activeText }) => {
          const isSelected = selectedCard === key
          return (
            <button
              key={key}
              onClick={() => {
                setSelectedCard(key)
                startTransition(() => setFilter(key))
              }}
              className={`rounded-xl p-3 md:p-4 text-left transition-all duration-150 shadow-sm ${
                isSelected
                  ? `${activeBg} ${activeText} shadow-md scale-[1.03]`
                  : `${bg} ${text}`
              }`}
            >
              <p className="text-xs font-medium opacity-80">{label}</p>
              <p className="text-xl md:text-2xl font-bold mt-0.5">{count}</p>
            </button>
          )
        })}
      </div>

      {/* SEARCH */}
      <input
        type="text"
        placeholder="Search by name or mobile..."
        className="w-full p-3 border rounded-lg mb-5"
        onChange={(e) => setSearchInput(e.target.value)}
      />

      {/* LOADING */}
      {loading && <p>Loading...</p>}

      {/* EMPTY */}
      {!loading && filtered.length === 0 && (
        <p className="text-gray-500">No students found</p>
      )}

      {/* LIST */}
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((s) => (
          <StudentCard key={s.mobile_number} s={s} />
        ))}
      </div>

    </div>
  )
}
