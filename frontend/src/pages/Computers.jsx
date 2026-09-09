import { useState, useEffect } from 'react'
import {
  Search, RefreshCw, Monitor, Plus, Trash2, X, Move,
  CheckSquare, Square, MoreVertical, MonitorCheck, MonitorX,
  Filter, Edit, Download, Key,
  ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react'
import {
  getComputers, createComputer, deleteComputer,
  enableComputer, disableComputer, moveComputer, getOUs,
  getLapsPassword, getLapsHistory, rotateLapsPassword
} from '../api'

export default function Computers() {
  const [computers, setComputers]       = useState([])
  const [search, setSearch]             = useState('')
  const [loading, setLoading]           = useState(false)
  const [selected, setSelected]         = useState(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [showMove, setShowMove]         = useState(false)
  const [showLaps, setShowLaps]         = useState(false)
  const [message, setMessage]           = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortField, setSortField]       = useState('name')
  const [sortDir, setSortDir]           = useState('asc')
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const [selectedComputers, setSelectedComputers] = useState(new Set())
  const [showBulkMenu, setShowBulkMenu]           = useState(false)
  const [showBulkMove, setShowBulkMove]           = useState(false)

  useEffect(() => { load() }, [])

  const load = async (q = '') => {
    setLoading(true)
    setSelectedComputers(new Set())
    try {
      const data = await getComputers(q ? { search: q } : {})
      setComputers(data.computers || [])
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  // â”€â”€ Sort Handler â”€â”€
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleAction = async (action, name) => {
    try {
      if (action === 'enable')  await enableComputer(name)
      if (action === 'disable') await disableComputer(name)
      showMsg('success', `Computer "${name}" ${action}d`)
      load(search)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || `Failed: ${action}`)
    }
  }

  const handleDelete = async (name) => {
    if (!confirm(`Delete computer "${name}"?\n\nThis cannot be undone.`)) return
    try {
      await deleteComputer(name)
      showMsg('success', `Computer "${name}" deleted`)
      load(search)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed')
    }
  }

  const toggleSelect = (name) => {
    const newSet = new Set(selectedComputers)
    if (newSet.has(name)) newSet.delete(name)
    else newSet.add(name)
    setSelectedComputers(newSet)
  }

  const toggleSelectAll = () => {
    if (selectedComputers.size === filteredComputers.length) {
      setSelectedComputers(new Set())
    } else {
      setSelectedComputers(new Set(filteredComputers.map(c => c.name)))
    }
  }

  const handleBulkAction = async (action) => {
    if (selectedComputers.size === 0) {
      showMsg('error', 'No computers selected')
      return
    }
    if (action === 'delete' && !confirm(`Delete ${selectedComputers.size} computers? Cannot be undone!`)) return
    if (!confirm(`Apply "${action}" to ${selectedComputers.size} computers?`)) return

    let success = 0, failed = 0
    for (const name of selectedComputers) {
      try {
        if (action === 'enable')  await enableComputer(name)
        if (action === 'disable') await disableComputer(name)
        if (action === 'delete')  await deleteComputer(name)
        success++
      } catch (err) {
        failed++
      }
    }

    showMsg('success', `${action}: ${success} succeeded, ${failed} failed`)
    setSelectedComputers(new Set())
    setShowBulkMenu(false)
    load(search)
  }

  const handleExport = () => {
    const headers = ['Name', 'DNS Name', 'Operating System', 'OS Version', 'Status', 'Last Logon', 'OU']
    const rows = filteredComputers.map(c => [
      c.name, c.dnsName, c.os, c.osVersion, c.status, c.lastLogon, c.ou
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `computers-${Date.now()}.csv`
    a.click()
    showMsg('success', `Exported ${filteredComputers.length} computers`)
  }

  // Filter + Sort
  const filteredComputers = (() => {
    let list = statusFilter === 'all'
      ? computers
      : computers.filter(c => c.status === statusFilter)

    if (search && search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(c => [
        c.name,
        c.dnsName,
        c.os,
        c.osVersion,
        c.status,
        c.lastLogon,
        c.ou,
        c.description
      ].some(val => val && val.toString().toLowerCase().includes(q)))
    }

    const sorted = [...list].sort((a, b) => {
      let av = a[sortField]
      let bv = b[sortField]

      if (av === null || av === undefined) av = ''
      if (bv === null || bv === undefined) bv = ''

      if (sortField === 'lastLogon') {
        const at = av ? new Date(av).getTime() : 0
        const bt = bv ? new Date(bv).getTime() : 0
        return sortDir === 'asc' ? at - bt : bt - at
      }

      av = String(av).toLowerCase()
      bv = String(bv).toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return sorted
  })()

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1">Computers</h1>
          <p className="text-slate-400">
            {filteredComputers.length} of {computers.length} computers
            {selectedComputers.size > 0 && <span className="ml-2 text-blue-400">â€¢ {selectedComputers.size} selected</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedComputers.size > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowBulkMenu(!showBulkMenu)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center gap-2"
              >
                <MoreVertical size={16} />
                Bulk Actions ({selectedComputers.size})
              </button>
              {showBulkMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20">
                  <button onClick={() => handleBulkAction('enable')} className="w-full text-left px-4 py-2.5 hover:bg-slate-700 flex items-center gap-2 text-green-400">
                    <MonitorCheck size={14} /> Enable Selected
                  </button>
                  <button onClick={() => handleBulkAction('disable')} className="w-full text-left px-4 py-2.5 hover:bg-slate-700 flex items-center gap-2 text-red-400">
                    <MonitorX size={14} /> Disable Selected
                  </button>
                  <button onClick={() => { setShowBulkMove(true); setShowBulkMenu(false) }} className="w-full text-left px-4 py-2.5 hover:bg-slate-700 flex items-center gap-2 text-cyan-400">
                    <Move size={14} /> Move to OU
                  </button>
                  {user.role === 'Admin' && (
                    <button onClick={() => handleBulkAction('delete')} className="w-full text-left px-4 py-2.5 hover:bg-red-500/20 flex items-center gap-2 text-red-400 border-t border-slate-700">
                      <Trash2 size={14} /> Delete Selected
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {user.role === 'Admin' && (
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2">
              <Plus size={16} /> New Computer
            </button>
          )}
          <button onClick={handleExport} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-2">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={() => load(search)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

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

      <div className="mb-6 flex gap-2 flex-wrap">
        <form onSubmit={(e) => { e.preventDefault(); load(search) }} className="flex-1 flex gap-2 min-w-[300px]">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search computers..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>
          <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg">Search</button>
        </form>

        <div className="flex gap-2 items-center bg-slate-800 border border-slate-700 rounded-lg px-3">
          <Filter size={16} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-transparent py-2 focus:outline-none cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900">
              <tr className="text-left text-xs uppercase text-slate-400">
                <th className="p-4 w-10">
                  <button onClick={toggleSelectAll} className="hover:text-blue-400">
                    {selectedComputers.size === filteredComputers.length && filteredComputers.length > 0
                      ? <CheckSquare size={18} className="text-blue-400" />
                      : <Square size={18} />}
                  </button>
                </th>
                <SortHeader field="name"      label="Computer"   sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader field="os"        label="OS"         sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader field="dnsName"   label="DNS Name"   sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader field="lastLogon" label="Last Logon" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader field="status"    label="Status"     sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {loading ? (
                <tr><td colSpan="7" className="p-8 text-center text-slate-500">
                  <RefreshCw size={32} className="mx-auto mb-2 animate-spin" />
                  Loading computers...
                </td></tr>
              ) : filteredComputers.length === 0 ? (
                <tr><td colSpan="7" className="p-8 text-center text-slate-500">No computers found</td></tr>
              ) : (
                filteredComputers.map(c => (
                  <tr key={c.id}
                      className={`hover:bg-slate-700/30 ${selectedComputers.has(c.name) ? 'bg-blue-500/10' : ''}`}>
                    <td className="p-4">
                      <button onClick={() => toggleSelect(c.name)}>
                        {selectedComputers.has(c.name)
                          ? <CheckSquare size={18} className="text-blue-400" />
                          : <Square size={18} className="text-slate-500 hover:text-slate-300" />}
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Monitor size={18} className="text-purple-400 flex-shrink-0" />
                        <div>
                          <div className="font-medium">{c.name}</div>
                          {c.description && <div className="text-xs text-slate-400">{c.description}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm">
                      <div>{c.os || 'â€”'}</div>
                      {c.osVersion && <div className="text-xs text-slate-500">{c.osVersion}</div>}
                    </td>
                    <td className="p-4 text-sm text-slate-400 font-mono">{c.dnsName || 'â€”'}</td>
                    <td className="p-4 text-sm text-slate-400">
                      {c.lastLogon ? (
                        <span title={c.lastLogon}>{new Date(c.lastLogon).toLocaleDateString()}</span>
                      ) : 'â€”'}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        c.status === 'active'   ? 'bg-green-500/20 text-green-400'    :
                        c.status === 'inactive' ? 'bg-yellow-500/20 text-yellow-400' :
                                                  'bg-red-500/20 text-red-400'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-1">
                        {user.role === 'Admin' && (
                          <button
                            onClick={() => { setSelected(c); setShowLaps(true) }}
                            className="p-2 hover:bg-slate-700 rounded text-amber-400"
                            title="View LAPS Password"
                          >
                            <Key size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => { setSelected(c); setShowMove(true) }}
                          className="p-2 hover:bg-slate-700 rounded text-cyan-400"
                          title="Move to OU"
                        >
                          <Move size={16} />
                        </button>
                        {c.enabled ? (
                          <button
                            onClick={() => handleAction('disable', c.name)}
                            className="p-2 hover:bg-slate-700 rounded text-red-400"
                            title="Disable"
                          >
                            <MonitorX size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAction('enable', c.name)}
                            className="p-2 hover:bg-slate-700 rounded text-green-400"
                            title="Enable"
                          >
                            <MonitorCheck size={16} />
                          </button>
                        )}
                        {user.role === 'Admin' && (
                          <button
                            onClick={() => handleDelete(c.name)}
                            className="p-2 hover:bg-red-500/20 rounded text-red-400"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <CreateComputerModal
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { showMsg('success', msg); load() }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {showMove && selected && (
        <MoveComputerModal
          computer={selected}
          onClose={() => { setShowMove(false); setSelected(null) }}
          onSuccess={(msg) => { showMsg('success', msg); load(); setShowMove(false); setSelected(null) }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {showBulkMove && (
        <BulkMoveModal
          computers={Array.from(selectedComputers)}
          onClose={() => setShowBulkMove(false)}
          onSuccess={(msg) => {
            showMsg('success', msg)
            setShowBulkMove(false)
            setSelectedComputers(new Set())
            load()
          }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {showLaps && selected && (
        <LapsPasswordModal
          computer={selected}
          onClose={() => { setShowLaps(false); setSelected(null) }}
          onSuccess={(msg) => showMsg('success', msg)}
          onError={(msg) => showMsg('error', msg)}
        />
      )}
    </div>
  )
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className={`bg-slate-800 border border-slate-700 rounded-xl p-6 w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
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

function CreateComputerModal({ onClose, onSuccess, onError }) {
  const [form, setForm] = useState({ name: '', description: '', ou: '' })
  const [ous, setOus] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getOUs().then(d => setOus(d.ous || [])).catch(() => {})
  }, [])

  const handleSubmit = async () => {
    if (!form.name) {
      onError('Computer name is required')
      return
    }
    if (form.name.length > 15) {
      onError('Computer name must be 15 characters or less')
      return
    }
    if (!/^[a-zA-Z0-9-]+$/.test(form.name)) {
      onError('Computer name can only contain letters, numbers, and hyphens')
      return
    }

    setSaving(true)
    try {
      await createComputer(form)
      onSuccess(`Computer "${form.name}" created`)
      onClose()
    } catch (err) {
      onError(err.response?.data?.detail || 'Create failed')
    }
    setSaving(false)
  }

  return (
    <Modal title="Create New Computer" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Computer Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })}
            placeholder="e.g. PC-001"
            maxLength={15}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
            autoFocus
          />
          <p className="text-xs text-slate-500 mt-1">
            Max 15 chars, letters/numbers/hyphens only â€¢ Will be created as {form.name || 'NAME'}$
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional - e.g. John's Workstation"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Target OU</label>
          <select
            value={form.ou}
            onChange={(e) => setForm({ ...form, ou: e.target.value })}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
          >
            <option value="">Default Computers Container</option>
            {ous.map(ou => <option key={ou.dn} value={ou.dn}>{ou.dn}</option>)}
          </select>
        </div>

        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300">
          â„¹ï¸ Note: This creates an empty computer account. The actual computer must be joined to the domain using the corresponding name.
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
        <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
          {saving ? 'Creating...' : 'Create Computer'}
        </button>
      </div>
    </Modal>
  )
}

function MoveComputerModal({ computer, onClose, onSuccess, onError }) {
  const [ous, setOus]           = useState([])
  const [targetOu, setTargetOu] = useState('')
  const [moving, setMoving]     = useState(false)

  useEffect(() => {
    getOUs().then(d => setOus(d.ous || [])).catch(() => {})
  }, [])

  const handleMove = async () => {
    if (!targetOu) {
      onError('Select target OU')
      return
    }
    setMoving(true)
    try {
      await moveComputer(computer.name, targetOu)
      onSuccess(`Moved ${computer.name} to ${targetOu}`)
    } catch (err) {
      onError(err.response?.data?.detail || 'Move failed')
    }
    setMoving(false)
  }

  return (
    <Modal title="Move Computer" onClose={onClose}>
      <div className="mb-4 p-3 bg-slate-900 rounded-lg">
        <div className="text-xs text-slate-400">Computer</div>
        <div className="font-medium flex items-center gap-2">
          <Monitor size={16} className="text-purple-400" />
          {computer.name}
        </div>
        {computer.os && <div className="text-xs text-slate-500 mt-1">{computer.os}</div>}
        <div className="text-xs text-slate-500 mt-1">Current OU:</div>
        <div className="text-xs font-mono truncate">{computer.ou}</div>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">Move to OU</label>
        <select
          value={targetOu}
          onChange={(e) => setTargetOu(e.target.value)}
          className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
        >
          <option value="">Select target OU...</option>
          {ous.map(o => <option key={o.dn} value={o.dn}>{o.dn}</option>)}
        </select>
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">Cancel</button>
        <button onClick={handleMove} disabled={moving || !targetOu} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg disabled:opacity-50">
          {moving ? 'Moving...' : 'Move Computer'}
        </button>
      </div>
    </Modal>
  )
}

function BulkMoveModal({ computers, onClose, onSuccess, onError }) {
  const [ous, setOus]           = useState([])
  const [targetOu, setTargetOu] = useState('')
  const [moving, setMoving]     = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  useEffect(() => {
    getOUs().then(d => setOus(d.ous || [])).catch(() => {})
  }, [])

  const handleMove = async () => {
    if (!targetOu) {
      onError('Select target OU')
      return
    }
    setMoving(true)
    setProgress({ done: 0, total: computers.length })

    let success = 0
    let failed = 0
    for (let i = 0; i < computers.length; i++) {
      try {
        await moveComputer(computers[i], targetOu)
        success++
      } catch (err) {
        failed++
      }
      setProgress({ done: i + 1, total: computers.length })
    }

    onSuccess(`Moved ${success} of ${computers.length} computers (${failed} failed)`)
    setMoving(false)
  }

  return (
    <Modal title={`Move ${computers.length} Computers`} onClose={onClose}>
      <div className="mb-4 p-3 bg-slate-900 rounded-lg max-h-32 overflow-y-auto">
        <div className="text-xs text-slate-400 mb-2">Selected computers:</div>
        <div className="text-sm font-mono">{computers.join(', ')}</div>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">Move all to OU</label>
        <select
          value={targetOu}
          onChange={(e) => setTargetOu(e.target.value)}
          className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg"
        >
          <option value="">Select target OU...</option>
          {ous.map(o => <option key={o.dn} value={o.dn}>{o.dn}</option>)}
        </select>
      </div>

      {moving && (
        <div className="mt-4 p-3 bg-slate-900 rounded-lg">
          <div className="flex justify-between text-sm mb-2">
            <span>Moving computers...</span>
            <span>{progress.done} / {progress.total}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end mt-6">
        <button onClick={onClose} disabled={moving} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg disabled:opacity-50">Cancel</button>
        <button onClick={handleMove} disabled={moving || !targetOu} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg disabled:opacity-50">
          {moving ? `Moving... (${progress.done}/${progress.total})` : `Move ${computers.length} Computers`}
        </button>
      </div>
    </Modal>
  )
}

function LapsPasswordModal({ computer, onClose, onSuccess, onError }) {
  const [step, setStep] = useState('reason')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [history, setHistory] = useState([])
  const [showPassword, setShowPassword] = useState(false)
  const [countdown, setCountdown] = useState(30)
  const [rotating, setRotating] = useState(false)

  useEffect(() => {
    if (step !== 'viewing' || !showPassword) return
    setCountdown(30)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setShowPassword(false)
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [step, showPassword])

  const handleFetchPassword = async () => {
    if (!reason || reason.trim().length < 5) {
      onError('Reason must be at least 5 characters')
      return
    }
    setLoading(true)
    try {
      const result = await getLapsPassword(computer.name, reason.trim())
      setData(result)
      setStep('viewing')
      setShowPassword(true)
    } catch (err) {
      onError(err.response?.data?.detail || 'Failed to retrieve LAPS password')
    }
    setLoading(false)
  }

  const handleFetchHistory = async () => {
    setLoading(true)
    try {
      const result = await getLapsHistory(computer.name, reason.trim())
      setHistory(result.history || [])
      setStep('history')
    } catch (err) {
      onError(err.response?.data?.detail || 'Failed to retrieve history')
    }
    setLoading(false)
  }

  const handleRotate = async () => {
    if (!confirm(`Force password rotation for ${computer.name}?\n\nThe computer will get a new password on its next AD check-in (usually within 1 hour).`)) return
    setRotating(true)
    try {
      const result = await rotateLapsPassword(computer.name)
      onSuccess(result.message)
      onClose()
    } catch (err) {
      onError(err.response?.data?.detail || 'Rotation failed')
    }
    setRotating(false)
  }

  const copyToClipboard = async (text, label = 'Password') => {
    try {
      await navigator.clipboard.writeText(text)
      onSuccess(`${label} copied to clipboard`)
    } catch {
      onError('Copy failed - browser blocked clipboard access')
    }
  }

  const formatDate = (iso) => {
    if (!iso) return 'â€”'
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }

  const timeUntilExpiry = () => {
    if (!data?.expires) return null
    try {
      const now = Date.now()
      const exp = new Date(data.expires).getTime()
      const diff = exp - now
      if (diff < 0) return { text: 'EXPIRED - rotation pending', color: 'text-red-400' }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      if (days > 0) return { text: `${days}d ${hours}h until rotation`, color: 'text-green-400' }
      return { text: `${hours}h until rotation`, color: 'text-yellow-400' }
    } catch { return null }
  }

  return (
    <Modal title={`ðŸ”‘ LAPS Password - ${computer.name}`} onClose={onClose} wide>
      {step === 'reason' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2 text-amber-300 text-sm">
              <Key size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-semibold mb-1">Sensitive Operation - Audit Log Required</div>
                <div className="text-xs text-amber-200/80">
                  Retrieving the LAPS local admin password will be permanently logged with your username,
                  the computer name, timestamp, IP address, and your stated reason.
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-900 rounded-lg">
            <div className="text-xs text-slate-400 mb-1">Computer</div>
            <div className="flex items-center gap-2 font-medium">
              <Monitor size={16} className="text-purple-400" />
              {computer.name}
            </div>
            <div className="text-xs text-slate-500 mt-1">{computer.dnsName || computer.ou}</div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">
              Reason for viewing this password <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Ticket #12345 - User locked out, needs local admin recovery"
              rows={3}
              maxLength={200}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
              autoFocus
            />
            <div className="flex justify-between mt-1 text-xs text-slate-500">
              <span>Minimum 5 characters, max 200</span>
              <span>{reason.length}/200</span>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
              Cancel
            </button>
            <button
              onClick={handleFetchPassword}
              disabled={loading || reason.trim().length < 5}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Key size={16} />}
              {loading ? 'Retrieving...' : 'Reveal Password'}
            </button>
          </div>
        </div>
      )}

      {step === 'viewing' && data && (
        <div className="space-y-4">
          {showPassword && (
            <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-center text-sm text-red-300">
              â± Password will auto-hide in <span className="font-bold">{countdown}s</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-xs text-slate-400 mb-1">Local Admin Account</div>
              <div className="font-mono text-sm">{data.account || 'Administrator'}</div>
            </div>
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-xs text-slate-400 mb-1">Source</div>
              <div className="text-sm">
                {data.source === 'EncryptedPassword' ? (
                  <span className="text-green-400">ðŸ”’ Encrypted</span>
                ) : (
                  <span className="text-yellow-400">ðŸ“„ Plain Text</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Current Password</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={data.password || ''}
                  readOnly
                  className="w-full px-3 py-3 pr-10 bg-slate-900 border-2 border-amber-500/40 rounded-lg font-mono text-lg"
                />
                <button
                  onClick={() => {
                    setShowPassword(!showPassword)
                    if (!showPassword) setCountdown(30)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-700 rounded"
                >
                  {showPassword ? 'ðŸ™ˆ' : 'ðŸ‘'}
                </button>
              </div>
              <button
                onClick={() => copyToClipboard(data.password)}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2"
                title="Copy to clipboard"
              >
                ðŸ“‹ Copy
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-xs text-slate-400 mb-1">Last Updated</div>
              <div className="text-sm">{formatDate(data.updated)}</div>
            </div>
            <div className="p-3 bg-slate-900 rounded-lg">
              <div className="text-xs text-slate-400 mb-1">Expires</div>
              <div className="text-sm">{formatDate(data.expires)}</div>
              {timeUntilExpiry() && (
                <div className={`text-xs mt-1 ${timeUntilExpiry().color}`}>
                  {timeUntilExpiry().text}
                </div>
              )}
            </div>
          </div>

          {data.authorizedDecryptor && (
            <div className="p-2 bg-slate-900 rounded text-xs text-slate-400">
              Authorized decryptor: <span className="font-mono text-cyan-400">{data.authorizedDecryptor}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-between pt-4 border-t border-slate-700">
            <div className="flex gap-2">
              <button
                onClick={handleFetchHistory}
                disabled={loading}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
              >
                {loading ? 'Loading...' : 'ðŸ“œ History'}
              </button>
              <button
                onClick={handleRotate}
                disabled={rotating}
                className="px-3 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm disabled:opacity-50"
              >
                {rotating ? 'Rotating...' : 'ðŸ”„ Force Rotation'}
              </button>
            </div>
            <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
              Close
            </button>
          </div>
        </div>
      )}

      {step === 'history' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Password History for {computer.name}</h4>
            <button
              onClick={() => setStep('viewing')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              â† Back to current password
            </button>
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No password history available
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {history.map((h, i) => (
                <div key={i} className="p-3 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-slate-400">
                      {i === 0 ? 'ðŸ”µ Current' : `#${i} - ${formatDate(h.updated)}`}
                    </div>
                    <button
                      onClick={() => copyToClipboard(h.password, `Password #${i}`)}
                      className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
                    >
                      ðŸ“‹ Copy
                    </button>
                  </div>
                  <div className="font-mono text-sm break-all bg-slate-800 p-2 rounded">
                    {h.password}
                  </div>
                  {h.status !== 'Success' && (
                    <div className="text-xs text-red-400 mt-1">Status: {h.status}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SortHeader â€” Sortable Table Column Header
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SortHeader({ field, label, sortField, sortDir, onSort }) {
  const isActive = sortField === field
  return (
    <th
      onClick={() => onSort(field)}
      className="p-4 cursor-pointer select-none hover:bg-slate-800 transition"
    >
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        {isActive ? (
          sortDir === 'asc'
            ? <ArrowUp size={14} className="text-blue-400" />
            : <ArrowDown size={14} className="text-blue-400" />
        ) : (
          <ArrowUpDown size={12} className="text-slate-600 opacity-50" />
        )}
      </div>
    </th>
  )
}



