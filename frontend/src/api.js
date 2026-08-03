import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
})

// ── Request Interceptor ─────────────────────────────────────
api.interceptors.request.use((config) => {
  const token     = localStorage.getItem('token')
  const domain_id = localStorage.getItem('domain_id')

  if (token)     config.headers.Authorization = `Bearer ${token}`
  if (domain_id) config.headers['X-Domain-ID'] = domain_id

  return config
})

// ── Response Interceptor ────────────────────────────────────
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('domain_id')
      localStorage.removeItem('domain_name')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════
export const login = async (username, password, domain_id) => {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  const res = await api.post('/api/auth/login', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Domain-ID':  String(domain_id)
    }
  })
  // Persist domain info alongside token
  if (res.data.domain_id)   localStorage.setItem('domain_id',   String(res.data.domain_id))
  if (res.data.domain_name) localStorage.setItem('domain_name', res.data.domain_name)
  return res.data
}

export const logout = () => api.post('/api/auth/logout').then(r => r.data)
export const getMe  = () => api.get('/api/auth/me').then(r => r.data)

// ════════════════════════════════════════════════════════════
// DOMAIN PROFILES
// ════════════════════════════════════════════════════════════

// Public - used on login page (no auth required)
export const getDomains = () =>
  api.get('/api/domains').then(r => r.data)

// Admin only - full details
export const getFullDomains = () =>
  api.get('/api/domains/full').then(r => r.data)

export const createDomain = (data) =>
  api.post('/api/domains', data).then(r => r.data)

export const updateDomain = (id, data) =>
  api.put(`/api/domains/${id}`, data).then(r => r.data)

export const deleteDomain = (id) =>
  api.delete(`/api/domains/${id}`).then(r => r.data)

export const testDomainConnection = (id, data) =>
  api.post(`/api/domains/${id}/test`, data).then(r => r.data)

export const setDefaultDomain = (id) =>
  api.post(`/api/domains/${id}/set-default`).then(r => r.data)

// ════════════════════════════════════════════════════════════
// USERS
// ════════════════════════════════════════════════════════════
export const getUsers      = (params = {}) => api.get('/api/users', { params }).then(r => r.data)
export const getUser       = (username)    => api.get(`/api/users/${username}`).then(r => r.data)
export const createUser    = (data)        => api.post('/api/users', data).then(r => r.data)
export const updateUser    = (username, data) => api.put(`/api/users/${username}`, data).then(r => r.data)
export const deleteUser    = (username)    => api.delete(`/api/users/${username}`).then(r => r.data)
export const disableUser   = (username)    => api.post(`/api/users/${username}/disable`).then(r => r.data)
export const enableUser    = (username)    => api.post(`/api/users/${username}/enable`).then(r => r.data)
export const unlockUser    = (username)    => api.post(`/api/users/${username}/unlock`).then(r => r.data)
export const moveUser      = (username, targetOu) =>
  api.post(`/api/users/${username}/move`, { target_ou: targetOu }).then(r => r.data)
export const resetPassword = (username, password, forceChange = true) =>
  api.post(`/api/users/${username}/reset-password`, { password, forceChange }).then(r => r.data)

// ── User Bulk Operations ────────────────────────────────────
export const bulkImportUsers  = (users)               => api.post('/api/users/bulk-import',     { users }).then(r => r.data)
export const bulkModifyUsers  = (updates)             => api.post('/api/users/bulk-modify',     { updates }).then(r => r.data)
export const bulkMoveUsers    = (usernames, targetOu) => api.post('/api/users/bulk-move',       { usernames, target_ou: targetOu }).then(r => r.data)
export const bulkUserAction   = (usernames, action, extra = {}) => api.post('/api/users/bulk-action', { usernames, action, extra }).then(r => r.data)
export const bulkUpdateCsv    = (rows)                => api.post('/api/users/bulk-update-csv', { rows }).then(r => r.data)

// ════════════════════════════════════════════════════════════
// USER PHOTOS
// ════════════════════════════════════════════════════════════
export const getUserPhotoUrl = (username) => `${API_URL}/api/users/${username}/photo`

