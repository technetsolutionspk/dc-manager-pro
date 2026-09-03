import { useState, useEffect } from 'react'
import {
  Wifi, RefreshCw, Server, Search, Plus, Trash2, Edit2, CheckCircle2,
  XCircle, AlertCircle, Copy, Check, Filter, ChevronUp, ChevronDown,
  Layers, Database, ArrowUpDown, ArrowUp, ArrowDown, Activity, Clock,
  MoreVertical, ShieldAlert, PieChart, Radio, TestTube
} from 'lucide-react'
import {
  getDhcpScopes, getDhcpReservations, createDhcpReservation,
  updateDhcpReservation, deleteDhcpReservation, getDhcpLeases,
  releaseDhcpLease, testDhcpConnection
} from '../api'

export default function DHCP() {
  const [scopes,          setScopes]          = useState([])
  const [selectedScope,   setSelectedScope]   = useState(null)
  const [activeTab,       setActiveTab]       = useState('reservations') // 'reservations' | 'leases'
  const [loadingScopes,   setLoadingScopes]   = useState(true)
  const [loadingData,     setLoadingData]     = useState(false)
  const [activeServer,    setActiveServer]    = useState('')
  const [testingConn,     setTestingConn]     = useState(false)
  const [message,         setMessage]         = useState(null)

  // Data
  const [reservations,    setReservations]    = useState([])
  const [leases,          setLeases]          = useState([])
  const [search,          setSearch]          = useState('')

  // Sorting
  const [resSortCol,      setResSortCol]      = useState('ipAddress')
  const [resSortAsc,      setResSortAsc]      = useState(true)
  const [leaseSortCol,    setLeaseSortCol]    = useState('ipAddress')
  const [leaseSortAsc,    setLeaseSortAsc]    = useState(true)

  // Selection
  const [selectedResIps,  setSelectedResIps]  = useState([])
  const [selectedLeaseIps,setSelectedLeaseIps]= useState([])

  // Modals
  const [showAddResModal, setShowAddResModal] = useState(false)
  const [showEditResModal,setShowEditResModal]= useState(false)
  const [showBulkDescModal,setShowBulkDescModal]=useState(false)
  const [editingRes,      setEditingRes]      = useState(null)
  const [resForm,         setResForm]         = useState({ ip: '', mac: '', name: '', description: '' })
  const [bulkDescText,    setBulkDescText]    = useState('')
  const [savingRes,       setSavingRes]       = useState(false)

  // Bulk Progress Modal
  const [bulkProgress,    setBulkProgress]    = useState(null) // { total, current, failed, active: bool, type: string }

  // Copy state
  const [copiedText,      setCopiedText]      = useState('')

  useEffect(() => {
    loadScopes()
  }, [])

  useEffect(() => {
    if (selectedScope) {
      loadData()
    }
  }, [selectedScope, activeTab])

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const loadScopes = async () => {
    setLoadingScopes(true)
    try {
      const data = await getDhcpScopes()
      setScopes(data.scopes || [])
      setActiveServer(data.activeServer || '')
      if (data.scopes && data.scopes.length > 0) {
        setSelectedScope(data.scopes[0])
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load DHCP scopes')
    }
    setLoadingScopes(false)
  }

  const loadData = async () => {
    if (!selectedScope) return
    setLoadingData(true)
    setSelectedResIps([])
    setSelectedLeaseIps([])
    try {
      if (activeTab === 'reservations') {
        const data = await getDhcpReservations(selectedScope.scopeId)
        // Normalize reservation keys
        const rawRes = data.reservations || []
        const normRes = rawRes.map(r => ({
          ipAddress: r.ipAddress || r.ip || '',
          clientId:  r.clientId  || r.mac || '',
          name:      r.name      || '',
          description: r.description || '',
          type:      r.type      || '',
          addressState: r.addressState || ''
        }))
        setReservations(normRes)
      } else {
        const data = await getDhcpLeases(selectedScope.scopeId)
        // Normalize lease keys
        const rawLeases = data.leases || []
        const normLeases = rawLeases.map(l => ({
          ipAddress:       l.ipAddress       || l.ip || '',
          clientId:        l.clientId        || l.mac || '',
          hostName:        l.hostName        || l.hostname || '',
          description:     l.description     || '',
          addressState:    l.addressState    || l.state || 'Active',
          leaseExpiryTime: l.leaseExpiryTime || l.leaseExpiry || 'Never'
        }))
        setLeases(normLeases)
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || `Failed to load ${activeTab}`)
    }
    setLoadingData(false)
  }

  const handleTestConn = async () => {
    setTestingConn(true)
    try {
      const res = await testDhcpConnection()
      if (res.connected) {
        showMsg('success', `✓ Connected to DHCP Server: ${res.activeServer || 'Success'}`)
      } else {
        showMsg('error', `✗ Connection failed: ${res.message}`)
      }
    } catch (err) {
      showMsg('error', 'DHCP test connection failed')
    }
    setTestingConn(false)
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(''), 2000)
  }

  // ── Reservation CRUD ─────────────────────────────────────
  const handleCreateRes = async () => {
    if (!resForm.ip || !resForm.mac) {
      showMsg('error', 'IP Address and MAC Address are required')
      return
    }
    setSavingRes(true)
    try {
      await createDhcpReservation(selectedScope.scopeId, resForm)
      showMsg('success', `✓ Reservation for ${resForm.ip} created`)
      setShowAddResModal(false)
      setResForm({ ip: '', mac: '', name: '', description: '' })
      await loadData()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to create reservation')
    }
    setSavingRes(false)
  }

  const handleUpdateRes = async () => {
    if (!editingRes) return
    setSavingRes(true)
    try {
      await updateDhcpReservation(selectedScope.scopeId, editingRes.ipAddress, {
        name: resForm.name,
        description: resForm.description
      })
      showMsg('success', `✓ Reservation ${editingRes.ipAddress} updated`)
      setShowEditResModal(false)
      setEditingRes(null)
      await loadData()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to update reservation')
    }
    setSavingRes(false)
  }

  const handleDeleteRes = async (ip) => {
    if (!window.confirm(`Delete reservation for IP ${ip}?`)) return
    try {
      await deleteDhcpReservation(selectedScope.scopeId, ip)
      showMsg('success', `✓ Reservation ${ip} deleted`)
      await loadData()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed')
    }
  }

  // ── Lease Delete / Release Single ────────────────────────
  const handleReleaseLease = async (ip) => {
    if (!window.confirm(`Release / Delete lease for IP ${ip}?`)) return
    try {
      await releaseDhcpLease(selectedScope.scopeId, ip)
      showMsg('success', `✓ Lease ${ip} released`)
      await loadData()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Release failed')
    }
  }

  // ── Bulk Actions: Reservations ───────────────────────────
  const handleBulkDeleteRes = async () => {
    if (selectedResIps.length === 0) return
    if (!window.confirm(`Delete ${selectedResIps.length} selected reservation(s)?`)) return

    setBulkProgress({ total: selectedResIps.length, current: 0, failed: 0, active: true, type: 'reservations' })
    let failedCount = 0

    for (let i = 0; i < selectedResIps.length; i++) {
      const ip = selectedResIps[i]
      try {
        await deleteDhcpReservation(selectedScope.scopeId, ip)
      } catch {
        failedCount++
      }
      setBulkProgress(prev => prev ? { ...prev, current: i + 1, failed: failedCount } : null)
    }

    setTimeout(async () => {
      setBulkProgress(null)
      showMsg('success', `✓ Bulk delete complete (${selectedResIps.length - failedCount} succeeded, ${failedCount} failed)`)
      await loadData()
    }, 500)
  }

  const handleBulkEditDescRes = async () => {
    if (selectedResIps.length === 0) return
    setSavingRes(true)
    setBulkProgress({ total: selectedResIps.length, current: 0, failed: 0, active: true, type: 'reservations' })
    let failedCount = 0

    for (let i = 0; i < selectedResIps.length; i++) {
      const ip = selectedResIps[i]
      try {
        await updateDhcpReservation(selectedScope.scopeId, ip, { description: bulkDescText })
      } catch {
        failedCount++
      }
      setBulkProgress(prev => prev ? { ...prev, current: i + 1, failed: failedCount } : null)
    }

    setTimeout(async () => {
      setBulkProgress(null)
      setShowBulkDescModal(false)
      setBulkDescText('')
      setSavingRes(false)
      showMsg('success', `✓ Updated descriptions for ${selectedResIps.length - failedCount} reservation(s)`)
      await loadData()
    }, 500)
  }

  // ── Bulk Actions: Leases ─────────────────────────────────
  const handleBulkDeleteLeases = async () => {
    if (selectedLeaseIps.length === 0) return
    if (!window.confirm(`Release / Delete ${selectedLeaseIps.length} selected lease(s)?`)) return

    setBulkProgress({ total: selectedLeaseIps.length, current: 0, failed: 0, active: true, type: 'leases' })
    let failedCount = 0

    for (let i = 0; i < selectedLeaseIps.length; i++) {
      const ip = selectedLeaseIps[i]
      try {
        await releaseDhcpLease(selectedScope.scopeId, ip)
      } catch {
        failedCount++
      }
      setBulkProgress(prev => prev ? { ...prev, current: i + 1, failed: failedCount } : null)
    }

    setTimeout(async () => {
      setBulkProgress(null)
      showMsg('success', `✓ Bulk lease release complete (${selectedLeaseIps.length - failedCount} succeeded, ${failedCount} failed)`)
      await loadData()
    }, 500)
  }

  // ── Sorting Helpers ──────────────────────────────────────
  const handleResSort = (col) => {
    if (resSortCol === col) {
      setResSortAsc(!resSortAsc)
    } else {
      setResSortCol(col)
      setResSortAsc(true)
    }
  }

  const handleLeaseSort = (col) => {
    if (leaseSortCol === col) {
      setLeaseSortAsc(!leaseSortAsc)
    } else {
      setLeaseSortCol(col)
      setLeaseSortAsc(true)
    }
  }

  // ── Filtering & Sorting ──────────────────────────────────
  const filteredReservations = reservations.filter(r =>
    (r.ipAddress || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.clientId || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    let valA = a[resSortCol] || ''
    let valB = b[resSortCol] || ''
    return resSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
  })

  const filteredLeases = leases.filter(l =>
    (l.ipAddress || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.clientId || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.hostName || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (l.addressState || '').toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    let valA = a[leaseSortCol] || ''
    let valB = b[leaseSortCol] || ''
    return leaseSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
  })

  // Select All Toggles
  const toggleSelectAllRes = () => {
    if (selectedResIps.length === filteredReservations.length) {
      setSelectedResIps([])
    } else {
      setSelectedResIps(filteredReservations.map(r => r.ipAddress))
    }
  }

  const toggleSelectAllLeases = () => {
    if (selectedLeaseIps.length === filteredLeases.length) {
      setSelectedLeaseIps([])
    } else {
      setSelectedLeaseIps(filteredLeases.map(l => l.ipAddress))
    }
  }

  const formatExpiry = (isoStr) => {
    if (!isoStr || isoStr === 'Never') return 'Never'
    try {
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return isoStr
      return d.toLocaleString()
    } catch {
      return isoStr
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Wifi size={32} className="text-blue-400" />
            DHCP Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage DHCP scopes, reservations, and active leases</p>
        </div>
        <div className="flex items-center gap-3">
          {activeServer && (
            <span className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-slate-300 flex items-center gap-2">
              <Server size={14} className="text-blue-400" />
              {activeServer}
            </span>
          )}
          <button
            onClick={handleTestConn}
            disabled={testingConn}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-2 transition disabled:opacity-50"
          >
            <TestTube size={14} className={testingConn ? 'animate-spin' : ''} />
            Test Connection
          </button>
          <button
            onClick={loadScopes}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-2 transition"
          >
            <RefreshCw size={14} className={loadingScopes ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl border ${
          message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Scope Selector Card */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-xl">
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Select DHCP Scope</label>
        {loadingScopes ? (
          <div className="py-6 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
            <RefreshCw size={18} className="animate-spin text-blue-400" /> Loading DHCP scopes...
          </div>
        ) : scopes.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">No DHCP scopes found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {scopes.map(s => {
              const isSelected = selectedScope?.scopeId === s.scopeId
              return (
                <button
                  key={s.scopeId}
                  onClick={() => setSelectedScope(s)}
                  className={`p-4 rounded-xl border text-left transition flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-white shadow-lg shadow-blue-500/10'
                      : 'bg-slate-900/50 border-slate-700/80 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-sm">{s.name || s.scopeId}</div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">{s.scopeId}</div>
                    <div className="text-xs text-slate-500 mt-1 font-mono">{s.startRange || s.startIp || '—'} - {s.endRange || s.endIp || '—'}</div>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    s.state === 'Active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {s.state}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Scope Statistics Panel */}
      {selectedScope && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Subnet Mask</div>
            <div className="text-xl font-bold font-mono text-slate-200">{selectedScope.subnetMask || '255.255.255.0'}</div>
            <div className="text-xs text-slate-500 mt-1">Scope Subnet Mask</div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Addresses In Use</div>
            <div className="text-xl font-bold font-mono text-blue-400">{selectedScope.addressesInUse || leases.length} Leases</div>
            <div className="text-xs text-slate-500 mt-1">Free: {selectedScope.addressesFree || 0} Addresses</div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Reservations</div>
            <div className="text-xl font-bold font-mono text-green-400">{reservations.length} Active</div>
            <div className="text-xs text-slate-500 mt-1">Configured IP Reservations</div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Lease Duration</div>
            <div className="text-xl font-bold font-mono text-slate-200">{selectedScope.leaseDurationHours ? `${selectedScope.leaseDurationHours} Hours` : '8 Days'}</div>
            <div className="text-xs text-slate-500 mt-1">Standard Scope Lease Time</div>
          </div>
        </div>
      )}

      {/* Selected Scope Details & Tabs */}
      {selectedScope && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-xl">

          {/* Scope Header Tabs Bar */}
          <div className="p-6 border-b border-slate-700 bg-slate-900/40 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Layers size={20} className="text-blue-400" />
                {selectedScope.name || selectedScope.scopeId}
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Scope ID: {selectedScope.scopeId} | Mask: {selectedScope.subnetMask}</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 bg-slate-900 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setActiveTab('reservations')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                  activeTab === 'reservations' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Reservations ({reservations.length})
              </button>
              <button
                onClick={() => setActiveTab('leases')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                  activeTab === 'leases' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Active Leases ({leases.length})
              </button>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between flex-wrap gap-4">
            {/* Search */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${activeTab} by IP, MAC, Name, Description...`}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs focus:outline-none focus:border-blue-500 text-slate-200"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {activeTab === 'reservations' ? (
                <>
                  {selectedResIps.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setBulkDescText('')
                          setShowBulkDescModal(true)
                        }}
                        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium flex items-center gap-1.5 transition"
                      >
                        <Edit2 size={14} /> Edit Desc ({selectedResIps.length})
                      </button>
                      <button
                        onClick={handleBulkDeleteRes}
                        className="px-3 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30 rounded-xl text-xs font-medium flex items-center gap-1.5 transition"
                      >
                        <Trash2 size={14} /> Delete Selected ({selectedResIps.length})
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setResForm({ ip: '', mac: '', name: '', description: '' })
                      setShowAddResModal(true)
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-md shadow-blue-600/20"
                  >
                    <Plus size={16} /> Add Reservation
                  </button>
                </>
              ) : (
                <>
                  {/* Bulk Delete for Leases */}
                  {selectedLeaseIps.length > 0 && (
                    <button
                      onClick={handleBulkDeleteLeases}
                      className="px-3.5 py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30 rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-md"
                    >
                      <Trash2 size={14} />
                      Release / Delete Selected ({selectedLeaseIps.length})
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Content Table */}
          {loadingData ? (
            <div className="py-16 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
              <RefreshCw size={24} className="animate-spin text-blue-400" />
              Loading {activeTab}...
            </div>
          ) : activeTab === 'reservations' ? (
            /* ═══ RESERVATIONS TABLE ═════════════════════════════ */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/60 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="p-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedResIps.length > 0 && selectedResIps.length === filteredReservations.length}
                        onChange={toggleSelectAllRes}
                        className="rounded border-slate-700 bg-slate-900 text-blue-600"
                      />
                    </th>
                    <SortHeader col="ipAddress" label="IP Address" current={resSortCol} asc={resSortAsc} onClick={handleResSort} />
                    <SortHeader col="clientId" label="MAC Address" current={resSortCol} asc={resSortAsc} onClick={handleResSort} />
                    <SortHeader col="name" label="Name" current={resSortCol} asc={resSortAsc} onClick={handleResSort} />
                    <SortHeader col="description" label="Description" current={resSortCol} asc={resSortAsc} onClick={handleResSort} />
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-xs font-mono">
                  {filteredReservations.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-500 font-sans">No reservations found for this scope</td>
                    </tr>
                  ) : (
                    filteredReservations.map(r => {
                      const isChecked = selectedResIps.includes(r.ipAddress)
                      return (
                        <tr key={r.ipAddress} className={`hover:bg-slate-700/30 transition ${isChecked ? 'bg-blue-600/10' : ''}`}>
                          <td className="p-4 font-sans">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedResIps(prev => isChecked ? prev.filter(x => x !== r.ipAddress) : [...prev, r.ipAddress])
                              }}
                              className="rounded border-slate-700 bg-slate-900 text-blue-600"
                            />
                          </td>
                          <td className="p-4 font-semibold text-slate-200">
                            <button onClick={() => copyToClipboard(r.ipAddress)} className="hover:text-blue-400 flex items-center gap-1.5" title="Copy IP">
                              {r.ipAddress}
                              {copiedText === r.ipAddress ? <Check size={12} className="text-green-400" /> : <Copy size={12} className="text-slate-600 opacity-0 group-hover:opacity-100" />}
                            </button>
                          </td>
                          <td className="p-4 text-slate-400">{r.clientId || '—'}</td>
                          <td className="p-4 text-slate-300 font-sans font-medium">{r.name || '—'}</td>
                          <td className="p-4 text-slate-400 font-sans truncate max-w-xs">{r.description || '—'}</td>
                          <td className="p-4 text-right font-sans flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingRes(r)
                                setResForm({ ip: r.ipAddress, mac: r.clientId, name: r.name || '', description: r.description || '' })
                                setShowEditResModal(true)
                              }}
                              className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition"
                              title="Edit Reservation"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteRes(r.ipAddress)}
                              className="p-1.5 hover:bg-red-500/20 rounded text-red-400 transition"
                              title="Delete Reservation"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* ═══ LEASES TABLE ═══════════════════════════════════ */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/60 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="p-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedLeaseIps.length > 0 && selectedLeaseIps.length === filteredLeases.length}
                        onChange={toggleSelectAllLeases}
                        className="rounded border-slate-700 bg-slate-900 text-blue-600"
                      />
                    </th>
                    <SortHeader col="ipAddress" label="IP Address" current={leaseSortCol} asc={leaseSortAsc} onClick={handleLeaseSort} />
                    <SortHeader col="clientId" label="MAC Address" current={leaseSortCol} asc={leaseSortAsc} onClick={handleLeaseSort} />
                    <SortHeader col="hostName" label="Hostname" current={leaseSortCol} asc={leaseSortAsc} onClick={handleLeaseSort} />
                    <SortHeader col="description" label="Description" current={leaseSortCol} asc={leaseSortAsc} onClick={handleLeaseSort} />
                    <SortHeader col="addressState" label="State" current={leaseSortCol} asc={leaseSortAsc} onClick={handleLeaseSort} />
                    <SortHeader col="leaseExpiryTime" label="Expires" current={leaseSortCol} asc={leaseSortAsc} onClick={handleLeaseSort} />
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50 text-xs font-mono">
                  {filteredLeases.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-500 font-sans">No active leases found for this scope</td>
                    </tr>
                  ) : (
                    filteredLeases.map(l => {
                      const isChecked = selectedLeaseIps.includes(l.ipAddress)
                      return (
                        <tr key={l.ipAddress} className={`hover:bg-slate-700/30 transition ${isChecked ? 'bg-blue-600/10' : ''}`}>
                          <td className="p-4 font-sans">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedLeaseIps(prev => isChecked ? prev.filter(x => x !== l.ipAddress) : [...prev, l.ipAddress])
                              }}
                              className="rounded border-slate-700 bg-slate-900 text-blue-600"
                            />
                          </td>
                          <td className="p-4 font-semibold text-slate-200">
                            <button onClick={() => copyToClipboard(l.ipAddress)} className="hover:text-blue-400 flex items-center gap-1.5" title="Copy IP">
                              {l.ipAddress}
                              {copiedText === l.ipAddress ? <Check size={12} className="text-green-400" /> : <Copy size={12} className="text-slate-600 opacity-0 group-hover:opacity-100" />}
                            </button>
                          </td>
                          <td className="p-4 text-slate-400">{l.clientId || '—'}</td>
                          <td className="p-4 text-slate-300 font-sans font-medium">{l.hostName || '—'}</td>
                          <td className="p-4 text-slate-400 font-sans truncate max-w-xs">{l.description || '—'}</td>
                          <td className="p-4 font-sans">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              l.addressState === 'Active' || l.addressState === 'ActiveLease' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                              l.addressState === 'Reservation' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-slate-700 text-slate-400'
                            }`}>
                              {l.addressState || 'Active'}
                            </span>
                          </td>
                          <td className="p-4 text-slate-400 font-sans">{formatExpiry(l.leaseExpiryTime)}</td>
                          <td className="p-4 text-right font-sans">
                            <button
                              onClick={() => handleReleaseLease(l.ipAddress)}
                              className="p-1.5 hover:bg-red-500/20 rounded text-red-400 transition"
                              title="Release / Delete Lease"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ ADD RESERVATION MODAL ═══════════════════════════ */}
      {showAddResModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold">Add DHCP Reservation</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">IP Address *</label>
                <input
                  type="text"
                  value={resForm.ip}
                  onChange={e => setResForm({ ...resForm, ip: e.target.value })}
                  placeholder="192.168.100.50"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">MAC Address *</label>
                <input
                  type="text"
                  value={resForm.mac}
                  onChange={e => setResForm({ ...resForm, mac: e.target.value })}
                  placeholder="00-11-22-33-44-55"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Name</label>
                <input
                  type="text"
                  value={resForm.name}
                  onChange={e => setResForm({ ...resForm, name: e.target.value })}
                  placeholder="e.g. Printer-Floor2"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Description</label>
                <input
                  type="text"
                  value={resForm.description}
                  onChange={e => setResForm({ ...resForm, description: e.target.value })}
                  placeholder="e.g. Reserved for HR Printer"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="pt-3 flex justify-end gap-3 text-xs border-t border-slate-700">
              <button
                onClick={() => setShowAddResModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRes}
                disabled={savingRes}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold flex items-center gap-2"
              >
                {savingRes ? <RefreshCw size={14} className="animate-spin" /> : null}
                Save Reservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT RESERVATION MODAL ══════════════════════════ */}
      {showEditResModal && editingRes && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold">Edit Reservation ({editingRes.ipAddress})</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Name</label>
                <input
                  type="text"
                  value={resForm.name}
                  onChange={e => setResForm({ ...resForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Description</label>
                <input
                  type="text"
                  value={resForm.description}
                  onChange={e => setResForm({ ...resForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="pt-3 flex justify-end gap-3 text-xs border-t border-slate-700">
              <button
                onClick={() => setShowEditResModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRes}
                disabled={savingRes}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold flex items-center gap-2"
              >
                {savingRes ? <RefreshCw size={14} className="animate-spin" /> : null}
                Update Reservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BULK EDIT DESCRIPTION MODAL ═════════════════════ */}
      {showBulkDescModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold">Edit Description for {selectedResIps.length} Reservation(s)</h2>
            <div className="text-xs">
              <label className="block text-slate-400 mb-1 font-semibold">New Description</label>
              <input
                type="text"
                value={bulkDescText}
                onChange={e => setBulkDescText(e.target.value)}
                placeholder="Enter description to apply to all selected"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="pt-3 flex justify-end gap-3 text-xs border-t border-slate-700">
              <button
                onClick={() => setShowBulkDescModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkEditDescRes}
                disabled={savingRes}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold flex items-center gap-2"
              >
                {savingRes ? <RefreshCw size={14} className="animate-spin" /> : null}
                Apply to All Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BULK PROGRESS MODAL ═════════════════════════════ */}
      {bulkProgress && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <RefreshCw size={36} className="animate-spin text-blue-400 mx-auto" />
            <h3 className="font-bold text-base">Processing Bulk Operations</h3>
            <p className="text-xs text-slate-400">
              Processing item {bulkProgress.current} of {bulkProgress.total}...
            </p>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700">
              <div
                className="bg-blue-600 h-full transition-all duration-200"
                style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Reusable Sortable Column Header Component ──────────────
function SortHeader({ col, label, current, asc, onClick }) {
  const isCurrent = current === col
  return (
    <th
      className="p-4 cursor-pointer hover:text-white transition select-none"
      onClick={() => onClick(col)}
    >
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        {isCurrent ? (
          asc ? <ArrowUp size={13} className="text-blue-400" /> : <ArrowDown size={13} className="text-blue-400" />
        ) : (
          <ArrowUpDown size={13} className="text-slate-600" />
        )}
      </div>
    </th>
  )
}