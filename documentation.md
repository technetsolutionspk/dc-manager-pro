# AD Manager Pro — Complete Documentation v2.6.0

## Enterprise Active Directory Management Platform
## Multi-Domain Support | DNS/DHCP Management | Setup Guide | API Reference | Architecture | Features | Troubleshooting

---

# TABLE OF CONTENTS

## PART I — INTRODUCTION
1. Project Overview
2. Architecture
3. Technology Stack
4. Folder Structure

## PART II — DATA & FEATURES
5. Database Schema
6. Complete Features List
7. Role-Based Access Control

## PART III — API & UI REFERENCE
8. Complete API Reference
9. Frontend Pages Reference

## PART IV — MODULES
10. Multi-Domain Support
11. Windows LAPS Integration
12. DNS Management
13. DHCP Management

## PART V — SETUP & DEPLOYMENT
14. Active Directory Permissions
15. Complete Setup Guide
16. Production Deployment Guide
17. Installer Script Guide

## PART VI — OPERATIONS
18. Backup and Restore
19. Troubleshooting Guide
20. Maintenance Schedule
21. GitHub Deployment

## PART VII — HISTORY
22. Changelog
23. Document Metadata

---

# PART I — INTRODUCTION

---

# 1. PROJECT OVERVIEW

AD Manager Pro is a web-based Active Directory management platform built with Python FastAPI backend and React Vite Tailwind CSS frontend. It provides a modern dark-themed UI for managing AD users, groups, computers, OUs, GPOs, service accounts, user photos, workflow approvals, Windows LAPS passwords, DNS records, DHCP scopes, and more with role-based access control and comprehensive audit logging.

The application supports multiple Active Directory domains from a single interface with full data isolation per domain. Users select their target domain on the login page, and Administrators can switch between domains from the top header bar without re-logging in (as long as their username is authorized in the target domain).

The application connects to Active Directory via the LDAP3 library, authenticates users against AD, and provides a web interface for common AD administration tasks. DNS and DHCP management operates through PowerShell remoting to Domain Controllers. All operations are logged to a SQLite database. Settings are stored in the database with Fernet AES encryption for sensitive values like passwords.

The backend code is split into five Python files for maintainability: models.py for database models and configuration, ad_service.py for LDAP operations and Windows LAPS integration, dns_service.py for DNS management via PowerShell, dhcp_service.py for DHCP management via PowerShell, and app.py for API routes and FastAPI setup.

The built React frontend is served as static files from the backend enabling single-port deployment without a separate web server. The application runs on HTTP port 8080 without SSL certificates.

## 1.1 Key Highlights

Multi-Domain Active Directory Management — Configure and switch between multiple AD domains from a single web interface. Users select their target domain on the login page. Domain profiles store per-domain DC addresses, service account credentials (Fernet encrypted), Base DN, protocol settings, and DNS/DHCP server IPs. All application data is scoped per domain for full isolation. Domain switching validates user authorization in the target domain before allowing access. Dashboard and Reports pages dynamically display the active domain name.

DNS Management — Full CRUD operations for A, CNAME, and PTR records through PowerShell remoting. Zone browser, record type filter, search, sortable columns, multi-select bulk delete with progress bar. Automatic failover to secondary DNS server per domain configuration.

DHCP Management — Full CRUD for reservations, view and release active leases. Scope statistics panel, sortable columns, multi-select bulk operations (delete reservations, edit descriptions, release leases). Automatic failover to secondary DHCP server per domain configuration.

Full CRUD for Core AD Objects — Users, Groups, Computers, and OUs with bulk operations including multi-select, bulk import from CSV, bulk update from CSV, bulk modify, bulk move, and bulk enable/disable/unlock/delete/reset-password.

Sortable Table Columns — On Users page (User, Email, Department, Status), Computers page (Computer, OS, DNS Name, Last Logon, Status), DNS Records page (Hostname, Type, Value, TTL), and DHCP tables (multiple columns) with ascending/descending toggle and visual sort indicators.

Windows LAPS Integration — Admins view local admin passwords with mandatory reason logging, auto-hide after 30 seconds, password history (last 5), and force rotation. Supports encrypted LAPS passwords via PowerShell subprocess.

Home Folder Support — Network path and drive letter support when creating and editing users. Supports %username% placeholder auto-substitution.

Service Accounts — Atomic dual tracking in AD and application database with automatic rollback if database save fails after AD creation.

Accurate Lockout Detection — Reads domain lockoutDuration policy from AD, caches it for one hour, and compares with each user's lockoutTime attribute.

Built-in AD Objects Filtering — Settings toggles control visibility of built-in users, groups, and containers.

ManageEngine-Style Dashboard — Recharts library provides bar charts, pie charts, and domain login activity cards. Dashboard domain badge dynamically shows the active domain name.

User Templates — Standardized account creation with templates defining OU, department, title, company, groups, and password policy.

Approval Workflow System — Six request types: create user, modify user, delete user, reset password, enable user, and disable user.

GPO Viewing — Read-only Group Policy Objects with status, version, SYSVOL path, and OU link reporting.

User Photo Management — Automatic client-side Canvas processing: center-crop to square, resize to 200x200 pixels, compress as JPEG under 100KB.

Active Session Tracking — Which users are logged into the web interface with active/idle status, device detection, IP tracking, and force-logout.

Dynamic Encrypted Settings — Fernet-encrypted passwords in database. Persist across restarts. Auto-reload on save.

Role-Based Access Control — Three roles: Admin (full access), Helpdesk (user/group management), Viewer (read-only).

Complete Audit Trail — Every action logged with operator, role, action, object, details, status, IP, timestamp. CSV export. All logs scoped per domain.

JWT Authentication — Authenticate with AD credentials via LDAP bind. Receive JWT valid for 8 hours. Token contains domain_id claim.

---

# 2. ARCHITECTURE

## 2.1 System Design

The browser loads a React Single Page Application served from the FastAPI backend. All page routing is handled client-side by React Router. The frontend communicates with the backend exclusively through REST API calls using Axios with JWT Bearer token authentication and X-Domain-ID header on every request except the login endpoint, domains list endpoint, and health check.

The FastAPI backend consists of five Python files. models.py contains all database models, configuration, encryption, authentication helpers, and utility functions including the critical get_current_user function that validates JWT and resolves the active domain from the X-Domain-ID header. ad_service.py contains the ADService class with all LDAP operations plus Windows LAPS integration via PowerShell subprocess. dns_service.py contains the DNSService class for DNS operations via PowerShell remoting. dhcp_service.py contains the DHCPService class for DHCP operations via PowerShell remoting. app.py contains all API route handlers and the FastAPI application setup.

Application data is stored in a local SQLite database file (audit.db) using SQLAlchemy ORM. The database contains eight tables for audit logs, authorized app users, dynamic settings, user templates, workflow requests, active sessions, service account metadata, and domain profiles.

## 2.2 Connection Flow

1. Browser loads Login page and fetches GET /api/domains (no auth) to populate domain dropdown
2. User selects a domain and enters AD credentials
3. POST /api/auth/login sent with X-Domain-ID header set to selected domain ID
4. Backend resolves domain profile by ID from domain_profiles table
5. Backend checks app_users table for authorization scoped to that domain
6. Backend creates ADService instance configured with that domain's credentials
7. Backend authenticates user against the domain's DC via LDAP bind
8. On success: JWT token returned containing username, role, and domain_id claims
9. Browser stores token, domain_id, and domain_name in localStorage
10. For API calls: JWT token sent in Authorization header, X-Domain-ID sent as custom header automatically via Axios interceptor
11. Backend validates JWT and reads X-Domain-ID header to determine active domain
12. If X-Domain-ID differs from JWT domain, backend validates user is authorized in target domain
13. Backend creates domain-specific ADService/DNSService/DHCPService instance for the active domain
14. AD operations performed against the correct domain's DC using that domain's service account
15. DNS/DHCP operations executed via PowerShell remoting to the configured DNS/DHCP server IPs
16. Results returned to browser as JSON
17. Admin can switch domains via header dropdown — updates localStorage and reloads page

## 2.3 Domain Resolution Logic

The get_current_user function in models.py implements the following domain resolution:

1. Decode JWT to get username and login domain_id
2. Check for X-Domain-ID header in the request
3. If header present and differs from JWT domain_id: Query app_users to verify user exists and is authorized in the header domain. If authorized, use header domain_id as active_domain_id and return user record from that domain. If not authorized, return 403 with clear error message.
4. If no header or same as JWT, use JWT domain_id as active_domain_id
5. Load AppUser record from database scoped to active_domain_id
6. All subsequent domain-scoped queries use active_domain_id via cu.domain_id

This design allows seamless domain switching for users authorized in multiple domains while enforcing security for users limited to specific domains.

## 2.4 Key Design Decisions

Five-file backend approach chosen for maintainability. Each module has clear responsibilities: models, AD/LAPS, DNS, DHCP, routes.

SQLite chosen for zero-configuration deployment.

JWT tokens expire after 8 hours. Token contains domain_id claim as the login domain, but the X-Domain-ID header overrides this for data scoping when the user is authorized in the target domain.

Domain profiles store all per-domain connection settings including encrypted service account passwords and DNS/DHCP server IPs.

Domain switching in the UI updates localStorage and triggers a full page reload to ensure all cached data is refreshed.

GET /api/domains is public (no authentication required) so the login page can display the domain dropdown.

