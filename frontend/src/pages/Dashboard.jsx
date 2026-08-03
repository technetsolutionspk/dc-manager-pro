import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts'
import {
  Users, Shield, Monitor, FolderTree, Lock, KeyRound, AlertCircle,
  UserX, Building, Activity, RefreshCw, Settings as SettingsIcon,
  ChevronRight, Eye, TrendingUp, Clock, UserCheck, LogIn
} from 'lucide-react'
import {
  getReportSummary, getUsersByDepartment, getComputersByOS,
  getInactiveUsers, getPasswordExpiring, getLockedUsers,
  getDisabledUsersReport, getPasswordExpired, getDomainLoginsSummary
} from '../api'

export default function Dashboard() {
  const navigate = useNavigate()
  const [summary, setSummary]     = useState(null)
  const [loginsData, setLoginsData] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [domain, setDomain]       = useState('')

  useEffect(() => { loadDashboard() }, [])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const [data, logins] = await Promise.all([
        getReportSummary(),
        getDomainLoginsSummary().catch(() => null)
      ])
      setSummary(data)
      setLoginsData(logins)
      setDomain(localStorage.getItem('domain_name') || localStorage.getItem('domain_id') || 'Unknown')
    } catch (err) {
      console.error('Failed to load dashboard:', err)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-slate-500 py-16">
          <RefreshCw size={48} className="mx-auto mb-3 animate-spin text-blue-500" />
          <p className="text-lg">Loading dashboard...</p>
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
          <button onClick={loadDashboard} className="mt-4 px-4 py-2 bg-blue-600 rounded-lg">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-slate-900 min-h-screen">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="text-green-400" size={20} />
          <h1 className="text-2xl font-bold">Graphical View</h1>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Domain:</span>
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
              <Building size={16} className="text-blue-400" />
              <span className="font-medium">{domain}</span>
            </div>
          </div>
          <button
            onClick={loadDashboard}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* ── Domain Login Activity (NEW) ── */}
      {loginsData && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <LogIn className="text-green-400" size={20} />
            <h2 className="text-lg font-bold">Domain Login Activity</h2>
            <span className="text-xs text-slate-500 ml-2">
              Based on AD lastLogonTimestamp (updated every ~14 days)
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <LoginActivityCard
              value={loginsData.last15min}
              label="Last 15 min"
              color="text-green-400"
              bgColor="bg-green-500/10 border-green-500/30"
              onClick={() => navigate('/reports')}
            />
            <LoginActivityCard
              value={loginsData.last1hour}
              label="Last 1 hour"
              color="text-cyan-400"
              bgColor="bg-cyan-500/10 border-cyan-500/30"
              onClick={() => navigate('/reports')}
            />
            <LoginActivityCard
              value={loginsData.last24hours}
              label="Last 24 hours"
              color="text-blue-400"
              bgColor="bg-blue-500/10 border-blue-500/30"
              onClick={() => navigate('/reports')}
            />
            <LoginActivityCard
              value={loginsData.last7days}
              label="Last 7 days"
              color="text-purple-400"
              bgColor="bg-purple-500/10 border-purple-500/30"
              onClick={() => navigate('/reports')}
            />
            <LoginActivityCard
              value={loginsData.last30days}
              label="Last 30 days"
              color="text-orange-400"
              bgColor="bg-orange-500/10 border-orange-500/30"
              onClick={() => navigate('/reports')}
            />
            <LoginActivityCard
              value={loginsData.neverLoggedIn}
              label="Never Logged In"
              color="text-red-400"
              bgColor="bg-red-500/10 border-red-500/30"
              onClick={() => navigate('/reports')}
            />
          </div>
        </div>
      )}

      {/* ── Top Quick Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <QuickStatCard
          icon={Lock}
          iconColor="text-red-500"
          iconBg="bg-red-500/10"
          value={summary.users.locked}
          label="Locked Out Users"
          action="Unlock"
          onAction={() => navigate('/reports')}
        />
        <QuickStatCard
          icon={KeyRound}
          iconColor="text-yellow-500"
          iconBg="bg-yellow-500/10"
          value={summary.users.passwordNeverExpires}
          label="Passwords Never Expire"
          action="View Details"
          onAction={() => navigate('/reports')}
        />
        <QuickStatCard
          icon={KeyRound}
          iconColor="text-orange-500"
          iconBg="bg-orange-500/10"
          value={summary.users.mustChangePassword}
          label="Must Change Password"
          action="Options"
          onAction={() => navigate('/reports')}
        />
        <QuickStatCard
          icon={Clock}
          iconColor="text-pink-500"
          iconBg="bg-pink-500/10"
          value={summary.users.inactive30Days + summary.users.inactive90Days + summary.users.inactive180Days}
          label="Inactive Users (30+ days)"
          action="Options"
          onAction={() => navigate('/reports')}
        />
      </div>

      {/* ── User Reports & System Reports ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <UserReportsCard summary={summary} onClick={() => navigate('/users')} />
        <SystemReportsCard summary={summary} onClick={() => navigate('/computers')} />
      </div>

      {/* ── Logged On & Groups Reports ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <LoggedOnReportCard summary={summary} />
        <GroupsAndOUsCard summary={summary} onClick={() => navigate('/groups')} />
      </div>

      {/* ── Departments & OS Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DepartmentsChart />
        <OperatingSystemChart />
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
// Quick Stat Card (Top row)
// ─────────────────────────────────────────────────────────
function QuickStatCard({ icon: Icon, iconColor, iconBg, value, label, action, onAction }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 hover:border-slate-600 transition">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-3 rounded-lg ${iconBg}`}>
          <Icon size={28} className={iconColor} />
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold text-white">{value}</div>
          <div className="text-xs text-slate-400 mt-1">{label}</div>
        </div>
      </div>
      <div className="pt-3 border-t border-slate-700">
        <button
          onClick={onAction}
          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          {action}
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

function UserReportsCard({ summary, onClick }) {
  const data = [
    { name: 'Total Users',    value: summary.users.total,           color: '#06b6d4' },
    { name: 'Inactive 30d',   value: summary.users.inactive30Days,  color: '#22c55e' },
    { name: 'Disabled',       value: summary.users.disabled,        color: '#ec4899' },
    { name: 'Locked',         value: summary.users.locked,          color: '#3b82f6' },
    { name: 'Pwd Expired',    value: summary.users.mustChangePassword, color: '#a855f7' },
  ]
  return (
    <Card title="User Reports" onRefresh={onClick}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} labelStyle={{ color: '#fff' }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-2">
        {[
          { label: 'Number of users',           value: summary.users.total,             color: '#06b6d4' },
          { label: 'Inactive users in 30 days', value: summary.users.inactive30Days,    color: '#22c55e' },
          { label: 'Disabled Users',            value: summary.users.disabled,          color: '#ec4899' },
          { label: 'Locked-out Users',          value: summary.users.locked,            color: '#3b82f6' },
          { label: 'Password Expired Users',    value: summary.users.mustChangePassword, color: '#a855f7' },
        ].map((item, i) => (<LegendRow key={i} {...item} />))}
      </div>
    </Card>
  )
}

function SystemReportsCard({ summary, onClick }) {
  const data = [
    { name: 'Total',     value: summary.computers.total,    color: '#06b6d4' },
    { name: 'Inactive',  value: summary.computers.inactive, color: '#22c55e' },
    { name: 'Disabled',  value: summary.computers.disabled, color: '#ec4899' },
    { name: 'Active',    value: summary.computers.active,   color: '#3b82f6' },
  ]
  return (
    <Card title="System Reports" onRefresh={onClick}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-2">
        {[
          { label: 'Number of computers',           value: summary.computers.total,    color: '#06b6d4' },
          { label: 'Inactive computers in 30 days', value: summary.computers.inactive, color: '#22c55e' },
          { label: 'Disabled Computers',            value: summary.computers.disabled, color: '#ec4899' },
          { label: 'Active Workstations',           value: summary.computers.active,   color: '#3b82f6' },
        ].map((item, i) => (<LegendRow key={i} {...item} />))}
      </div>
    </Card>
  )
}

function LoggedOnReportCard({ summary }) {
  const total = summary.users.total
  const neverLoggedIn = summary.users.neverLoggedIn
  const recentlyLogged = total - neverLoggedIn - summary.users.inactive90Days - summary.users.inactive180Days
  const expiringSoon = summary.users.mustChangePassword
  const data = [
    { name: 'Users Never Logged On',      value: neverLoggedIn,             color: '#06b6d4' },
    { name: 'Recently Logged (30 days)',  value: Math.max(0, recentlyLogged), color: '#22c55e' },
    { name: 'Inactive Bad Logged (30d)',  value: summary.users.locked,      color: '#ec4899' },
    { name: 'Password Expiring (7 days)', value: expiringSoon,              color: '#3b82f6' },
  ]
  return (
    <Card title="Logged On User Report">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" stroke="#94a3b8" fontSize={11} />
            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={150} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

function GroupsAndOUsCard({ summary, onClick }) {
  const data = [
    { name: 'Number of groups',          value: summary.groups.total,         color: '#06b6d4' },
    { name: 'Number of security groups', value: summary.groups.security,      color: '#22c55e' },
    { name: 'Number of distribution',    value: summary.groups.distribution,  color: '#3b82f6' },
    { name: 'Groups without members',    value: summary.groups.empty,         color: '#a855f7' },
    { name: 'Number of OUs',             value: summary.ous.total,            color: '#f59e0b' },
  ]
  return (
    <Card title="Group and OU reports" onRefresh={onClick}>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="number" stroke="#94a3b8" fontSize={11} />
            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={150} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
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
      const top = d.departments.slice(0, 8).map(dept => ({ name: dept.department, value: dept.total }))
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
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80} fill="#8884d8" dataKey="value">
                {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
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
      const list = d.operatingSystems.map(os => ({ name: os.os || 'Unknown', value: os.total }))
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
                label={({ name, percent }) => `${name.substring(0, 20)} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80} fill="#8884d8" dataKey="value">
                {data.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function Card({ title, children, onRefresh }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700">
        <h2 className="font-semibold text-slate-200">{title}</h2>
        {onRefresh && (
          <button onClick={onRefresh} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400 transition">
            <RefreshCw size={14} />
          </button>
        )}
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