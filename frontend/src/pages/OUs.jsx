import { useState, useEffect } from 'react'
import {
  FolderTree, RefreshCw, Plus, Trash2, X,
  Users, Shield, Monitor, ChevronRight, Search
} from 'lucide-react'
import {
  getOUs, createOU, deleteOU, getOUContents
} from '../api'

export default function OUs() {
  const [ous, setOus]         = useState([])
  const [filtered, setFiltered] = useState([])
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!search) {
      setFiltered(ous)
    } else {
      const q = search.toLowerCase()
      setFiltered(ous.filter(ou =>
        ou.name.toLowerCase().includes(q) || ou.dn.toLowerCase().includes(q)
      ))
    }
  }, [search, ous])

  const load = async () => {
    setLoading(true)
    try {
      const data = await getOUs()
      setOus(data.ous || [])
      setFiltered(data.ous || [])
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleDelete = async (ou, e) => {
    e.stopPropagation()
    if (!confirm(`Delete OU "${ou.name}"?\n\nNote: OU must be empty (no users/groups/computers/sub-OUs inside).`)) return
    try {
      await deleteOU(ou.dn)
      showMsg('success', `OU "${ou.name}" deleted`)
      load()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed - OU must be empty')
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1">Organizational Units</h1>
          <p className="text-slate-400">{filtered.length} of {ous.length} OUs</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2">
            <Plus size={16} /> New OU
          </button>
          <button onClick={load}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="mb-6 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter OUs by name or DN..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
        />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            {search ? 'No OUs match your search' : 'No OUs found'}
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {filtered.map(ou => (
              <div key={ou.id}
                   onClick={() => setSelected(ou)}
                   className="p-4 hover:bg-slate-700/30 flex items-center gap-3 group cursor-pointer">
                <FolderTree size={18} className="text-orange-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{ou.name}</div>
                  <div className="text-xs text-slate-400 truncate">{ou.dn}</div>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-slate-600 rounded transition"
                  title="View contents"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={(e) => handleDelete(ou, e)}
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 text-red-400 rounded transition"
                  title="Delete OU"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateOUModal
          ous={ous}
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { showMsg('success', msg); load() }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {selected && (
        <OUContentsModal
          ou={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function CreateOUModal({ ous, onClose, onSuccess, onError }) {
  const [form, setForm] = useState({ name: '', parent: '', description: '' })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.name) {
      onError('OU name required')
      return
    }
    setSaving(true)
    try {
      await createOU(form)
      onSuccess(`OU "${form.name}" created`)
      onClose()
    } catch (err) {
      onError(err.response?.data?.detail || 'Create failed')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
        <div className="flex justify-between mb-4">
          <h3 className="text-lg font-bold">Create OU</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">OU Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="e.g. Marketing"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Parent OU</label>
            <select
              value={form.parent}
              onChange={(e) => setForm({...form, parent: e.target.value})}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
            >
              <option value="">Domain Root</option>
              {ous.map(ou => (
                <option key={ou.dn} value={ou.dn}>{ou.dn}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              {form.parent ? `Will create: OU=${form.name},${form.parent}` : `Will create in domain root`}
            </p>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {saving ? 'Creating...' : 'Create OU'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OUContentsModal({ ou, onClose }) {
  const [contents, setContents] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    getOUContents(ou.dn)
      .then(setContents)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [ou])

  const totalItems = contents
    ? contents.counts.users + contents.counts.groups +
      contents.counts.computers + contents.counts.ous
    : 0

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <FolderTree size={20} className="text-orange-400" />
              {ou.name}
            </h3>
            <p className="text-xs text-slate-400 mt-1 truncate">{ou.dn}</p>
            {ou.description && (
              <p className="text-sm text-slate-300 mt-1">{ou.description}</p>
            )}
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading contents...</div>
        ) : !contents ? (
          <div className="text-center text-red-400 py-8">Failed to load contents</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard icon={Users}      label="Users"     value={contents.counts.users}     color="blue" />
              <StatCard icon={Shield}     label="Groups"    value={contents.counts.groups}    color="green" />
              <StatCard icon={Monitor}    label="Computers" value={contents.counts.computers} color="purple" />
              <StatCard icon={FolderTree} label="Sub-OUs"   value={contents.counts.ous}       color="orange" />
            </div>

            {totalItems === 0 ? (
              <div className="text-center text-slate-500 py-12 bg-slate-900 rounded-lg">
                <FolderTree size={48} className="mx-auto mb-3 text-slate-600" />
                <p>This OU is empty</p>
                <p className="text-xs mt-1">It can be safely deleted</p>
              </div>
            ) : (
              <>
                <div className="flex gap-1 border-b border-slate-700 mb-4 overflow-x-auto">
                  <TabButton
                    active={activeTab === 'all'}
                    onClick={() => setActiveTab('all')}
                    label={`All (${totalItems})`}
                  />
                  {contents.counts.ous > 0 && (
                    <TabButton
                      active={activeTab === 'ous'}
                      onClick={() => setActiveTab('ous')}
                      label={`OUs (${contents.counts.ous})`}
                    />
                  )}
                  {contents.counts.users > 0 && (
                    <TabButton
                      active={activeTab === 'users'}
                      onClick={() => setActiveTab('users')}
                      label={`Users (${contents.counts.users})`}
                    />
                  )}
                  {contents.counts.groups > 0 && (
                    <TabButton
                      active={activeTab === 'groups'}
                      onClick={() => setActiveTab('groups')}
                      label={`Groups (${contents.counts.groups})`}
                    />
                  )}
                  {contents.counts.computers > 0 && (
                    <TabButton
                      active={activeTab === 'computers'}
                      onClick={() => setActiveTab('computers')}
                      label={`Computers (${contents.counts.computers})`}
                    />
                  )}
                </div>

                <div className="space-y-4">
                  {(activeTab === 'all' || activeTab === 'ous') && contents.ous.length > 0 && (
                    <Section title="Sub-OUs" icon={FolderTree} color="orange">
                      {contents.ous.map((o, i) => (
                        <ListItem
                          key={i}
                          icon={FolderTree}
                          iconColor="text-orange-400"
                          title={o.name}
                          subtitle={o.description}
                          detail={o.dn}
                        />
                      ))}
                    </Section>
                  )}

                  {(activeTab === 'all' || activeTab === 'users') && contents.users.length > 0 && (
                    <Section title="Users" icon={Users} color="blue">
                      {contents.users.map((u, i) => (
                        <ListItem
                          key={i}
                          icon={Users}
                          iconColor="text-blue-400"
                          title={u.displayName || u.username}
                          subtitle={u.username}
                          badge={u.enabled ? 'Active' : 'Disabled'}
                          badgeColor={u.enabled ? 'green' : 'red'}
                        />
                      ))}
                    </Section>
                  )}

                  {(activeTab === 'all' || activeTab === 'groups') && contents.groups.length > 0 && (
                    <Section title="Groups" icon={Shield} color="green">
                      {contents.groups.map((g, i) => (
                        <ListItem
                          key={i}
                          icon={Shield}
                          iconColor="text-green-400"
                          title={g.name}
                          subtitle={g.description}
                        />
                      ))}
                    </Section>
                  )}

                  {(activeTab === 'all' || activeTab === 'computers') && contents.computers.length > 0 && (
                    <Section title="Computers" icon={Monitor} color="purple">
                      {contents.computers.map((c, i) => (
                        <ListItem
                          key={i}
                          icon={Monitor}
                          iconColor="text-purple-400"
                          title={c.name}
                          badge={c.enabled ? 'Active' : 'Disabled'}
                          badgeColor={c.enabled ? 'green' : 'red'}
                        />
                      ))}
                    </Section>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue:   'text-blue-400   bg-blue-500/10',
    green:  'text-green-400  bg-green-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
  }
  return (
    <div className={`p-4 rounded-lg text-center border border-slate-700 ${colors[color]}`}>
      <Icon size={20} className="mx-auto mb-2" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  )
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition ${
        active
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
}

function Section({ title, icon: Icon, color, children }) {
  return (
    <div>
      <div className={`text-sm font-medium mb-2 text-${color}-400 flex items-center gap-2`}>
        <Icon size={14} /> {title}
      </div>
      <div className="space-y-1 bg-slate-900 rounded-lg p-2">
        {children}
      </div>
    </div>
  )
}

function ListItem({ icon: Icon, iconColor, title, subtitle, detail, badge, badgeColor }) {
  return (
    <div className="p-2 rounded hover:bg-slate-800/50 flex items-center gap-3">
      <Icon size={16} className={iconColor} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        {subtitle && (
          <div className="text-xs text-slate-500 truncate">{subtitle}</div>
        )}
        {detail && (
          <div className="text-xs text-slate-600 truncate font-mono">{detail}</div>
        )}
      </div>
      {badge && (
        <span className={`text-xs px-2 py-0.5 rounded ${
          badgeColor === 'green' ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
        }`}>
          {badge}
        </span>
      )}
    </div>
  )
}