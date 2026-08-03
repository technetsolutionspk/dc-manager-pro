import { useState, useEffect } from 'react'
import {
  Globe, RefreshCw, Plus, Trash2, Edit2, X, Search,
  ChevronDown, AlertCircle, CheckCircle, Server, Filter,
  ArrowUp, ArrowDown, ArrowUpDown, Copy, TestTube,
  CheckSquare, Square, MoreVertical
} from 'lucide-react'
import {
  getDnsZones, getDnsRecords, createDnsARecord, createDnsCnameRecord,
  createDnsPtrRecord, updateDnsRecord, deleteDnsRecord, testDnsConnection
} from '../api'

const RECORD_TYPES = ['A', 'CNAME', 'PTR']

export default function DNS() {
  const [zones,        setZones]        = useState([])
  const [selectedZone, setSelectedZone] = useState('')
  const [records,      setRecords]      = useState([])
  const [loading,      setLoading]      = useState(false)
  const [zonesLoading, setZonesLoading] = useState(true)
  const [message,      setMessage]      = useState(null)
  const [activeServer, setActiveServer] = useState('')

  const [search,       setSearch]       = useState('')
  const [typeFilter,   setTypeFilter]   = useState('all')
  const [sortField,    setSortField]    = useState('hostname')
  const [sortDir,      setSortDir]      = useState('asc')

  const [showCreate,   setShowCreate]   = useState(false)
  const [createType,   setCreateType]   = useState('A')
  const [editRecord,   setEditRecord]   = useState(null)

  // Bulk operations state
  const [selectedRecords, setSelectedRecords] = useState(new Set())
  const [showBulkMenu,    setShowBulkMenu]    = useState(false)
  const [bulkProgress,    setBulkProgress]    = useState(null)

  useEffect(() => { loadZones() }, [])
  useEffect(() => {
    if (selectedZone) loadRecords()
  }, [selectedZone, typeFilter])

  // Clear selection when zone/filter changes
  useEffect(() => {
    setSelectedRecords(new Set())
  }, [selectedZone, typeFilter])

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const loadZones = async () => {
    setZonesLoading(true)
    try {
      const data = await getDnsZones()
      setZones(data.zones || [])
      setActiveServer(data.activeServer || '')
      const firstZone = (data.zones || []).find(z => !z.isAutoCreated)
      if (firstZone && !selectedZone) setSelectedZone(firstZone.name)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load zones')
      setZones([])
    }
    setZonesLoading(false)
  }

  const loadRecords = async () => {
    if (!selectedZone) return
    setLoading(true)
    try {
      const filter = typeFilter === 'all' ? null : typeFilter
      const data = await getDnsRecords(selectedZone, filter)
      setRecords(data.records || [])
      setActiveServer(data.activeServer || activeServer)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load records')
      setRecords([])
    }
    setLoading(false)
  }

  const handleSort = (field) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const handleDelete = async (rec) => {
    if (!confirm(`Delete ${rec.type} record "${rec.hostname}" -> "${rec.value}"?\n\nThis cannot be undone.`)) return
    try {
      await deleteDnsRecord(selectedZone, rec.hostname, rec.type)
      showMsg('success', `Deleted ${rec.type} record: ${rec.hostname}`)
      loadRecords()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed')
    }
  }

  const handleTest = async () => {
    try {
      const result = await testDnsConnection()
      if (result.connected) showMsg('success', `Connected to DNS: ${result.activeServer}`)
      else showMsg('error', `DNS test failed: ${result.message}`)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Test failed')
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    showMsg('success', `Copied: ${text}`)
  }

  // ── Selection Helpers ──
  const recordKey = (r) => `${r.hostname}|${r.type}|${r.value}`

  const toggleSelect = (r) => {
    const key = recordKey(r)
    const next = new Set(selectedRecords)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedRecords(next)
  }

  const toggleSelectAll = () => {
    if (selectedRecords.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedRecords(new Set())
    } else {
      setSelectedRecords(new Set(filteredRecords.map(recordKey)))
    }
  }

  const isSelected = (r) => selectedRecords.has(recordKey(r))

  // ── Bulk Delete ──
  const handleBulkDelete = async () => {
    if (selectedRecords.size === 0) return
    if (!confirm(`Delete ${selectedRecords.size} DNS record(s)?\n\nThis cannot be undone.`)) return

    setShowBulkMenu(false)
    setBulkProgress({ current: 0, total: selectedRecords.size, failed: 0 })

    let success = 0
    let failed = 0
    const errors = []

    const toDelete = filteredRecords.filter(r => selectedRecords.has(recordKey(r)))

    for (let i = 0; i < toDelete.length; i++) {
      const r = toDelete[i]
      try {
        await deleteDnsRecord(selectedZone, r.hostname, r.type)
        success++
      } catch (err) {
        failed++
        errors.push(`${r.hostname} (${r.type}): ${err.response?.data?.detail || 'failed'}`)
      }
      setBulkProgress({ current: i + 1, total: toDelete.length, failed })
    }

    setBulkProgress(null)
    setSelectedRecords(new Set())

    if (failed === 0) {
      showMsg('success', `Deleted ${success} record(s)`)
    } else {
      showMsg('error', `${success} deleted, ${failed} failed. First error: ${errors[0]}`)
      console.error('Bulk delete errors:', errors)
    }

    loadRecords()
  }

  const filteredRecords = (() => {
    let list = records
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        r.hostname.toLowerCase().includes(q) ||
        r.value.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      let av = a[sortField]; let bv = b[sortField]
      if (av === null || av === undefined) av = ''
      if (bv === null || bv === undefined) bv = ''
      if (sortField === 'ttl') return sortDir === 'asc' ? (av - bv) : (bv - av)
      av = String(av).toLowerCase()
      bv = String(bv).toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  })()

  const displayZones = zones.filter(z => !z.isAutoCreated || zones.filter(zz => !zz.isAutoCreated).length === 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            <Globe size={28} className="text-blue-400" />
            DNS Management
          </h1>
          <p className="text-slate-400">
            Manage DNS records for the active domain
            {activeServer && <span className="ml-2 text-xs text-blue-400">Server: {activeServer}</span>}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Bulk Actions dropdown - only shown when items selected */}
          {selectedRecords.size > 0 && (
            <div className="relative">
              <button onClick={() => setShowBulkMenu(!showBulkMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium">
                <MoreVertical size={16} />
                Bulk Actions ({selectedRecords.size})
                <ChevronDown size={14} />
              </button>
              {showBulkMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <button onClick={handleBulkDelete}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-red-400 hover:bg-slate-700 transition">
                    <Trash2 size={14} />
                    <span className="text-sm">Delete Selected</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <button onClick={handleTest} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">
            <TestTube size={14} /> Test DNS
          </button>
          <button onClick={() => { setCreateType('A'); setShowCreate(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium">
            <Plus size={16} /> Add Record
          </button>
          <button onClick={loadRecords} disabled={loading || !selectedZone}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-50">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Bulk progress indicator */}
      {bulkProgress && (
        <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <RefreshCw size={16} className="animate-spin text-blue-400" />
            <span className="text-sm text-blue-300">
              Processing {bulkProgress.current} of {bulkProgress.total}
              {bulkProgress.failed > 0 && <span className="text-red-400 ml-2">({bulkProgress.failed} failed)</span>}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all"
              style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
          message.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Zone Selector & Filters */}
      <div className="mb-4 bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Zone</label>
            {zonesLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 rounded-lg text-slate-500 text-sm">
                <RefreshCw size={14} className="animate-spin" /> Loading zones...
              </div>
            ) : displayZones.length === 0 ? (
              <div className="px-3 py-2 bg-slate-900 rounded-lg text-slate-500 text-sm">No zones found</div>
            ) : (
              <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm">
                <option value="">-- Select a zone --</option>
                {displayZones.map(z => (
                  <option key={z.name} value={z.name}>
                    {z.name} {z.isReverseLookup ? '(Reverse)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Record Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm">
              <option value="all">All Types</option>
              {RECORD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search records..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm" />
            </div>
          </div>
        </div>

        {selectedZone && (
          <div className="mt-3 text-xs text-slate-500 flex items-center gap-3">
            <span>Showing {filteredRecords.length} of {records.length} records</span>
            {typeFilter !== 'all' && (
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">Filter: {typeFilter}</span>
            )}
            {selectedRecords.size > 0 && (
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                {selectedRecords.size} selected
              </span>
            )}
          </div>
        )}
      </div>

      {/* Records Table */}
      {selectedZone ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="p-4 w-10">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-blue-400">
                    {selectedRecords.size === filteredRecords.length && filteredRecords.length > 0
                      ? <CheckSquare size={18} />
                      : <Square size={18} />}
                  </button>
                </th>
                <SortHeader field="hostname" label="Hostname" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader field="type"     label="Type"     sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader field="value"    label="Value"    sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader field="ttl"      label="TTL"      sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2" /> Loading records...
                </td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">
                  {search ? 'No records match your search' : 'No records in this zone'}
                </td></tr>
              ) : (
                filteredRecords.map((r, i) => {
                  const selected = isSelected(r)
                  return (
                    <tr key={i} className={`border-t border-slate-700 hover:bg-slate-700/30 ${selected ? 'bg-blue-500/5' : ''}`}>
                      <td className="p-4">
                        <button onClick={() => toggleSelect(r)}
                          className="text-slate-400 hover:text-blue-400">
                          {selected ? <CheckSquare size={18} className="text-blue-400" /> : <Square size={18} />}
                        </button>
                      </td>
                      <td className="p-4 font-mono">{r.hostname}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          r.type === 'A'     ? 'bg-blue-500/20 text-blue-400' :
                          r.type === 'CNAME' ? 'bg-purple-500/20 text-purple-400' :
                          r.type === 'PTR'   ? 'bg-orange-500/20 text-orange-400' :
                          'bg-slate-700 text-slate-300'
                        }`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-slate-300">
                        <div className="flex items-center gap-2">
                          <span>{r.value}</span>
                          <button onClick={() => copyToClipboard(r.value)}
                            className="text-slate-600 hover:text-blue-400"><Copy size={12} /></button>
                        </div>
                      </td>
                      <td className="p-4 text-slate-400">{r.ttl}s</td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditRecord(r)}
                            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400" title="Edit">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(r)}
                            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-red-400" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-slate-500 bg-slate-800 border border-slate-700 rounded-xl">
          <Globe size={40} className="mx-auto mb-3 opacity-30" />
          <p>Select a zone to view records</p>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateRecordModal
          zone={selectedZone}
          initialType={createType}
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { showMsg('success', msg); loadRecords(); setShowCreate(false) }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {/* Edit Modal */}
      {editRecord && (
        <EditRecordModal
          zone={selectedZone}
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSuccess={(msg) => { showMsg('success', msg); loadRecords(); setEditRecord(null) }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}
    </div>
  )
}

// SortHeader Component
function SortHeader({ field, label, sortField, sortDir, onSort }) {
  const isActive = sortField === field
  return (
    <th onClick={() => onSort(field)}
      className="p-4 cursor-pointer select-none hover:bg-slate-800 transition text-left">
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        {isActive
          ? (sortDir === 'asc' ? <ArrowUp size={14} className="text-blue-400" /> : <ArrowDown size={14} className="text-blue-400" />)
          : <ArrowUpDown size={12} className="text-slate-600 opacity-50" />
        }
      </div>
    </th>
  )
}

// Create Record Modal
function CreateRecordModal({ zone, initialType, onClose, onSuccess, onError }) {
  const [type,   setType]   = useState(initialType || 'A')
  const [name,   setName]   = useState('')
  const [value,  setValue]  = useState('')
  const [ttl,    setTtl]    = useState(3600)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name || !value) { onError('Name and value are required'); return }
    setSaving(true)
    try {
      if (type === 'A')     await createDnsARecord(zone, { name, ip: value, ttl: parseInt(ttl) })
      else if (type === 'CNAME') await createDnsCnameRecord(zone, { alias: name, target: value, ttl: parseInt(ttl) })
      else if (type === 'PTR')   await createDnsPtrRecord(zone, { name, hostname: value, ttl: parseInt(ttl) })
      onSuccess(`${type} record created: ${name}`)
    } catch (err) {
      onError(err.response?.data?.detail || 'Create failed')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center"><Plus size={18} /></div>
            <div>
              <h2 className="font-bold text-lg">Add DNS Record</h2>
              <p className="text-xs text-slate-400">Zone: {zone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">Record Type</label>
            <div className="grid grid-cols-3 gap-2">
              {RECORD_TYPES.map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={`py-2 rounded-lg text-sm font-medium transition ${
                    type === t ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
                  }`}>{t}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              {type === 'PTR' ? 'Last IP Octet' : 'Name (Hostname)'} <span className="text-red-400">*</span>
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={type === 'A' ? 'server01' : type === 'CNAME' ? 'www' : '10'}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg" />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              {type === 'A' ? 'IP Address' : type === 'CNAME' ? 'Target FQDN' : 'Hostname FQDN'} <span className="text-red-400">*</span>
            </label>
            <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={type === 'A' ? '192.168.1.100' : 'server01.domain.local'}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg" />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">TTL (seconds)</label>
            <input type="number" value={ttl} onChange={(e) => setTtl(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg" />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><Plus size={14} /> Create Record</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// Edit Record Modal
function EditRecordModal({ zone, record, onClose, onSuccess, onError }) {
  const [newValue, setNewValue] = useState(record.value)
  const [newTtl,   setNewTtl]   = useState(record.ttl)
  const [saving,   setSaving]   = useState(false)

  const handleSave = async () => {
    if (!newValue) { onError('Value is required'); return }
    setSaving(true)
    try {
      await updateDnsRecord(zone, {
        hostname: record.hostname,
        type: record.type,
        oldValue: record.value,
        newValue: newValue,
        ttl: parseInt(newTtl)
      })
      onSuccess(`Updated ${record.type} record: ${record.hostname}`)
    } catch (err) {
      onError(err.response?.data?.detail || 'Update failed')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center"><Edit2 size={18} /></div>
            <div>
              <h2 className="font-bold text-lg">Edit DNS Record</h2>
              <p className="text-xs text-slate-400">{record.hostname} ({record.type})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3 bg-slate-900 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Current Value</div>
            <div className="font-mono text-sm">{record.value}</div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">New Value <span className="text-red-400">*</span></label>
            <input type="text" value={newValue} onChange={(e) => setNewValue(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg font-mono" />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">TTL (seconds)</label>
            <input type="number" value={newTtl} onChange={(e) => setNewTtl(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg" />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><Edit2 size={14} /> Update</>}
          </button>
        </div>
      </div>
    </div>
  )
}