Settings storage split — visibility, password policy, and email settings are global (in app_settings). Domain-specific connection settings are stored in domain_profiles.

Dashboard and Reports pages read the active domain name from localStorage to display the correct domain badge dynamically.

HTTP-only deployment eliminates SSL certificate management.

PowerShell remoting via subprocess for DNS/DHCP because these use CIM/WMI cmdlets that require remote execution on the target server.

---

# 3. TECHNOLOGY STACK

## 3.1 Backend Technologies

Python 3.11 or higher. FastAPI web framework. Uvicorn ASGI server with 4 workers in production. ldap3 pure Python LDAP library. SQLAlchemy ORM with SQLite. python-jose with cryptography for JWT (HS256). passlib with bcrypt. cryptography for Fernet AES encryption. python-dotenv. python-multipart. subprocess for PowerShell LAPS, DNS, DHCP invocations.

## 3.2 Frontend Technologies

React 18. Vite 8+ build tool (requires esbuild as separate dev dependency). Tailwind CSS v3 dark theme. Axios HTTP client with JWT and X-Domain-ID interceptors. React Router DOM v6. Lucide React icons (includes ArrowUp, ArrowDown, ArrowUpDown, Globe, Wifi). Recharts charting library.

## 3.3 Infrastructure

Windows 10/11 or Windows Server 2016+. Windows Task Scheduler for service hosting. SQLite single-file database.

## 3.4 Prerequisites for Advanced Features

For Windows LAPS: Windows Server 2019+ with LAPS module. LAPS decryption group membership for AD Manager Pro server.

For DNS/DHCP Management: RSAT DNS Tools installed on AD Manager Pro server. RSAT DHCP Tools installed on AD Manager Pro server. WinRM enabled on all DCs (default on Server 2012 R2+). Service account in Administrators, DnsAdmins, DHCP Administrators, Remote Management Users on all DCs. TrustedHosts configured for IP-based remoting (cross-domain scenarios).

---

# 4. FOLDER STRUCTURE

ad-manager-pro/
    backend/
        app.py                    - FastAPI routes and application setup
        models.py                 - Config, database models, auth with domain resolution, encryption
        ad_service.py             - ADService class, LDAP operations, LAPS integration
        dns_service.py            - DNSService class, PowerShell remoting for DNS (v2.6.0)
        dhcp_service.py           - DHCPService class, PowerShell remoting for DHCP (v2.6.0)
        requirements.txt          - Python package dependencies
        .env                      - Environment configuration (SECRET_KEY, APP_HOST, APP_PORT)
        service.cmd               - Windows scheduled task wrapper
        venv/                     - Python virtual environment (not in git)
        database/
            audit.db              - SQLite database with 8 tables (not in git)
        logs/
            app.log               - Application log
            service.log           - Service output log
        static/                   - Built React frontend (not in git)
    frontend/
        package.json              - NPM dependencies (esbuild required)
        vite.config.js            - Vite build configuration
        tailwind.config.js        - Tailwind CSS configuration
        postcss.config.js         - PostCSS configuration
        index.html                - HTML template
        .env.production           - Frontend env (VITE_API_URL=)
        src/
            main.jsx              - React entry point
            App.jsx               - React Router setup with DNS/DHCP routes
            api.js                - Axios API client with X-Domain-ID interceptor
            index.css             - Tailwind directives and dark theme CSS
            components/
                Layout.jsx        - Sidebar, top header bar with domain switcher
            pages/
                Login.jsx         - Domain selector dropdown
                Dashboard.jsx     - Dynamic domain badge from localStorage
                Users.jsx         - Sortable columns, bulk operations
                Groups.jsx
                Computers.jsx     - Sortable columns, LapsPasswordModal, SortHeader
                OUs.jsx
                ServiceAccounts.jsx
                GPO.jsx
                Photos.jsx
                Templates.jsx
                Workflows.jsx
                Sessions.jsx
                Reports.jsx       - Dynamic domain badge
                AuditLogs.jsx
                Settings.jsx      - Domains tab with DNS/DHCP fields
                DNS.jsx           - DNS management (v2.6.0)
                DHCP.jsx          - DHCP management (v2.6.0)

---

# PART II — DATA & FEATURES

---

# 5. DATABASE SCHEMA

Eight SQLite tables stored in backend/database/audit.db.

## 5.1 Table: domain_profiles

Stores AD domain connection profiles for multi-domain management, including DNS/DHCP server IPs added in v2.6.0.

Columns: id (INTEGER PK), name (VARCHAR 100 UNIQUE NOT NULL), ad_server_primary (VARCHAR 100 NOT NULL), ad_server_secondary (VARCHAR 100), ad_domain (VARCHAR 100 NOT NULL), ad_base_dn (VARCHAR 200 NOT NULL), ad_service_account (VARCHAR 200 NOT NULL), ad_service_password (TEXT NOT NULL Fernet encrypted), ad_use_ldaps (BOOLEAN DEFAULT TRUE), ad_port (INTEGER DEFAULT 636), ad_default_user_ou (VARCHAR 500), is_default (BOOLEAN DEFAULT FALSE), dns_server_primary (VARCHAR 100 DEFAULT empty, added v2.6.0), dns_server_secondary (VARCHAR 100 DEFAULT empty, added v2.6.0), dhcp_server_primary (VARCHAR 100 DEFAULT empty, added v2.6.0), dhcp_server_secondary (VARCHAR 100 DEFAULT empty, added v2.6.0), created_at (DATETIME).

## 5.2 Table: audit_logs

Every action logged for compliance. Scoped per domain.

Columns: id, timestamp, operator, operator_role, action, object_type, object_name, details, status, ip_address, domain_id.

## 5.3 Table: app_users

Authorized users. Same username can exist in multiple domains with different roles.

Columns: id, username, display_name, email, role, active, last_login, domain_id (NOT NULL FK to domain_profiles).

Unique constraint: (username, domain_id).

## 5.4 Table: app_settings

Global settings shared across all domains.

Columns: id, key (UNIQUE), value (Fernet encrypted for sensitive values), category, updated_at, updated_by.

## 5.5 Table: user_templates

User creation templates. Scoped per domain.

Columns: id, name (UNIQUE), description, ou, department, title, company, office, phone, manager, groups (JSON), password_never_expires, must_change_password, enabled, created_at, created_by, domain_id (FK).

## 5.6 Table: workflow_requests

Approval workflow requests. Scoped per domain.

Columns: id, request_type, requested_by, target_object, payload (JSON), status, reason, rejection_reason, approved_by, approved_at, completed_at, created_at, domain_id (FK).

## 5.7 Table: active_sessions

Logged-in browser sessions. Scoped per domain.

Columns: id, username, display_name, role, ip_address, user_agent, login_time, last_activity, token_hash, domain_id (FK).

## 5.8 Table: service_accounts

Service accounts tracked in AD and database. Scoped per domain.

Columns: id, username, display_name, email, description, purpose, owner, department, ad_dn, ou, password_never_expires, cannot_change_password, is_system_critical, has_app_access, app_role, created_at, created_by, last_password_change, notes, domain_id (FK).

Unique constraint: (username, domain_id).

---

# 6. COMPLETE FEATURES LIST

## 6.1 Multi-Domain Management

Domain selector dropdown on login page. User must select domain before sign in. Domain switcher in top header bar for Admin only. Non-admin sees read-only domain badge. Domains tab in Settings for full CRUD. Each domain profile has encrypted service account password and configurable DNS/DHCP server IPs. Test connection per domain. Set default domain. All data scoped per domain. Domain switching validates user authorization in target domain. Dashboard and Reports show active domain name dynamically.

## 6.2 User Management

View all AD users with real-time search. Filter by status (All, Active, Disabled, Locked). Sortable columns: User, Email, Department, Status with ascending/descending toggle and visual sort arrows.

Create single user with all fields including home folder network path (%username% placeholder), home drive letter (H: through Z:), must change password, password never expires. Two-step LDAP creation.

Edit user in 5-section modal: Personal Information, Job Information, Home Folder, Additional, Account Options.

Delete (Admin only, built-in accounts protected). Move between OUs. Enable/disable. Unlock with accurate lockout detection.

Reset passwords with show/hide, generate (16-char random), force change at next logon, unlock option.

Bulk import from CSV. Bulk update from CSV with column aliases. Bulk modify same value for multiple users. Bulk move, enable, disable, unlock, delete, reset password via dropdown.

Multi-select with checkboxes, select all, blue highlight, count display.

## 6.3 Group Management

Grid cards with name, description, type badge, member count, scope. Create with name, description, OU, type, scope. Delete (Admin only, 35+ built-in protected). View members with add/remove. Search groups.

## 6.4 Computer Management

Table with computer name, description, OS, DNS name, last logon, status badge, action buttons, LAPS key icon (Admin only).

Sortable columns: Computer, OS, DNS Name, Last Logon, Status. Click column header to toggle ascending/descending. Visual arrows on active column, faded double arrow on inactive columns.

Create (Admin only, max 15 chars, auto-uppercase). Delete (Admin only). Enable/disable. Move with error reporting.

Bulk operations with progress: Enable, Disable, Move, Delete. Status filter. CSV export. Multi-select.

## 6.5 Windows LAPS Password Management

Three-step modal via gold key icon (Admin only). Step 1: Reason prompt (min 5 chars, logged permanently). Step 2: Password display with 30-second auto-hide, copy to clipboard. Step 3: Password history (last 5).

