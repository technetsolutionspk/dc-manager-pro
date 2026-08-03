import { useState, useEffect } from 'react'
import {
  Cog, RefreshCw, X, Plus, Trash2, KeyRound, Edit,
  Search, Filter, Shield, AlertCircle, CheckCircle,
  Lock, User, Building, Calendar, Eye, EyeOff,
  Download, Upload, Star, Briefcase, Mail, FileText
} from 'lucide-react'
import {
  getServiceAccounts, createServiceAccount, updateServiceAccount,
  deleteServiceAccount, resetServiceAccountPassword, importServiceAccount,
  getOUs, getUsers
} from '../api'

export default function ServiceAccounts() {
  const [accounts, setAccounts]     = useState([])
  const [loading, setLoading]       = useState(false)
  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState('all')  // all | critical | app-access | regular
  const [message, setMessage]       = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showEdit, setShowEdit]     = useState(false)
  const [showReset, setShowReset]   = useState(false)
  const [selected, setSelected]     = useState(null)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin = user.role === 'Admin'

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getServiceAccounts()
      setAccounts(data.accounts || [])
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleDelete = async (account) => {
    const deleteFromAd = confirm(
      `Delete service account "${account.username}"?\n\n` +
      `Click OK to delete from BOTH AD and AD Manager DB.\n` +
      `Click Cancel to keep in AD (only remove from this app).`
    )
    if (deleteFromAd === null) return  // User pressed Escape
    
    try {
      await deleteServiceAccount(account.id, deleteFromAd)
      showMsg('success', `Service account "${account.username}" deleted`)
      load()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed')
    }
  }

  // Filter accounts
  const filtered = accounts.filter(a => {
    if (filter === 'critical' && !a.isSystemCritical) return false
    if (filter === 'app-access' && !a.hasAppAccess) return false
    if (filter === 'regular' && (a.isSystemCritical || a.hasAppAccess)) return false
    if (search) {
      const q = search.toLowerCase()
      return a.username.toLowerCase().includes(q) ||
             (a.displayName || '').toLowerCase().includes(q) ||
             (a.purpose || '').toLowerCase().includes(q) ||
             (a.owner || '').toLowerCase().includes(q) ||
             (a.department || '').toLowerCase().includes(q)
    }
    return true
  })

  const stats = {
    total: accounts.length,
    critical: accounts.filter(a => a.isSystemCritical).length,
    appAccess: accounts.filter(a => a.hasAppAccess).length,
    regular: accounts.filter(a => !a.isSystemCritical && !a.hasAppAccess).length,
  }

  return (
    <div className="p-8">
      {/* ── Header ──────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            <Cog size={28} className="text-indigo-400" />
            Service Accounts
          </h1>
          <p className="text-slate-400">
            Manage service accounts in both AD and DC Manager Pro
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button onClick={() => setShowImport(true)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2">
                <Upload size={16} /> Import Existing
              </button>
              <button onClick={() => setShowCreate(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-2">
                <Plus size={16} /> New Service Account
              </button>
            </>
          )}
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
      <div className="mb-6 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-500/20 rounded-lg flex-shrink-0">
            <Cog size={20} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="font-medium text-indigo-300 mb-1">About Service Accounts</h3>
            <p className="text-sm text-slate-300">
              Service accounts are special AD accounts used by applications and services.
              Creating here will <strong>create the account in both Active Directory AND DC Manager Pro</strong>.
              Optionally, grant access to this app to manage AD via API.
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Cog} label="Total Accounts" value={stats.total} color="blue"
          active={filter === 'all'} onClick={() => setFilter('all')}
        />
        <StatCard
          icon={Star} label="System Critical" value={stats.critical} color="red"
          active={filter === 'critical'} onClick={() => setFilter('critical')}
        />
        <StatCard
          icon={Shield} label="App Access" value={stats.appAccess} color="purple"
          active={filter === 'app-access'} onClick={() => setFilter('app-access')}
        />
        <StatCard
          icon={User} label="Regular Service" value={stats.regular} color="green"
          active={filter === 'regular'} onClick={() => setFilter('regular')}
        />
      </div>

      {/* ── Search ──────────────────────────────── */}
      <div className="mb-6 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username, purpose, owner, department..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* ── Accounts List ───────────────────────── */}
      {loading ? (
        <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <RefreshCw size={48} className="mx-auto mb-3 animate-spin" />
          <p>Loading service accounts...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <Cog size={48} className="mx-auto mb-3 text-slate-600" />
          <p className="mb-4">No service accounts {search || filter !== 'all' ? 'match your filters' : 'yet'}</p>
          {!search && filter === 'all' && isAdmin && (
            <button onClick={() => setShowCreate(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg inline-flex items-center gap-2">
              <Plus size={16} /> Create First Service Account
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              isAdmin={isAdmin}
              onEdit={() => { setSelected(account); setShowEdit(true) }}
              onResetPassword={() => { setSelected(account); setShowReset(true) }}
              onDelete={() => handleDelete(account)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ──────────────────────────────── */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { showMsg('success', msg); load() }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={(msg) => { showMsg('success', msg); load() }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {showEdit && selected && (
        <EditModal
          account={selected}
          onClose={() => { setShowEdit(false); setSelected(null) }}
          onSuccess={(msg) => {
            showMsg('success', msg)
            setShowEdit(false)
            setSelected(null)
            load()
          }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {showReset && selected && (
        <ResetPasswordModal
          account={selected}
          onClose={() => { setShowReset(false); setSelected(null) }}
          onSuccess={(msg) => {
            showMsg('success', msg)
            setShowReset(false)
            setSelected(null)
            load()
          }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, active, onClick }) {
  const colors = {
    blue:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400' },
    red:    { bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
    green:  { bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400' },
  }
  const c = colors[color]
  return (
    <button onClick={onClick}
            className={`p-4 rounded-lg border transition text-left ${c.bg} ${c.border} ${
              active ? 'ring-2 ring-indigo-500' : 'hover:opacity-80'
            }`}>
      <div className="flex items-center justify-between mb-2">
        <Icon size={18} className={c.text} />
        <span className={`text-2xl font-bold ${c.text}`}>{value}</span>
      </div>
      <div className="text-xs text-slate-400">{label}</div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────
// Account Card
// ─────────────────────────────────────────────────────────
function AccountCard({ account, isAdmin, onEdit, onResetPassword, onDelete }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/50 transition group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`p-2 rounded-lg flex-shrink-0 ${
            account.isSystemCritical
              ? 'bg-red-500/20'
              : account.hasAppAccess
                ? 'bg-purple-500/20'
                : 'bg-indigo-500/20'
          }`}>
            <Cog size={20} className={
              account.isSystemCritical
                ? 'text-red-400'
                : account.hasAppAccess
                  ? 'text-purple-400'
                  : 'text-indigo-400'
            } />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold truncate">{account.displayName || account.username}</h3>
              {account.isSystemCritical && (
                <span title="System Critical" className="flex-shrink-0">
                  <Star size={14} className="text-red-400 fill-current" />
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate font-mono">{account.username}</p>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {account.hasAppAccess && (
          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs flex items-center gap-1">
            <Shield size={10} /> {account.appRole}
          </span>
        )}
        {account.isSystemCritical && (
          <span className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded text-xs flex items-center gap-1">
            <Star size={10} /> Critical
          </span>
        )}
        {account.passwordNeverExpires && (
          <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-xs">
            ∞ No Expiry
          </span>
        )}
        {account.cannotChangePassword && (
          <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1">
            <Lock size={10} /> Locked
          </span>
        )}
      </div>

      {/* Details */}
      <div className="space-y-1.5 mb-4 text-xs">
        {account.purpose && (
          <div className="flex items-start gap-2 text-slate-300">
            <FileText size={12} className="text-slate-500 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{account.purpose}</span>
          </div>
        )}
        {account.owner && (
          <div className="flex items-center gap-2 text-slate-300">
            <User size={12} className="text-slate-500" />
            <span>Owner: {account.owner}</span>
          </div>
        )}
        {account.department && (
          <div className="flex items-center gap-2 text-slate-300">
            <Building size={12} className="text-slate-500" />
            <span>{account.department}</span>
          </div>
        )}
        {account.email && (
          <div className="flex items-center gap-2 text-slate-400">
            <Mail size={12} className="text-slate-500" />
            <span className="truncate">{account.email}</span>
          </div>
        )}
        {account.lastPasswordChange && (
          <div className="flex items-center gap-2 text-slate-500">
            <Calendar size={12} />
            <span>Pwd: {new Date(account.lastPasswordChange).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {isAdmin && (
        <div className="flex gap-1 pt-3 border-t border-slate-700">
          <button onClick={onEdit}
                  className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center gap-1"
                  title="Edit">
            <Edit size={12} /> Edit
          </button>
          <button onClick={onResetPassword}
                  className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs flex items-center justify-center gap-1"
                  title="Reset Password">
            <KeyRound size={12} /> Password
          </button>
          {!account.isSystemCritical && (
            <button onClick={onDelete}
                    className="px-2 py-1.5 bg-slate-700 hover:bg-red-600 rounded text-xs"
                    title="Delete">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Modal Wrapper
// ─────────────────────────────────────────────────────────
function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className={`bg-slate-800 border border-slate-700 rounded-xl p-6 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Create Service Account Modal
// ─────────────────────────────────────────────────────────
function CreateModal({ onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    username: '',
    displayName: '',
    email: '',
    password: '',
    purpose: '',
    description: '',
    owner: '',
    department: 'Service Accounts',
    ou: '',
    passwordNeverExpires: true,
    cannotChangePassword: true,
    isSystemCritical: false,
    hasAppAccess: false,
    appRole: 'Viewer',
    notes: '',
  })
  const [ous, setOus] = useState([])
  const [saving, setSaving] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  useEffect(() => {
    getOUs().then(d => setOus(d.ous || [])).catch(() => {})
  }, [])

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
    let pwd = ''
    for (let i = 0; i < 20; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    update('password', pwd)
    setShowPwd(true)
  }

  const handleSubmit = async () => {
    if (!form.username) return onError('Username required')
    if (!form.password || form.password.length < 12) return onError('Password must be at least 12 characters')
    if (!/^[a-zA-Z0-9._-]+$/.test(form.username)) {
      return onError('Username can only contain letters, numbers, dots, underscores, hyphens')
    }

    setSaving(true)
    try {
      const result = await createServiceAccount(form)
      onSuccess(`✓ Service account '${form.username}' created in AD and DB`)
      onClose()
    } catch (err) {
      onError(err.response?.data?.detail || 'Create failed')
    }
    setSaving(false)
  }

  return (
    <Modal title="Create New Service Account" onClose={onClose} wide>
      {/* Warning */}
      <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <strong>This will create the account in BOTH:</strong>
            <ul className="mt-1 ml-4 list-disc text-xs">
              <li>Active Directory (svc-name@{form.username || 'username'}@domain.local)</li>
              <li>DC Manager Pro database (with tracking metadata)</li>
              {form.hasAppAccess && <li className="text-purple-300">App access ({form.appRole} role)</li>}
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* Basic Info */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Basic Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input label="Username (sAMAccountName) *" value={form.username}
                     onChange={v => update('username', v)}
                     placeholder="e.g. svc-sql-backup, svc-app-pool" />
              <p className="text-xs text-slate-500 mt-1">
                Recommended prefix: <code>svc-</code> for service accounts
              </p>
            </div>
            <Input label="Display Name" value={form.displayName}
                   onChange={v => update('displayName', v)}
                   placeholder={`Service: ${form.username}`} />
            <Input label="Email" type="email" value={form.email}
                   onChange={v => update('email', v)}
                   placeholder={`${form.username}@domain.local`} />
          </div>
        </div>

        {/* Password */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Password</h4>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Password * (min 12 characters)</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="Strong password..."
                className="w-full px-3 py-2 pr-24 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                        className="p-1.5 hover:bg-slate-700 rounded">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button type="button" onClick={generatePassword}
                        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs">
                  Generate
                </button>
              </div>
            </div>
            {form.password && (
              <div className="mt-1 text-xs">
                Length: <span className={form.password.length >= 12 ? 'text-green-400' : 'text-red-400'}>
                  {form.password.length}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Purpose & Owner */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Documentation</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Purpose *</label>
              <textarea
                value={form.purpose}
                onChange={(e) => update('purpose', e.target.value)}
                placeholder="What is this account used for? (e.g. SQL Server backup service, Application pool identity)"
                rows={2}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Owner (responsible person)" value={form.owner}
                     onChange={v => update('owner', v)} placeholder="IT Manager, John Doe" />
              <Input label="Department" value={form.department}
                     onChange={v => update('department', v)} />
            </div>
          </div>
        </div>

        {/* AD Settings */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">AD Settings</h4>
          <div className="mb-3">
            <label className="block text-sm text-slate-400 mb-1">Target OU</label>
            <select value={form.ou} onChange={e => update('ou', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg">
              <option value="">Default OU (from settings)</option>
              {ous.map(ou => <option key={ou.dn} value={ou.dn}>{ou.dn}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Recommendation: Use a dedicated "OU=Service Accounts" container
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700/50">
              <input type="checkbox" checked={form.passwordNeverExpires}
                     onChange={e => update('passwordNeverExpires', e.target.checked)} />
              <div>
                <div className="text-sm font-medium">Password Never Expires</div>
                <div className="text-xs text-slate-500">Recommended for service accounts</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700/50">
              <input type="checkbox" checked={form.cannotChangePassword}
                     onChange={e => update('cannotChangePassword', e.target.checked)} />
              <div>
                <div className="text-sm font-medium">User Cannot Change Password</div>
                <div className="text-xs text-slate-500">Only admins can reset</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg cursor-pointer hover:bg-red-500/10">
              <input type="checkbox" checked={form.isSystemCritical}
                     onChange={e => update('isSystemCritical', e.target.checked)} />
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <Star size={14} className="text-red-400 fill-current" />
                  System Critical
                </div>
                <div className="text-xs text-slate-500">Cannot be deleted, requires confirmation</div>
              </div>
            </label>
          </div>
        </div>

        {/* App Access */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider flex items-center gap-2">
            DC Manager Pro Access
            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[10px] rounded">Optional</span>
          </h4>

          <label className="flex items-center gap-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg cursor-pointer hover:bg-purple-500/10 mb-3">
            <input type="checkbox" checked={form.hasAppAccess}
                   onChange={e => update('hasAppAccess', e.target.checked)} />
            <div className="flex-1">
              <div className="text-sm font-medium">Grant access to DC Manager Pro</div>
              <div className="text-xs text-slate-500">
                Allow this account to log into this app and manage AD via API
              </div>
            </div>
          </label>

          {form.hasAppAccess && (
            <div>
              <label className="block text-sm text-slate-400 mb-1">App Role</label>
              <select value={form.appRole} onChange={e => update('appRole', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg">
                <option value="Viewer">Viewer (read-only)</option>
                <option value="Helpdesk">Helpdesk (manage users)</option>
                <option value="Admin">Admin (full access)</option>
              </select>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm text-slate-400 mb-1">Notes</label>
          <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)}
                    placeholder="Additional notes, change history, etc."
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500" />
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-700">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
          <Cog size={16} />
          {saving ? 'Creating in AD + DB...' : 'Create Service Account'}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Edit Modal
// ─────────────────────────────────────────────────────────
function EditModal({ account, onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    displayName: account.displayName || '',
    email: account.email || '',
    description: account.description || '',
    purpose: account.purpose || '',
    owner: account.owner || '',
    department: account.department || '',
    isSystemCritical: account.isSystemCritical || false,
    hasAppAccess: account.hasAppAccess || false,
    appRole: account.appRole || 'Viewer',
    notes: account.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleSubmit = async () => {
    setSaving(true)
    try {
      await updateServiceAccount(account.id, form)
      onSuccess(`✓ Service account "${account.username}" updated`)
    } catch (err) {
      onError(err.response?.data?.detail || 'Update failed')
    }
    setSaving(false)
  }

  return (
    <Modal title={`Edit: ${account.username}`} onClose={onClose} wide>
      <div className="mb-4 p-3 bg-slate-900 rounded-lg">
        <div className="text-xs text-slate-400">Username (cannot be changed)</div>
        <div className="font-mono font-medium">{account.username}</div>
        <div className="text-xs text-slate-500 mt-1">{account.adDn}</div>
      </div>

      <div className="space-y-5">
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Basic Info</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Display Name" value={form.displayName} onChange={v => update('displayName', v)} />
            <Input label="Email" type="email" value={form.email} onChange={v => update('email', v)} />
            <Input label="Owner" value={form.owner} onChange={v => update('owner', v)} />
            <Input label="Department" value={form.department} onChange={v => update('department', v)} />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Purpose</label>
          <textarea value={form.purpose} onChange={(e) => update('purpose', e.target.value)} rows={2}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg" />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Description (in AD)</label>
          <input type="text" value={form.description} onChange={(e) => update('description', e.target.value)}
                 className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg" />
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Options</h4>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.isSystemCritical}
                     onChange={e => update('isSystemCritical', e.target.checked)} />
              <div>
                <div className="text-sm font-medium">System Critical (cannot be deleted)</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.hasAppAccess}
                     onChange={e => update('hasAppAccess', e.target.checked)} />
              <div className="flex-1">
                <div className="text-sm font-medium">Grant DC Manager Pro Access</div>
              </div>
            </label>
            {form.hasAppAccess && (
              <div className="ml-8">
                <label className="block text-sm text-slate-400 mb-1">Role</label>
                <select value={form.appRole} onChange={e => update('appRole', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg">
                  <option value="Viewer">Viewer</option>
                  <option value="Helpdesk">Helpdesk</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Notes</label>
          <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={2}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg" />
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-700">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
        <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Reset Password Modal
// ─────────────────────────────────────────────────────────
function ResetPasswordModal({ account, onClose, onSuccess, onError }) {
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [resetting, setResetting] = useState(false)

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
    let pwd = ''
    for (let i = 0; i < 20; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setPassword(pwd)
    setShowPwd(true)
  }

  const handleReset = async () => {
    if (!password || password.length < 12) {
      onError('Password must be at least 12 characters')
      return
    }
    setResetting(true)
    try {
      await resetServiceAccountPassword(account.id, password)
      onSuccess(`✓ Password reset for "${account.username}"`)
    } catch (err) {
      onError(err.response?.data?.detail || 'Reset failed')
    }
    setResetting(false)
  }

  return (
    <Modal title="Reset Service Account Password" onClose={onClose}>
      <div className="mb-4 p-3 bg-slate-900 rounded-lg">
        <div className="text-xs text-slate-400">Service Account</div>
        <div className="font-medium">{account.displayName || account.username}</div>
        <div className="text-xs text-slate-500 mt-1">{account.username}</div>
      </div>

      <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
        <strong>⚠ Warning:</strong> This will change the password in Active Directory.
        Make sure to update any services or applications using this account.
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-1">New Password * (min 12 chars)</label>
        <div className="relative">
          <input
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Strong password..."
            className="w-full px-3 py-2 pr-24 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
            <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="p-1.5 hover:bg-slate-700 rounded">
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button type="button" onClick={generatePassword}
                    className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs">
              Generate
            </button>
          </div>
        </div>
        {password && (
          <div className="mt-1 text-xs">
            Length: <span className={password.length >= 12 ? 'text-green-400' : 'text-red-400'}>
              {password.length}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
          Cancel
        </button>
        <button onClick={handleReset} disabled={resetting || !password}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
          <KeyRound size={16} />
          {resetting ? 'Resetting...' : 'Reset Password'}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Import Modal
// ─────────────────────────────────────────────────────────
function ImportModal({ onClose, onSuccess, onError }) {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({
    purpose: '',
    owner: '',
    department: 'Service Accounts',
    isSystemCritical: false,
    hasAppAccess: false,
    appRole: 'Viewer',
    passwordNeverExpires: true,
    cannotChangePassword: true,
    notes: 'Imported from AD',
  })
  const [importing, setImporting] = useState(false)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!search) return
    setSearching(true)
    try {
      const data = await getUsers({ search })
      setUsers(data.users || [])
    } catch (err) {
      onError('Search failed')
    }
    setSearching(false)
  }

  const handleImport = async () => {
    if (!selected) return
    setImporting(true)
    try {
      await importServiceAccount({
        username: selected.username,
        ...form,
      })
      onSuccess(`✓ Imported "${selected.username}" as service account`)
      onClose()
    } catch (err) {
      onError(err.response?.data?.detail || 'Import failed')
    }
    setImporting(false)
  }

  return (
    <Modal title="Import Existing AD User as Service Account" onClose={onClose} wide>
      <p className="text-sm text-slate-400 mb-4">
        Search for an existing user in AD and convert them to a tracked service account.
        This doesn't modify the AD user, only adds tracking metadata.
      </p>

      {!selected ? (
        <>
          <form onSubmit={handleSearch} className="mb-4 flex gap-2">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                   placeholder="Search by username..."
                   className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                   autoFocus />
            <button type="submit" disabled={searching}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          <div className="max-h-80 overflow-y-auto bg-slate-900 rounded-lg">
            {users.length === 0 ? (
              <div className="p-4 text-center text-slate-500">
                {search ? 'No users found' : 'Search for an AD user'}
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {users.slice(0, 20).map(u => (
                  <button key={u.id} onClick={() => setSelected(u)}
                          className="w-full p-3 hover:bg-slate-800 text-left flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{u.displayName || u.username}</div>
                      <div className="text-xs text-slate-500">{u.username} • {u.email}</div>
                    </div>
                    <Plus size={16} className="text-indigo-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 p-3 bg-slate-900 rounded-lg flex items-center justify-between">
            <div>
              <div className="font-medium">{selected.displayName || selected.username}</div>
              <div className="text-xs text-slate-500 font-mono">{selected.username}</div>
            </div>
            <button onClick={() => setSelected(null)}
                    className="text-xs text-blue-400 hover:underline">
              Change
            </button>
          </div>

          <div className="space-y-4">
            <textarea value={form.purpose} onChange={(e) => setForm({...form, purpose: e.target.value})}
                      placeholder="What is this account used for?" rows={2}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg" />
            
            <div className="grid grid-cols-2 gap-3">
              <Input label="Owner" value={form.owner}
                     onChange={v => setForm({...form, owner: v})} />
              <Input label="Department" value={form.department}
                     onChange={v => setForm({...form, department: v})} />
            </div>

            <label className="flex items-center gap-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg cursor-pointer">
              <input type="checkbox" checked={form.hasAppAccess}
                     onChange={e => setForm({...form, hasAppAccess: e.target.checked})} />
              <div className="text-sm">Grant DC Manager Pro Access</div>
            </label>

            {form.hasAppAccess && (
              <select value={form.appRole} onChange={e => setForm({...form, appRole: e.target.value})}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg">
                <option value="Viewer">Viewer</option>
                <option value="Helpdesk">Helpdesk</option>
                <option value="Admin">Admin</option>
              </select>
            )}
          </div>

          <div className="flex gap-2 justify-end mt-6">
            <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
              Cancel
            </button>
            <button onClick={handleImport} disabled={importing}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50">
              {importing ? 'Importing...' : 'Import as Service Account'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────
function Input({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
             placeholder={placeholder}
             className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500" />
    </div>
  )
}