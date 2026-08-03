import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Shield, Monitor, FolderTree,
  ScrollText, Settings, LogOut, Server, ChevronLeft, ChevronRight,
  BarChart3, FileText, GitBranch, Bell, Camera, Activity,
  ShieldCheck, Cog, Globe, ChevronDown, Check, RefreshCw, Wifi
} from 'lucide-react'
import { getWorkflowRequests, getActiveSessions, logout as apiLogout, getDomains, getSettings } from '../api'

export default function Layout() {
  const [collapsed,     setCollapsed]     = useState(false)
  const [pendingCount,  setPendingCount]  = useState(0)
  const [sessionsCount, setSessionsCount] = useState(0)
  const [permissions,   setPermissions]   = useState({})
  const [permsLoaded,   setPermsLoaded]   = useState(false)

  // Domain switcher state
  const [domains,         setDomains]         = useState([])
  const [domainOpen,      setDomainOpen]       = useState(false)
  const [domainSwitching, setDomainSwitching]  = useState(false)
  const domainRef = useRef(null)

  const navigate  = useNavigate()
  const user      = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin   = user.role === 'Admin'
  const isHelpdesk = user.role === 'Helpdesk'

  const activeDomainId   = localStorage.getItem('domain_id')   || ''
  const activeDomainName = localStorage.getItem('domain_name') || 'Unknown Domain'

  // ── On Mount ──────────────────────────────────────────
  useEffect(() => {
    fetchPermissions()
    loadBadges()
    const interval = setInterval(loadBadges, 30000)
    return () => clearInterval(interval)
  }, [])

  // ── Load Domains for Admin Switcher ───────────────────
  useEffect(() => {
    if (isAdmin) loadDomains()
  }, [isAdmin])

  // ── Close Domain Dropdown on Outside Click ────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (domainRef.current && !domainRef.current.contains(e.target)) {
        setDomainOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Fetch Permissions from Backend ────────────────────
  const fetchPermissions = async () => {
    // Admin does not need permission checks
    if (isAdmin) {
      setPermsLoaded(true)
      return
    }
    try {
      const settingsData = await getSettings()
      const key = isHelpdesk
        ? 'helpdesk_sidebar_permissions'
        : 'viewer_sidebar_permissions'
      let perms = {}
      try {
        perms = typeof settingsData[key] === 'string'
          ? JSON.parse(settingsData[key])
          : (settingsData[key] || {})
      } catch { perms = {} }
      setPermissions(perms)
    } catch (err) {
      console.error('Failed to load permissions', err)
      setPermissions({})
    } finally {
      setPermsLoaded(true)
    }
  }

  const loadBadges = async () => {
    try {
      const data = await getWorkflowRequests('pending')
      setPendingCount(data.count || 0)
    } catch { setPendingCount(0) }
    if (isAdmin) {
      try {
        const data = await getActiveSessions()
        setSessionsCount(data.count || 0)
      } catch { setSessionsCount(0) }
    }
  }

  const loadDomains = async () => {
    try {
      const data = await getDomains()
      setDomains(data.domains || [])
    } catch { setDomains([]) }
  }

  // ── Domain Switch ─────────────────────────────────────
  const handleDomainSwitch = async (domain) => {
    if (String(domain.id) === String(activeDomainId)) {
      setDomainOpen(false)
      return
    }
    setDomainSwitching(true)
    setDomainOpen(false)
    try {
      localStorage.setItem('domain_id',   String(domain.id))
      localStorage.setItem('domain_name', domain.name)
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      u.domain_id   = domain.id
      u.domain_name = domain.name
      localStorage.setItem('user', JSON.stringify(u))
      window.location.reload()
    } catch {
      setDomainSwitching(false)
    }
  }

  const logout = async () => {
    try { await apiLogout() } catch {}
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('domain_id')
    localStorage.removeItem('domain_name')
    navigate('/login')
  }

  // ── Menu Definition ───────────────────────────────────
  const allMenu = [
    { to: '/',                 icon: LayoutDashboard, label: 'Dashboard',        id: 'dashboard'        },
    { to: '/users',            icon: Users,           label: 'Users',            id: 'users'            },
    { to: '/groups',           icon: Shield,          label: 'Groups',           id: 'groups'           },
    { to: '/computers',        icon: Monitor,         label: 'Computers',        id: 'computers'        },
    { to: '/ous',              icon: FolderTree,      label: 'OUs',              id: 'ous'              },
    { to: '/dns',              icon: Globe,           label: 'DNS',              id: 'dns'              },
    { to: '/dhcp',             icon: Wifi,            label: 'DHCP',             id: 'dhcp'             },
    { to: '/service-accounts', icon: Cog,             label: 'Service Accounts', id: 'service-accounts' },
    { to: '/gpo',              icon: ShieldCheck,     label: 'GPOs',             id: 'gpo'              },
    { to: '/photos',           icon: Camera,          label: 'User Photos',      id: 'photos'           },
    { to: '/templates',        icon: FileText,        label: 'Templates',        id: 'templates'        },
    { to: '/workflows',        icon: GitBranch,       label: 'Workflows',        id: 'workflows',       badge: pendingCount  },
    { to: '/sessions',         icon: Activity,        label: 'Sessions',         id: 'sessions',        badge: sessionsCount },
    { to: '/reports',          icon: BarChart3,       label: 'Reports',          id: 'reports'          },
    { to: '/audit',            icon: ScrollText,      label: 'Audit Logs',       id: 'audit',           adminOnly: true },
    { to: '/settings',         icon: Settings,        label: 'Settings',         id: 'settings',        adminOnly: true },
  ]

  // ── Filter Menu by Role + Permissions ─────────────────
  const visibleMenu = allMenu.filter(item => {
    // Admin sees everything always
    if (isAdmin) return true
    // adminOnly items never shown to non-admins
    if (item.adminOnly) return false
    // For Helpdesk and Viewer check permission toggle
    return permissions[item.id] === true
  })

  return (
    <div className="flex h-screen bg-slate-900 text-white">

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className={`${collapsed ? 'w-20' : 'w-64'} bg-slate-800 border-r border-slate-700 flex flex-col transition-all duration-200`}>

        {/* Logo */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
                <Server size={18} />
              </div>
              <div>
                <div className="font-bold text-sm">DC Manager Pro</div>
                <div className="text-xs text-slate-400">v2.6.1</div>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-slate-700 rounded transition"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {!permsLoaded ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={18} className="animate-spin text-slate-500" />
            </div>
          ) : (
            visibleMenu.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition group relative ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`
                }
                title={collapsed ? item.label : ''}
              >
                <item.icon size={18} className="flex-shrink-0" />
                {!collapsed && (
                  <>
                    <span className="text-sm flex-1">{item.label}</span>
                    {item.badge > 0 && (
                      <span className={`px-2 py-0.5 text-white text-xs rounded-full font-bold ${
                        item.to === '/workflows' ? 'bg-orange-500' :
                        item.to === '/sessions'  ? 'bg-green-500'  :
                        'bg-red-500'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
                {collapsed && item.badge > 0 && (
                  <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                    item.to === '/workflows' ? 'bg-orange-500' :
                    item.to === '/sessions'  ? 'bg-green-500'  :
                    'bg-red-500'
                  }`} />
                )}
              </NavLink>
            ))
          )}
        </nav>

        {/* User Profile & Logout */}
        <div className="p-3 border-t border-slate-700">
          {!collapsed && (
            <div className="mb-3 px-3 py-2 bg-slate-900 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium truncate flex-1">
                  {user.display_name || user.username || 'User'}
                </div>
                {pendingCount > 0 && isAdmin && (
                  <button
                    onClick={() => navigate('/workflows')}
                    className="ml-2 p-1 hover:bg-slate-700 rounded text-yellow-400 relative"
                    title={`${pendingCount} pending approval${pendingCount !== 1 ? 's' : ''}`}
                  >
                    <Bell size={14} />
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-400 truncate flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  user.role === 'Admin'    ? 'bg-red-400'    :
                  user.role === 'Helpdesk' ? 'bg-yellow-400' :
                  'bg-blue-400'
                }`} />
                {user.role || 'Viewer'} • {user.username || ''}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-slate-300 hover:bg-red-600/20 hover:text-red-400 rounded-lg transition"
            title={collapsed ? 'Sign Out' : ''}
          >
            <LogOut size={18} className="flex-shrink-0" />
            {!collapsed && <span className="text-sm">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Content ────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top Header */}
        <header className="h-12 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 flex-shrink-0">

          {/* Left — Active Domain */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Globe size={13} className="text-slate-500" />
            <span className="hidden sm:inline">Active Domain:</span>
            <span className="text-slate-200 font-medium">{activeDomainName}</span>
          </div>

          {/* Right — Domain Switcher */}
          <div className="flex items-center gap-3">

            {/* Admin domain switcher */}
            {isAdmin && (
              <div className="relative" ref={domainRef}>
                <button
                  onClick={() => setDomainOpen(!domainOpen)}
                  disabled={domainSwitching}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-xs text-slate-200 transition disabled:opacity-50"
                >
                  {domainSwitching ? (
                    <><RefreshCw size={12} className="animate-spin" /><span>Switching...</span></>
                  ) : (
                    <><Globe size={12} className="text-blue-400" /><span>Switch Domain</span>
                    <ChevronDown size={12} className={`text-slate-400 transition-transform ${domainOpen ? 'rotate-180' : ''}`} /></>
                  )}
                </button>

                {domainOpen && !domainSwitching && (
                  <div className="absolute right-0 top-full mt-1 w-64 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-700">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Domain</p>
                    </div>
                    <div className="py-1 max-h-64 overflow-y-auto">
                      {domains.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-slate-500">No domains available</div>
                      ) : (
                        domains.map((d) => {
                          const isActive = String(d.id) === String(activeDomainId)
                          return (
                            <button
                              key={d.id}
                              onClick={() => handleDomainSwitch(d)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition ${
                                isActive ? 'bg-blue-600/20 text-blue-300' : 'text-slate-200 hover:bg-slate-700'
                              }`}
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-blue-600' : 'bg-slate-700'}`}>
                                {isActive ? <Check size={13} className="text-white" /> : <Globe size={13} className="text-slate-400" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{d.name}</div>
                                <div className="text-xs text-slate-500 truncate">{d.ad_domain}</div>
                              </div>
                              {d.is_default && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 bg-slate-600 text-slate-300 text-[10px] rounded font-medium">Default</span>
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                    <div className="px-3 py-2 border-t border-slate-700">
                      <button onClick={() => { setDomainOpen(false); navigate('/settings') }} className="text-xs text-blue-400 hover:text-blue-300 transition">
                        Manage domains in Settings →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Non-admin read-only domain badge */}
            {!isAdmin && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg">
                <Globe size={12} className="text-slate-500" />
                <span className="text-xs text-slate-400">{activeDomainName}</span>
              </div>
            )}

          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>

      </div>
    </div>
  )
}