Force rotation. PowerShell subprocess for encrypted decryption. Every access audit-logged with reason.

## 6.6 OU Management

Browse, create with parent picker, delete empty OUs (Admin), update descriptions. Click to browse contents with tabbed interface.

## 6.7 Service Accounts

Atomic dual tracking in AD and database with rollback. Import existing. Edit with AD sync. Reset passwords (min 12 chars). Delete with system critical protection. Grid cards color-coded. Scoped per domain.

## 6.8 User Templates

Create with basic info, location, job info, groups, account options. Create users from templates. Templates scoped per domain.

## 6.9 Workflow Approvals

Six request types. Approve (Admin, executes in AD). Reject with reason. Status tabs with counts. Sidebar badge with 30-second refresh. Scoped per domain.

## 6.10 GPO Management (Read-Only)

GPO card grid with detail modal. OU links tab. Stats, search, filter, CSV export.

## 6.11 User Photos

Canvas processing: center-crop, resize 200x200, JPEG compression under 95KB. Grid, zoom, delete, filter, stats.

## 6.12 Active Sessions

Session cards with role-colored avatars, Active/Idle indicators, device detection, force logout. Auto-refresh 30 seconds. Scoped per domain.

## 6.13 Reports and Analytics

Dashboard with domain login activity cards (6 time periods), quick stat cards (4 clickable with drill-down modals), charts (bar, horizontal bar, pie). Reports page with same cards, View Active Users modal, CSV exports. Domain badge dynamically shows active domain from localStorage. All data from active domain.

## 6.14 Audit Logging

Table with all action details. CSV export. Paginated 500 per page. Scoped per domain.

## 6.15 Settings

Five tabs: Domains (profile management with DNS/DHCP IP fields), Active Directory (global fallback), Visibility (built-in objects), Password Policy, Email SMTP.

## 6.16 App User Management

Users scoped to active domain. Add with username, display name, email, role. Delete with self-protection. Login requires both app_users entry for selected domain AND valid AD bind.

## 6.17 Home Folder Support

%username% auto-substitution in all forms. Drive letter dropdown H: through Z:. AD attributes: homeDirectory and homeDrive.

## 6.18 DNS Management (v2.6.0)

Full CRUD for A, CNAME, PTR records. Zone selector, record type filter, search, sortable columns. Create/Edit/Delete modals. Multi-select bulk delete with progress bar. Test connection button. Automatic failover to secondary DNS server. See Section 12 for full details.

## 6.19 DHCP Management (v2.6.0)

Scope viewer with statistics. Reservations tab with full CRUD and bulk operations (delete, edit description). Active Leases tab with view, release, and bulk release. Description column on both tabs. Multi-select checkboxes with bulk actions dropdown. Automatic failover to secondary DHCP server. See Section 13 for full details.

---

# 7. ROLE-BASED ACCESS CONTROL

## 7.1 Admin

Full access. Settings, app users, service accounts, templates, workflow approval/rejection, sessions, LAPS, domain switching, domain profile management, DNS/DHCP management. Can switch domains via header if authorized in target domain.

## 7.2 Helpdesk

Create/edit/enable/disable/unlock/move users. Reset passwords. Group membership. Enable/disable computers. Create OUs. Use templates. Submit workflows. Cannot delete, access settings/sessions/LAPS/DNS/DHCP/domains, or switch domains.

## 7.3 Viewer

Read-only. View all data (except DNS/DHCP). Submit workflows. Cannot modify anything or switch domains.

## 7.4 Permission Matrix

Feature | Admin | Helpdesk | Viewer
View all AD data | Yes | Yes | Yes
Create/edit users | Yes | Yes | No
Delete objects | Yes | No | No
Reset passwords | Yes | Yes | No
Bulk operations | Yes | Yes | No
Manage settings | Yes | No | No
Approve workflows | Yes | No | No
View sessions | Yes | No | No
View LAPS passwords | Yes | No | No
Switch domains | Yes | No | No
Manage domain profiles | Yes | No | No
Sort table columns | Yes | Yes | Yes
Manage DNS records | Yes | No | No
Manage DHCP reservations | Yes | No | No
View/release DHCP leases | Yes | No | No
Bulk DNS/DHCP operations | Yes | No | No
Configure DNS/DHCP servers | Yes | No | No

---

# PART III — API & UI REFERENCE

---

# 8. COMPLETE API REFERENCE

## 8.1 Authentication Endpoints

GET /api/health — Public health check. Returns status, ldap, domain, server, timestamp.

GET /api/ad/test — Test AD connection for active domain. Requires auth + X-Domain-ID.

POST /api/auth/login — Login with X-Domain-ID header. Returns JWT with domain_id claim, role, display_name, username, domain_id, domain_name.

GET /api/auth/me — Current user info including domain_id and domain_name.

POST /api/auth/logout — Logout and remove session.

## 8.2 Domain Profile Endpoints

GET /api/domains — Public (no auth). Domain list for login dropdown. Returns id, name, ad_domain, is_default.

GET /api/domains/full — Admin only. Full domain details with masked passwords.

POST /api/domains — Admin only. Create domain profile.

PUT /api/domains/{id} — Admin only. Update domain profile.

DELETE /api/domains/{id} — Admin only. Cannot delete default or last domain.

POST /api/domains/{id}/test — Admin only. Test connection to specific domain.

POST /api/domains/{id}/set-default — Admin only. Set as default domain.

## 8.3 Settings Endpoints

GET /api/settings — Global settings. Encrypted values masked.

PUT /api/settings — Update global settings (Admin only).

POST /api/settings/test-connection — Test AD connection with custom settings.

POST /api/settings/change-service-password — Change service account password for active domain.

## 8.4 User Endpoints (All scoped to active domain)

GET /api/users — List users. Optional: search, ou, status_filter, show_builtin.

GET /api/users/{username} — Single user details.

POST /api/users — Create user (Admin/Helpdesk).

PUT /api/users/{username} — Update user (Admin/Helpdesk).

DELETE /api/users/{username} — Delete user (Admin only).

POST /api/users/{username}/move — Move to different OU.

POST /api/users/{username}/disable — Disable account.

POST /api/users/{username}/enable — Enable account.

POST /api/users/{username}/unlock — Unlock account.

POST /api/users/{username}/reset-password — Reset password.

POST /api/users/bulk-import — Bulk create from JSON.

POST /api/users/bulk-modify — Bulk update same values.

POST /api/users/bulk-update-csv — Bulk update from CSV rows.

POST /api/users/bulk-move — Move multiple users.

POST /api/users/bulk-action — Bulk enable/disable/unlock/delete/reset.

## 8.5 Photo Endpoints

GET /api/users/{username}/photo — Get photo binary.

POST /api/users/{username}/photo — Upload photo (max 100KB).

DELETE /api/users/{username}/photo — Delete photo.

## 8.6 Group Endpoints

GET /api/groups — List groups.

POST /api/groups — Create group.

DELETE /api/groups/{name} — Delete (Admin only).

GET /api/groups/{name}/members — Get members.

POST /api/groups/{name}/members/{username} — Add member.

DELETE /api/groups/{name}/members/{username} — Remove member.

## 8.7 Computer Endpoints

GET /api/computers — List computers.

POST /api/computers — Create (Admin only).

DELETE /api/computers/{name} — Delete (Admin only).

POST /api/computers/{name}/enable — Enable.

POST /api/computers/{name}/disable — Disable.

POST /api/computers/{name}/move — Move.

## 8.8 Windows LAPS Endpoints (Admin only)

GET /api/computers/{name}/laps — Current LAPS password (requires reason).

GET /api/computers/{name}/laps/history — Password history.

POST /api/computers/{name}/laps/rotate — Force rotation.

## 8.9 OU Endpoints

GET /api/ous — List all OUs.

POST /api/ous — Create OU.

PUT /api/ous — Update description (Admin only).

DELETE /api/ous — Delete empty OU (Admin only).

GET /api/ous/contents — Browse OU contents.

## 8.10 GPO Endpoints

GET /api/gpos — List all GPOs.

GET /api/gpos/links — Get OU-GPO links.

## 8.11 Session Endpoints (Admin only)

GET /api/sessions — List sessions for active domain.

DELETE /api/sessions/{id} — Terminate session.

## 8.12 Service Account Endpoints

GET /api/service-accounts — List for active domain.

POST /api/service-accounts — Create (Admin only, atomic AD+DB).

GET /api/service-accounts/{id} — Get details.

PUT /api/service-accounts/{id} — Update (Admin only).

DELETE /api/service-accounts/{id} — Delete (Admin only).

POST /api/service-accounts/{id}/reset-password — Reset password (Admin only).

POST /api/service-accounts/import-existing — Import existing AD user (Admin only).

## 8.13 Template Endpoints

GET /api/templates — List for active domain.

POST /api/templates — Create (Admin only).

DELETE /api/templates/{id} — Delete (Admin only).

POST /api/templates/{id}/create-user — Create user from template (Admin/Helpdesk).

## 8.14 Workflow Endpoints

GET /api/workflows/requests — List for active domain.

POST /api/workflows/requests — Submit new request.

POST /api/workflows/requests/{id}/approve — Approve (Admin only).

POST /api/workflows/requests/{id}/reject — Reject (Admin only).

## 8.15 Audit Log Endpoints

GET /api/audit-logs — List for active domain. Optional: skip, limit.

GET /api/audit-logs/export — Export as CSV.

