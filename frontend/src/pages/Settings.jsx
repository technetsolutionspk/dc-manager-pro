import { useState, useEffect } from 'react'
import {
  Save, TestTube, CheckCircle, XCircle, Database, Eye, EyeOff,
  Mail, Lock, Bell, Server, Settings as SettingsIcon,
  AlertCircle, Send, RefreshCw, ToggleLeft, ToggleRight,
  Globe, Plus, Trash2, Edit2, Star, ChevronDown, ChevronUp,
  Shield, X
} from 'lucide-react'
import {
  getSettings, updateSettings, testConnection, sendTestEmail,
  getFullDomains, createDomain, updateDomain, deleteDomain,
  testDomainConnection, setDefaultDomain
} from '../api'

export default function Settings() {
  const [settings,     setSettings]     = useState({})
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [testing,      setTesting]      = useState(false)
  const [message,      setMessage]      = useState(null)
  const [connected,    setConnected]    = useState(null)
  const [showPwd,      setShowPwd]      = useState(false)
  const [showSmtpPwd,  setShowSmtpPwd]  = useState(false)
  const [activeTab,    setActiveTab]    = useState('domains')

  // Domain management state
  const [domains,       setDomains]       = useState([])
  const [domainsLoading,setDomainsLoading]= useState(false)
  const [showDomainModal,setShowDomainModal] = useState(false)
  const [editingDomain,  setEditingDomain]   = useState(null)
  const [domainForm,     setDomainForm]      = useState(defaultDomainForm())
  const [domainSaving,   setDomainSaving]    = useState(false)
  const [domainTesting,  setDomainTesting]   = useState(false)
  const [showDomainPwd,  setShowDomainPwd]   = useState(false)
  const [testingId,      setTestingId]       = useState(null)
  const [settingDefaultId, setSettingDefaultId] = useState(null)

  useEffect(() => { load() }, [])
  useEffect(() => { if (activeTab === 'domains') loadDomains() }, [activeTab])

  function defaultDomainForm() {
    return {
      name:                  '',
      ad_server_primary:     '',
      ad_server_secondary:   '',
      ad_domain:             '',
      ad_base_dn:            '',
      ad_service_account:    '',
      ad_service_password:   '',
      ad_use_ldaps:          true,
      ad_port:               636,
      ad_default_user_ou:    '',
      dns_server_primary:    '',
      dns_server_secondary:  '',
      dhcp_server_primary:   '',
      dhcp_server_secondary: '',
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await getSettings()
      setSettings(data)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to load settings')
    }
    setLoading(false)
  }

  const loadDomains = async () => {
    setDomainsLoading(true)
    try {
      const data = await getFullDomains()
      setDomains(data.domains || [])
    } catch (err) {
      showMsg('error', 'Failed to load domain profiles')
    }
    setDomainsLoading(false)
  }

  const showMsg = (type, text) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setConnected(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings(settings)
      showMsg('success', '✓ Settings saved successfully!')
      await load()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Save failed')
    }
    setSaving(false)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setConnected(null)
    try {
      const result = await testConnection(settings)
      setConnected(true)
      showMsg('success', `✓ ${result.message}`)
    } catch (err) {
      setConnected(false)
      showMsg('error', err.response?.data?.detail || 'Connection failed')
    }
    setTesting(false)
  }

  const handleTestEmail = async () => {
    const to = settings.notify_admin_email
    if (!to) { showMsg('error', 'Set "Admin Email" first'); return }
    try {
      await sendTestEmail(to)
      showMsg('success', `✓ Test email sent to ${to}`)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Email test failed')
    }
  }

  // ── Domain Modal Helpers ─────────────────────────────────
  const openAddDomain = () => {
    setEditingDomain(null)
    setDomainForm(defaultDomainForm())
    setShowDomainPwd(false)
    setShowDomainModal(true)
  }

  const openEditDomain = (d) => {
    setEditingDomain(d)
    setDomainForm({
      name:                  d.name,
      ad_server_primary:     d.ad_server_primary,
      ad_server_secondary:   d.ad_server_secondary || '',
      ad_domain:             d.ad_domain,
      ad_base_dn:            d.ad_base_dn,
      ad_service_account:    d.ad_service_account,
      ad_service_password:   '********',
      ad_use_ldaps:          d.ad_use_ldaps,
      ad_port:               d.ad_port,
      ad_default_user_ou:    d.ad_default_user_ou || '',
      dns_server_primary:    d.dns_server_primary || '',
      dns_server_secondary:  d.dns_server_secondary || '',
      dhcp_server_primary:   d.dhcp_server_primary || '',
      dhcp_server_secondary: d.dhcp_server_secondary || '',
    })
    setShowDomainPwd(false)
    setShowDomainModal(true)
  }

  const closeDomainModal = () => {
    setShowDomainModal(false)
    setEditingDomain(null)
    setDomainForm(defaultDomainForm())
  }

  const handleDomainFormChange = (key, value) => {
    setDomainForm(prev => {
      const next = { ...prev, [key]: value }
      // Auto-set port when toggling LDAPS
      if (key === 'ad_use_ldaps') {
        next.ad_port = value ? 636 : 389
      }
      return next
    })
  }

  const handleDomainSave = async () => {
    if (!domainForm.name.trim())               { showMsg('error', 'Domain display name is required');  return }
    if (!domainForm.ad_server_primary.trim())  { showMsg('error', 'Primary DC is required');           return }
    if (!domainForm.ad_domain.trim())          { showMsg('error', 'Domain name is required');          return }
    if (!domainForm.ad_base_dn.trim())         { showMsg('error', 'Base DN is required');              return }
    if (!domainForm.ad_service_account.trim()) { showMsg('error', 'Service account is required');      return }
    if (!editingDomain && !domainForm.ad_service_password.trim()) {
      showMsg('error', 'Password is required for new domains')
      return
    }

    setDomainSaving(true)
    try {
      if (editingDomain) {
        await updateDomain(editingDomain.id, domainForm)
        showMsg('success', `✓ Domain '${domainForm.name}' updated`)
      } else {
        await createDomain(domainForm)
        showMsg('success', `✓ Domain '${domainForm.name}' created`)
      }
      closeDomainModal()
      await loadDomains()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Save failed')
    }
    setDomainSaving(false)
  }

  const handleDomainTest = async (d) => {
    setTestingId(d.id)
    try {
      const result = await testDomainConnection(d.id, {})
      showMsg('success', `✓ Connected to ${d.name}: ${result.message}`)
    } catch (err) {
      showMsg('error', `✗ ${d.name}: ${err.response?.data?.detail || 'Connection failed'}`)
    }
    setTestingId(null)
  }

  const handleDomainModalTest = async () => {
    setDomainTesting(true)
    try {
      const payload = { ...domainForm }
      if (editingDomain) {
        await testDomainConnection(editingDomain.id, payload)
      } else {
        // For new domain use test-connection with custom settings
        const result = await testConnection({
          ad_server_primary:  domainForm.ad_server_primary,
          ad_port:            domainForm.ad_port,
          ad_use_ldaps:       domainForm.ad_use_ldaps ? 'true' : 'false',
          ad_service_account: domainForm.ad_service_account,
          ad_service_password:domainForm.ad_service_password,
          ad_base_dn:         domainForm.ad_base_dn,
        })
        showMsg('success', `✓ Connected: ${result.message}`)
        setDomainTesting(false)
        return
      }
      showMsg('success', `✓ Connection successful`)
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Connection failed')
    }
    setDomainTesting(false)
  }

  const handleSetDefault = async (d) => {
    setSettingDefaultId(d.id)
    try {
      await setDefaultDomain(d.id)
      showMsg('success', `✓ '${d.name}' is now the default domain`)
      await loadDomains()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Failed to set default')
    }
    setSettingDefaultId(null)
  }

  const handleDeleteDomain = async (d) => {
    if (d.is_default) { showMsg('error', 'Cannot delete the default domain'); return }
    if (!window.confirm(`Delete domain '${d.name}'? This cannot be undone.`)) return
    try {
      await deleteDomain(d.id)
      showMsg('success', `✓ Domain '${d.name}' deleted`)
      await loadDomains()
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Delete failed')
    }
  }

  // ── Loading screen ───────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-slate-500 py-16">
          <RefreshCw size={48} className="mx-auto mb-3 animate-spin" />
          <p>Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            <SettingsIcon size={28} className="text-slate-400" />
            Settings
          </h1>
          <p className="text-slate-400">Configure DC Manager Pro</p>
        </div>
        {connected !== null && (
          <span className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-2 ${
            connected
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}>
            {connected ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {connected ? 'Connected' : 'Connection Failed'}
          </span>
        )}
      </div>

      {/* ── Message ─────────────────────────────────────── */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-500/10 border border-green-500/30 text-green-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="mb-6 flex gap-1 border-b border-slate-700 overflow-x-auto">
        <TabButton active={activeTab === 'domains'}    onClick={() => setActiveTab('domains')}
                   icon={Globe}     label="Domains" />
        <TabButton active={activeTab === 'ad'}         onClick={() => setActiveTab('ad')}
                   icon={Database}  label="Active Directory" />
        <TabButton active={activeTab === 'visibility'} onClick={() => setActiveTab('visibility')}
                   icon={Eye}       label="Visibility" />
        <TabButton active={activeTab === 'password'}   onClick={() => setActiveTab('password')}
                   icon={Lock}      label="Password Policy" />
        <TabButton active={activeTab === 'email'}      onClick={() => setActiveTab('email')}
                   icon={Mail}      label="Email" />
      </div>

      {/* ═══ Domains Tab ════════════════════════════════ */}
      {activeTab === 'domains' && (
        <div className="space-y-4">

          {/* Info banner */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
            <div className="flex items-start gap-3">
              <Globe size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-300 mb-1">Multi-Domain Management</h3>
                <p className="text-sm text-slate-300">
                  Configure multiple Active Directory domains. Users select their domain on the
                  login page. Admins can switch domains from the top header bar. Each domain
                  has its own service account credentials and connection settings.
                </p>
              </div>
            </div>
          </div>

          {/* Header row */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Globe size={20} className="text-blue-400" />
              Domain Profiles
              <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full">
                {domains.length}
              </span>
            </h2>
            <button
              onClick={openAddDomain}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
            >
              <Plus size={16} />
              Add Domain
            </button>
          </div>

          {/* Loading */}
          {domainsLoading && (
            <div className="text-center py-12 text-slate-500">
              <RefreshCw size={32} className="mx-auto mb-2 animate-spin" />
              <p>Loading domains...</p>
            </div>
          )}

          {/* Domain cards */}
          {!domainsLoading && domains.length === 0 && (
            <div className="text-center py-16 text-slate-500 bg-slate-800 border border-slate-700 rounded-xl">
              <Globe size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium mb-1">No domains configured</p>
              <p className="text-sm">Click "Add Domain" to configure your first domain</p>
            </div>
          )}

          {!domainsLoading && domains.map((d) => (
            <div
              key={d.id}
              className={`bg-slate-800 border rounded-xl p-5 transition ${
                d.is_default
                  ? 'border-blue-500/50 shadow-lg shadow-blue-500/10'
                  : 'border-slate-700'
              }`}
            >
              <div className="flex items-start gap-4">

                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  d.is_default ? 'bg-blue-600' : 'bg-slate-700'
                }`}>
                  <Globe size={18} className={d.is_default ? 'text-white' : 'text-slate-400'} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-white">{d.name}</h3>
                    {d.is_default && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full border border-blue-500/30">
                        <Star size={10} />
                        Default
                      </span>
                    )}
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      d.ad_use_ldaps
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                    }`}>
                      {d.ad_use_ldaps ? '🔒 LDAPS' : 'LDAP'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <InfoRow label="Domain"      value={d.ad_domain} />
                    <InfoRow label="Primary DC"  value={`${d.ad_server_primary}:${d.ad_port}`} />
                    <InfoRow label="Base DN"     value={d.ad_base_dn} />
                    <InfoRow label="Service Acct"value={d.ad_service_account} />
                    {d.ad_server_secondary && (
                      <InfoRow label="Secondary DC" value={d.ad_server_secondary} />
                    )}
                    {d.ad_default_user_ou && (
                      <InfoRow label="Default OU" value={d.ad_default_user_ou} />
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2 flex-shrink-0">

                  {/* Test connection */}
                  <button
                    onClick={() => handleDomainTest(d)}
                    disabled={testingId === d.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition disabled:opacity-50"
                    title="Test connection"
                  >
                    {testingId === d.id
                      ? <RefreshCw size={12} className="animate-spin" />
                      : <TestTube size={12} />
                    }
                    Test
                  </button>

                  {/* Set as default */}
                  {!d.is_default && (
                    <button
                      onClick={() => handleSetDefault(d)}
                      disabled={settingDefaultId === d.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-xs transition disabled:opacity-50"
                      title="Set as default domain"
                    >
                      {settingDefaultId === d.id
                        ? <RefreshCw size={12} className="animate-spin" />
                        : <Star size={12} />
                      }
                      Default
                    </button>
                  )}

                  {/* Edit */}
                  <button
                    onClick={() => openEditDomain(d)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs transition"
                    title="Edit domain"
                  >
                    <Edit2 size={12} />
                    Edit
                  </button>

                  {/* Delete */}
                  {!d.is_default && (
                    <button
                      onClick={() => handleDeleteDomain(d)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition"
                      title="Delete domain"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Active Directory Tab ═══════════════════════ */}
      {activeTab === 'ad' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Database size={20} className="text-blue-400" />
            Active Directory Connection
          </h2>
          <p className="text-sm text-slate-400 mb-5">
            These are global fallback settings. Domain-specific settings are managed in the
            <button
              onClick={() => setActiveTab('domains')}
              className="text-blue-400 hover:text-blue-300 ml-1 underline"
            >
              Domains tab
            </button>.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Primary DC IP / Hostname"  value={settings.ad_server_primary}   onChange={v => handleChange('ad_server_primary', v)}   placeholder="192.168.200.10" required />
            <Field label="Secondary DC (failover)"   value={settings.ad_server_secondary}  onChange={v => handleChange('ad_server_secondary', v)}  placeholder="Optional" />
            <Field label="Domain Name"               value={settings.ad_domain}            onChange={v => handleChange('ad_domain', v)}            placeholder="company.local" required />
            <Field label="Service Account (UPN)"     value={settings.ad_service_account}   onChange={v => handleChange('ad_service_account', v)}   placeholder="svc-dcmanager@company.local" required />
            <Field label="Base DN"                   value={settings.ad_base_dn}           onChange={v => handleChange('ad_base_dn', v)}           placeholder="DC=company,DC=local" fullWidth required />
            <Field label="Default User OU"           value={settings.ad_default_user_ou}   onChange={v => handleChange('ad_default_user_ou', v)}   placeholder="OU=Users,DC=company,DC=local" fullWidth />

            {/* Password */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                Service Account Password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={settings.ad_service_password || ''}
                  onChange={(e) => handleChange('ad_service_password', e.target.value)}
                  placeholder="Leave masked to keep current"
                  className="w-full px-4 py-2.5 pr-12 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Protocol */}
            <div>
              <label className="block text-sm text-slate-400 mb-2">Protocol</label>
              <div className="flex gap-4 py-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={settings.ad_use_ldaps === 'true'}
                    onChange={() => { handleChange('ad_use_ldaps','true'); handleChange('ad_port','636') }} />
                  <span className="text-sm">🔒 LDAPS (636)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={settings.ad_use_ldaps === 'false'}
                    onChange={() => { handleChange('ad_use_ldaps','false'); handleChange('ad_port','389') }} />
                  <span className="text-sm">LDAP (389)</span>
                </label>
              </div>
            </div>

            <Field label="Port" type="number" value={settings.ad_port} onChange={v => handleChange('ad_port', v)} />
          </div>

          <div className="mt-6 flex gap-3 justify-end pt-6 border-t border-slate-700">
            <button onClick={handleTestConnection} disabled={testing}
              className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2 disabled:opacity-50">
              <TestTube size={16} />
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 disabled:opacity-50">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Visibility Tab ═════════════════════════════ */}
      {activeTab === 'visibility' && (
        <div className="space-y-6">
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
                <Eye size={20} className="text-blue-400" />
              </div>
              <div>
                <h3 className="font-medium text-blue-300 mb-1">Hide Built-in AD Objects</h3>
                <p className="text-sm text-slate-300">
                  Control visibility of built-in Windows accounts, groups, and containers.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
              <Eye size={20} className="text-cyan-400" />
              Built-in Object Visibility
            </h2>
            <div className="space-y-3">
              <ToggleRow label="Show Built-in Users"
                description="Display Administrator, Guest, krbtgt, etc. in user lists"
                value={settings.show_builtin_users === 'true'}
                onChange={(v) => handleChange('show_builtin_users', v ? 'true' : 'false')}
                examples={['Administrator', 'Guest', 'krbtgt', 'DefaultAccount']} />
              <ToggleRow label="Show Built-in Groups"
                description="Display Domain Admins, Domain Users, Schema Admins, etc."
                value={settings.show_builtin_groups === 'true'}
                onChange={(v) => handleChange('show_builtin_groups', v ? 'true' : 'false')}
                examples={['Domain Admins', 'Domain Users', 'Enterprise Admins', 'Schema Admins']} />
              <ToggleRow label="Show Built-in Containers"
                description="Display objects from CN=Users, CN=Builtin, CN=Computers, etc."
                value={settings.show_builtin_containers === 'true'}
                onChange={(v) => handleChange('show_builtin_containers', v ? 'true' : 'false')}
                examples={['CN=Users', 'CN=Builtin', 'CN=Computers', 'CN=System']} />
            </div>
            <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Recommendation:</strong> Keep these hidden in production to avoid
                  accidentally modifying critical system accounts.
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end pt-6 border-t border-slate-700">
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 rounded-lg flex items-center gap-2 disabled:opacity-50">
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Visibility Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Password Policy Tab ════════════════════════ */}
      {activeTab === 'password' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Lock size={20} className="text-yellow-400" />
            Password Policy Display
          </h2>
          <p className="text-sm text-slate-400 mb-5">
            Display purposes only. Actual policy is enforced by your Domain Controller.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Minimum Length"        type="number" value={settings.pwd_min_length}    onChange={v => handleChange('pwd_min_length', v)} />
            <Field label="Max Password Age (days)" type="number" value={settings.pwd_max_age_days} onChange={v => handleChange('pwd_max_age_days', v)} />
            <Field label="Password History Count"  type="number" value={settings.pwd_history_count} onChange={v => handleChange('pwd_history_count', v)} fullWidth />
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <CheckboxRow label="Require Uppercase Letter"  value={settings.pwd_require_upper   === 'true'} onChange={(v) => handleChange('pwd_require_upper',   v ? 'true' : 'false')} />
              <CheckboxRow label="Require Lowercase Letter"  value={settings.pwd_require_lower   === 'true'} onChange={(v) => handleChange('pwd_require_lower',   v ? 'true' : 'false')} />
              <CheckboxRow label="Require Number"            value={settings.pwd_require_number  === 'true'} onChange={(v) => handleChange('pwd_require_number',  v ? 'true' : 'false')} />
              <CheckboxRow label="Require Special Character" value={settings.pwd_require_special === 'true'} onChange={(v) => handleChange('pwd_require_special', v ? 'true' : 'false')} />
            </div>
          </div>
          <div className="mt-6 flex gap-3 justify-end pt-6 border-t border-slate-700">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-yellow-600 hover:bg-yellow-700 rounded-lg flex items-center gap-2 disabled:opacity-50">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Password Policy'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Email Tab ══════════════════════════════════ */}
      {activeTab === 'email' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <Mail size={20} className="text-green-400" />
            Email / SMTP Configuration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="SMTP Server"   value={settings.notify_smtp_server} onChange={v => handleChange('notify_smtp_server', v)} placeholder="smtp.gmail.com" />
            <Field label="SMTP Port" type="number" value={settings.notify_smtp_port} onChange={v => handleChange('notify_smtp_port', v)} placeholder="587" />
            <Field label="SMTP Username" value={settings.notify_smtp_user}   onChange={v => handleChange('notify_smtp_user', v)}   placeholder="notify@company.com" />
            <div>
              <label className="block text-sm text-slate-400 mb-2">SMTP Password</label>
              <div className="relative">
                <input
                  type={showSmtpPwd ? 'text' : 'password'}
                  value={settings.notify_smtp_password || ''}
                  onChange={(e) => handleChange('notify_smtp_password', e.target.value)}
                  placeholder="Leave masked to keep current"
                  className="w-full px-4 py-2.5 pr-12 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
                />
                <button type="button" onClick={() => setShowSmtpPwd(!showSmtpPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showSmtpPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <Field label="From Email" type="email" value={settings.notify_from_email}  onChange={v => handleChange('notify_from_email', v)}  placeholder="noreply@company.com" />
            <Field label="Admin Email" type="email" value={settings.notify_admin_email} onChange={v => handleChange('notify_admin_email', v)} placeholder="admin@company.com" />
          </div>
          <div className="mt-6 space-y-3 pt-4 border-t border-slate-700">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Notification Options</h3>
            <CheckboxRow label="Notify on Account Lockout"  value={settings.notify_on_lockout         === 'true'} onChange={(v) => handleChange('notify_on_lockout',         v ? 'true' : 'false')} />
            <CheckboxRow label="Notify on Password Expiry"  value={settings.notify_on_password_expiry === 'true'} onChange={(v) => handleChange('notify_on_password_expiry', v ? 'true' : 'false')} />
          </div>
          <div className="mt-6 flex gap-3 justify-end pt-6 border-t border-slate-700">
            <button onClick={handleTestEmail}
              className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center gap-2">
              <Send size={16} />
              Send Test Email
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 rounded-lg flex items-center gap-2 disabled:opacity-50">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Email Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          DOMAIN MODAL (Add / Edit)
      ═══════════════════════════════════════════════════ */}
      {showDomainModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Globe size={18} />
                </div>
                <div>
                  <h2 className="font-bold text-lg">
                    {editingDomain ? `Edit: ${editingDomain.name}` : 'Add Domain Profile'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {editingDomain ? 'Update domain connection settings' : 'Configure a new Active Directory domain'}
                  </p>
                </div>
              </div>
              <button onClick={closeDomainModal}
                className="p-2 hover:bg-slate-700 rounded-lg transition">
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5">

              {/* Display name */}
              <ModalField
                label="Display Name"
                required
                placeholder="e.g. Abasyn Staff"
                value={domainForm.name}
                onChange={v => handleDomainFormChange('name', v)}
                hint="Shown in the login page domain dropdown"
              />

              {/* Connection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModalField
                  label="Primary DC IP / Hostname"
                  required
                  placeholder="192.168.200.10"
                  value={domainForm.ad_server_primary}
                  onChange={v => handleDomainFormChange('ad_server_primary', v)}
                />
                <ModalField
                  label="Secondary DC (failover)"
                  placeholder="Optional"
                  value={domainForm.ad_server_secondary}
                  onChange={v => handleDomainFormChange('ad_server_secondary', v)}
                />
              </div>

              {/* Domain + Base DN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModalField
                  label="Domain Name"
                  required
                  placeholder="abasyn.local"
                  value={domainForm.ad_domain}
                  onChange={v => handleDomainFormChange('ad_domain', v)}
                />
                <ModalField
                  label="Base DN"
                  required
                  placeholder="DC=abasyn,DC=local"
                  value={domainForm.ad_base_dn}
                  onChange={v => handleDomainFormChange('ad_base_dn', v)}
                />
              </div>

              {/* Service account */}
              <ModalField
                label="Service Account UPN"
                required
                placeholder="svc-dcmanager@abasyn.local"
                value={domainForm.ad_service_account}
                onChange={v => handleDomainFormChange('ad_service_account', v)}
              />

              {/* Password */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Service Account Password
                  {!editingDomain && <span className="text-red-400 ml-1">*</span>}
                </label>
                <div className="relative">
                  <input
                    type={showDomainPwd ? 'text' : 'password'}
                    value={domainForm.ad_service_password}
                    onChange={e => handleDomainFormChange('ad_service_password', e.target.value)}
                    placeholder={editingDomain ? 'Leave as ******** to keep current' : 'Enter password'}
                    className="w-full px-4 py-2.5 pr-12 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                  <button type="button" onClick={() => setShowDomainPwd(!showDomainPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showDomainPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Protocol + Port */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Protocol</label>
                  <div className="flex gap-4 py-2.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={domainForm.ad_use_ldaps === true}
                        onChange={() => handleDomainFormChange('ad_use_ldaps', true)} />
                      <span className="text-sm">🔒 LDAPS</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={domainForm.ad_use_ldaps === false}
                        onChange={() => handleDomainFormChange('ad_use_ldaps', false)} />
                      <span className="text-sm">LDAP</span>
                    </label>
                  </div>
                </div>
                <ModalField
                  label="Port"
                  type="number"
                  value={domainForm.ad_port}
                  onChange={v => handleDomainFormChange('ad_port', parseInt(v) || 636)}
                />
              </div>

              {/* Default user OU */}
              <ModalField
                label="Default User OU"
                placeholder="OU=Users,DC=abasyn,DC=local"
                value={domainForm.ad_default_user_ou}
                onChange={v => handleDomainFormChange('ad_default_user_ou', v)}
                hint="Where new users are created by default"
              />

              {/* ── DNS / DHCP Server Configuration (v2.6.0) ── */}
              <div className="pt-4 mt-4 border-t border-slate-700">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Globe size={14} className="text-blue-400" />
                  DNS &amp; DHCP Server IPs
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  IP addresses of DNS/DHCP servers for this domain. Usually the same as DC IPs.
                  Leave secondary empty if no failover.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ModalField
                    label="DNS Primary IP"
                    placeholder="192.168.200.10"
                    value={domainForm.dns_server_primary}
                    onChange={v => handleDomainFormChange('dns_server_primary', v)}
                  />
                  <ModalField
                    label="DNS Secondary IP"
                    placeholder="Optional"
                    value={domainForm.dns_server_secondary}
                    onChange={v => handleDomainFormChange('dns_server_secondary', v)}
                  />
                  <ModalField
                    label="DHCP Primary IP"
                    placeholder="192.168.200.10"
                    value={domainForm.dhcp_server_primary}
                    onChange={v => handleDomainFormChange('dhcp_server_primary', v)}
                  />
                  <ModalField
                    label="DHCP Secondary IP"
                    placeholder="Optional"
                    value={domainForm.dhcp_server_secondary}
                    onChange={v => handleDomainFormChange('dhcp_server_secondary', v)}
                  />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between p-6 border-t border-slate-700 sticky bottom-0 bg-slate-800">
              <button
                onClick={handleDomainModalTest}
                disabled={domainTesting}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm disabled:opacity-50 transition"
              >
                {domainTesting
                  ? <><RefreshCw size={14} className="animate-spin" /> Testing...</>
                  : <><TestTube size={14} /> Test Connection</>
                }
              </button>

              <div className="flex gap-3">
                <button onClick={closeDomainModal}
                  className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition">
                  Cancel
                </button>
                <button
                  onClick={handleDomainSave}
                  disabled={domainSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50 transition"
                >
                  {domainSaving
                    ? <><RefreshCw size={14} className="animate-spin" /> Saving...</>
                    : <><Save size={14} /> {editingDomain ? 'Update Domain' : 'Add Domain'}</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 font-medium border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
        active
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      }`}
    >
      <Icon size={16} />
      {label}
      {badge && (
        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded font-bold">
          {badge}
        </span>
      )}
    </button>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder = '', fullWidth = false, required = false }) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <label className="block text-sm text-slate-400 mb-2">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
      />
    </div>
  )
}

function ModalField({ label, value, onChange, type = 'text', placeholder = '', required = false, hint = '' }) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-2">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-500 flex-shrink-0">{label}:</span>
      <span className="text-slate-300 truncate font-mono text-xs">{value}</span>
    </div>
  )
}

function CheckboxRow({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700/50">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
      <span className="text-sm">{label}</span>
    </label>
  )
}

function ToggleRow({ label, description, value, onChange, examples }) {
  return (
    <div
      className={`p-4 rounded-lg border transition cursor-pointer ${
        value ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-slate-900 border-slate-700 hover:border-slate-600'
      }`}
      onClick={() => onChange(!value)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium">{label}</h3>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              value ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-400'
            }`}>
              {value ? 'SHOWING' : 'HIDDEN'}
            </span>
          </div>
          <p className="text-sm text-slate-400 mb-2">{description}</p>
          {examples && examples.length > 0 && (
            <div className="text-xs text-slate-500">
              Examples: {examples.map((e, i) => (
                <span key={i}>
                  <code className="px-1.5 py-0.5 bg-slate-800 rounded text-cyan-300">{e}</code>
                  {i < examples.length - 1 && ', '}
                </span>
              ))}
            </div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onChange(!value) }} className="flex-shrink-0">
          {value
            ? <ToggleRight size={36} className="text-cyan-400" />
            : <ToggleLeft  size={36} className="text-slate-500" />
          }
        </button>
      </div>
    </div>
  )
}