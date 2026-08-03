import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// ── Auth ────────────────────────────────────────────
import Login from './pages/Login'

// ── Layout ──────────────────────────────────────────
import Layout from './components/Layout'

// ── Core Pages ──────────────────────────────────────
import Dashboard  from './pages/Dashboard'
import Users      from './pages/Users'
import Groups     from './pages/Groups'
import Computers  from './pages/Computers'
import OUs        from './pages/OUs'

// ── Service Accounts (NEW v2.2) ─────────────────────
import ServiceAccounts from './pages/ServiceAccounts'

// ── GPO, Photos, Sessions (v2.1) ────────────────────
import GPO        from './pages/GPO'
import Photos     from './pages/Photos'
import Sessions   from './pages/Sessions'
import DNS        from './pages/DNS'
import DHCP       from './pages/DHCP'

// ── Advanced Features ───────────────────────────────
import Templates  from './pages/Templates'
import Workflows  from './pages/Workflows'

// ── Analytics & Admin ───────────────────────────────
import Reports    from './pages/Reports'
import AuditLogs  from './pages/AuditLogs'
import Settings   from './pages/Settings'

// ─────────────────────────────────────────────────────
// Protected Route - Requires Login
// ─────────────────────────────────────────────────────
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

// ─────────────────────────────────────────────────────
// Admin-Only Route
// ─────────────────────────────────────────────────────
function AdminRoute({ children }) {
  const token = localStorage.getItem('token')
  const user  = JSON.parse(localStorage.getItem('user') || '{}')
  if (!token) return <Navigate to="/login" replace />
  if (user.role !== 'Admin') return <Navigate to="/" replace />
  return children
}

// ─────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────
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
          {/* ── Dashboard ────────────────────────────── */}
          <Route index element={<Dashboard />} />

          {/* ── Core AD Management ───────────────────── */}
          <Route path="users"            element={<Users />} />
          <Route path="groups"           element={<Groups />} />
          <Route path="computers"        element={<Computers />} />
          <Route path="ous"              element={<OUs />} />

          {/* ── Service Accounts (NEW) ───────────────── */}
          <Route path="service-accounts" element={<ServiceAccounts />} />

          {/* ── GPO Management ───────────────────────── */}
          <Route path="gpo"              element={<GPO />} />

          {/* ── User Photos ──────────────────────────── */}
          <Route path="photos"           element={<Photos />} />

          {/* ── Advanced Features ────────────────────── */}
          <Route path="templates"        element={<Templates />} />
          <Route path="workflows"        element={<Workflows />} />

          {/* ── Active Sessions (Admin only) ─────────── */}
          <Route path="sessions"         element={
            <AdminRoute>
              <Sessions />
            </AdminRoute>
          } />

          <Route path="dns" element={
            <AdminRoute>
              <DNS />
            </AdminRoute>
          } />

          <Route path="dhcp" element={
            <AdminRoute>
              <DHCP />
            </AdminRoute>
          } />

          {/* ── Analytics & Logs ─────────────────────── */}
          <Route path="reports"          element={<Reports />} />
          <Route path="audit"            element={<AuditLogs />} />

          {/* ── Settings (Admin only) ────────────────── */}
          <Route path="settings"         element={
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