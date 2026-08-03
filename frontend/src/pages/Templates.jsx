import { useState, useEffect } from 'react'
import {
  FileText, Plus, Trash2, X, RefreshCw, UserPlus,
  Briefcase, Building, MapPin, Phone, Mail, Shield,
  CheckCircle, Edit, Copy, Search
} from 'lucide-react'
import {
  getTemplates, createTemplate, deleteTemplate,
  createUserFromTemplate, getOUs, getGroups
} from '../api'

export default function Templates() {
  const [templates, setTemplates]     = useState([])
  const [loading, setLoading]         = useState(false)
  const [showCreate, setShowCreate]   = useState(false)
  const [showUseTemplate, setShowUseTemplate] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [message, setMessage]         = useState(null)
  const [search, setSearch]           = useState('')
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getTemplates()
      setTemplates(data.templates || [])
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load templates')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleDelete = async (template) => {
    if (!confirm(`Delete template "${template.name}"?\n\nThis cannot be undone.`)) return
    try {
      await deleteTemplate(template.id)
      showMsg('success', `Template "${template.name}" deleted`)
      load()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed')
    }
  }

  const handleUseTemplate = (template) => {
    setSelectedTemplate(template)
    setShowUseTemplate(true)
  }

  const filteredTemplates = search
    ? templates.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.department || '').toLowerCase().includes(search.toLowerCase())
      )
    : templates

  return (
    <div className="p-8">
      {/* ── Header ──────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            <FileText size={28} className="text-blue-400" />
            User Templates
          </h1>
          <p className="text-slate-400">
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} •
            Create user accounts with predefined attributes
          </p>
        </div>
        <div className="flex gap-2">
          {user.role === 'Admin' && (
            <button onClick={() => setShowCreate(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2">
              <Plus size={16} /> New Template
            </button>
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
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
            <FileText size={20} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-medium text-blue-300 mb-1">About User Templates</h3>
            <p className="text-sm text-slate-300">
              Templates let you create users quickly by pre-filling common fields like department,
              title, OU, and groups. When using a template, you only need to provide the username,
              name, and password.
            </p>
          </div>
        </div>
      </div>

      {/* ── Search ──────────────────────────────── */}
      <div className="mb-6 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates by name, description, or department..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* ── Templates Grid ──────────────────────── */}
      {loading ? (
        <div className="text-center text-slate-500 py-12">
          <RefreshCw size={48} className="mx-auto mb-3 animate-spin" />
          <p>Loading templates...</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
          <FileText size={48} className="mx-auto mb-3 text-slate-600" />
          <p className="mb-4">No templates {search ? 'match your search' : 'yet'}</p>
          {!search && user.role === 'Admin' && (
            <button onClick={() => setShowCreate(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-2">
              <Plus size={16} /> Create First Template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              isAdmin={user.role === 'Admin'}
              canUse={user.role === 'Admin' || user.role === 'Helpdesk'}
              onUse={() => handleUseTemplate(t)}
              onDelete={() => handleDelete(t)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ──────────────────────────────── */}
      {showCreate && (
        <CreateTemplateModal
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { showMsg('success', msg); load() }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {showUseTemplate && selectedTemplate && (
        <UseTemplateModal
          template={selectedTemplate}
          onClose={() => { setShowUseTemplate(false); setSelectedTemplate(null) }}
          onSuccess={(msg) => {
            showMsg('success', msg)
            setShowUseTemplate(false)
            setSelectedTemplate(null)
          }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Template Card
// ─────────────────────────────────────────────────────────
function TemplateCard({ template, isAdmin, canUse, onUse, onDelete }) {
  const groupsCount = (() => {
    try {
      const g = template.groups ? JSON.parse(template.groups) : []
      return Array.isArray(g) ? g.length : 0
    } catch { return 0 }
  })()

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <FileText size={20} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold truncate">{template.name}</h3>
            {template.createdBy && (
              <p className="text-xs text-slate-500">by {template.createdBy}</p>
            )}
          </div>
        </div>
        {isAdmin && (
          <button onClick={onDelete}
                  className="p-1.5 hover:bg-red-500/20 text-red-400 rounded opacity-0 group-hover:opacity-100 transition"
                  title="Delete template">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Description */}
      {template.description && (
        <p className="text-sm text-slate-400 mb-4 line-clamp-2">{template.description}</p>
      )}

      {/* Details */}
      <div className="space-y-1.5 mb-4 text-xs">
        {template.department && (
          <div className="flex items-center gap-2 text-slate-300">
            <Building size={12} className="text-slate-500" />
            <span className="truncate">{template.department}</span>
          </div>
        )}
        {template.title && (
          <div className="flex items-center gap-2 text-slate-300">
            <Briefcase size={12} className="text-slate-500" />
            <span className="truncate">{template.title}</span>
          </div>
        )}
        {template.office && (
          <div className="flex items-center gap-2 text-slate-300">
            <MapPin size={12} className="text-slate-500" />
            <span className="truncate">{template.office}</span>
          </div>
        )}
        {template.ou && (
          <div className="flex items-center gap-2 text-slate-400">
            <Building size={12} className="text-slate-500" />
            <span className="truncate text-xs font-mono">{template.ou.split(',')[0]}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {groupsCount > 0 && (
          <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs flex items-center gap-1">
            <Shield size={10} /> {groupsCount} group{groupsCount !== 1 ? 's' : ''}
          </span>
        )}
        {template.passwordNeverExpires && (
          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded text-xs">
            Pwd Never Expires
          </span>
        )}
        {template.mustChangePassword && (
          <span className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-xs">
            Force Pwd Change
          </span>
        )}
      </div>

      {/* Action */}
      {canUse && (
        <button onClick={onUse}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition">
          <UserPlus size={14} />
          Create User from Template
        </button>
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
// Create Template Modal
// ─────────────────────────────────────────────────────────
function CreateTemplateModal({ onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    ou: '',
    department: '',
    title: '',
    company: '',
    office: '',
    phone: '',
    manager: '',
    groups: [],
    passwordNeverExpires: false,
    mustChangePassword: true,
    enabled: true,
  })
  const [ous, setOus]     = useState([])
  const [allGroups, setAllGroups] = useState([])
  const [groupSearch, setGroupSearch] = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    getOUs().then(d => setOus(d.ous || [])).catch(() => {})
    getGroups().then(d => setAllGroups(d.groups || [])).catch(() => {})
  }, [])

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const toggleGroup = (groupDn) => {
    if (form.groups.includes(groupDn)) {
      update('groups', form.groups.filter(g => g !== groupDn))
    } else {
      update('groups', [...form.groups, groupDn])
    }
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      onError('Template name is required')
      return
    }
    setSaving(true)
    try {
      await createTemplate(form)
      onSuccess(`Template "${form.name}" created`)
      onClose()
    } catch (err) {
      onError(err.response?.data?.detail || 'Create failed')
    }
    setSaving(false)
  }

  const filteredGroups = groupSearch
    ? allGroups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()))
    : allGroups.slice(0, 50)  // Show first 50 by default

  return (
    <Modal title="Create User Template" onClose={onClose} wide>
      <div className="space-y-5">
        {/* Basic Info */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Basic Info</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Template Name *" value={form.name} onChange={v => update('name', v)}
                   placeholder="e.g. IT Staff, Faculty Member" />
            <Input label="Description" value={form.description} onChange={v => update('description', v)}
                   placeholder="What is this template for?" />
          </div>
        </div>

        {/* Location */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Location</h4>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Target OU</label>
            <select value={form.ou} onChange={e => update('ou', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg">
              <option value="">Default OU (from settings)</option>
              {ous.map(ou => <option key={ou.dn} value={ou.dn}>{ou.dn}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Users created from this template will be placed in this OU
            </p>
          </div>
        </div>

        {/* Job Info */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Job Information</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Department" value={form.department} onChange={v => update('department', v)} />
            <Input label="Job Title" value={form.title} onChange={v => update('title', v)} />
            <Input label="Company" value={form.company} onChange={v => update('company', v)} />
            <Input label="Office" value={form.office} onChange={v => update('office', v)} />
            <Input label="Phone" value={form.phone} onChange={v => update('phone', v)} />
            <Input label="Manager DN" value={form.manager} onChange={v => update('manager', v)}
                   placeholder="CN=Manager,OU=..." />
          </div>
        </div>

        {/* Groups */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
            Default Groups ({form.groups.length} selected)
          </h4>
          <input
            type="text"
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            placeholder="Search groups..."
            className="w-full px-3 py-2 mb-2 bg-slate-900 border border-slate-700 rounded-lg text-sm"
          />
          <div className="max-h-48 overflow-y-auto bg-slate-900 rounded-lg p-2 border border-slate-700">
            {filteredGroups.length === 0 ? (
              <div className="text-center text-slate-500 py-4">No groups found</div>
            ) : (
              filteredGroups.map(g => (
                <label key={g.id} className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.groups.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                    className="flex-shrink-0"
                  />
                  <Shield size={14} className="text-purple-400 flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{g.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    g.type === 'security' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                  }`}>
                    {g.type}
                  </span>
                </label>
              ))
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            New users will be automatically added to these groups
          </p>
        </div>

        {/* Account Options */}
        <div>
          <h4 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Account Options</h4>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700/50">
              <input type="checkbox" checked={form.mustChangePassword}
                     onChange={e => update('mustChangePassword', e.target.checked)} className="w-4 h-4" />
              <div>
                <div className="text-sm font-medium">Must Change Password at Next Logon</div>
                <div className="text-xs text-slate-500">User will be forced to change password on first login</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700/50">
              <input type="checkbox" checked={form.passwordNeverExpires}
                     onChange={e => update('passwordNeverExpires', e.target.checked)} className="w-4 h-4" />
              <div>
                <div className="text-sm font-medium">Password Never Expires</div>
                <div className="text-xs text-slate-500">Account password won't expire based on policy</div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700/50">
              <input type="checkbox" checked={form.enabled}
                     onChange={e => update('enabled', e.target.checked)} className="w-4 h-4" />
              <div>
                <div className="text-sm font-medium">Account Enabled</div>
                <div className="text-xs text-slate-500">User can log in immediately</div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-700">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
        <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
          {saving ? 'Creating...' : 'Create Template'}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Use Template Modal
// ─────────────────────────────────────────────────────────
function UseTemplateModal({ template, onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    username: '',
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    password: '',
  })
  const [saving, setSaving] = useState(false)

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  // Auto-fill display name
  useEffect(() => {
    if (form.firstName || form.lastName) {
      update('displayName', `${form.firstName} ${form.lastName}`.trim())
    }
  }, [form.firstName, form.lastName])

  const handleSubmit = async () => {
    if (!form.username.trim()) {
      onError('Username is required')
      return
    }
    if (!form.password || form.password.length < 8) {
      onError('Password must be at least 8 characters')
      return
    }
    if (!form.firstName.trim()) {
      onError('First name is required')
      return
    }

    setSaving(true)
    try {
      const result = await createUserFromTemplate(template.id, form)
      onSuccess(`User "${form.username}" created from template "${template.name}"`)
    } catch (err) {
      onError(err.response?.data?.detail || 'Create failed')
    }
    setSaving(false)
  }

  const groupCount = (() => {
    try {
      const g = template.groups ? JSON.parse(template.groups) : []
      return Array.isArray(g) ? g.length : 0
    } catch { return 0 }
  })()

  return (
    <Modal title="Create User from Template" onClose={onClose} wide>
      {/* Template Preview */}
      <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
            <FileText size={20} className="text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-blue-300">{template.name}</div>
            {template.description && (
              <div className="text-sm text-slate-400">{template.description}</div>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {template.department && (
                <span className="px-2 py-1 bg-slate-800 rounded">📋 {template.department}</span>
              )}
              {template.title && (
                <span className="px-2 py-1 bg-slate-800 rounded">💼 {template.title}</span>
              )}
              {template.ou && (
                <span className="px-2 py-1 bg-slate-800 rounded">📁 {template.ou.split(',')[0]}</span>
              )}
              {groupCount > 0 && (
                <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded">
                  🛡️ {groupCount} group{groupCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-400 mb-4">
        Fill in only the unique user info. All other fields will be auto-filled from the template.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Username *" value={form.username} onChange={v => update('username', v)}
               placeholder="jdoe" />
        <Input label="Email" type="email" value={form.email} onChange={v => update('email', v)}
               placeholder="jdoe@abasyn.local" />
        <Input label="First Name *" value={form.firstName} onChange={v => update('firstName', v)} />
        <Input label="Last Name" value={form.lastName} onChange={v => update('lastName', v)} />
        <Input label="Display Name" value={form.displayName} onChange={v => update('displayName', v)}
               placeholder="Auto-filled from First+Last" />
        <Input label="Password *" type="password" value={form.password} onChange={v => update('password', v)}
               placeholder="Min 8 characters" />
      </div>

      {/* Will be Applied */}
      <div className="mt-4 p-3 bg-slate-900 rounded-lg">
        <div className="text-xs text-slate-500 mb-2">Will be applied from template:</div>
        <div className="space-y-1 text-sm">
          {template.ou && <div className="text-slate-400">📁 OU: <span className="font-mono text-xs">{template.ou}</span></div>}
          {template.department && <div className="text-slate-400">📋 Department: <span className="text-slate-200">{template.department}</span></div>}
          {template.title && <div className="text-slate-400">💼 Title: <span className="text-slate-200">{template.title}</span></div>}
          {template.company && <div className="text-slate-400">🏢 Company: <span className="text-slate-200">{template.company}</span></div>}
          {template.office && <div className="text-slate-400">📍 Office: <span className="text-slate-200">{template.office}</span></div>}
          {template.phone && <div className="text-slate-400">📞 Phone: <span className="text-slate-200">{template.phone}</span></div>}
          {groupCount > 0 && <div className="text-slate-400">🛡️ Groups: <span className="text-purple-300">{groupCount} group{groupCount !== 1 ? 's' : ''}</span></div>}
          {template.mustChangePassword && <div className="text-orange-300">✓ Must change password at next login</div>}
          {template.passwordNeverExpires && <div className="text-yellow-300">✓ Password never expires</div>}
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-slate-700">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
        <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
          <UserPlus size={16} />
          {saving ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Input Component
// ─────────────────────────────────────────────────────────
function Input({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}