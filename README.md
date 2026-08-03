# AD Manager Pro v2.4.0

Enterprise Active Directory Management Platform with Windows LAPS Integration

## Overview

AD Manager Pro is a modern web-based platform for managing Active Directory environments. Built with Python FastAPI and React, it provides a dark-themed responsive UI for common AD administration tasks including user, group, computer, OU, and GPO management, with role-based access control and comprehensive audit logging.

## Key Features

- Complete AD user, group, computer, and OU management
- Windows LAPS integration for local admin password recovery with encryption support
- Bulk operations from CSV with preview and error reporting
- Home folder path support with %username% placeholder
- Service account management with dual AD+DB tracking
- User templates for standardized account creation
- Workflow approval system with 6 request types
- GPO viewing with OU link reporting
- User photo management with automatic Canvas processing
- Active session tracking with force-logout capability
- Domain login activity reporting across 6 time periods
- Comprehensive audit logging with CSV export
- Role-based access control (Admin, Helpdesk, Viewer)
- Dynamic settings with encrypted password storage
- ManageEngine-style dashboard with interactive charts

## Requirements

- Windows 10/11 or Windows Server 2016+
- Python 3.11 or higher
- Node.js 18 LTS or higher
- Active Directory Domain Controller access
- Service account with appropriate LDAP permissions

For LAPS features:
- Windows LAPS configured on domain
- Windows Server 2019+ or Windows 10 21H2+ clients
- LAPS PowerShell module on the AD Manager Pro server
- Server computer account added to LAPS decryption group

## Quick Start

Run the automated installer as Administrator:

    powershell -ExecutionPolicy Bypass -File install.ps1

The installer will:
1. Install Python 3.12 and Node.js 20 if missing
2. Configure AD connection settings
3. Build the frontend
4. Create Windows scheduled task
5. Configure firewall rule
6. Start the application

After installation, access the app at http://servername:8080

## AD Permission Setup

Run on Domain Controller as Domain Admin:

    powershell -ExecutionPolicy Bypass -File setup_permissions.ps1

## LAPS Setup (Optional)

On Domain Controller:

    Add-ADGroupMember -Identity "IT Admins" -Members "SERVERNAME$"

On AD Manager Pro server:

    Restart-Computer -Force

## Documentation

See documentation.md for complete setup guide, API reference, feature descriptions, troubleshooting, and architecture details.

## Architecture

- Backend: Python FastAPI with 3-file split (app.py, models.py, ad_service.py)
- Frontend: React 18 + Vite + Tailwind CSS with dark theme
- Database: SQLite (zero configuration)
- Authentication: JWT tokens with 8-hour expiration
- AD Integration: ldap3 library with LDAPS support
- LAPS Integration: PowerShell subprocess for encrypted password decryption
- Deployment: Windows Task Scheduler running as SYSTEM

## License

MIT License