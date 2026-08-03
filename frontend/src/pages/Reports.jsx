import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts'
import {
  Users, Shield, Monitor, FolderTree, Lock, KeyRound, AlertCircle,
  UserX, Building, Activity, RefreshCw, Clock, UserCheck,
  Download, BarChart3, X, Eye, LogIn, Filter
} from 'lucide-react'
import {
  getReportSummary, getUsersByDepartment, getComputersByOS, exportReport,
  getRecentlyActiveUsers, getDomainLoginsSummary
} from '../api'

export default function Reports() {
  const navigate = useNavigate()
  const [summary, setSummary]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [message, setMessage]     = useState(null)
  const [loginsData, setLoginsData] = useState(null)
  const [showActiveUsers, setShowActiveUsers] = useState(false)
  const [activeUsersFilter, setActiveUsersFilter] = useState(15) // minutes

  useEffect(() => { loadSummary() }, [])

  const loadSummary = async () => {
    setLoading(true)
    try {
      const [data, logins] = await Promise.all([
        getReportSummary(),
        getDomainLoginsSummary().catch(() => null)
      ])
      setSummary(data)
      setLoginsData(logins)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleExport = async (type, name) => {
    try {
      const res = await exportReport(type)
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = name + '-' + Date.now() + '.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showMsg('success', 'Exported ' + name)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Export failed')
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-slate-500 py-16">
          <RefreshCw size={48} className="mx-auto mb-3 animate-spin text-blue-500" />
          <p className="text-lg">Loading reports...</p>
        </div>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="p-8">
        <div className="text-center text-red-400 py-16">
          <AlertCircle size={48} className="mx-auto mb-3" />
          <p>Failed to load dashboard data</p>
          <button onClick={loadSummary} className="mt-4 px-4 py-2 bg-blue-600 rounded-lg">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-slate-900 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="text-blue-400" size={24} />
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Domain:</span>
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <Building size={16} className="text-blue-400" />
              <span className="font-medium">{localStorage.getItem('domain_name') || 'Unknown'}</span>
            </div>
          </div>
          <button onClick={loadSummary} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={'mb-4 p-3 rounded-lg flex items-center justify-between ' +
          (message.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300')}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── Domain Login Activity (NEW) ── */}
      {loginsData && (
        <div className="mb-6 bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <LogIn className="text-green-400" size={22} />
              <h2 className="text-xl font-bold">Domain Login Activity</h2>
            </div>
            <button
              onClick={() => setShowActiveUsers(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm flex items-center gap-2"
            >
              <Eye size={14} /> View Active Users
            </button>
          </div>
          <div className="text-xs text-slate-500 mb-4">
            ℹ️ Based on AD lastLogonTimestamp (updated every ~14 days by AD replication).
            For real-time data, query domain controllers directly.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <LoginActivityCard
              value={loginsData.last15min}
              label="Last 15 min"
              color="text-green-400"
              bgColor="bg-green-500/10 border-green-500/30"
              onClick={() => { setActiveUsersFilter(15); setShowActiveUsers(true) }}
            />
            <LoginActivityCard
              value={loginsData.last1hour}
              label="Last 1 hour"
              color="text-cyan-400"
              bgColor="bg-cyan-500/10 border-cyan-500/30"
              onClick={() => { setActiveUsersFilter(60); setShowActiveUsers(true) }}
            />
            <LoginActivityCard
              value={loginsData.last24hours}
              label="Last 24 hours"
              color="text-blue-400"
              bgColor="bg-blue-500/10 border-blue-500/30"
              onClick={() => { setActiveUsersFilter(1440); setShowActiveUsers(true) }}
            />
            <LoginActivityCard
              value={loginsData.last7days}
              label="Last 7 days"
              color="text-purple-400"
              bgColor="bg-purple-500/10 border-purple-500/30"
              onClick={() => { setActiveUsersFilter(10080); setShowActiveUsers(true) }}
            />
            <LoginActivityCard
              value={loginsData.last30days}
              label="Last 30 days"
              color="text-orange-400"
              bgColor="bg-orange-500/10 border-orange-500/30"
              onClick={() => { setActiveUsersFilter(43200); setShowActiveUsers(true) }}
            />
            <LoginActivityCard
              value={loginsData.neverLoggedIn}
              label="Never Logged In"
              color="text-red-400"
              bgColor="bg-red-500/10 border-red-500/30"
              onClick={() => handleExport('never-logged-in', 'never-logged-in')}
            />
          </div>
        </div>
      )}

      {/* Top Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <QuickStatCard icon={Lock} iconColor="text-red-500" iconBg="bg-red-500/10"
          value={summary.users.locked} label="Locked Out Users"
          action="Unlock" onAction={() => navigate('/users')} />
        <QuickStatCard icon={KeyRound} iconColor="text-yellow-500" iconBg="bg-yellow-500/10"
          value={summary.users.passwordNeverExpires} label="Passwords Never Expire"
          action="View Details" onAction={() => navigate('/reports')} />
        <QuickStatCard icon={KeyRound} iconColor="text-orange-500" iconBg="bg-orange-500/10"
          value={summary.users.mustChangePassword} label="Must Change Password"
          action="Options" onAction={() => navigate('/reports')} />
        <QuickStatCard icon={Clock} iconColor="text-pink-500" iconBg="bg-pink-500/10"
          value={summary.users.inactive30Days + summary.users.inactive90Days + summary.users.inactive180Days}
          label="Inactive Users (30+ days)"
          action="Options" onAction={() => navigate('/reports')} />
      </div>

      {/* User Reports & System Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <UserReportsCard summary={summary} />
        <SystemReportsCard summary={summary} />
      </div>

      {/* Logged On & Groups Reports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <LoggedOnReportCard summary={summary} />
        <GroupsAndOUsCard summary={summary} />
      </div>

      {/* Departments & OS Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <DepartmentsChart />
        <OperatingSystemChart />
      </div>

      {/* Quick Export */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Download size={20} className="text-blue-400" />
          Quick Export
        </h2>
        <p className="text-sm text-slate-400 mb-4">
          Download CSV reports for analysis in Excel
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ExportButton onClick={() => handleExport('all-users', 'all-users')} label="All Users" />
          <ExportButton onClick={() => handleExport('active-users', 'active-users')} label="Active Users" />
          <ExportButton onClick={() => handleExport('disabled-users', 'disabled-users')} label="Disabled Users" />
          <ExportButton onClick={() => handleExport('locked-users', 'locked-users')} label="Locked Users" />
          <ExportButton onClick={() => handleExport('never-logged-in', 'never-logged-in')} label="Never Logged In" />
          <ExportButton onClick={() => handleExport('inactive-users', 'inactive-users')} label="Inactive (90+ days)" />
          <ExportButton onClick={() => handleExport('all-groups', 'all-groups')} label="All Groups" />
          <ExportButton onClick={() => handleExport('all-computers', 'all-computers')} label="All Computers" />
        </div>
      </div>

      {/* Active Users Modal */}
      {showActiveUsers && (
        <ActiveUsersModal
          initialMinutes={activeUsersFilter}
          onClose={() => setShowActiveUsers(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Active Users Modal (NEW)
// ─────────────────────────────────────────────────────────
function ActiveUsersModal({ initialMinutes, onClose }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [minutes, setMinutes] = useState(initialMinutes)

  const timeOptions = [
    { value: 15,    label: 'Last 15 minutes' },
    { value: 60,    label: 'Last 1 hour' },
    { value: 1440,  label: 'Last 24 hours' },
    { value: 10080, label: 'Last 7 days' },
    { value: 43200, label: 'Last 30 days' }
  ]

  useEffect(() => { loadUsers() }, [minutes])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const data = await getRecentlyActiveUsers(minutes)
      setUsers(data.users || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  const formatTimeAgo = (min) => {
    if (min < 1) return 'just now'
    if (min < 60) return `${min} min ago`
    if (min < 1440) return `${Math.floor(min / 60)} hr ago`
    return `${Math.floor(min / 1440)} day${Math.floor(min / 1440) > 1 ? 's' : ''} ago`
  }

  const getActivityColor = (min) => {
    if (min <= 15) return 'text-green-400 bg-green-500/10'
    if (min <= 60) return 'text-cyan-400 bg-cyan-500/10'
    if (min <= 1440) return 'text-blue-400 bg-blue-500/10'
    if (min <= 10080) return 'text-purple-400 bg-purple-500/10'
    return 'text-orange-400 bg-orange-500/10'
  }

  const exportCsv = () => {
    const headers = ['Username', 'Display Name', 'Email', 'Department', 'Last Logon', 'Time Ago']
    const rows = users.map(u => [
      u.username,
      u.displayName || '',
      u.email || '',
      u.department || '',
      u.lastLogon || '',
      formatTimeAgo(u.minutesAgo)
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `active-users-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LogIn className="text-green-400" size={22} />
              <h3 className="text-xl font-bold">Recently Active Domain Users</h3>
            </div>
            <p className="text-sm text-slate-400">
              Users who logged into the domain based on AD lastLogonTimestamp
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-slate-700 flex items-center gap-3 flex-wrap">
          <Filter size={16} className="text-slate-400" />
          <span className="text-sm text-slate-400">Time period:</span>
          <div className="flex gap-2 flex-wrap">
            {timeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setMinutes(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  minutes === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-slate-400">
              {users.length} user{users.length !== 1 ? 's' : ''}
            </span>
            {users.length > 0 && (
              <button
                onClick={exportCsv}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm flex items-center gap-1"
              >
                <Download size={14} /> CSV
              </button>
            )}
            <button
              onClick={loadUsers}
              className="p-1.5 bg-slate-900 hover:bg-slate-700 rounded"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-16 text-center text-slate-500">
              <RefreshCw size={40} className="mx-auto mb-3 animate-spin text-blue-500" />
              <p>Loading active users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-16 text-center text-slate-500">
              <UserX size={48} className="mx-auto mb-3" />
              <p>No users logged in during this period</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-900 sticky top-0">
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="p-3">User</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Last Logon</th>
                  <th className="p-3">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-700/30">
                    <td className="p-3">
                      <div className="font-medium">{u.displayName || u.username}</div>
                      <div className="text-xs text-slate-400 font-mono">{u.username}</div>
                    </td>
                    <td className="p-3 text-sm text-slate-300">{u.email || '—'}</td>
                    <td className="p-3 text-sm text-slate-300">{u.department || '—'}</td>
                    <td className="p-3 text-sm text-slate-400">
                      {u.lastLogon ? new Date(u.lastLogon).toLocaleString() : '—'}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getActivityColor(u.minutesAgo)}`}>
                        {formatTimeAgo(u.minutesAgo)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Login Activity Card (NEW)
// ─────────────────────────────────────────────────────────
function LoginActivityCard({ value, label, color, bgColor, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`${bgColor} border rounded-lg p-4 hover:opacity-80 transition text-left`}
    >
      <div className={`text-3xl font-bold ${color} mb-1`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────
// Quick Stat Card
// ─────────────────────────────────────────────────────────
function QuickStatCard({ icon: Icon, iconColor, iconBg, value, label, action, onAction }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 hover:border-slate-600 transition">
      <div className="flex items-start justify-between mb-3">
        <div className={'p-3 rounded-lg ' + iconBg}>
          <Icon size={28} className={iconColor} />
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold text-white">{value}</div>
          <div className="text-xs text-slate-400 mt-1">{label}</div>
        </div>
      </div>
      <div className="pt-3 border-t border-slate-700">
        <button onClick={onAction} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
          {action} <span>›</span>
        </button>
      </div>
    </div>
  )
}

function UserReportsCard({ summary }) {
  const data = [
    { name: 'Total Users',    value: summary.users.total,           color: '#06b6d4' },
    { name: 'Inactive 30d',   value: summary.users.inactive30Days,  color: '#22c55e' },
    { name: 'Disabled',       value: summary.users.disabled,        color: '#ec4899' },
    { name: 'Locked',         value: summary.users.locked,          color: '#3b82f6' },
    { name: 'Pwd Expired',    value: summary.users.mustChangePassword, color: '#a855f7' },
  ]
  return (
    <Card title="User Reports">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (<Cell key={'cell-' + index} fill={entry.color} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-2">
        <LegendRow label="Number of users" value={summary.users.total} color="#06b6d4" />
        <LegendRow label="Inactive users in 30 days" value={summary.users.inactive30Days} color="#22c55e" />
        <LegendRow label="Disabled Users" value={summary.users.disabled} color="#ec4899" />
        <LegendRow label="Locked-out Users" value={summary.users.locked} color="#3b82f6" />
        <LegendRow label="Password Expired Users" value={summary.users.mustChangePassword} color="#a855f7" />
      </div>
    </Card>
  )
}

function SystemReportsCard({ summary }) {
  const data = [
    { name: 'Total',     value: summary.computers.total,    color: '#06b6d4' },
    { name: 'Inactive',  value: summary.computers.inactive, color: '#22c55e' },
    { name: 'Disabled',  value: summary.computers.disabled, color: '#ec4899' },
    { name: 'Active',    value: summary.computers.active,   color: '#3b82f6' },
  ]
  return (
    <Card title="System Reports">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (<Cell key={'cell-' + index} fill={entry.color} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-2">
        <LegendRow label="Number of computers" value={summary.computers.total} color="#06b6d4" />
        <LegendRow label="Inactive computers in 30 days" value={summary.computers.inactive} color="#22c55e" />
        <LegendRow label="Disabled Computers" value={summary.computers.disabled} color="#ec4899" />
        <LegendRow label="Active Workstations" value={summary.computers.active} color="#3b82f6" />
      </div>
    </Card>
  )
}

function LoggedOnReportCard({ summary }) {
  const total = summary.users.total
  const neverLoggedIn = summary.users.neverLoggedIn
  const recentlyLogged = Math.max(0, total - neverLoggedIn - summary.users.inactive90Days - summary.users.inactive180Days)
  const expiringSoon = summary.users.mustChangePassword
  const data = [
    { name: 'Users Never Logged On',      value: neverLoggedIn,    color: '#06b6d4' },
    { name: 'Recently Logged (30 days)',   value: recentlyLogged,  color: '#22c55e' },
    { name: 'Inactive Bad Logged (30d)',   value: summary.users.locked, color: '#ec4899' },
    { name: 'Password Expiring (7 days)',  value: expiringSoon,    color: '#3b82f6' },
  ]
  return (
    <Card title="Logged On User Report">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" stroke="#94a3b8" fontSize={11} />
            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={180} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (<Cell key={'cell-' + index} fill={entry.color} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function GroupsAndOUsCard({ summary }) {
  const data = [
    { name: 'Number of groups',          value: summary.groups.total,         color: '#06b6d4' },
    { name: 'Number of security groups', value: summary.groups.security,      color: '#22c55e' },
    { name: 'Number of distribution',    value: summary.groups.distribution,  color: '#3b82f6' },
    { name: 'Groups without members',    value: summary.groups.empty,         color: '#a855f7' },
    { name: 'Number of OUs',            value: summary.ous.total,            color: '#f59e0b' },
  ]
  return (
    <Card title="Group and OU Reports">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" stroke="#94a3b8" fontSize={11} />
            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={180} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (<Cell key={'cell-' + index} fill={entry.color} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function DepartmentsChart() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const COLORS = ['#06b6d4', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ec4899', '#10b981', '#f97316', '#8b5cf6']

  useEffect(() => {
    getUsersByDepartment().then(d => {
      const top = (d.departments || []).slice(0, 8).map(dept => ({
        name: dept.department,
        value: dept.total
      }))
      setData(top)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <Card title="Users by Department (Top 8)">
      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-500">Loading...</div>
      ) : data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-slate-500">No data</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" labelLine={false}
                label={({ name, percent }) => name + ' ' + (percent * 100).toFixed(0) + '%'}
                outerRadius={80} fill="#8884d8" dataKey="value">
                {data.map((entry, index) => (
                  <Cell key={'cell-' + index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function OperatingSystemChart() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const COLORS = ['#06b6d4', '#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ec4899']

  useEffect(() => {
    getComputersByOS().then(d => {
      const list = (d.operatingSystems || []).map(os => ({
        name: os.os || 'Unknown',
        value: os.total
      }))
      setData(list)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <Card title="Computers by Operating System">
      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-500">Loading...</div>
      ) : data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-slate-500">No data</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" labelLine={false}
                label={({ name, percent }) => name.substring(0, 20) + ' ' + (percent * 100).toFixed(0) + '%'}
                outerRadius={80} fill="#8884d8" dataKey="value">
                {data.map((entry, index) => (
                  <Cell key={'cell-' + index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700">
        <h2 className="font-semibold text-slate-200">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function LegendRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-700/30 rounded text-sm">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }}></span>
        <span className="text-slate-300">{label}</span>
      </div>
      <span className="font-bold text-white">{value}</span>
    </div>
  )
}

function ExportButton({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition"
    >
      <Download size={14} />
      {label}
    </button>
  )
}