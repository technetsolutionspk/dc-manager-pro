import { useState, useEffect } from 'react'
import {
  Shield, RefreshCw, Search, Link as LinkIcon, FileText,
  CheckCircle, XCircle, AlertCircle, Calendar, FolderOpen,
  Eye, Download, Filter, X, ChevronRight
} from 'lucide-react'
import { getGPOs, getGPOLinks } from '../api'

export default function GPO() {
  const [gpos, setGpos]           = useState([])
  const [links, setLinks]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [activeTab, setActiveTab] = useState('gpos')
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage]     = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const [gposData, linksData] = await Promise.all([
        getGPOs(),
        getGPOLinks()
      ])
      setGpos(gposData.gpos || [])
      setLinks(linksData.links || [])
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load GPOs')
    }
    setLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  // Filter GPOs
  const filteredGpos = gpos.filter(g => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) &&
        !g.guid.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Get GPO name by GUID
  const getGpoName = (guid) => {
    const cleaned = guid.replace('{', '').replace('}', '')
    const gpo = gpos.find(g =>
      g.guid.replace('{', '').replace('}', '') === cleaned
    )
    return gpo ? gpo.name : guid
  }

  // Stats
  const stats = {
    total: gpos.length,
    enabled: gpos.filter(g => g.status === 'enabled').length,
    disabled: gpos.filter(g => g.status === 'disabled').length,
    partial: gpos.filter(g => g.status === 'user-disabled' || g.status === 'computer-disabled').length,
    linked: links.length,
  }

  // Export
  const handleExport = () => {
    const headers = ['Name', 'GUID', 'Status', 'Version', 'User Enabled', 'Computer Enabled', 'Created', 'Modified']
    const rows = filteredGpos.map(g => [
      g.name, g.guid, g.status, g.version,
      g.userEnabled, g.computerEnabled, g.created, g.modified
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gpos-${Date.now()}.csv`
    a.click()
    showMsg('success', `Exported ${filteredGpos.length} GPOs`)
  }

  return (
    <div className="p-8">
      {/* ── Header ──────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            <Shield size={28} className="text-purple-400" />
            Group Policy Objects
          </h1>
          <p className="text-slate-400">View and manage Group Policy Objects</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-2">
            <Download size={16} /> Export CSV
          </button>
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

      {/* ── Stats Cards ─────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard icon={Shield} label="Total GPOs" value={stats.total} color="purple" />
        <StatCard icon={CheckCircle} label="Enabled" value={stats.enabled} color="green" />
        <StatCard icon={XCircle} label="Disabled" value={stats.disabled} color="red" />
        <StatCard icon={AlertCircle} label="Partial" value={stats.partial} color="yellow" />
        <StatCard icon={LinkIcon} label="Linked to OUs" value={stats.linked} color="blue" />
      </div>

      {/* ── Tabs ────────────────────────────────── */}
      <div className="mb-6 flex gap-2 border-b border-slate-700">
        <button
          onClick={() => setActiveTab('gpos')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'gpos'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield size={16} className="inline mr-2" />
          All GPOs ({gpos.length})
        </button>
        <button
          onClick={() => setActiveTab('links')}
          className={`px-4 py-2 font-medium border-b-2 transition ${
            activeTab === 'links'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <LinkIcon size={16} className="inline mr-2" />
          OU Links ({links.length})
        </button>
      </div>

      {/* ── GPOs Tab ──────────────────────────── */}
      {activeTab === 'gpos' && (
        <>
          <div className="mb-6 flex gap-2 flex-wrap">
            <div className="flex-1 relative min-w-[300px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search GPOs by name or GUID..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="flex gap-2 items-center bg-slate-800 border border-slate-700 rounded-lg px-3">
              <Filter size={16} className="text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent py-2 focus:outline-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
                <option value="user-disabled">User Disabled</option>
                <option value="computer-disabled">Computer Disabled</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
              <RefreshCw size={48} className="mx-auto mb-3 animate-spin" />
              <p>Loading GPOs...</p>
            </div>
          ) : filteredGpos.length === 0 ? (
            <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
              <Shield size={48} className="mx-auto mb-3 text-slate-600" />
              <p>{search ? 'No GPOs match your search' : 'No GPOs found'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGpos.map(g => (
                <GPOCard key={g.id} gpo={g} links={links} onView={() => setSelected(g)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Links Tab ──────────────────────────── */}
      {activeTab === 'links' && (
        <>
          {loading ? (
            <div className="text-center text-slate-500 py-12">
              <RefreshCw size={48} className="mx-auto mb-3 animate-spin" />
              <p>Loading links...</p>
            </div>
          ) : links.length === 0 ? (
            <div className="text-center text-slate-500 py-12 bg-slate-800 border border-slate-700 rounded-xl">
              <LinkIcon size={48} className="mx-auto mb-3 text-slate-600" />
              <p>No GPO links found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {links.map((link, i) => (
                <LinkCard key={i} link={link} getGpoName={getGpoName} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modal ──────────────────────────────── */}
      {selected && (
        <GPODetailModal
          gpo={selected}
          links={links.filter(l => l.gpos.some(g => g.guid.includes(selected.guid)))}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    green:  'text-green-400 bg-green-500/10 border-green-500/30',
    red:    'text-red-400 bg-red-500/10 border-red-500/30',
    yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    blue:   'text-blue-400 bg-blue-500/10 border-blue-500/30',
  }
  return (
    <div className={`p-4 rounded-lg border ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon size={18} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// GPO Card
// ─────────────────────────────────────────────────────────
function GPOCard({ gpo, links, onView }) {
  const linkCount = links.filter(l =>
    l.gpos.some(g => g.guid.includes(gpo.guid.replace('{', '').replace('}', '')))
  ).length

  const statusColors = {
    enabled: 'bg-green-500/20 text-green-400',
    disabled: 'bg-red-500/20 text-red-400',
    'user-disabled': 'bg-yellow-500/20 text-yellow-400',
    'computer-disabled': 'bg-orange-500/20 text-orange-400',
  }

  const statusLabels = {
    enabled: 'Enabled',
    disabled: 'Disabled',
    'user-disabled': 'User Disabled',
    'computer-disabled': 'Computer Disabled',
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-purple-500/50 transition cursor-pointer"
         onClick={onView}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 bg-purple-500/20 rounded-lg">
          <Shield size={20} className="text-purple-400" />
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[gpo.status] || 'bg-slate-500/20 text-slate-400'}`}>
          {statusLabels[gpo.status] || gpo.status}
        </span>
      </div>

      <h3 className="font-bold mb-2 truncate" title={gpo.name}>{gpo.name}</h3>
      <p className="text-xs text-slate-400 font-mono truncate mb-3" title={gpo.guid}>
        {gpo.guid}
      </p>

      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <span className={gpo.userEnabled ? 'text-green-400' : 'text-red-400'}>●</span>
            User Settings
          </span>
          <span>{gpo.userEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <span className={gpo.computerEnabled ? 'text-green-400' : 'text-red-400'}>●</span>
            Computer Settings
          </span>
          <span>{gpo.computerEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <LinkIcon size={10} /> Linked OUs
          </span>
          <span className={linkCount > 0 ? 'text-blue-400 font-medium' : ''}>{linkCount}</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span>Version</span>
          <span>{gpo.version}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between text-xs text-slate-500">
        <span>{gpo.modified ? new Date(gpo.modified).toLocaleDateString() : '—'}</span>
        <button className="text-purple-400 hover:text-purple-300 flex items-center gap-1">
          View Details <ChevronRight size={12} />
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Link Card
// ─────────────────────────────────────────────────────────
function LinkCard({ link, getGpoName }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
          <FolderOpen size={20} className="text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg">{link.ou}</h3>
          <p className="text-xs text-slate-400 font-mono truncate" title={link.dn}>{link.dn}</p>
        </div>
        <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded text-sm font-medium">
          {link.gpos.length} GPO{link.gpos.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Linked GPOs:</div>
        {link.gpos.map((gpo, i) => (
          <div key={i} className="flex items-center justify-between p-2 bg-slate-900 rounded-lg">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Shield size={14} className="text-purple-400 flex-shrink-0" />
              <span className="text-sm truncate">{getGpoName(gpo.guid)}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {gpo.enforced && (
                <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-xs">
                  Enforced
                </span>
              )}
              {gpo.enabled ? (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                  Enabled
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                  Disabled
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// GPO Detail Modal
// ─────────────────────────────────────────────────────────
function GPODetailModal({ gpo, links, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4 pb-4 border-b border-slate-700">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <Shield size={24} className="text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold">{gpo.name}</h3>
              <p className="text-xs text-slate-400 font-mono mt-1">{gpo.guid}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Status */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <InfoBox label="Status" value={gpo.status} />
          <InfoBox label="Version" value={gpo.version} />
          <InfoBox label="User Settings" value={gpo.userEnabled ? 'Enabled' : 'Disabled'}
                   color={gpo.userEnabled ? 'green' : 'red'} />
          <InfoBox label="Computer Settings" value={gpo.computerEnabled ? 'Enabled' : 'Disabled'}
                   color={gpo.computerEnabled ? 'green' : 'red'} />
        </div>

        {/* Path */}
        <div className="mb-4 p-3 bg-slate-900 rounded-lg">
          <div className="text-xs text-slate-500 mb-1">SYSVOL Path</div>
          <div className="text-sm font-mono break-all">{gpo.path || 'N/A'}</div>
        </div>

        {/* DN */}
        <div className="mb-4 p-3 bg-slate-900 rounded-lg">
          <div className="text-xs text-slate-500 mb-1">Distinguished Name</div>
          <div className="text-sm font-mono break-all">{gpo.dn}</div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3 bg-slate-900 rounded-lg">
            <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">
              <Calendar size={12} /> Created
            </div>
            <div className="text-sm">{gpo.created ? new Date(gpo.created).toLocaleString() : '—'}</div>
          </div>
          <div className="p-3 bg-slate-900 rounded-lg">
            <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">
              <Calendar size={12} /> Modified
            </div>
            <div className="text-sm">{gpo.modified ? new Date(gpo.modified).toLocaleString() : '—'}</div>
          </div>
        </div>

        {/* Linked OUs */}
        <div className="mb-4">
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <LinkIcon size={16} className="text-blue-400" />
            Linked to {links.length} OU{links.length !== 1 ? 's' : ''}
          </div>
          {links.length === 0 ? (
            <div className="p-4 bg-slate-900 rounded-lg text-center text-slate-500 text-sm">
              This GPO is not linked to any OU
            </div>
          ) : (
            <div className="space-y-2">
              {links.map((link, i) => {
                const linkInfo = link.gpos.find(g => g.guid.includes(gpo.guid.replace('{', '').replace('}', '')))
                return (
                  <div key={i} className="p-3 bg-slate-900 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FolderOpen size={14} className="text-blue-400" />
                      <span className="text-sm">{link.ou}</span>
                    </div>
                    <div className="flex gap-2">
                      {linkInfo?.enforced && (
                        <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded text-xs">
                          Enforced
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        linkInfo?.enabled
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {linkInfo?.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-300">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <strong>Note:</strong> To edit GPO settings, use the Group Policy Management Console (gpmc.msc) on your Domain Controller.
              This page is read-only for viewing GPO information.
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6 pt-4 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoBox({ label, value, color }) {
  const colors = {
    green: 'text-green-400',
    red: 'text-red-400',
  }
  return (
    <div className="p-3 bg-slate-900 rounded-lg">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-sm font-medium ${color ? colors[color] : ''}`}>{value}</div>
    </div>
  )
}