## 8.16 App User Endpoints (Admin only)

GET /api/app-users — List for active domain.

POST /api/app-users — Add to active domain.

DELETE /api/app-users/{username} — Remove (cannot delete self).

## 8.17 Notification Endpoints

POST /api/notifications/test-email — Send test email (Admin only).

## 8.18 Report Endpoints (All scoped to active domain)

GET /api/reports/summary — Complete summary.

GET /api/reports/users/by-department — Users by department.

GET /api/reports/computers/by-os — Computers by OS.

GET /api/reports/users/recently-active — Recently active users.

GET /api/reports/users/domain-logins-summary — Login activity counts.

GET /api/reports/users/never-logged-in — Never logged in.

GET /api/reports/users/inactive — Inactive users.

GET /api/reports/users/locked — Locked users.

GET /api/reports/users/disabled — Disabled users.

GET /api/reports/export/{type} — Export report as CSV.

## 8.19 DNS Endpoints (v2.6.0 — Admin only, per-domain)

GET /api/dns/zones — List all DNS zones.

GET /api/dns/zones/{zone_name}/records — List records with optional type filter.

POST /api/dns/zones/{zone_name}/records/a — Create A record.

POST /api/dns/zones/{zone_name}/records/cname — Create CNAME record.

POST /api/dns/zones/{zone_name}/records/ptr — Create PTR record.

PUT /api/dns/zones/{zone_name}/records — Update existing record.

DELETE /api/dns/zones/{zone_name}/records — Delete record.

GET /api/dns/test — Test DNS server connectivity.

## 8.20 DHCP Endpoints (v2.6.0 — Admin only, per-domain)

GET /api/dhcp/scopes — List all DHCP scopes with statistics.

GET /api/dhcp/scopes/{scope_id}/reservations — List reservations.

POST /api/dhcp/scopes/{scope_id}/reservations — Create reservation.

PUT /api/dhcp/scopes/{scope_id}/reservations/{ip} — Update reservation.

DELETE /api/dhcp/scopes/{scope_id}/reservations/{ip} — Delete reservation.

GET /api/dhcp/scopes/{scope_id}/leases — List active leases.

POST /api/dhcp/scopes/{scope_id}/leases/{ip}/release — Release lease.

DELETE /api/dhcp/scopes/{scope_id}/leases/{ip} — Delete lease.

GET /api/dhcp/test — Test DHCP server connectivity.

---

# 9. FRONTEND PAGES REFERENCE

16 pages plus Layout component.

Login.jsx — Domain selector dropdown (mandatory selection), username/password, blocks login if no domains.

Dashboard.jsx — Domain login activity cards, quick stat cards with drill-down, charts. Dynamic domain badge from localStorage.

Users.jsx — Sortable table (User, Email, Department, Status), checkboxes, bulk operations, all modals.

Groups.jsx — Grid cards, member management, search.

Computers.jsx — Sortable table (Computer, OS, DNS Name, Last Logon, Status), checkboxes, LAPS key icon, bulk operations, SortHeader component.

OUs.jsx — List, parent picker, contents browser with tabs.

ServiceAccounts.jsx — Grid cards, create/import/edit/delete, AD sync.

GPO.jsx — Two tabs (GPO grid, OU links), detail modal.

Photos.jsx — Grid, Canvas upload, filter.

Templates.jsx — Grid cards, create from template.

Workflows.jsx — Status tabs, approve/reject.

Sessions.jsx — Auto-refresh, force logout (Admin only).

Reports.jsx — Login activity cards, drill-down modals, charts, CSV export. Dynamic domain badge.

AuditLogs.jsx — Paginated table, CSV export.

Settings.jsx — Five tabs: Domains (CRUD with DNS/DHCP fields), AD (global fallback), Visibility, Password Policy, Email.

DNS.jsx (v2.6.0) — DNS management with zone selector, record type filter (A/CNAME/PTR), search, sortable columns (Hostname, Type, Value, TTL), create/edit/delete record modals, multi-select checkboxes, bulk delete with progress bar, test connection button, copy to clipboard, active server indicator.

DHCP.jsx (v2.6.0) — DHCP management with scope selector, statistics panel (mask, in use, free, reservations), Reservations tab (sortable table with checkboxes, CRUD modals, bulk delete, bulk edit description with progress bar), Active Leases tab (sortable table with checkboxes, Description column, State badge, Expires column, bulk release), test connection button, active server indicator.

Layout.jsx — Sidebar with collapsible navigation, workflow/session badges, DNS/DHCP menu items (Admin only), top header bar with domain indicator and Admin-only domain switcher dropdown.

---

# PART IV — MODULES

---

# 10. MULTI-DOMAIN SUPPORT

## 10.1 Login Flow

1. GET /api/domains (no auth) populates dropdown
2. User selects domain, enters credentials
3. Backend validates user in app_users for that domain
4. Backend authenticates against domain's DC
5. JWT with domain_id issued
6. domain_id and domain_name stored in localStorage

## 10.2 Domain Switch Flow (Admin Only)

1. Click Switch Domain in header
2. Select target domain
3. localStorage updated
4. Page reloads
5. Backend validates authorization via X-Domain-ID header
6. All data loads from new domain (AD, DNS, DHCP)

## 10.3 Adding Users to Multiple Domains

1. Login as Admin to first domain
2. Verify user exists in Settings → App Users
3. Switch to second domain
4. Add same username via Settings → App Users
5. User can now switch between domains

## 10.4 Data Isolation

Per-domain: app_users, audit_logs, sessions, service_accounts, workflows, templates, AD data, DNS zones/records, DHCP scopes/reservations/leases.

Global: visibility settings, password policy, email SMTP.

## 10.5 Security

Domain passwords Fernet encrypted. Public endpoint exposes only name and FQDN. Full details require Admin. Switching requires authorization in target domain. JWT domain_id used for identity, X-Domain-ID header for data scoping.

---

# 11. WINDOWS LAPS INTEGRATION

## 11.1 Prerequisites

Windows LAPS configured on domain. LAPS module on server. Server computer account in LAPS decryption group. Server rebooted after group addition.

## 11.2 Usage

Gold key icon on Computers page → Enter reason (min 5 chars) → View password (30-sec auto-hide) → Copy to clipboard → View History (last 5) → Force rotation.

## 11.3 Security

Admin only. Reason mandatory. Every access logged with operator, reason, IP, timestamp. No caching. Computer name sanitized to prevent injection.

---

# 12. DNS MANAGEMENT

## 12.1 Overview

AD Manager Pro v2.6.0 adds full DNS management through PowerShell remoting. Administrators can view DNS zones, browse records, and perform CRUD operations on A, CNAME, and PTR records directly from the web interface. DNS operations are per-domain with automatic failover to secondary DNS server if the primary is unavailable.

## 12.2 Prerequisites

RSAT DNS Tools must be installed on the AD Manager Pro server:

    Install-WindowsFeature -Name RSAT-DNS-Server

The service account (svc-admanager) must be a member of these groups on each DNS server: Administrators, DnsAdmins, Remote Management Users.

WinRM must be enabled on each DNS server (enabled by default on Windows Server 2012 R2+).

For IP-based remoting (cross-domain), the DNS server IPs must be added to TrustedHosts on the AD Manager Pro server:

    Set-Item WSMan:\localhost\Client\TrustedHosts -Value "DC01_IP,DC02_IP,PDC_IP" -Force

## 12.3 Architecture

DNS operations use PowerShell subprocess with Invoke-Command to run cmdlets remotely on the DNS server configured in the domain profile. Each domain profile stores its own DNS server primary and secondary IPs. The DNSService class handles automatic failover — if the primary DNS server fails, it tries the secondary before returning an error.

The backend creates a PSCredential object using the domain profile's service account and encrypted password for each PowerShell invocation. This enables cross-domain DNS management from a single server.

## 12.4 Supported Record Types

A (IPv4 host records) — Full CRUD. CNAME (alias records) — Full CRUD. PTR (reverse lookup records) — Full CRUD.

Other record types (AAAA, MX, TXT, SRV, NS) are not currently managed but may appear in read-only listing.

## 12.5 Features

Zone selector dropdown showing all non-auto-created DNS zones. Record type filter (All, A, CNAME, PTR). Real-time search by hostname, value, or type. Sortable columns (Hostname, Type, Value, TTL) with visual sort indicators.

Create Record modal with dynamic form that changes based on selected record type. A records require hostname and IP address. CNAME records require alias name and target FQDN. PTR records require last IP octet and hostname FQDN. All types support custom TTL (default 3600 seconds).

Edit Record modal showing current value with inline editing of new value and TTL. Update is performed as atomic delete-then-add to ensure consistency.

Delete with confirmation dialog. Single-record delete via action button.

Multi-select with checkboxes on each record row. Header checkbox for select all filtered records. Selected count indicator. Bulk Actions purple dropdown with Delete Selected option. Progress bar during bulk operations showing current/total with failure count.

Test DNS connection button verifying server reachability and displaying active server IP.

Copy to clipboard button on record values.

Active server indicator showing which DNS server (primary or failover) is currently serving requests.

## 12.6 Failover Behavior

For domains with both primary and secondary DNS servers configured, the DNSService tries the primary server first. If the primary fails (timeout, connection refused, authentication error), it automatically tries the secondary server. The active server is reported in the UI so the administrator knows which server is currently serving requests.

For domains with only a primary DNS server, no failover is attempted. If the primary fails, the error is returned directly.

