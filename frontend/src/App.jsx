import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getSettings } from './api'

// ── Auth ────────────────────────────────────────────────
import Login from './pages/Login'

// ── Layout ──────────────────────────────────────────────
import Layout from './components/Layout'

// ── Core Pages ──────────────────────────────────────────
import Dashboard       from './pages/Dashboard'
import Users           from './pages/Users'
import Groups          from './pages/Groups'
import Computers       from './pages/Computers'
import OUs             from './pages/OUs'

// ── Service Accounts ────────────────────────────────────
import ServiceAccounts from './pages/ServiceAccounts'

// ── GPO, Photos, Sessions ───────────────────────────────
import GPO             from './pages/GPO'
import Photos          from './pages/Photos'
import Sessions        from './pages/Sessions'
import DNS             from './pages/DNS'
import DHCP            from './pages/DHCP'

// ── Advanced Features ───────────────────────────────────
import Templates       from './pages/Templates'
import Workflows       from './pages/Workflows'

// ── Analytics & Admin ───────────────────────────────────
import Reports         from './pages/Reports'
import AuditLogs       from './pages/AuditLogs'
import Settings        from './pages/Settings'

// ─────────────────────────────────────────────────────────
// Private Route - Requires Login
// ─────────────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

// ─────────────────────────────────────────────────────────
// Admin-Only Route - Always Admin access
// ─────────────────────────────────────────────────────────
function AdminRoute({ children }) {
  const token = localStorage.getItem('token')
  const user  = JSON.parse(localStorage.getItem('user') || '{}')
  if (!token) return <Navigate to="/login" replace />
  if (user.role !== 'Admin') return <Navigate to="/" replace />
  return children
}

// ─────────────────────────────────────────────────────────
// Permission Route - Dynamic Role-Based Access
// Checks if module is enabled for Helpdesk/Viewer
// Admin always passes. Redirects to dashboard if denied.
// ─────────────────────────────────────────────────────────
function PermissionRoute({ children, moduleId }) {
  const [allowed, setAllowed] = useState(null)
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => {
    // Admin always has access
    if (user.role === 'Admin') {
      setAllowed(true)
      return
    }

    const checkPermission = async () => {
      try {
        const settingsData = await getSettings()
        const key = user.role === 'Helpdesk'
          ? 'helpdesk_sidebar_permissions'
          : 'viewer_sidebar_permissions'

        let perms = {}
        try {
          perms = typeof settingsData[key] === 'string'
            ? JSON.parse(settingsData[key])
            : (settingsData[key] || {})
        } catch {
          perms = {}
        }

        setAllowed(perms[moduleId] === true)
      } catch (err) {
        console.error('Permission check failed', err)
        setAllowed(false)
      }
    }

    checkPermission()
  }, [moduleId, user.role])

  // Loading state
  if (allowed === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  // Access denied - redirect to dashboard
  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return children
}

// ─────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />

        {/* Protected Routes (require authentication) */}
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          {/* ── Dashboard (toggleable) ───────────────────── */}
          <Route index element={
            <PermissionRoute moduleId="dashboard">
              <Dashboard />
            </PermissionRoute>
          } />

          {/* ── Core AD Management (toggleable) ─────────── */}
          <Route path="users" element={
            <PermissionRoute moduleId="users">
              <Users />
            </PermissionRoute>
          } />

          <Route path="groups" element={
            <PermissionRoute moduleId="groups">
              <Groups />
            </PermissionRoute>
          } />

          <Route path="computers" element={
            <PermissionRoute moduleId="computers">
              <Computers />
            </PermissionRoute>
          } />

          <Route path="ous" element={
            <PermissionRoute moduleId="ous">
              <OUs />
            </PermissionRoute>
          } />

          {/* ── DNS Management (toggleable) ─────────────── */}
          <Route path="dns" element={
            <PermissionRoute moduleId="dns">
              <DNS />
            </PermissionRoute>
          } />

          {/* ── DHCP Management (toggleable) ────────────── */}
          <Route path="dhcp" element={
            <PermissionRoute moduleId="dhcp">
              <DHCP />
            </PermissionRoute>
          } />

          {/* ── Service Accounts (toggleable) ───────────── */}
          <Route path="service-accounts" element={
            <PermissionRoute moduleId="service-accounts">
              <ServiceAccounts />
            </PermissionRoute>
          } />

          {/* ── GPO Management (toggleable) ─────────────── */}
          <Route path="gpo" element={
            <PermissionRoute moduleId="gpo">
              <GPO />
            </PermissionRoute>
          } />

          {/* ── User Photos (toggleable) ────────────────── */}
          <Route path="photos" element={
            <PermissionRoute moduleId="photos">
              <Photos />
            </PermissionRoute>
          } />

          {/* ── Templates (toggleable) ──────────────────── */}
          <Route path="templates" element={
            <PermissionRoute moduleId="templates">
              <Templates />
            </PermissionRoute>
          } />

          {/* ── Workflows (toggleable) ──────────────────── */}
          <Route path="workflows" element={
            <PermissionRoute moduleId="workflows">
              <Workflows />
            </PermissionRoute>
          } />

          {/* ── Sessions (toggleable) ───────────────────── */}
          <Route path="sessions" element={
            <PermissionRoute moduleId="sessions">
              <Sessions />
            </PermissionRoute>
          } />

          {/* ── Reports (toggleable) ────────────────────── */}
          <Route path="reports" element={
            <PermissionRoute moduleId="reports">
              <Reports />
            </PermissionRoute>
          } />

          {/* ── Audit Logs (Admin only - NOT toggleable) ── */}
          <Route path="audit" element={
            <AdminRoute>
              <AuditLogs />
            </AdminRoute>
          } />

          {/* ── Settings (Admin only - NOT toggleable) ──── */}
          <Route path="settings" element={
            <AdminRoute>
              <Settings />
            </AdminRoute>
          } />

          {/* Catch-all - redirect unknown routes to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}