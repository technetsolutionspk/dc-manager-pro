import { useState, useEffect } from 'react'
import {
  Search, RefreshCw, Shield, Plus, Trash2,
  Users, X, UserPlus, UserMinus
} from 'lucide-react'
import {
  getGroups, createGroup, deleteGroup, getGroupMembers,
  getOUs, addGroupMember, removeGroupMember, getUsers
} from '../api'

export default function Groups() {
  const [groups, setGroups]       = useState([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected]   = useState(null)
  const [message, setMessage]     = useState(null)

  useEffect(() => { load() }, [])

  const load = async (q = '') => {
    setLoading(true)
    try {
      const data = await getGroups(q ? { search: q } : {})
      setGroups(data.groups || [])
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleDelete = async (name, e) => {
    e.stopPropagation()
    if (!confirm(`Delete group "${name}"?`)) return
    try {
      await deleteGroup(name)
      showMsg('success', `Group "${name}" deleted`)
      load()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed')
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1">Groups</h1>
          <p className="text-slate-400">{groups.length} groups</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2">
            <Plus size={16} /> New Group
          </button>
          <button onClick={() => load(search)}
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

      <form onSubmit={(e) => { e.preventDefault(); load(search) }} className="mb-6 flex gap-2">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
        <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg">
          Search
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center text-slate-500 py-8">Loading...</div>
        ) : groups.length === 0 ? (
          <div className="col-span-full text-center text-slate-500 py-8">No groups found</div>
        ) : groups.map(g => (
          <div
            key={g.id}
            onClick={() => setSelected(g)}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-blue-500/50 transition cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-green-600/20 text-green-400 rounded-lg flex items-center justify-center">
                <Shield size={20} />
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  g.type === 'security'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-purple-500/20 text-purple-400'
                }`}>
                  {g.type}
                </span>
                <button
                  onClick={(e) => handleDelete(g.name, e)}
                  className="p-1 hover:bg-red-500/20 text-red-400 rounded opacity-0 group-hover:opacity-100 transition"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="font-medium mb-1 truncate">{g.name}</div>
            <div className="text-xs text-slate-400 mb-3 truncate">
              {g.description || 'No description'}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Users size={12} /> {g.memberCount} members
              </span>
              <span>{g.scope}</span>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { showMsg('success', msg); load() }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {selected && (
        <GroupDetailsModal
          group={selected}
          onClose={() => setSelected(null)}
          onChange={() => load()}
        />
      )}
    </div>
  )
}

function CreateGroupModal({ onClose, onSuccess, onError }) {
  const [form, setForm] = useState({
    name: '', description: '', ou: '', type: 'security', scope: 'global'
  })
  const [ous, setOus] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getOUs().then(d => setOus(d.ous || [])).catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!form.name) { onError('Group name required'); return }
    setSaving(true)
    try {
      await createGroup(form)
      onSuccess(`Group "${form.name}" created`)
      onClose()
    } catch (err) {
      onError(err.response?.data?.detail || 'Create failed')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Create Group</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Group Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Target OU</label>
            <select
              value={form.ou}
              onChange={(e) => setForm({...form, ou: e.target.value})}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
            >
              <option value="">Domain Root</option>
              {ous.map(ou => <option key={ou.dn} value={ou.dn}>{ou.dn}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({...form, type: e.target.value})}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
              >
                <option value="security">Security</option>
                <option value="distribution">Distribution</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Scope</label>
              <select
                value={form.scope}
                onChange={(e) => setForm({...form, scope: e.target.value})}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
              >
                <option value="global">Global</option>
                <option value="domain-local">Domain Local</option>
                <option value="universal">Universal</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GroupDetailsModal({ group, onClose, onChange }) {
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [message, setMessage]   = useState(null)

  const loadMembers = async () => {
    setLoading(true)
    try {
      const data = await getGroupMembers(group.name)
      setMembers(data.members || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { loadMembers() }, [group])

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleRemove = async (username) => {
    if (!confirm(`Remove ${username} from ${group.name}?`)) return
    try {
      await removeGroupMember(group.name, username)
      showMsg('success', `Removed ${username}`)
      loadMembers()
      onChange?.()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to remove')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Shield size={20} className="text-green-400" />
              {group.name}
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              {group.description || 'No description'}
            </p>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        {message && (
          <div className={`mb-3 p-2 rounded text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-300'
              : 'bg-red-500/10 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 bg-slate-900 rounded-lg text-center">
            <div className="text-2xl font-bold">{members.length}</div>
            <div className="text-xs text-slate-400">Members</div>
          </div>
          <div className="p-3 bg-slate-900 rounded-lg text-center">
            <div className="text-sm font-bold capitalize">{group.type}</div>
            <div className="text-xs text-slate-400">Type</div>
          </div>
          <div className="p-3 bg-slate-900 rounded-lg text-center">
            <div className="text-sm font-bold capitalize">{group.scope}</div>
            <div className="text-xs text-slate-400">Scope</div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Members:</div>
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs flex items-center gap-1"
          >
            <UserPlus size={12} /> Add Member
          </button>
        </div>

        {loading ? (
          <div className="text-center text-slate-500 py-4">Loading...</div>
        ) : members.length === 0 ? (
          <div className="text-center text-slate-500 py-4 bg-slate-900 rounded-lg">
            No members
          </div>
        ) : (
          <div className="bg-slate-900 rounded-lg divide-y divide-slate-800 max-h-80 overflow-y-auto">
            {members.map((m, i) => (
              <div key={i} className="p-3 flex items-center justify-between hover:bg-slate-800/50">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {m.displayName || m.username}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {m.username} {m.email && `• ${m.email}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-slate-500 px-2 py-1 bg-slate-800 rounded">
                    {m.type}
                  </span>
                  {m.username && (
                    <button
                      onClick={() => handleRemove(m.username)}
                      className="p-1.5 hover:bg-red-500/20 text-red-400 rounded"
                      title="Remove from group"
                    >
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <AddMemberModal
            group={group}
            onClose={() => setShowAdd(false)}
            onSuccess={(msg) => {
              showMsg('success', msg)
              setShowAdd(false)
              loadMembers()
              onChange?.()
            }}
            onError={(msg) => showMsg('error', msg)}
          />
        )}
      </div>
    </div>
  )
}

function AddMemberModal({ group, onClose, onSuccess, onError }) {
  const [search, setSearch]   = useState('')
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding]   = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!search) return
    setLoading(true)
    try {
      const data = await getUsers({ search })
      setUsers(data.users || [])
    } catch (err) {
      onError('Search failed')
    }
    setLoading(false)
  }

  const handleAdd = async (username) => {
    setAdding(username)
    try {
      await addGroupMember(group.name, username)
      onSuccess(`Added ${username} to ${group.name}`)
    } catch (err) {
      onError(err.response?.data?.detail || 'Failed to add')
    }
    setAdding(null)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-lg w-full">
        <div className="flex justify-between mb-4">
          <h3 className="text-lg font-bold">Add Member to {group.name}</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
            autoFocus
          />
          <button type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
            Search
          </button>
        </form>

        <div className="max-h-80 overflow-y-auto bg-slate-900 rounded-lg">
          {loading ? (
            <div className="p-4 text-center text-slate-500">Searching...</div>
          ) : users.length === 0 ? (
            <div className="p-4 text-center text-slate-500">
              {search ? 'No users found' : 'Search for users to add'}
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {users.slice(0, 20).map(u => (
                <div key={u.id} className="p-3 flex items-center justify-between hover:bg-slate-800/50">
                  <div>
                    <div className="font-medium text-sm">
                      {u.displayName || u.username}
                    </div>
                    <div className="text-xs text-slate-500">
                      {u.username} {u.email && `• ${u.email}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleAdd(u.username)}
                    disabled={adding === u.username}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs disabled:opacity-50"
                  >
                    {adding === u.username ? 'Adding...' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}