## 12.7 Audit Logging

Every DNS create, update, and delete operation is logged to the audit trail with operator username and role, action type (DNS A Record Created, DNS Record Updated, DNS Record Deleted, etc.), object name (hostname.zonename), details including IP/target/TTL values and operation result, client IP address, and domain ID (per-domain scoping).

---

# 13. DHCP MANAGEMENT

## 13.1 Overview

AD Manager Pro v2.6.0 adds full DHCP management through PowerShell remoting. Administrators can view DHCP scopes with statistics, manage reservations (full CRUD), and view/release active leases. DHCP operations are per-domain with automatic failover to secondary DHCP server.

## 13.2 Prerequisites

RSAT DHCP Tools must be installed on the AD Manager Pro server:

    Install-WindowsFeature -Name RSAT-DHCP

The service account (svc-admanager) must be a member of these groups on each DHCP server: Administrators, DHCP Administrators, Remote Management Users.

WinRM must be enabled on each DHCP server. TrustedHosts must include DHCP server IPs for cross-domain remoting.

## 13.3 Architecture

DHCP operations use the same PowerShell subprocess pattern as DNS. Each domain profile stores DHCP server primary and secondary IPs. The DHCPService class handles automatic failover. PSCredential is constructed from the domain profile's service account credentials for each invocation.

## 13.4 Features

### 13.4.1 Scope Management (Read-Only View)

Scope selector dropdown showing all DHCPv4 scopes with name, IP range, and state. Scope statistics panel showing subnet mask, addresses in use (with percentage), addresses free, and reservation count. Statistics update when scope is selected.

### 13.4.2 Reservations Tab (Full CRUD + Bulk Operations)

Sortable table with columns: IP Address, MAC (ClientID), Name, Description, Actions. Create reservation modal with IP address, MAC address (accepts any format — dashes, colons, or plain hex), name, and description fields. MAC automatically normalized to 12-character hex format.

Edit reservation modal for changing name and description. IP and MAC cannot be changed (must delete and recreate). Delete with confirmation.

Multi-select with checkboxes. Header select all. Bulk Actions dropdown with Edit Description (opens modal to set same description for all selected, supports clearing) and Delete Selected (with progress bar).

### 13.4.3 Active Leases Tab (View + Release + Bulk Release)

Sortable table with columns: IP Address, MAC, Hostname, Description, State (color-coded badge), Expires (formatted datetime), Actions. State badge colors: green for Active, blue for Reservation, default for others.

Release lease with confirmation (frees the IP address). Bulk release with multi-select checkboxes and progress bar.

Search across IP, MAC, hostname, and description on both tabs.

## 13.5 Failover Behavior

Same pattern as DNS. Primary server tried first, secondary on failure. Active server displayed in UI. Domains without secondary configured will not attempt failover.

## 13.6 Audit Logging

Every DHCP reservation create, update, delete, and lease release is logged with operator, action type, target IP and scope, MAC address, name, description details, result, client IP, and domain ID.

---

# PART V — SETUP & DEPLOYMENT

---

# 14. ACTIVE DIRECTORY PERMISSIONS

## 14.1 AD Object Permissions

Run setup_permissions.ps1 on each Domain Controller as Domain Admin for each managed domain:

    powershell -ExecutionPolicy Bypass -File setup_permissions.ps1

Permissions applied: Read all objects. Create/Delete/Modify users, groups, computers, OUs. Reset passwords (requires LDAPS). Manage group membership. Move objects between OUs. Read GPOs.

Password operations (unicodePwd) require LDAPS (port 636).

## 14.2 DNS/DHCP Server Group Memberships (v2.6.0)

On each DNS/DHCP server the service account must be a member of:

1. Administrators — Required for CIM/WMI access that DNS and DHCP PowerShell cmdlets use under the hood
2. DnsAdmins — Grants DNS server management permissions
3. DHCP Administrators — Grants DHCP server management permissions
4. Remote Management Users — Allows WinRM remote PowerShell connections

These groups are typically configured once per domain and apply to all DCs in that domain via AD replication.

Add via PowerShell on any DC:

    Add-ADGroupMember -Identity "Administrators" -Members "svc-admanager"
    Add-ADGroupMember -Identity "DnsAdmins" -Members "svc-admanager"
    Add-ADGroupMember -Identity "DHCP Administrators" -Members "svc-admanager"
    Add-ADGroupMember -Identity "Remote Management Users" -Members "svc-admanager"

## 14.3 RSAT Installation on AD Manager Pro Server

Required for DNS and DHCP management features (v2.6.0).

Windows Server 2016/2019/2022:

    Install-WindowsFeature -Name RSAT-DNS-Server
    Install-WindowsFeature -Name RSAT-DHCP

Windows 10/11 Client:

    Add-WindowsCapability -Online -Name "Rsat.Dns.Tools~~~~0.0.1.0"
    Add-WindowsCapability -Online -Name "Rsat.DHCP.Tools~~~~0.0.1.0"

Verify installation:

    Get-WindowsFeature -Name RSAT-DNS-Server, RSAT-DHCP | Select Name, InstallState

## 14.4 WinRM TrustedHosts (Cross-Domain Only)

For domains where the AD Manager Pro server is NOT a member, add DC IPs to TrustedHosts:

    Set-Item WSMan:\localhost\Client\TrustedHosts -Value "DC01_IP,DC02_IP,PDC_IP" -Force

---

# 15. COMPLETE SETUP GUIDE

## 15.1 Prerequisites

Python 3.11+. Node.js 18+ LTS. DC access on port 389/636. AD service account per domain. Windows admin access. For DNS/DHCP: RSAT DNS/DHCP Tools installed.

## 15.2 Automated Installation

    powershell -ExecutionPolicy Bypass -File install.ps1

## 15.3 Manual Backend Installation

    python -m venv venv
    pip install -r requirements.txt

Create .env with SECRET_KEY. Start once to seed domains.

## 15.4 Manual Frontend Installation

    npm install
    npm install esbuild --save-dev
    npm run build

Copy dist to backend/static.

## 15.5 Post-Install Configuration

1. Update domain profiles with real passwords via Settings → Domains
2. Add authorized users per domain
3. Configure DNS/DHCP server IPs in each domain profile (v2.6.0)
4. Add service account to required groups on each DC (v2.6.0)
5. Install RSAT tools on AD Manager Pro server (v2.6.0)
6. Configure TrustedHosts for cross-domain DC IPs (v2.6.0)

---

# 16. PRODUCTION DEPLOYMENT GUIDE

## 16.1 Service Configuration

service.cmd with quoted paths. Windows Scheduled Task as SYSTEM at startup. Firewall rule on port 8080 for all network profiles.

## 16.2 Service Management

    schtasks /run /tn "AD Manager Pro"
    schtasks /end /tn "AD Manager Pro"
    schtasks /query /tn "AD Manager Pro"

## 16.3 Access URLs

Main UI: http://servername:8080

Swagger API docs: http://servername:8080/docs

ReDoc API docs: http://servername:8080/redoc

Health check: http://servername:8080/api/health

Domain list (public): http://servername:8080/api/domains

---

# 17. INSTALLER SCRIPT GUIDE

install.ps1 — 13-step automated installer.

uninstall.ps1 — Standalone uninstaller with optional database backup.

setup_permissions.ps1 — DC permission setup. Run per domain.

---

# PART VI — OPERATIONS

---

# 18. BACKUP AND RESTORE

## 18.1 Critical Files

audit.db — Contains all domain profiles (including DNS/DHCP configs), users, audit data.

.env — Contains SECRET_KEY needed to decrypt domain passwords.

Python source files — app.py, models.py, ad_service.py, dns_service.py, dhcp_service.py.

## 18.2 Backup Commands

    Copy-Item "backend\database\audit.db" "backup\audit-$(Get-Date -Format 'yyyyMMdd').db"
    Copy-Item "backend\.env" "backup\.env.backup"

## 18.3 Restore Process

1. Copy files back
2. Create venv: python -m venv venv
3. Install packages: pip install -r requirements.txt
4. Rebuild frontend: npm install && npm install esbuild --save-dev && npm run build
5. Deploy: Copy dist to backend/static
6. Start service

Warning: Without original SECRET_KEY, domain passwords must be re-entered via Settings UI.

---

# 19. TROUBLESHOOTING GUIDE

## 19.1 Login Issues

Login page shows "No domains available" — Restart backend, verify GET /api/domains returns data.

User not authorized for domain X — Add user to target domain via Settings → App Users.

Existing users cannot login after upgrade — Run migration script to assign domain_id.

## 19.2 Domain Switching

Dashboard/Reports show wrong domain name — Fixed in v2.5.2, now reads from localStorage. Hard refresh browser.

Data from wrong domain — Verify X-Domain-ID header in browser DevTools Network tab.

403 when switching domains — User not authorized in target domain. Add via Settings → App Users.

Domain switcher not visible — Admin only by design.

## 19.3 Database

"no such column domain_id" — Run ALTER TABLE migration script.

UNIQUE constraint failed on app_users.username — Run migration to change constraint to (username, domain_id).

UNIQUE constraint failed on service_accounts.username — Run migration to change constraint to (username, domain_id).

## 19.4 AD Connection

invalidCredentials data 775 — Service account locked. Unlock on DC.

WinError 10060 connection timeout — Wrong DC IP, firewall blocking port, LDAPS not configured.

WILL_NOT_PERFORM — LDAPS required for password operations.

