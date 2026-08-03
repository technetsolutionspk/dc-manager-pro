import { useState, useEffect } from 'react'
import {
  Wifi, RefreshCw, Plus, Trash2, Edit2, X, Search,
  AlertCircle, CheckCircle, Server, TestTube,
  ArrowUp, ArrowDown, ArrowUpDown, Copy, Zap, Users,
  CheckSquare, Square, MoreVertical, ChevronDown, FileEdit
} from 'lucide-react'
import {
  getDhcpScopes, getDhcpReservations, createDhcpReservation,
  updateDhcpReservation, deleteDhcpReservation,
  getDhcpLeases, releaseDhcpLease, deleteDhcpLease, testDhcpConnection
} from '../api'

export default function DHCP() {
  const [scopes,        setScopes]        = useState([])
  const [selectedScope, setSelectedScope] = useState('')
  const [reservations,  setReservations]  = useState([])
  const [leases,        setLeases]        = useState([])
  const [loading,       setLoading]       = useState(false)
  const [scopesLoading, setScopesLoading] = useState(true)
  const [message,       setMessage]       = useState(null)
  const [activeServer,  setActiveServer]  = useState('')
  const [activeTab,     setActiveTab]     = useState('reservations')

  const [search,      setSearch]      = useState('')
  const [sortField,   setSortField]   = useState('ipAddress')
  const [sortDir,     setSortDir]     = useState('asc')

  const [showCreate,      setShowCreate]      = useState(false)
  const [editReservation, setEditReservation] = useState(null)

  // Bulk state (separate for each tab)
  const [selectedReservations, setSelectedReservations] = useState(new Set())
  const [selectedLeases,       setSelectedLeases]       = useState(new Set())
  const [showBulkMenu,         setShowBulkMenu]         = useState(false)
  const [showBulkEditDesc,     setShowBulkEditDesc]     = useState(false)
  const [bulkProgress,         setBulkProgress]         = useState(null)

  useEffect(() => { loadScopes() }, [])
  useEffect(() => {
    if (selectedScope) {
      if (activeTab === 'reservations') loadReservations()
      else if (activeTab === 'leases') loadLeases()
    }
  }, [selectedScope, activeTab])

  useEffect(() => {
    // Clear selection when tab/scope changes
    setSelectedReservations(new Set())
    setSelectedLeases(new Set())
  }, [activeTab, selectedScope])

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const loadScopes = async () => {
    setScopesLoading(true)
    try {
      const data = await getDhcpScopes()
      setScopes(data.scopes || [])
      setActiveServer(data.activeServer || '')
      if ((data.scopes || []).length > 0 && !selectedScope) setSelectedScope(data.scopes[0].scopeId)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load scopes')
      setScopes([])
    }
    setScopesLoading(false)
  }

  const loadReservations = async () => {
    if (!selectedScope) return
    setLoading(true)
    try {
      const data = await getDhcpReservations(selectedScope)
      setReservations(data.reservations || [])
      setActiveServer(data.activeServer || activeServer)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load reservations')
      setReservations([])
    }
    setLoading(false)
  }

  const loadLeases = async () => {
    if (!selectedScope) return
    setLoading(true)
    try {
      const data = await getDhcpLeases(selectedScope)
      setLeases(data.leases || [])
      setActiveServer(data.activeServer || activeServer)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load leases')
      setLeases([])
    }
    setLoading(false)
  }

  const handleSort = (field) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const handleDeleteReservation = async (r) => {
    if (!confirm(`Delete reservation for ${r.ipAddress} (${r.name || 'unnamed'})?\n\nThis cannot be undone.`)) return
    try {
      await deleteDhcpReservation(selectedScope, r.ipAddress)
      showMsg('success', `Deleted reservation: ${r.ipAddress}`)
      loadReservations()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed')
    }
  }

  const handleReleaseLease = async (l) => {
    if (!confirm(`Release lease for ${l.ipAddress} (${l.hostName || 'unknown'})?\n\nThis will free the IP.`)) return
    try {
      await releaseDhcpLease(selectedScope, l.ipAddress)
      showMsg('success', `Released lease: ${l.ipAddress}`)
      loadLeases()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Release failed')
    }
  }

  const handleTest = async () => {
    try {
      const result = await testDhcpConnection()
      if (result.connected) showMsg('success', `Connected to DHCP: ${result.activeServer}`)
      else showMsg('error', `DHCP test failed: ${result.message}`)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Test failed')
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    showMsg('success', `Copied: ${text}`)
  }

  // ── Selection helpers ──
  const toggleSelectReservation = (r) => {
    const next = new Set(selectedReservations)
    if (next.has(r.ipAddress)) next.delete(r.ipAddress)
    else next.add(r.ipAddress)
    setSelectedReservations(next)
  }

  const toggleSelectAllReservations = () => {
    if (selectedReservations.size === filteredReservations.length && filteredReservations.length > 0) {
      setSelectedReservations(new Set())
    } else {
      setSelectedReservations(new Set(filteredReservations.map(r => r.ipAddress)))
    }
  }

  const toggleSelectLease = (l) => {
    const next = new Set(selectedLeases)
    if (next.has(l.ipAddress)) next.delete(l.ipAddress)
    else next.add(l.ipAddress)
    setSelectedLeases(next)
  }

  const toggleSelectAllLeases = () => {
    if (selectedLeases.size === filteredLeases.length && filteredLeases.length > 0) {
      setSelectedLeases(new Set())
    } else {
      setSelectedLeases(new Set(filteredLeases.map(l => l.ipAddress)))
    }
  }

  // ── Bulk Delete Reservations ──
  const handleBulkDeleteReservations = async () => {
    if (selectedReservations.size === 0) return
    if (!confirm(`Delete ${selectedReservations.size} reservation(s)?\n\nThis cannot be undone.`)) return

    setShowBulkMenu(false)
    setBulkProgress({ current: 0, total: selectedReservations.size, failed: 0 })

    let success = 0
    let failed = 0
    const errors = []
    const ips = Array.from(selectedReservations)

    for (let i = 0; i < ips.length; i++) {
      try {
        await deleteDhcpReservation(selectedScope, ips[i])
        success++
      } catch (err) {
        failed++
        errors.push(`${ips[i]}: ${err.response?.data?.detail || 'failed'}`)
      }
      setBulkProgress({ current: i + 1, total: ips.length, failed })
    }

    setBulkProgress(null)
    setSelectedReservations(new Set())

    if (failed === 0) showMsg('success', `Deleted ${success} reservation(s)`)
    else {
      showMsg('error', `${success} deleted, ${failed} failed. First error: ${errors[0]}`)
      console.error('Bulk delete errors:', errors)
    }
    loadReservations()
  }

  // ── Bulk Edit Description for Reservations ──
  const handleBulkEditDescription = async (newDescription) => {
    if (selectedReservations.size === 0) return

    setShowBulkEditDesc(false)
    setBulkProgress({ current: 0, total: selectedReservations.size, failed: 0 })

    let success = 0
    let failed = 0
    const errors = []
    const ips = Array.from(selectedReservations)

    for (let i = 0; i < ips.length; i++) {
      try {
        await updateDhcpReservation(selectedScope, ips[i], { description: newDescription })
        success++
      } catch (err) {
        failed++
        errors.push(`${ips[i]}: ${err.response?.data?.detail || 'failed'}`)
      }
      setBulkProgress({ current: i + 1, total: ips.length, failed })
    }

    setBulkProgress(null)
    setSelectedReservations(new Set())

    if (failed === 0) showMsg('success', `Updated description on ${success} reservation(s)`)
    else {
      showMsg('error', `${success} updated, ${failed} failed. First error: ${errors[0]}`)
      console.error('Bulk update errors:', errors)
    }
    loadReservations()
  }

  // ── Bulk Release Leases ──
  const handleBulkReleaseLeases = async () => {
    if (selectedLeases.size === 0) return
    if (!confirm(`Release ${selectedLeases.size} lease(s)?\n\nThese IPs will be freed.`)) return

    setShowBulkMenu(false)
    setBulkProgress({ current: 0, total: selectedLeases.size, failed: 0 })

    let success = 0
    let failed = 0
    const errors = []
    const ips = Array.from(selectedLeases)

    for (let i = 0; i < ips.length; i++) {
      try {
        await releaseDhcpLease(selectedScope, ips[i])
        success++
      } catch (err) {
        failed++
        errors.push(`${ips[i]}: ${err.response?.data?.detail || 'failed'}`)
      }
      setBulkProgress({ current: i + 1, total: ips.length, failed })
    }

    setBulkProgress(null)
    setSelectedLeases(new Set())

    if (failed === 0) showMsg('success', `Released ${success} lease(s)`)
    else {
      showMsg('error', `${success} released, ${failed} failed. First error: ${errors[0]}`)
      console.error('Bulk release errors:', errors)
    }
    loadLeases()
  }

  const sortList = (list) => {
    return [...list].sort((a, b) => {
      let av = a[sortField]; let bv = b[sortField]
      if (av === null || av === undefined) av = ''
      if (bv === null || bv === undefined) bv = ''
      av = String(av).toLowerCase()
      bv = String(bv).toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }

  const filteredReservations = sortList(
    search
      ? reservations.filter(r =>
          r.ipAddress.toLowerCase().includes(search.toLowerCase()) ||
          r.clientId.toLowerCase().includes(search.toLowerCase()) ||
          (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
          (r.description || '').toLowerCase().includes(search.toLowerCase())
        )
      : reservations
  )

  const filteredLeases = sortList(
    search
      ? leases.filter(l =>
          l.ipAddress.toLowerCase().includes(search.toLowerCase()) ||
          l.clientId.toLowerCase().includes(search.toLowerCase()) ||
          (l.hostName || '').toLowerCase().includes(search.toLowerCase()) ||
          (l.description || '').toLowerCase().includes(search.toLowerCase())
        )
      : leases
  )

  const activeScope = scopes.find(s => s.scopeId === selectedScope)
  const bulkSelectionCount = activeTab === 'reservations' ? selectedReservations.size : selectedLeases.size

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            <Wifi size={28} className="text-blue-400" />
            DHCP Management
          </h1>
          <p className="text-slate-400">
            Manage DHCP reservations and leases
            {activeServer && <span className="ml-2 text-xs text-blue-400">Server: {activeServer}</span>}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Bulk Actions dropdown */}
          {bulkSelectionCount > 0 && (
            <div className="relative">
              <button onClick={() => setShowBulkMenu(!showBulkMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium">
                <MoreVertical size={16} />
                Bulk Actions ({bulkSelectionCount})
                <ChevronDown size={14} />
              </button>
              {showBulkMenu && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {activeTab === 'reservations' ? (
                    <>
                      <button onClick={() => { setShowBulkMenu(false); setShowBulkEditDesc(true) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-slate-200 hover:bg-slate-700 transition">
                        <FileEdit size={14} />
                        <span className="text-sm">Edit Description</span>
                      </button>
                      <button onClick={handleBulkDeleteReservations}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-red-400 hover:bg-slate-700 transition">
                        <Trash2 size={14} />
                        <span className="text-sm">Delete Selected</span>
                      </button>
                    </>
                  ) : (
                    <button onClick={handleBulkReleaseLeases}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-orange-400 hover:bg-slate-700 transition">
                      <Zap size={14} />
                      <span className="text-sm">Release Selected</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <button onClick={handleTest} className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">
            <TestTube size={14} /> Test DHCP
          </button>
          {activeTab === 'reservations' && (
            <button onClick={() => setShowCreate(true)} disabled={!selectedScope}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50">
              <Plus size={16} /> Add Reservation
            </button>
          )}
          <button onClick={() => activeTab === 'reservations' ? loadReservations() : loadLeases()}
            disabled={loading || !selectedScope}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg disabled:opacity-50">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Bulk progress */}
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

      {/* Scope Selector */}
      <div className="mb-4 bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">DHCP Scope</label>
            {scopesLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 rounded-lg text-slate-500 text-sm">
                <RefreshCw size={14} className="animate-spin" /> Loading scopes...
              </div>
            ) : scopes.length === 0 ? (
              <div className="px-3 py-2 bg-slate-900 rounded-lg text-slate-500 text-sm">No scopes found</div>
            ) : (
              <select value={selectedScope} onChange={(e) => setSelectedScope(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm">
                {scopes.map(s => (
                  <option key={s.scopeId} value={s.scopeId}>
                    {s.scopeId} - {s.name} ({s.startRange}-{s.endRange}) [{s.state}]
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by IP, MAC, name, description..."
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm" />
            </div>
          </div>
        </div>

        {activeScope && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="px-3 py-2 bg-slate-900 rounded-lg">
              <div className="text-slate-500">Mask</div>
              <div className="text-slate-200 font-mono">{activeScope.subnetMask}</div>
            </div>
            <div className="px-3 py-2 bg-slate-900 rounded-lg">
              <div className="text-slate-500">In Use</div>
              <div className="text-slate-200">{activeScope.addressesInUse} ({activeScope.percentageInUse}%)</div>
            </div>
            <div className="px-3 py-2 bg-slate-900 rounded-lg">
              <div className="text-slate-500">Free</div>
              <div className="text-green-400">{activeScope.addressesFree}</div>
            </div>
            <div className="px-3 py-2 bg-slate-900 rounded-lg">
              <div className="text-slate-500">Reservations</div>
              <div className="text-blue-400">{activeScope.reserved}</div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      {selectedScope && (
        <div className="mb-4 flex gap-1 border-b border-slate-700">
          <TabButton active={activeTab === 'reservations'} onClick={() => setActiveTab('reservations')}
            icon={Zap} label="Reservations" count={reservations.length} />
          <TabButton active={activeTab === 'leases'} onClick={() => setActiveTab('leases')}
            icon={Users} label="Active Leases" count={leases.length} />
        </div>
      )}

      {/* Content Tables */}
      {selectedScope ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          {activeTab === 'reservations' ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="p-4 w-10">
                    <button onClick={toggleSelectAllReservations} className="text-slate-400 hover:text-blue-400">
                      {selectedReservations.size === filteredReservations.length && filteredReservations.length > 0
                        ? <CheckSquare size={18} />
                        : <Square size={18} />}
                    </button>
                  </th>
                  <SortHeader field="ipAddress"   label="IP Address"     sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="clientId"    label="MAC (ClientID)" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="name"        label="Name"           sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="description" label="Description"    sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="6" className="p-8 text-center text-slate-500">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" /> Loading...
                  </td></tr>
                ) : filteredReservations.length === 0 ? (
                  <tr><td colSpan="6" className="p-8 text-center text-slate-500">
                    {search ? 'No reservations match search' : 'No reservations in this scope'}
                  </td></tr>
                ) : (
                  filteredReservations.map((r, i) => {
                    const selected = selectedReservations.has(r.ipAddress)
                    return (
                      <tr key={i} className={`border-t border-slate-700 hover:bg-slate-700/30 ${selected ? 'bg-blue-500/5' : ''}`}>
                        <td className="p-4">
                          <button onClick={() => toggleSelectReservation(r)}
                            className="text-slate-400 hover:text-blue-400">
                            {selected ? <CheckSquare size={18} className="text-blue-400" /> : <Square size={18} />}
                          </button>
                        </td>
                        <td className="p-4 font-mono">{r.ipAddress}</td>
                        <td className="p-4 font-mono text-slate-400">{r.clientId}</td>
                        <td className="p-4">{r.name || <span className="text-slate-600">—</span>}</td>
                        <td className="p-4 text-slate-400">{r.description || <span className="text-slate-600">—</span>}</td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setEditReservation(r)}
                              className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-blue-400" title="Edit">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDeleteReservation(r)}
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
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="p-4 w-10">
                    <button onClick={toggleSelectAllLeases} className="text-slate-400 hover:text-blue-400">
                      {selectedLeases.size === filteredLeases.length && filteredLeases.length > 0
                        ? <CheckSquare size={18} />
                        : <Square size={18} />}
                    </button>
                  </th>
                  <SortHeader field="ipAddress"       label="IP Address"    sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="clientId"        label="MAC"           sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="hostName"        label="Hostname"      sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="description"     label="Description"   sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="addressState"    label="State"         sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader field="leaseExpiryTime" label="Expires"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" className="p-8 text-center text-slate-500">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2" /> Loading...
                  </td></tr>
                ) : filteredLeases.length === 0 ? (
                  <tr><td colSpan="8" className="p-8 text-center text-slate-500">
                    {search ? 'No leases match search' : 'No active leases in this scope'}
                  </td></tr>
                ) : (
                  filteredLeases.map((l, i) => {
                    const selected = selectedLeases.has(l.ipAddress)
                    return (
                      <tr key={i} className={`border-t border-slate-700 hover:bg-slate-700/30 ${selected ? 'bg-blue-500/5' : ''}`}>
                        <td className="p-4">
                          <button onClick={() => toggleSelectLease(l)}
                            className="text-slate-400 hover:text-blue-400">
                            {selected ? <CheckSquare size={18} className="text-blue-400" /> : <Square size={18} />}
                          </button>
                        </td>
                        <td className="p-4 font-mono">{l.ipAddress}</td>
                        <td className="p-4 font-mono text-slate-400">{l.clientId}</td>
                        <td className="p-4">{l.hostName || <span className="text-slate-600">—</span>}</td>
                        <td className="p-4 text-slate-400">{l.description || <span className="text-slate-600">—</span>}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            l.addressState?.includes('Active') ? 'bg-green-500/20 text-green-400' :
                            l.addressState?.includes('Reservation') ? 'bg-blue-500/20 text-blue-400' :
                            'bg-slate-700 text-slate-300'
                          }`}>
                            {l.addressState}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400 text-xs">
                          {l.leaseExpiryTime ? new Date(l.leaseExpiryTime).toLocaleString() : '—'}
                        </td>
                        <td className="p-4 text-right">
                          <button onClick={() => handleReleaseLease(l)}
                            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-orange-400" title="Release lease">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="text-center py-16 text-slate-500 bg-slate-800 border border-slate-700 rounded-xl">
          <Wifi size={40} className="mx-auto mb-3 opacity-30" />
          <p>Select a scope to view reservations and leases</p>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateReservationModal
          scopeId={selectedScope}
          onClose={() => setShowCreate(false)}
          onSuccess={(msg) => { showMsg('success', msg); loadReservations(); setShowCreate(false) }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {/* Edit Modal */}
      {editReservation && (
        <EditReservationModal
          scopeId={selectedScope}
          reservation={editReservation}
          onClose={() => setEditReservation(null)}
          onSuccess={(msg) => { showMsg('success', msg); loadReservations(); setEditReservation(null) }}
          onError={(msg) => showMsg('error', msg)}
        />
      )}

      {/* Bulk Edit Description Modal */}
      {showBulkEditDesc && (
        <BulkEditDescriptionModal
          count={selectedReservations.size}
          onClose={() => setShowBulkEditDesc(false)}
          onSave={handleBulkEditDescription}
        />
      )}
    </div>
  )
}

// Tab Button
function TabButton({ active, onClick, icon: Icon, label, count }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2.5 font-medium border-b-2 transition flex items-center gap-2 ${
        active ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}>
      <Icon size={16} /> {label}
      <span className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">{count}</span>
    </button>
  )
}

// Sort Header
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

// Create Reservation Modal
function CreateReservationModal({ scopeId, onClose, onSuccess, onError }) {
  const [ip,          setIp]          = useState('')
  const [mac,         setMac]         = useState('')
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [saving,      setSaving]      = useState(false)

  const handleSave = async () => {
    if (!ip || !mac) { onError('IP and MAC are required'); return }
    setSaving(true)
    try {
      await createDhcpReservation(scopeId, { ip, mac, name, description })
      onSuccess(`Reservation created: ${ip}`)
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
              <h2 className="font-bold text-lg">Add Reservation</h2>
              <p className="text-xs text-slate-400">Scope: {scopeId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-2">IP Address <span className="text-red-400">*</span></label>
            <input type="text" value={ip} onChange={(e) => setIp(e.target.value)}
              placeholder="192.168.1.50"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg font-mono" />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">MAC Address <span className="text-red-400">*</span></label>
            <input type="text" value={mac} onChange={(e) => setMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg font-mono" />
            <p className="mt-1 text-xs text-slate-500">Any format accepted (dashes, colons, or plain)</p>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Server01"
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg" />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={2}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Saving...</> : <><Plus size={14} /> Create</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// Edit Reservation Modal
function EditReservationModal({ scopeId, reservation, onClose, onSuccess, onError }) {
  const [name,        setName]        = useState(reservation.name || '')
  const [description, setDescription] = useState(reservation.description || '')
  const [saving,      setSaving]      = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateDhcpReservation(scopeId, reservation.ipAddress, { name, description })
      onSuccess(`Updated reservation: ${reservation.ipAddress}`)
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
              <h2 className="font-bold text-lg">Edit Reservation</h2>
              <p className="text-xs text-slate-400">{reservation.ipAddress}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3 bg-slate-900 rounded-lg space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">IP Address:</span>
              <span className="text-slate-200 font-mono">{reservation.ipAddress}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">MAC (ClientID):</span>
              <span className="text-slate-200 font-mono">{reservation.clientId}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">IP and MAC cannot be changed. Delete and recreate to modify.</p>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg" />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg resize-none" />
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

// Bulk Edit Description Modal
function BulkEditDescriptionModal({ count, onClose, onSave }) {
  const [description, setDescription] = useState('')

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-600 rounded-lg flex items-center justify-center"><FileEdit size={18} /></div>
            <div>
              <h2 className="font-bold text-lg">Bulk Edit Description</h2>
              <p className="text-xs text-slate-400">Update {count} reservation(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                This will overwrite the description on <strong>{count}</strong> selected reservation(s) with the value below.
                Leave blank to clear descriptions.
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">New Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description or leave blank to clear..."
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Cancel</button>
          <button onClick={() => onSave(description)}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium">
            <FileEdit size={14} /> Apply to {count} Reservation(s)
          </button>
        </div>
      </div>
    </div>
  )
}