export const uploadUserPhoto = (username, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/api/users/${username}/photo`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

export const deleteUserPhoto = (username) =>
  api.delete(`/api/users/${username}/photo`).then(r => r.data)

// ════════════════════════════════════════════════════════════
// GROUPS
// ════════════════════════════════════════════════════════════
export const getGroups        = (params = {}) => api.get('/api/groups', { params }).then(r => r.data)
export const createGroup      = (data)        => api.post('/api/groups', data).then(r => r.data)
export const deleteGroup      = (name)        => api.delete(`/api/groups/${name}`).then(r => r.data)
export const getGroupMembers  = (name)        => api.get(`/api/groups/${name}/members`).then(r => r.data)
export const addGroupMember   = (group, user) => api.post(`/api/groups/${group}/members/${user}`).then(r => r.data)
export const removeGroupMember= (group, user) => api.delete(`/api/groups/${group}/members/${user}`).then(r => r.data)

// ════════════════════════════════════════════════════════════
// COMPUTERS
// ════════════════════════════════════════════════════════════
export const getComputers    = (params = {}) => api.get('/api/computers', { params }).then(r => r.data)
export const createComputer  = (data)        => api.post('/api/computers', data).then(r => r.data)
export const deleteComputer  = (name)        => api.delete(`/api/computers/${name}`).then(r => r.data)
export const enableComputer  = (name)        => api.post(`/api/computers/${name}/enable`).then(r => r.data)
export const disableComputer = (name)        => api.post(`/api/computers/${name}/disable`).then(r => r.data)
export const moveComputer    = (name, targetOu) =>
  api.post(`/api/computers/${name}/move`, { target_ou: targetOu }).then(r => r.data)

// ════════════════════════════════════════════════════════════
// OUs
// ════════════════════════════════════════════════════════════
export const getOUs       = ()                    => api.get('/api/ous').then(r => r.data)
export const createOU     = (data)                => api.post('/api/ous', data).then(r => r.data)
export const updateOU     = (dn, description)     => api.put('/api/ous', { dn, description }).then(r => r.data)
export const deleteOU     = (dn)                  => api.delete('/api/ous', { params: { dn } }).then(r => r.data)
export const getOUContents= (dn)                  => api.get('/api/ous/contents', { params: { dn } }).then(r => r.data)

// ════════════════════════════════════════════════════════════
// GPOs
// ════════════════════════════════════════════════════════════
export const getGPOs     = () => api.get('/api/gpos').then(r => r.data)
export const getGPOLinks = () => api.get('/api/gpos/links').then(r => r.data)

// ════════════════════════════════════════════════════════════
// ACTIVE SESSIONS
// ════════════════════════════════════════════════════════════
export const getActiveSessions = ()           => api.get('/api/sessions').then(r => r.data)
export const terminateSession  = (sessionId)  => api.delete(`/api/sessions/${sessionId}`).then(r => r.data)

// ════════════════════════════════════════════════════════════
// SERVICE ACCOUNTS
// ════════════════════════════════════════════════════════════
export const getServiceAccounts        = ()              => api.get('/api/service-accounts').then(r => r.data)
export const getServiceAccount         = (id)            => api.get(`/api/service-accounts/${id}`).then(r => r.data)
export const createServiceAccount      = (data)          => api.post('/api/service-accounts', data).then(r => r.data)
export const updateServiceAccount      = (id, data)      => api.put(`/api/service-accounts/${id}`, data).then(r => r.data)
export const deleteServiceAccount      = (id, deleteAd = true) => api.delete(`/api/service-accounts/${id}`, { params: { delete_ad: deleteAd } }).then(r => r.data)
export const resetServiceAccountPassword = (id, password) => api.post(`/api/service-accounts/${id}/reset-password`, { password }).then(r => r.data)
export const importServiceAccount      = (data)          => api.post('/api/service-accounts/import-existing', data).then(r => r.data)

// ════════════════════════════════════════════════════════════
// TEMPLATES
// ════════════════════════════════════════════════════════════
export const getTemplates           = ()        => api.get('/api/templates').then(r => r.data)
export const createTemplate         = (data)    => api.post('/api/templates', data).then(r => r.data)
export const deleteTemplate         = (id)      => api.delete(`/api/templates/${id}`).then(r => r.data)
export const createUserFromTemplate = (id, data)=> api.post(`/api/templates/${id}/create-user`, data).then(r => r.data)

// ════════════════════════════════════════════════════════════
// WORKFLOWS
// ════════════════════════════════════════════════════════════
export const getWorkflowRequests = (statusFilter) =>
  api.get('/api/workflows/requests', {
    params: statusFilter ? { status_filter: statusFilter } : {}
  }).then(r => r.data)

export const createWorkflowRequest = (data) =>
  api.post('/api/workflows/requests', data).then(r => r.data)

export const approveWorkflow = (id) =>
  api.post(`/api/workflows/requests/${id}/approve`).then(r => r.data)

export const rejectWorkflow = (id, reason) =>
  api.post(`/api/workflows/requests/${id}/reject`, { reason }).then(r => r.data)

// ════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════════════════
export const sendTestEmail = (to) =>
  api.post('/api/notifications/test-email', { to }).then(r => r.data)

// ════════════════════════════════════════════════════════════
// AUDIT LOGS
// ════════════════════════════════════════════════════════════
export const getAuditLogs  = (params = {}) => api.get('/api/audit-logs', { params }).then(r => r.data)
export const exportAuditLogs = ()          => api.get('/api/audit-logs/export', { responseType: 'blob' })

// ════════════════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════════════════
export const getSettings    = ()     => api.get('/api/settings').then(r => r.data)
export const updateSettings = (data) => api.put('/api/settings', data).then(r => r.data)
export const testConnection = (data) => api.post('/api/settings/test-connection', data).then(r => r.data)

// ════════════════════════════════════════════════════════════
// APP USERS
// ════════════════════════════════════════════════════════════
export const getAppUsers    = ()       => api.get('/api/app-users').then(r => r.data)
export const createAppUser  = (data)   => api.post('/api/app-users', data).then(r => r.data)
export const deleteAppUser  = (username) => api.delete(`/api/app-users/${username}`).then(r => r.data)

// ════════════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════════════
export const getHealth = () => api.get('/api/health').then(r => r.data)
export const testAD    = () => api.get('/api/ad/test').then(r => r.data)

// ════════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════════
export const getReportSummary       = ()              => api.get('/api/reports/summary').then(r => r.data)
export const getUsersByDepartment   = ()              => api.get('/api/reports/users/by-department').then(r => r.data)
export const getNeverLoggedIn       = ()              => api.get('/api/reports/users/never-logged-in').then(r => r.data)
export const getInactiveUsers       = (days = 90)    => api.get('/api/reports/users/inactive',          { params: { days } }).then(r => r.data)
export const getPasswordExpiring    = (days = 14)    => api.get('/api/reports/users/password-expiring', { params: { days } }).then(r => r.data)
export const getPasswordExpired     = ()              => api.get('/api/reports/users/password-expired').then(r => r.data)
export const getLockedUsers         = ()              => api.get('/api/reports/users/locked').then(r => r.data)
export const getDisabledUsersReport = ()              => api.get('/api/reports/users/disabled').then(r => r.data)
export const getRecentUsers         = (days = 30)    => api.get('/api/reports/users/recent',            { params: { days } }).then(r => r.data)
export const getComputersByOS       = ()              => api.get('/api/reports/computers/by-os').then(r => r.data)
export const getInactiveComputers   = (days = 90)    => api.get('/api/reports/computers/inactive',      { params: { days } }).then(r => r.data)
export const getEmptyGroups         = ()              => api.get('/api/reports/groups/empty').then(r => r.data)
export const getLargestGroups       = (limit = 20)   => api.get('/api/reports/groups/largest',          { params: { limit } }).then(r => r.data)
export const exportReport           = (type)          => api.get(`/api/reports/export/${type}`,         { responseType: 'blob' })
export const getRecentlyActiveUsers = (minutes = 15) => api.get('/api/reports/users/recently-active',  { params: { minutes } }).then(r => r.data)
export const getDomainLoginsSummary = ()              => api.get('/api/reports/users/domain-logins-summary').then(r => r.data)

// ════════════════════════════════════════════════════════════
// WINDOWS LAPS (Admin only, audited)
// ════════════════════════════════════════════════════════════
export const getLapsPassword    = (name, reason) => api.get(`/api/computers/${name}/laps`,         { params: { reason } }).then(r => r.data)
export const getLapsHistory     = (name, reason) => api.get(`/api/computers/${name}/laps/history`, { params: { reason } }).then(r => r.data)
export const rotateLapsPassword = (name)         => api.post(`/api/computers/${name}/laps/rotate`).then(r => r.data)



// ════════════════════════════════════════════════════════════
// DNS MANAGEMENT (v2.6.0 - Admin only, per-domain)
// ════════════════════════════════════════════════════════════
export const getDnsZones = () =>
  api.get('/api/dns/zones').then(r => r.data)

export const getDnsRecords = (zoneName, recordType = null) =>
  api.get(`/api/dns/zones/${encodeURIComponent(zoneName)}/records`, {
    params: recordType ? { record_type: recordType } : {}
  }).then(r => r.data)

export const createDnsARecord = (zoneName, data) =>
  api.post(`/api/dns/zones/${encodeURIComponent(zoneName)}/records/a`, data).then(r => r.data)

export const createDnsCnameRecord = (zoneName, data) =>
  api.post(`/api/dns/zones/${encodeURIComponent(zoneName)}/records/cname`, data).then(r => r.data)

export const createDnsPtrRecord = (zoneName, data) =>
  api.post(`/api/dns/zones/${encodeURIComponent(zoneName)}/records/ptr`, data).then(r => r.data)

export const updateDnsRecord = (zoneName, data) =>
  api.put(`/api/dns/zones/${encodeURIComponent(zoneName)}/records`, data).then(r => r.data)

export const deleteDnsRecord = (zoneName, hostname, recordType) =>
  api.delete(`/api/dns/zones/${encodeURIComponent(zoneName)}/records`, {
    params: { hostname, record_type: recordType }
  }).then(r => r.data)

export const testDnsConnection = () =>
  api.get('/api/dns/test').then(r => r.data)


// ════════════════════════════════════════════════════════════
// DHCP MANAGEMENT (v2.6.0 - Admin only, per-domain)
// ════════════════════════════════════════════════════════════
export const getDhcpScopes = () =>
  api.get('/api/dhcp/scopes').then(r => r.data)

// ── Reservations ──
export const getDhcpReservations = (scopeId) =>
  api.get(`/api/dhcp/scopes/${scopeId}/reservations`).then(r => r.data)

export const createDhcpReservation = (scopeId, data) =>
  api.post(`/api/dhcp/scopes/${scopeId}/reservations`, data).then(r => r.data)

export const updateDhcpReservation = (scopeId, ip, data) =>
  api.put(`/api/dhcp/scopes/${scopeId}/reservations/${ip}`, data).then(r => r.data)

export const deleteDhcpReservation = (scopeId, ip) =>
  api.delete(`/api/dhcp/scopes/${scopeId}/reservations/${ip}`).then(r => r.data)

// ── Leases ──
export const getDhcpLeases = (scopeId) =>
  api.get(`/api/dhcp/scopes/${scopeId}/leases`).then(r => r.data)

export const releaseDhcpLease = (scopeId, ip) =>
  api.post(`/api/dhcp/scopes/${scopeId}/leases/${ip}/release`).then(r => r.data)

export const deleteDhcpLease = (scopeId, ip) =>
  api.delete(`/api/dhcp/scopes/${scopeId}/leases/${ip}`).then(r => r.data)

export const testDhcpConnection = () =>
  api.get('/api/dhcp/test').then(r => r.data)

export default api