## 19.5 Build Issues

Cannot find package esbuild — Run: npm install esbuild --save-dev

Unexpected token BOM in JSON — Use System.IO.File.WriteAllText with UTF8NoBom encoding.

## 19.6 LAPS Issues

Decryption failed Unauthorized — Server not in LAPS decryption group or not rebooted.

Get-LapsADPassword not recognized — Install RSAT LAPS module.

## 19.7 Network Issues

App not accessible on secondary NICs — Set firewall rule profile to Any. Change NIC network category to Private. Check VLAN assignments on switch.

## 19.8 DNS Issues (v2.6.0)

DNS page shows "Failed to load zones" — DNS server unreachable, credentials incorrect, or RSAT not installed. Verify DNS server IP in Settings → Domains. Run Test DNS button. Check RSAT installation. Verify service account is in DnsAdmins and Administrators on DNS server.

DNS record update fails — Update is performed as atomic delete-then-add. If the old record value has changed since loading, the delete fails. Refresh the records list and try again with current values.

## 19.9 DHCP Issues (v2.6.0)

DHCP page shows "Failed to load scopes" — DHCP server unreachable, credentials incorrect, or RSAT not installed. Same troubleshooting as DNS — verify IP, test connection, check RSAT and group memberships.

Bulk delete shows partial failures — Some records may be protected or already deleted by another admin. Check error details in browser console. Retry with remaining records.

## 19.10 DNS/DHCP Common Issues (v2.6.0)

"Cannot connect to CIM server. Access denied" — Service account not in Administrators group on the remote DNS/DHCP server. DnsAdmins and DHCP Administrators alone are insufficient for CIM/WMI access. Fix: Add service account to Administrators group on each DNS/DHCP server.

"WinRM client cannot process the request" (IP address) — IP-based PowerShell remoting requires TrustedHosts configuration. Fix: Set-Item WSMan:\localhost\Client\TrustedHosts -Value "all_dc_ips" -Force

DNS/DHCP operations timeout after 60 seconds — Network latency, DNS/DHCP service overloaded, or firewall blocking WinRM (port 5985). Test with: Test-NetConnection -ComputerName DC_IP -Port 5985. Verify WinRM service is running on the target server.

---

# 20. MAINTENANCE SCHEDULE

## 20.1 Weekly

Review audit logs per domain. Check LAPS views. Verify backups. Review DNS/DHCP audit entries for unusual activity.

## 20.2 Monthly

Review app_users per domain. Check service account passwords. Review workflows. Test DNS/DHCP failover behavior.

## 20.3 Quarterly

Test backup restore. Rotate service account passwords per domain. Update packages. Test all domain connections. Verify DNS/DHCP server IPs are current. Review WinRM TrustedHosts configuration.

## 20.4 Yearly

Full security audit. Archive audit logs. Review domain profiles. Audit svc-admanager group memberships on all DCs. Review DNS/DHCP delegated permissions.

---

# 21. GITHUB DEPLOYMENT

## 21.1 .gitignore

backend/.env, backend/venv/, backend/database/, backend/logs/, backend/static/, backend/__pycache__/, frontend/node_modules/, frontend/dist/, frontend/.vite/

## 21.2 Initial Push

    git init
    git add .
    git commit -m "AD Manager Pro v2.6.0"
    git remote add origin https://github.com/username/ad-manager-pro.git
    git push -u origin main

## 21.3 Deploy on New Machine

    git clone https://github.com/username/ad-manager-pro.git
    cd ad-manager-pro
    powershell -ExecutionPolicy Bypass -File install.ps1

Post-install: Configure domain profiles via Settings → Domains. Add DNS/DHCP server IPs. Install RSAT tools. Configure svc-admanager group memberships on DCs. Configure TrustedHosts for cross-domain IPs.

---

# PART VII — HISTORY

---

# 22. CHANGELOG

## v2.6.0 (Current)

DNS and DHCP Management:
- Added full DNS management (A, CNAME, PTR records) with CRUD operations
- Added full DHCP management (Reservations CRUD, Leases view/release)
- New backend: dns_service.py (238 lines) using PowerShell remoting with auto-failover
- New backend: dhcp_service.py (263 lines) using PowerShell remoting with auto-failover
- Both services support primary/secondary server automatic failover
- Uses subprocess to invoke DNS/DHCP cmdlets remotely via Invoke-Command with PSCredential
- Cross-domain authentication handled with encrypted per-domain credentials

Database Changes:
- 4 new columns in domain_profiles: dns_server_primary, dns_server_secondary, dhcp_server_primary, dhcp_server_secondary
- Auto-populated existing domain profiles with DC IPs for DNS/DHCP servers

API Endpoints:
- 6 DNS endpoints: zones list, records list/create A/CNAME/PTR/update/delete, test connection
- 7 DHCP endpoints: scopes list, reservations CRUD, leases list/release/delete, test connection
- All DNS/DHCP endpoints Admin-only with full audit logging

Frontend Pages:
- New: DNS.jsx (562 lines) with zone selector, record type filter, search, sortable columns, create/edit modals, multi-select bulk delete with progress bar
- New: DHCP.jsx (802 lines) with scope selector, statistics panel, Reservations tab with CRUD + bulk delete + bulk edit description, Active Leases tab with Description column + bulk release
- Sidebar: DNS (Globe icon) and DHCP (Wifi icon) menu items (Admin only)
- Settings: DNS/DHCP server IP fields added to Domain profile modal
- App.jsx: /dns and /dhcp routes with AdminRoute protection
- api.js: 8 DNS + 9 DHCP client functions

Infrastructure:
- RSAT DNS and DHCP Tools required on AD Manager Pro server
- Service account requires Administrators + DnsAdmins + DHCP Administrators + Remote Management Users on all DCs
- WinRM TrustedHosts configured for IP-based cross-domain remoting

## v2.5.2

- Added sortable columns to Computers page: Computer, OS, DNS Name, Last Logon, Status
- Sort icons show ascending/descending state on active column, faded double arrow on inactive
- Date columns sort chronologically, string columns sort alphabetically
- Added SortHeader reusable component to Computers.jsx
- Fixed hardcoded "abasyn.local" domain badge on Dashboard — now reads from localStorage
- Fixed hardcoded "abasyn.local" domain badge on Reports — now reads from localStorage
- Dashboard and Reports dynamically display the active domain name

## v2.5.1

- Fixed critical bug: get_current_user now properly validates X-Domain-ID header for domain switching
- Users authorized in multiple domains can switch seamlessly via header dropdown
- Backend validates user authorization in target domain before allowing access
- Returns 403 with clear message if user tries to switch to unauthorized domain
- Domain resolution: JWT domain_id for identity, X-Domain-ID header for data scoping
- Database migrations: app_users constraint to (username, domain_id), service_accounts constraint to (username, domain_id)

## v2.5.0

- Added multi-domain Active Directory management
- New domain_profiles database table with encrypted credentials per domain
- Domain selector dropdown on login page (mandatory selection)
- Domain switcher in top header bar (Admin only)
- New Domains tab in Settings with Add/Edit/Delete/Test/Set Default
- Per-domain data isolation for all domain-scoped tables
- App users scoped to specific domains
- ADService refactored with domain_profile parameter
- All API routes use X-Domain-ID header
- JWT token contains domain_id claim
- Seven new /api/domains endpoints
- domain_id column added to six tables
- Top header bar added to Layout
- esbuild required for Vite 8+

## v2.4.0

- Added Windows LAPS integration
- LapsPasswordModal with three-step flow
- PowerShell subprocess for encrypted LAPS
- Password auto-hides after 30 seconds
- Mandatory reason logged to audit trail
- Force password rotation
- Password history (last 5)
- Fixed computer move operation
- Updated setup_permissions.ps1

## v2.3.0

- Backend refactored into 3 files
- Home folder network path and drive letter support
- Domain login activity cards
- Sortable columns on Users table
- Password show/hide and generate
- Bulk Update from CSV
- HTTP-only deployment

## v2.2.2

- Bulk operations (import, modify, move, action)
- Service account management
- User templates with group auto-assignment
- Workflow approval system
- GPO viewing
- User photo management
- Active session tracking
- ManageEngine-style reports dashboard
- Complete audit logging
- Encrypted settings storage

$docPath = "C:\DC Pro\public\DC-Manager-Pro-Documentation-v2.6.0.md"

$appendText = @'

---

## 18.13 Backup and Restore Scripts v3.1

### backup.ps1 v3.1

Full backup script that captures the complete application state including Python virtual environment.

**Location:** C:\DC Pro\public\backup.ps1

**What Gets Backed Up (v3.1 additions):**
- Python virtual environment (venv folder) — eliminates need to reinstall Python packages after restore
- service.cmd — Windows scheduled task wrapper with correct Python path
- SSL certificates (cert.crt, cert.pem, key.pem)
- All utility scripts (add_user.py, generate_cert.py, init_db.py, test_*.py, *.bat)
- Scheduled task XML exports for both app and backup tasks
- backup-info.json with metadata (version, timestamp, hostname, includes/excludes)
- README.md with inline restore instructions

**Excludes:** node_modules, dist, .vite, __pycache__

**Usage:**

Manual run:

    powershell -ExecutionPolicy Bypass -File "C:\DC Pro\public\backup.ps1"

Custom backup location:

    powershell -ExecutionPolicy Bypass -File "C:\DC Pro\public\backup.ps1" -BackupDir "D:\Backups\DCManagerPro"

