import { useState, useEffect } from 'react'
import {
  Activity, RefreshCw, X, Monitor, Smartphone, Globe,
  Clock, User, Shield, LogOut, AlertCircle, Calendar,
  MapPin, Trash2, ChevronRight, Search
} from 'lucide-react'
import { getActiveSessions, terminateSession } from '../api'

export default function Sessions() {
  const [sessions, setSessions]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [message, setMessage]     = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => {
    load()
    // Auto-refresh every 30 seconds
    let interval
    if (autoRefresh) {
      interval = setInterval(load, 30000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [autoRefresh])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getActiveSessions()
      setSessions(data.sessions || [])
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load sessions')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleTerminate = async (session) => {
    if (session.username === currentUser.username) {
      if (!confirm('This is your own session. Terminating will log you out. Continue?')) return
    } else {
      if (!confirm(`Force logout ${session.displayName || session.username}?`)) return
    }
    
    try {
      await terminateSession(session.id)
      showMsg('success', `Session terminated for ${session.username}`)
      
      // If we terminated our own session, logout
      if (session.username === currentUser.username) {
        setTimeout(() => {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          window.location.href = '/login'
        }, 1500)
      } else {
        load()
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Terminate failed')
    }
  }

  // Parse user agent to get browser/OS info
  const parseUserAgent = (ua) => {
    if (!ua) return { browser: 'Unknown', os: 'Unknown', icon: Globe }
    
    let browser = 'Unknown'
    let os = 'Unknown'
    let icon = Globe
    
    if (ua.includes('Chrome')) browser = 'Chrome'
    else if (ua.includes('Firefox')) browser = 'Firefox'
    else if (ua.includes('Safari')) browser = 'Safari'
    else if (ua.includes('Edge')) browser = 'Edge'
    
    if (ua.includes('Windows')) { os = 'Windows'; icon = Monitor }
    else if (ua.includes('Mac')) { os = 'macOS'; icon = Monitor }
    else if (ua.includes('Linux')) { os = 'Linux'; icon = Monitor }
    else if (ua.includes('Android')) { os = 'Android'; icon = Smartphone }
    else if (ua.includes('iPhone') || ua.includes('iPad')) { os = 'iOS'; icon = Smartphone }
    
    return { browser, os, icon }
  }

  const timeAgo = (dateStr) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const isActive = (lastActivity) => {
    if (!lastActivity) return false
    const seconds = Math.floor((Date.now() - new Date(lastActivity).getTime()) / 1000)
    return seconds < 300  // Active if last activity < 5 min
  }

  const filteredSessions = sessions.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.username.toLowerCase().includes(q) ||
           (s.displayName || '').toLowerCase().includes(q) ||
           (s.ipAddress || '').toLowerCase().includes(q)
  })

  const stats = {
    total: sessions.length,
    active: sessions.filter(s => isActive(s.lastActivity)).length,
    idle: sessions.filter(s => !isActive(s.lastActivity)).length,
    admins: sessions.filter(s => s.role === 'Admin').length,
  }

  return (
    <div className="p-8">
      {/* ── Header ──────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            <Activity size={28} className="text-green-400" />
            Active Sessions
          </h1>
          <p className="text-slate-400">
            View and manage currently logged-in users
            {autoRefresh && <span className="ml-2 text-green-400 text-sm">● Auto-refresh ON</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
              autoRefresh
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            <RefreshCw size={16} className={autoRefresh ? 'animate-spin' : ''} />
            {autoRefresh ? 'Auto ON' : 'Auto OFF'}
          </button>
          <button onClick={load} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Message ─────────────────────────────── */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center justify-between ${
          message.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── Info Banner ─────────────────────────── */}
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
            <Activity size={20} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-medium text-blue-300 mb-1">Session Tracking</h3>
            <p className="text-sm text-slate-300">
              This page shows users currently logged into <strong>DC Manager Pro</strong>.
              Sessions are considered <span className="text-green-400 font-medium">Active</span> if there was activity in the last 5 minutes.
              Sessions automatically expire after 8 hours of inactivity.
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={User} label="Total Sessions" value={stats.total} color="blue" />
        <StatCard icon={Activity} label="Currently Active" value={stats.active} color="green" />
        <StatCard icon={Clock} label="Idle" value={stats.idle} color="yellow" />
        <StatCard icon={Shield} label="Admin Sessions" value={stats.admins} color="red" />
      </div>

      {/* ── Search ──────────────────────────────── */}
      <div className="mb-6 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username, name, or IP address..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-green-500"
        />
      </div>

      {/* ── Sessions List ───────────────────────── */}
      {loading ? (
        <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <RefreshCw size={48} className="mx-auto mb-3 animate-spin" />
          <p>Loading sessions...</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <Activity size={48} className="mx-auto mb-3 text-slate-600" />
          <p>{search ? 'No sessions match your search' : 'No active sessions'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map(session => {
            const { browser, os, icon: DeviceIcon } = parseUserAgent(session.userAgent)
            const active = isActive(session.lastActivity)
            const isOwn = session.username === currentUser.username

            return (
              <div
                key={session.id}
                className={`bg-slate-800 border rounded-xl p-5 hover:border-slate-600 transition ${
                  active ? 'border-green-500/30' : 'border-slate-700'
                } ${isOwn ? 'ring-1 ring-blue-500/50' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left side - User & device info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                        session.role === 'Admin'
                          ? 'bg-red-500/20 text-red-400'
                          : session.role === 'Helpdesk'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {(session.displayName || session.username)[0]?.toUpperCase() || 'U'}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-lg">
                            {session.displayName || session.username}
                          </h3>
                          {isOwn && (
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">
                              YOU
                            </span>
                          )}
                          {active ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">
                              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                              Active
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs font-medium">
                              <Clock size={10} />
                              Idle
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            session.role === 'Admin'
                              ? 'bg-red-500/20 text-red-400'
                              : session.role === 'Helpdesk'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            {session.role}
                          </span>
                        </div>
                        <div className="text-sm text-slate-400">{session.username}</div>
                      </div>
                    </div>

                    {/* Session details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 pl-15 ml-15">
                      <SessionDetail
                        icon={MapPin}
                        label="IP Address"
                        value={session.ipAddress || 'unknown'}
                        mono
                      />
                      <SessionDetail
                        icon={DeviceIcon}
                        label="Device"
                        value={`${browser} on ${os}`}
                      />
                      <SessionDetail
                        icon={Calendar}
                        label="Login Time"
                        value={timeAgo(session.loginTime)}
                        tooltip={session.loginTime ? new Date(session.loginTime).toLocaleString() : ''}
                      />
                      <SessionDetail
                        icon={Activity}
                        label="Last Activity"
                        value={timeAgo(session.lastActivity)}
                        tooltip={session.lastActivity ? new Date(session.lastActivity).toLocaleString() : ''}
                        highlight={active}
                      />
                    </div>
                  </div>

                  {/* Right side - Actions */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => setSelectedSession(session)}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm flex items-center gap-1"
                      title="View Details"
                    >
                      <Eye size={14} /> Details
                    </button>
                    {currentUser.role === 'Admin' && (
                      <button
                        onClick={() => handleTerminate(session)}
                        className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm flex items-center gap-1"
                        title={isOwn ? 'Logout' : 'Force Logout'}
                      >
                        <LogOut size={14} />
                        {isOwn ? 'Logout' : 'Force Out'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Detail Modal ────────────────────────── */}
      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          isOwn={selectedSession.username === currentUser.username}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Eye Icon (defined inline since we use Activity already)
// ─────────────────────────────────────────────────────────
function Eye({ size = 16, className = '' }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size}
         viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue:   'text-blue-400 bg-blue-500/10 border-blue-500/30',
    green:  'text-green-400 bg-green-500/10 border-green-500/30',
    yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    red:    'text-red-400 bg-red-500/10 border-red-500/30',
  }
  return (
    <div className={`p-4 rounded-lg border ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon size={20} />
        <span className="text-3xl font-bold">{value}</span>
      </div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Session Detail Inline
// ─────────────────────────────────────────────────────────
function SessionDetail({ icon: Icon, label, value, mono, tooltip, highlight }) {
  return (
    <div className="flex items-start gap-2" title={tooltip || ''}>
      <Icon size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className={`text-sm truncate ${mono ? 'font-mono' : ''} ${
          highlight ? 'text-green-400 font-medium' : 'text-slate-200'
        }`}>
          {value}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Session Detail Modal
// ─────────────────────────────────────────────────────────
function SessionDetailModal({ session, isOwn, onClose }) {
  const parseUA = (ua) => {
    if (!ua) return 'Unknown'
    return ua
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4 pb-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${
              session.role === 'Admin'
                ? 'bg-red-500/20 text-red-400'
                : session.role === 'Helpdesk'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-blue-500/20 text-blue-400'
            }`}>
              {(session.displayName || session.username)[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                {session.displayName || session.username}
                {isOwn && (
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">
                    YOU
                  </span>
                )}
              </h3>
              <p className="text-sm text-slate-400">{session.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* User Info */}
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">User</h4>
            <div className="grid grid-cols-2 gap-3">
              <InfoCard label="Username" value={session.username} mono />
              <InfoCard label="Display Name" value={session.displayName || '—'} />
              <InfoCard label="Role" value={session.role} highlight={session.role === 'Admin' ? 'red' : null} />
              <InfoCard label="Session ID" value={`#${session.id}`} />
            </div>
          </div>

          {/* Connection Info */}
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">Connection</h4>
            <div className="grid grid-cols-2 gap-3">
              <InfoCard label="IP Address" value={session.ipAddress || 'unknown'} mono />
              <InfoCard 
                label="Login Time" 
                value={session.loginTime ? new Date(session.loginTime).toLocaleString() : '—'} 
              />
              <InfoCard 
                label="Last Activity" 
                value={session.lastActivity ? new Date(session.lastActivity).toLocaleString() : '—'} 
              />
              <InfoCard 
                label="Duration" 
                value={session.loginTime ? calcDuration(session.loginTime) : '—'} 
              />
            </div>
          </div>

          {/* User Agent */}
          <div>
            <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">Device Info</h4>
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-xs text-slate-500 mb-1">User Agent</div>
              <div className="text-xs font-mono break-all">{parseUA(session.userAgent)}</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6 pt-4 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value, mono, highlight }) {
  const colors = {
    red: 'text-red-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
  }
  return (
    <div className="p-3 bg-slate-900 rounded-lg">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono' : ''} ${highlight ? colors[highlight] : ''}`}>
        {value}
      </div>
    </div>
  )
}

function calcDuration(loginTime) {
  const seconds = Math.floor((Date.now() - new Date(loginTime).getTime()) / 1000)
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins}m`
}