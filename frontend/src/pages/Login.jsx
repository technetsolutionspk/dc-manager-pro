import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, User, Server, AlertCircle, Globe, ChevronDown, RefreshCw } from 'lucide-react'
import { login, getDomains } from '../api'

export default function Login() {
  const [username,   setUsername]   = useState('')
  const [password,   setPassword]   = useState('')
  const [domainId,   setDomainId]   = useState('')
  const [domains,    setDomains]    = useState([])
  const [domainError,setDomainError]= useState('')
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const navigate = useNavigate()

  // ── Load domains on mount ───────────────────────────────
  useEffect(() => {
    loadDomains()
  }, [])

  const loadDomains = async () => {
    setDomainsLoading(true)
    setDomainError('')
    try {
      const data = await getDomains()
      const list = data.domains || []
      setDomains(list)
      if (list.length === 0) {
        setDomainError('No domains configured. Contact your administrator.')
      }
    } catch (err) {
      setDomainError('Could not load domains. Check server connectivity.')
      setDomains([])
    } finally {
      setDomainsLoading(false)
    }
  }

  // ── Submit ──────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!domainId) {
      setError('Please select a domain before signing in.')
      return
    }

    setLoading(true)
    try {
      const data = await login(username, password, domainId)

      // Persist auth data
      localStorage.setItem('token',       data.access_token)
      localStorage.setItem('domain_id',   String(data.domain_id))
      localStorage.setItem('domain_name', data.domain_name || '')
      localStorage.setItem('user', JSON.stringify({
        username    : data.username,
        display_name: data.display_name,
        role        : data.role,
        domain_id   : data.domain_id,
        domain_name : data.domain_name
      }))

      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  // ── Derived state ───────────────────────────────────────
  const noDomains     = !domainsLoading && domains.length === 0
  const formDisabled  = noDomains || domainsLoading
  const selectedDomain= domains.find(d => String(d.id) === String(domainId))

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="max-w-md w-full">

        {/* ── Logo ──────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
            <Server size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">DC Manager Pro</h1>
          <p className="text-slate-400">Active Directory Management</p>
        </div>

        {/* ── Card ──────────────────────────────────────── */}
        <div className="bg-slate-800/80 backdrop-blur rounded-2xl p-8 border border-slate-700 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Domain Selector ───────────────────────── */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Domain
                <span className="text-red-400 ml-1">*</span>
              </label>

              {/* Loading state */}
              {domainsLoading && (
                <div className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg flex items-center gap-3 text-slate-400">
                  <RefreshCw size={16} className="animate-spin flex-shrink-0" />
                  <span className="text-sm">Loading domains...</span>
                </div>
              )}

              {/* Error state - no domains */}
              {!domainsLoading && noDomains && (
                <div className="w-full px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-red-300">{domainError}</p>
                      <button
                        type="button"
                        onClick={loadDomains}
                        className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Domain dropdown */}
              {!domainsLoading && !noDomains && (
                <div className="relative">
                  <Globe
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  />
                  <select
                    value={domainId}
                    onChange={(e) => {
                      setDomainId(e.target.value)
                      setError('')
                    }}
                    className="w-full pl-10 pr-10 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition appearance-none cursor-pointer"
                    required
                  >
                    {/* Force user to pick — no default selection */}
                    <option value="" disabled className="text-slate-500 bg-slate-900">
                      — Select a domain —
                    </option>
                    {domains.map((d) => (
                      <option
                        key={d.id}
                        value={String(d.id)}
                        className="bg-slate-900 text-white"
                      >
                        {d.name}
                        {d.is_default ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  />
                </div>
              )}

              {/* Domain info badge — shows after selection */}
              {selectedDomain && (
                <div className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <span className="text-xs text-blue-300 truncate">
                    {selectedDomain.ad_domain}
                  </span>
                </div>
              )}
            </div>

            {/* ── Username ──────────────────────────────── */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Username
              </label>
              <div className="relative">
                <User
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your.username"
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  required
                  disabled={formDisabled}
                  autoFocus={!formDisabled}
                  autoComplete="username"
                />
              </div>
            </div>

            {/* ── Password ──────────────────────────────── */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  required
                  disabled={formDisabled}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {/* ── Error Message ─────────────────────────── */}
            {error && (
              <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-red-300">{error}</span>
              </div>
            )}

            {/* ── Submit Button ─────────────────────────── */}
            <button
              type="submit"
              disabled={loading || formDisabled || !domainId}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition shadow-lg shadow-blue-600/30"
            >
              {loading
                ? 'Signing in...'
                : formDisabled
                  ? 'No domains available'
                  : !domainId
                    ? 'Select a domain to continue'
                    : 'Sign In'
              }
            </button>
          </form>

          {/* ── Footer ──────────────────────────────────── */}
          <div className="mt-6 pt-6 border-t border-slate-700 text-center text-sm text-slate-500">
            {noDomains
              ? 'Contact your administrator to configure a domain'
              : 'Use your Active Directory credentials'
            }
          </div>
        </div>

        {/* ── Domain count indicator ───────────────────── */}
        {!domainsLoading && domains.length > 0 && (
          <p className="text-center text-xs text-slate-600 mt-4">
            {domains.length} domain{domains.length !== 1 ? 's' : ''} available
          </p>
        )}

      </div>
    </div>
  )
}