Automated daily at 2:00 AM via scheduled task: DC Manager Pro - Daily Backup

**Retention:** 30 days automatic cleanup. Change -30 value in script for different retention.

**Typical backup size:** 15-50 MB (larger than v3.0 due to venv inclusion).

### restore.ps1 v3.1

Interactive restore script with backup selection menu, confirmation prompt, and automatic health verification.

**Location:** C:\DC Pro\public\restore.ps1

**Features:**
- Interactive backup selector — lists last 10 backups with size and date
- Confirmation prompt before overwriting (must type YES)
- Automatic service stop before restore and start after restore
- Creates all required folder structure before file copy
- Restores venv — no need to reinstall Python or packages
- Restores service.cmd — scheduled task works immediately
- Health check verification after restore
- Post-restore checklist displayed on completion
- Handles missing backup components gracefully with warnings

**Usage:**

Interactive mode (shows backup list, prompts for selection):

    powershell -ExecutionPolicy Bypass -File "C:\DC Pro\public\restore.ps1"

Direct restore from specific backup:

    powershell -ExecutionPolicy Bypass -File "C:\DC Pro\public\restore.ps1" -BackupZip "C:\DC Pro\Backups\DCPro-FULL-20260803-194500.zip"

Restore to different path:

    powershell -ExecutionPolicy Bypass -File "C:\DC Pro\public\restore.ps1" -BackupZip "path\to\backup.zip" -ProjectPath "D:\DCPro\public"

### Restore Process (v3.1)

1. Script stops DC Manager Pro scheduled task
2. Extracts backup ZIP to temporary folder
3. Displays backup metadata (version, date, source host)
4. Creates all required directories
5. Copies backend Python files individually
6. Restores database (audit.db)
7. Restores logs
8. Restores static frontend build (removes old, copies fresh)
9. Restores Python venv (removes old, copies fresh)
10. Restores frontend source (excluding node_modules)
11. Saves scheduled task XML exports
12. Starts DC Manager Pro scheduled task
13. Waits 5 seconds and runs health check
14. Displays result and post-restore checklist

### Critical Path Note (v3.1)

The venv in DC Pro uses Python from C:\AD Pro\public\backend\venv\Scripts\python.exe (the original AD Manager Pro installation). The service.cmd references this path. If the AD Pro folder is removed, Python must be installed system-wide and a new venv created:

    cd C:\DC Pro\public\backend
    python -m venv venv
    .\venv\Scripts\activate
    pip install -r requirements.txt

Then update service.cmd to use the new venv path.

---

## v2.6.1 (Changelog Entry)

Backup and Restore:
- Updated backup.ps1 to v3.1 with full venv backup support
- Updated restore.ps1 to v3.1 with interactive backup selection and confirmation
- Backup now includes Python virtual environment for zero-dependency restore
- Backup includes service.cmd, SSL certificates, utility scripts, and scheduled task exports
- Backup includes backup-info.json metadata file with version, timestamp, hostname
- Restore script creates proper folder structure before copy operations
- Restore script displays backup metadata before restoring
- Restore script runs automatic health check after restore
- Restore script shows post-restore checklist
- Fixed temp folder cleanup issue in backup and restore scripts
- Typical backup size increased from 0.5-2 MB to 15-50 MB due to venv inclusion

Service Configuration:
- Created service.cmd for DC Pro using AD Pro Python venv path
- Fixed scheduled task to use correct service.cmd location
- Documented Python path dependency on AD Pro installation

'@

# Check if doc file exists
if (Test-Path $docPath) {
    Add-Content -Path $docPath -Value $appendText
    Write-Host "✅ Documentation updated: $docPath"
} else {
    # Try alternate location
    $altPath = "C:\DC Pro\public\documentation.md"
    if (Test-Path $altPath) {
        Add-Content -Path $altPath -Value $appendText
        Write-Host "✅ Documentation updated: $altPath"
    } else {
        # Create new file
        Set-Content -Path $docPath -Value $appendText
        Write-Host "✅ Documentation created: $docPath"
    }
}
---
---
# v2.6.1 — Role-Based Sidebar Permissions

## Overview
DC Manager Pro v2.6.1 introduces a dynamic sidebar permission system that allows Administrators to control which pages are visible to Helpdesk and Viewer roles without requiring code changes or restarts.

## How It Works
- **Admin** — Always has full access to all pages regardless of permission settings
- **Helpdesk** — Sees only pages toggled ON in Settings → Permissions tab
- **Viewer** — Sees only pages toggled ON in Settings → Permissions tab
- **Settings** — Always Admin only, not configurable
- **Audit Logs** — Always Admin only, not configurable
- **Route Protection** — Hidden pages are also blocked at URL level. Direct URL access redirects to Dashboard

## Configuring Permissions
1. Login as Admin
2. Navigate to **Settings → Permissions**
3. Toggle modules ON or OFF for the **Helpdesk** and **Viewer** columns
4. Use **All On** or **All Off** to bulk toggle a role
5. Click **Save Permissions**
6. Changes take effect immediately for active sessions

## Toggleable Modules

| Module | Helpdesk | Viewer |
|---|---|---|
| Dashboard | Toggleable | Toggleable |
| Users | Toggleable | Toggleable |
| Groups | Toggleable | Toggleable |
| Computers | Toggleable | Toggleable |
| OUs | Toggleable | Toggleable |
| DNS | Toggleable | Toggleable |
| DHCP | Toggleable | Toggleable |
| Service Accounts | Toggleable | Toggleable |
| GPOs | Toggleable | Toggleable |
| User Photos | Toggleable | Toggleable |
| Templates | Toggleable | Toggleable |
| Workflows | Toggleable | Toggleable |
| Sessions | Toggleable | Toggleable |
| Reports | Toggleable | Toggleable |
| Settings | Admin Only | Admin Only |
| Audit Logs | Admin Only | Admin Only |

## Storage
Permissions are stored in the `app_settings` table as two JSON-based setting keys:
- `helpdesk_sidebar_permissions`
- `viewer_sidebar_permissions`

Example stored value:

~~~json
{
  "dashboard": true,
  "users": true,
  "groups": true,
  "computers": true,
  "ous": false,
  "dns": true,
  "dhcp": true,
  "service-accounts": false,
  "gpo": false,
  "photos": false,
  "templates": true,
  "workflows": true,
  "sessions": false,
  "reports": true
}
~~~

## Backend Implementation

### Permission Helper
A new helper function `require_permission(module)` was added to `app.py`.

Behavior:
- **Admin** always allowed
- **Settings** and **Audit Logs** always denied for non-admins
- **Helpdesk** and **Viewer** permissions are read from the `app_settings` JSON values
- Returns HTTP 403 if access is disabled for the current role

### Updated Endpoint Protection
The following endpoint groups now use dynamic permission checks:

#### DNS Endpoints
- `GET /api/dns/zones`
- `GET /api/dns/zones/{zone_name}/records`
- `POST /api/dns/zones/{zone_name}/records/a`
- `POST /api/dns/zones/{zone_name}/records/cname`
- `POST /api/dns/zones/{zone_name}/records/ptr`
- `PUT /api/dns/zones/{zone_name}/records`
- `DELETE /api/dns/zones/{zone_name}/records`
- `GET /api/dns/test`

#### DHCP Endpoints
- `GET /api/dhcp/scopes`
- `GET /api/dhcp/scopes/{scope_id}/reservations`
- `POST /api/dhcp/scopes/{scope_id}/reservations`
- `PUT /api/dhcp/scopes/{scope_id}/reservations/{ip}`
- `DELETE /api/dhcp/scopes/{scope_id}/reservations/{ip}`
- `GET /api/dhcp/scopes/{scope_id}/leases`
- `POST /api/dhcp/scopes/{scope_id}/leases/{ip}/release`
- `DELETE /api/dhcp/scopes/{scope_id}/leases/{ip}`
- `GET /api/dhcp/test`

#### Sessions Endpoints
- `GET /api/sessions`
- `DELETE /api/sessions/{session_id}`

## Frontend Implementation

### Settings Page
A new **Permissions** tab was added to `Settings.jsx`.

Features:
- Permission matrix for Helpdesk and Viewer
- Toggle controls for all configurable modules
- **All On** and **All Off** shortcuts per role
- Locked **Admin Only** rows for Settings and Audit Logs
- Save button persists permissions through `PUT /api/settings`

### Sidebar
`Layout.jsx` now:
- Fetches permissions from `GET /api/settings` on load
- Dynamically filters sidebar items for Helpdesk and Viewer
- Keeps Admin visibility unchanged
- Preserves badges, collapse behavior, domain switcher, and user profile panel

### Route Guard
`App.jsx` now includes a `PermissionRoute` component.

Behavior:
- Checks permissions before allowing access to toggleable routes
- Admin bypasses checks
- Non-admin users are redirected to Dashboard if access is disabled
- Settings and Audit Logs remain protected by `AdminRoute`

## Security Notes
- Sidebar visibility is not the only control; backend access is also enforced
- Direct URL navigation does not bypass restrictions
- Admin cannot accidentally remove their own access
- Settings and Audit Logs remain permanently restricted to Admin role
- Permission changes apply immediately without restart

## Operational Notes
- Frontend was rebuilt and redeployed to `backend/static`
- Backend health verified successfully after deployment
- Git repository updated and pushed to GitHub
- Backup and restore scripts remain compatible with v2.6.1

## Changelog Entry

### v2.6.1

#### Permissions System
- Added dynamic sidebar permission system for Helpdesk and Viewer roles
- Added new **Permissions** tab in Settings
- Added permission matrix for 14 toggleable modules
- Added `helpdesk_sidebar_permissions` and `viewer_sidebar_permissions` settings
- Added `require_permission()` helper to backend
- Updated DNS, DHCP, and Sessions endpoints to use dynamic permission checks
- Added dynamic sidebar filtering in `Layout.jsx`
- Added route-level access control in `App.jsx`
- Redirects unauthorized direct URL access to Dashboard
- Settings and Audit Logs remain Admin only

#### Backup / Restore / Git
- backup.ps1 updated to include full environment support
- restore.ps1 updated with interactive restore and verification
- gitupdate.ps1 updated for DC Manager Pro naming and workflow
- Frontend rebuilt and redeployed successfully
- Changes committed and pushed to GitHub

# 23. DOCUMENT METADATA

Document Version: 2.6.0
Application Version: 2.6.0
Backend Files: 5 (app.py, models.py, ad_service.py, dns_service.py, dhcp_service.py)
Total API Endpoints: 110+
Total Frontend Pages: 16 (14 core + DNS + DHCP)
Total Database Tables: 8
Sortable Tables: Users (4 columns), Computers (5 columns), DNS Records (4 columns), DHCP Reservations (4 columns), DHCP Leases (6 columns)
Supported Protocol: HTTP (port 8080)
Authentication: JWT with AD LDAP bind (per-domain, X-Domain-ID header switching)
Encryption: Fernet AES for domain passwords and SMTP password
Database: SQLite (zero configuration)
Deployment: Windows Task Scheduler
LAPS Support: Windows LAPS with encryption via PowerShell
Multi-Domain: Yes (unlimited profiles, seamless switching for authorized users)
DNS Management: Full CRUD for A, CNAME, PTR records with PowerShell remoting and failover
DHCP Management: Reservations CRUD + Leases view/release with PowerShell remoting and failover
Bulk Operations: Users, Computers, DNS Records, DHCP Reservations, DHCP Leases
License: MIT

---

# v2.6.2 — DHCP Lease Deletion Fix

## Overview
DC Manager Pro v2.6.2 fixes a critical bug where DHCP lease deletion and release operations always failed with the misleading error message **"No DHCP server available"**, even when the DHCP server was fully reachable and the service account had all required permissions.

## Root Cause
Two issues in `backend/dhcp_service.py` caused the failure:

### Issue 1: Incorrect Parameter Set
The `Remove-DhcpServerv4Lease` PowerShell cmdlet does **not** accept both `-ScopeId` and `-IPAddress` parameters simultaneously. Passing both triggers a PowerShell parameter binding error:

> `Parameter set cannot be resolved using the specified named parameters. (AmbiguousParameterSet)`

Because an IP address is globally unique on a DHCP server, the cmdlet only requires `-IPAddress`.

### Issue 2: Missing Confirmation Suppression
`Remove-DhcpServerv4Lease` and `Remove-DhcpServerv4Reservation` are interactive by default. When invoked from a background subprocess with no console, PowerShell aborts because it cannot display the confirmation prompt:

> *"Are you sure you want to perform this action?"*

Both failures caused the backend to fall through to the failover branch, which then returned the generic **"No DHCP server available"** error, masking the real cause.

## The Fix
Updated `release_lease()` and `delete_reservation()` methods in `backend/dhcp_service.py`:

### Before (Broken)
```python
def release_lease(self, scope_id: str, ip: str) -> Tuple[bool, str]:
    script = f"""
Get-DhcpServerv4Lease -ScopeId '{scope_id}' -IPAddress '{ip}' | Remove-DhcpServerv4Lease
"""
```

### After (Fixed)
```python
def release_lease(self, scope_id: str, ip: str) -> Tuple[bool, str]:
    script = f"""
Remove-DhcpServerv4Lease -IPAddress '{ip}' -Confirm:$false
"""
```

### Reservation Deletion Fix
```python
# Before
Remove-DhcpServerv4Reservation -ScopeId '{scope_id}' -IPAddress '{ip}'

# After
Remove-DhcpServerv4Reservation -ScopeId '{scope_id}' -IPAddress '{ip}' -Confirm:$false
```

## Diagnostic Process
This issue was traced through the following steps:
1. Verified database contained correct DHCP server IPs in `domain_profiles` table
2. Confirmed backend was returning `"No DHCP server available"` from failover fallback branch
3. Verified service account (`svc-admanager`) group memberships on the DC — all correct:
   - Administrators
   - DHCP Administrators
   - DnsAdmins
   - Remote Management Users
4. Ran direct PowerShell remoting test to DHCP server which revealed the actual error: `AmbiguousParameterSet`
5. Confirmed working syntax uses only `-IPAddress` with `-Confirm:$false`
6. Applied patch and validated deletion from the web UI

## Files Modified
- `backend/dhcp_service.py` — Fixed `release_lease()` and `delete_reservation()` methods

## Impact
- DHCP lease release from **Active Leases** tab now works
- DHCP lease bulk release now works
- DHCP reservation deletion now works
- DHCP reservation bulk deletion now works
- Actual PowerShell errors are now correctly propagated (no longer masked as "No DHCP server available" unless the server is truly unreachable)

## Troubleshooting Notes Added
Added to Section 19 (Troubleshooting):

**Symptom:** `{"detail":"No DHCP server available"}` returned even though DHCP server is reachable and permissions are correct.

**Cause:** In versions prior to v2.6.2, the PowerShell command passed both `-ScopeId` and `-IPAddress` to `Remove-DhcpServerv4Lease`, which is invalid. The failure fell through to the failover branch and returned a misleading error.

**Fix:** Upgrade to v2.6.2 or manually patch `backend/dhcp_service.py`:
- `release_lease()` — use only `-IPAddress '{ip}' -Confirm:$false`
- `delete_reservation()` — add `-Confirm:$false`

**Verification:** Restart backend service and test deletion from the DHCP → Active Leases tab.

## Git Update & Push Commands

Run these commands from the project root:

```powershell
cd "C:\DC Pro\public"
git add .
git commit -m "v2.6.2: Fix DHCP lease/reservation deletion - remove invalid -ScopeId param and add -Confirm:false"
git push origin main
git tag -a v2.6.2 -m "v2.6.2 - DHCP lease deletion fix"
git push origin v2.6.2
```

## Changelog Entry

### v2.6.2

#### Bug Fixes
- Fixed DHCP lease deletion returning `"No DHCP server available"` error
- Fixed DHCP lease bulk release operations
- Fixed DHCP reservation deletion missing `-Confirm:$false` flag
- Fixed DHCP reservation bulk delete operations
- Removed invalid `-ScopeId` parameter from `Remove-DhcpServerv4Lease` command
- Added `-Confirm:$false` to all remote DHCP `Remove-*` cmdlets
- Actual PowerShell errors are now propagated correctly instead of being masked by the failover fallback

#### Files Modified
- `backend/dhcp_service.py` — `release_lease()` and `delete_reservation()` methods corrected

---
---

# v2.6.4 — Character Encoding (Mojibake) Repair & Clean UTF-8 Search

## Overview
DC Manager Pro v2.6.4 resolves UI text and icon corruption (mojibake such as `ðŸ'`, `â±`, `ðŸ"œ`) across the application caused by PowerShell 5.1 default ANSI/Windows-1252 encoding during file modifications. All source files were restored from clean UTF-8 Git history, and the multi-column search enhancement was re-applied using strict .NET UTF-8 (No BOM) stream writers.

## Root Cause
When PowerShell 5.1 reads or writes files using `Get-Content` / `Set-Content` without specifying explicit UTF-8 encoding, it defaults to ANSI (Windows-1252). This converted raw Unicode emojis (🔑, 🔒, ⏱️, 📋, 📜, 🔄) into garbled multi-byte sequences. When Vite compiled the frontend bundle, the garbled text was minified into the output JavaScript assets.

## The Fix
1. **Source File Restoration:** Restored clean UTF-8 source code from Git tag `v2.6.2` (`git checkout v2.6.2 -- frontend/src/`).
2. **Strict UTF-8 Code Ingestion:** Modified patching scripts to use native .NET `System.IO.File` methods with `System.Text.UTF8Encoding($false)` to prevent encoding loss.
3. **Multi-Column Search Retention:** Maintained the real-time client-side multi-column search on `Computers.jsx` and the 5-attribute LDAP query in `ad_service.py` without introducing character corruption.
4. **Clean Asset Deployment:** Cleared `backend/static/` completely before copying the freshly built, uncorrupted production bundle.

## Files Modified
- `frontend/src/pages/Computers.jsx` — Restored UTF-8 encoding; multi-column search clean patch
- `backend/ad_service.py` — Multi-attribute LDAP search filter retained

## Changelog Entry

### v2.6.4

#### Bug Fixes
- Fixed UI text and icon corruption (mojibake) across modals and buttons
- Fixed file encoding degradation caused by PowerShell 5.1 default ANSI file I/O
- Rebuilt production static assets with clean UTF-8 source code

#### Improvements
- Retained real-time multi-column search on Computers page across all 8 columns
- Standardized all automated build and patch scripts to use strict .NET UTF-8 (No BOM) stream handlers

#### Files Modified
- `frontend/src/pages/Computers.jsx`
- `backend/ad_service.py`