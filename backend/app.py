"""
DC Manager Pro - FastAPI Application
=====================================
Contains: All API routes and FastAPI setup
"""

import os
import csv
import io
import json
import logging
from datetime import datetime, timedelta
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from ldap3 import MODIFY_REPLACE, Connection, SIMPLE
import uvicorn

from models import (
    config, SessionLocal, get_db, Session,
    AuditLog, AppUser, AppSetting, UserTemplate, WorkflowRequest,
    ActiveSession, ServiceAccount, Token, DomainProfile,
    oauth2_scheme, create_access_token, hash_token,
    get_current_user, require_admin, log_action,
    get_client_ip, get_user_agent, send_email,
    init_default_settings, init_default_domains,
    get_setting, reload_config_from_db,
    encrypt_value, decrypt_value, ENCRYPTED_KEYS, PASSWORD_MASK,
    get_setting_category, safe_int, safe_str, safe_datetime_str, clean_value,
    get_domain_profile, get_domain_password,
)
from ad_service import ADService, get_ad_service_for_domain, ad_service, LDAP_AVAILABLE
from dns_service import DNSService, get_dns_service_for_domain
from dhcp_service import DHCPService, get_dhcp_service_for_domain

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════
# LIFESPAN
# ═══════════════════════════════════════════════════════════
@asynccontextmanager
async def lifespan(app):
    logger.info("DC Manager Pro v2.6.0 Starting")
    db = SessionLocal()
    try:
        init_default_settings(db)
        init_default_domains(db)
        reload_config_from_db(db, ad_service)
    finally:
        db.close()
    yield


app = FastAPI(
    title="DC Manager Pro API",
    version="2.6.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ═══════════════════════════════════════════════════════════
# DOMAIN DEPENDENCIES
# ═══════════════════════════════════════════════════════════
def get_domain_id_from_header(x_domain_id: Optional[str] = Header(None)) -> Optional[int]:
    """Extract domain_id from X-Domain-ID header"""
    if x_domain_id:
        try:
            return int(x_domain_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid X-Domain-ID header")
    return None


def get_domain_or_404(
    domain_id: Optional[int] = Depends(get_domain_id_from_header),
    db: Session = Depends(get_db)
) -> DomainProfile:
    """Get domain profile from header or fall back to default. Raises 404 if not found."""
    if domain_id:
        domain = db.query(DomainProfile).filter(DomainProfile.id == domain_id).first()
    else:
        domain = db.query(DomainProfile).filter(DomainProfile.is_default == True).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain profile not found")
    return domain


def get_domain_service(
    domain: DomainProfile = Depends(get_domain_or_404)
) -> ADService:
    """Returns ADService instance configured for the requested domain"""
    return get_ad_service_for_domain(domain)


def get_dns_service(
    domain: DomainProfile = Depends(get_domain_or_404)
) -> DNSService:
    """Returns DNSService instance configured for the requested domain"""
    return get_dns_service_for_domain(domain)


def get_dhcp_service(
    domain: DomainProfile = Depends(get_domain_or_404)
) -> DHCPService:
    """Returns DHCPService instance configured for the requested domain"""
    return get_dhcp_service_for_domain(domain)


# ═══════════════════════════════════════════════════════════
# HEALTH & AUTH
# ═══════════════════════════════════════════════════════════
@app.get("/api/health")
async def health(db: Session = Depends(get_db)):
    domain = db.query(DomainProfile).filter(DomainProfile.is_default == True).first()
    return {
        "status":    "healthy",
        "ldap":      LDAP_AVAILABLE,
        "domain":    domain.ad_domain if domain else config.AD_DOMAIN,
        "server":    domain.ad_server_primary if domain else config.AD_SERVER_PRIMARY,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/api/ad/test")
async def test_ad(
    svc: ADService       = Depends(get_domain_service),
    cu:  AppUser         = Depends(get_current_user)
):
    r = svc.test_connection()
    if not r["connected"]:
        raise HTTPException(status_code=503, detail=r)
    return r


@app.post("/api/auth/login", response_model=Token)
async def login(
    fd:      OAuth2PasswordRequestForm = Depends(),
    request: Request                   = None,
    db:      Session                   = Depends(get_db),
    x_domain_id: Optional[str]         = Header(None)
):
    ip = get_client_ip(request)

    # Resolve domain
    domain_id = None
    if x_domain_id:
        try:
            domain_id = int(x_domain_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid domain ID")

    if domain_id:
        domain = db.query(DomainProfile).filter(DomainProfile.id == domain_id).first()
    else:
        domain = db.query(DomainProfile).filter(DomainProfile.is_default == True).first()

    if not domain:
        raise HTTPException(status_code=400, detail="No domain configured. Contact administrator.")

    username = fd.username.strip().lower()

    # Check app_users scoped to this domain
    au = db.query(AppUser).filter(
        AppUser.username.ilike(username),
        AppUser.domain_id == domain.id,
        AppUser.active == True
    ).first()

    if not au:
        log_action(db, fd.username, "Unknown", "Login Failed", "Auth",
                   fd.username, f"Not authorized for domain: {domain.name}",
                   "Failed", ip, domain_id=domain.id)
        raise HTTPException(status_code=401, detail=f"User not authorized for domain '{domain.name}'")

    # Authenticate against the correct domain's DC
    svc = get_ad_service_for_domain(domain)
    if not svc.authenticate_user(fd.username.strip(), fd.password):
        log_action(db, fd.username, au.role, "Login Failed", "Auth",
                   fd.username, "Bad credentials", "Failed", ip, domain_id=domain.id)
        raise HTTPException(status_code=401, detail="Invalid AD credentials")

    au.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token({
        "sub":       au.username,
        "role":      au.role,
        "domain_id": domain.id
    })

    try:
        th = hash_token(token)
        db.query(ActiveSession).filter(
            ActiveSession.username  == au.username,
            ActiveSession.domain_id == domain.id
        ).delete()
        db.add(ActiveSession(
            username     = au.username,
            display_name = au.display_name,
            role         = au.role,
            ip_address   = ip,
            user_agent   = get_user_agent(request),
            login_time   = datetime.utcnow(),
            last_activity= datetime.utcnow(),
            token_hash   = th,
            domain_id    = domain.id
        ))
        db.commit()
    except:
        pass

    log_action(db, au.username, au.role, "Login Success", "Auth",
               au.username, f"From {ip} | Domain: {domain.name}",
               "Success", ip, domain_id=domain.id)

    return {
        "access_token": token,
        "token_type":   "bearer",
        "role":         au.role,
        "display_name": au.display_name,
        "username":     au.username,
        "domain_id":    domain.id,
        "domain_name":  domain.name
    }


@app.get("/api/auth/me")
async def get_me(cu: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    domain = db.query(DomainProfile).filter(DomainProfile.id == cu.domain_id).first()
    return {
        "username":    cu.username,
        "display_name":cu.display_name,
        "email":       cu.email,
        "role":        cu.role,
        "domain_id":   cu.domain_id,
        "domain_name": domain.name if domain else ""
    }


@app.post("/api/auth/logout")
async def logout(
    token: str     = Depends(oauth2_scheme),
    db:    Session = Depends(get_db)
):
    try:
        db.query(ActiveSession).filter(
            ActiveSession.token_hash == hash_token(token)
        ).delete()
        db.commit()
    except:
        pass
    return {"success": True}


# ═══════════════════════════════════════════════════════════
# DOMAIN PROFILES
# ═══════════════════════════════════════════════════════════
@app.get("/api/domains")
async def list_domains_public(db: Session = Depends(get_db)):
    """Public endpoint - returns domain list for login page (no credentials exposed)"""
    domains = db.query(DomainProfile).order_by(DomainProfile.id).all()
    return {
        "domains": [
            {
                "id":         d.id,
                "name":       d.name,
                "ad_domain":  d.ad_domain,
                "is_default": d.is_default
            }
            for d in domains
        ],
        "count": len(domains)
    }


@app.get("/api/domains/full")
async def list_domains_full(
    cu: AppUser  = Depends(require_admin),
    db: Session  = Depends(get_db)
):
    """Admin only - returns full domain details including connection settings"""
    domains = db.query(DomainProfile).order_by(DomainProfile.id).all()
    return {
        "domains": [
            {
                "id":                   d.id,
                "name":                 d.name,
                "ad_server_primary":    d.ad_server_primary,
                "ad_server_secondary":  d.ad_server_secondary or "",
                "ad_domain":            d.ad_domain,
                "ad_base_dn":           d.ad_base_dn,
                "ad_service_account":   d.ad_service_account,
                "ad_service_password":  PASSWORD_MASK,
                "ad_use_ldaps":         d.ad_use_ldaps,
                "ad_port":              d.ad_port,
                "ad_default_user_ou":   d.ad_default_user_ou or "",
                "dns_server_primary":   d.dns_server_primary or "",
                "dns_server_secondary": d.dns_server_secondary or "",
                "dhcp_server_primary":  d.dhcp_server_primary or "",
                "dhcp_server_secondary":d.dhcp_server_secondary or "",
                "is_default":           d.is_default,
                "created_at":           d.created_at.isoformat() if d.created_at else None
            }
            for d in domains
        ],
        "count": len(domains)
    }


@app.post("/api/domains")
async def create_domain(
    payload: dict,
    request: Request,
    cu:      AppUser  = Depends(require_admin),
    db:      Session  = Depends(get_db)
):
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Domain name is required")
    if db.query(DomainProfile).filter(DomainProfile.name == name).first():
        raise HTTPException(status_code=400, detail=f"Domain '{name}' already exists")

    pwd_raw = payload.get("ad_service_password", "")
    if not pwd_raw:
        raise HTTPException(status_code=400, detail="Service account password is required")

    use_ldaps = payload.get("ad_use_ldaps", True)
    if isinstance(use_ldaps, str):
        use_ldaps = use_ldaps.lower() == "true"

    d = DomainProfile(
        name                  = name,
        ad_server_primary     = payload.get("ad_server_primary", "").strip(),
        ad_server_secondary   = payload.get("ad_server_secondary", "").strip(),
        ad_domain             = payload.get("ad_domain", "").strip(),
        ad_base_dn            = payload.get("ad_base_dn", "").strip(),
        ad_service_account    = payload.get("ad_service_account", "").strip(),
        ad_service_password   = encrypt_value(pwd_raw),
        ad_use_ldaps          = use_ldaps,
        ad_port               = int(payload.get("ad_port", 636)),
        ad_default_user_ou    = payload.get("ad_default_user_ou", "").strip(),
        dns_server_primary    = payload.get("dns_server_primary", "").strip(),
        dns_server_secondary  = payload.get("dns_server_secondary", "").strip(),
        dhcp_server_primary   = payload.get("dhcp_server_primary", "").strip(),
        dhcp_server_secondary = payload.get("dhcp_server_secondary", "").strip(),
        is_default            = False
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    log_action(db, cu.username, cu.role, "Domain Created", "Domain",
               name, f"DC: {d.ad_server_primary}", "Success", get_client_ip(request))
    return {"success": True, "id": d.id, "message": f"Domain '{name}' created"}


@app.put("/api/domains/{domain_id}")
async def update_domain(
    domain_id: int,
    payload:   dict,
    request:   Request,
    cu:        AppUser  = Depends(require_admin),
    db:        Session  = Depends(get_db)
):
    d = db.query(DomainProfile).filter(DomainProfile.id == domain_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Domain not found")

    if "name" in payload and payload["name"].strip():
        d.name = payload["name"].strip()
    if "ad_server_primary" in payload:
        d.ad_server_primary = payload["ad_server_primary"].strip()
    if "ad_server_secondary" in payload:
        d.ad_server_secondary = payload["ad_server_secondary"].strip()
    if "ad_domain" in payload:
        d.ad_domain = payload["ad_domain"].strip()
    if "ad_base_dn" in payload:
        d.ad_base_dn = payload["ad_base_dn"].strip()
    if "ad_service_account" in payload:
        d.ad_service_account = payload["ad_service_account"].strip()
    if "ad_service_password" in payload and payload["ad_service_password"] != PASSWORD_MASK:
        d.ad_service_password = encrypt_value(payload["ad_service_password"])
    if "ad_use_ldaps" in payload:
        v = payload["ad_use_ldaps"]
        d.ad_use_ldaps = (str(v).lower() == "true") if isinstance(v, str) else bool(v)
    if "ad_port" in payload:
        d.ad_port = int(payload["ad_port"])
    if "ad_default_user_ou" in payload:
        d.ad_default_user_ou = payload["ad_default_user_ou"].strip()
    if "dns_server_primary" in payload:
        d.dns_server_primary = payload["dns_server_primary"].strip()
    if "dns_server_secondary" in payload:
        d.dns_server_secondary = payload["dns_server_secondary"].strip()
    if "dhcp_server_primary" in payload:
        d.dhcp_server_primary = payload["dhcp_server_primary"].strip()
    if "dhcp_server_secondary" in payload:
        d.dhcp_server_secondary = payload["dhcp_server_secondary"].strip()

    db.commit()
    log_action(db, cu.username, cu.role, "Domain Updated", "Domain",
               d.name, "Settings updated", "Success", get_client_ip(request))
    return {"success": True, "message": f"Domain '{d.name}' updated"}


@app.delete("/api/domains/{domain_id}")
async def delete_domain(
    domain_id: int,
    request:   Request,
    cu:        AppUser  = Depends(require_admin),
    db:        Session  = Depends(get_db)
):
    d = db.query(DomainProfile).filter(DomainProfile.id == domain_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Domain not found")
    if d.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default domain")
    if db.query(DomainProfile).count() <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the only domain")

    name = d.name
    db.delete(d)
    db.commit()
    log_action(db, cu.username, cu.role, "Domain Deleted", "Domain",
               name, "Domain profile removed", "Success", get_client_ip(request))
    return {"success": True, "message": f"Domain '{name}' deleted"}


@app.post("/api/domains/{domain_id}/test")
async def test_domain_connection(
    domain_id: int,
    payload:   dict,
    cu:        AppUser  = Depends(require_admin),
    db:        Session  = Depends(get_db)
):
    d = db.query(DomainProfile).filter(DomainProfile.id == domain_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Domain not found")

    # Use submitted password if provided and not masked, else use stored
    pwd = payload.get("ad_service_password", "")
    if not pwd or pwd == PASSWORD_MASK:
        pwd = get_domain_password(d)

    custom = {
        "ad_server_primary":  payload.get("ad_server_primary", d.ad_server_primary),
        "ad_port":            int(payload.get("ad_port", d.ad_port)),
        "ad_use_ldaps":       payload.get("ad_use_ldaps", d.ad_use_ldaps),
        "ad_service_account": payload.get("ad_service_account", d.ad_service_account),
        "ad_service_password":pwd,
        "ad_base_dn":         payload.get("ad_base_dn", d.ad_base_dn),
    }
    svc = get_ad_service_for_domain(d)
    r   = svc.test_connection(custom_settings=custom)
    if not r.get("connected"):
        raise HTTPException(status_code=400, detail=r.get("error", "Connection failed"))
    return r


@app.post("/api/domains/{domain_id}/set-default")
async def set_default_domain(
    domain_id: int,
    request:   Request,
    cu:        AppUser  = Depends(require_admin),
    db:        Session  = Depends(get_db)
):
    d = db.query(DomainProfile).filter(DomainProfile.id == domain_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Domain not found")

    # Clear existing default
    db.query(DomainProfile).filter(DomainProfile.is_default == True).update(
        {"is_default": False}
    )
    d.is_default = True
    db.commit()

    # Reload global config from new default
    reload_config_from_db(db, ad_service)

    log_action(db, cu.username, cu.role, "Default Domain Changed", "Domain",
               d.name, f"Set as default domain", "Success", get_client_ip(request))
    return {"success": True, "message": f"'{d.name}' is now the default domain"}


# ═══════════════════════════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════════════════════════
@app.get("/api/settings")
async def get_settings(
    cu: AppUser  = Depends(get_current_user),
    db: Session  = Depends(get_db)
):
    init_default_settings(db)
    r = {}
    for s in db.query(AppSetting).all():
        v = s.value
        if s.key in ENCRYPTED_KEYS:
            v = PASSWORD_MASK if v else ""
        r[s.key] = v
    return r


@app.put("/api/settings")
async def update_settings(
    payload: dict,
    cu:      AppUser  = Depends(require_admin),
    db:      Session  = Depends(get_db),
    request: Request  = None
):
    init_default_settings(db)
    updated = []
    for k, v in payload.items():
        if k in ENCRYPTED_KEYS and v == PASSWORD_MASK:
            continue
        if isinstance(v, bool):
            v = "true" if v else "false"
        sv = str(v) if v is not None else ""
        if k in ENCRYPTED_KEYS and sv:
            sv = encrypt_value(sv)
        s = db.query(AppSetting).filter(AppSetting.key == k).first()
        if s:
            s.value = sv
            s.updated_by = cu.username
        else:
            db.add(AppSetting(
                key=k, value=sv,
                category=get_setting_category(k),
                updated_by=cu.username
            ))
        updated.append(k)
    db.commit()
    log_action(db, cu.username, cu.role, "Settings Updated", "Settings",
               "system", f"{', '.join(updated)}", "Success", get_client_ip(request),
               domain_id=cu.domain_id)
    return {"success": True, "message": f"Saved {len(updated)} settings"}


@app.post("/api/settings/test-connection")
async def test_conn_settings(
    payload: dict,
    cu:      AppUser  = Depends(require_admin),
    db:      Session  = Depends(get_db)
):
    svc = get_ad_service_for_domain(
        db.query(DomainProfile).filter(DomainProfile.id == cu.domain_id).first()
    )
    r = svc.test_connection(custom_settings=payload)
    if not r.get("connected"):
        raise HTTPException(status_code=400, detail=r.get("error", "Failed"))
    return r


@app.post("/api/settings/change-service-password")
async def change_service_password(
    payload: dict,
    cu:      AppUser  = Depends(require_admin),
    db:      Session  = Depends(get_db)
):
    domain = db.query(DomainProfile).filter(DomainProfile.id == cu.domain_id).first()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")

    np = payload.get("newPassword", "")
    if not np or len(np) < 12:
        raise HTTPException(status_code=400, detail="New password must be at least 12 characters")

    svc     = get_ad_service_for_domain(domain)
    svc_un  = domain.ad_service_account.split("@")[0] if "@" in domain.ad_service_account else domain.ad_service_account

    try:
        conn = svc._get_connection()
        u    = svc._find_user(conn, svc_un)
        if not u:
            conn.unbind()
            raise HTTPException(status_code=404, detail=f"Service account '{svc_un}' not found")
        dn = safe_str(u.distinguishedName.value)
        pv = f'"{np}"'.encode("utf-16-le")
        r  = conn.modify(dn, {"unicodePwd": [(MODIFY_REPLACE, [pv])]})
        if not r:
            em = conn.result.get('message', 'Unknown')
            conn.unbind()
            raise HTTPException(status_code=500, detail=f"Password rejected by Active Directory. Ensure it meets complexity requirements (uppercase, lowercase, number, special character, min 8 chars) and was not recently used. Details: {em}")
        conn.unbind()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Password rejected by Active Directory. Ensure it meets complexity requirements (uppercase, lowercase, number, special character, min 8 chars) and was not recently used. Details: {str(e)}")

    domain.ad_service_password = encrypt_value(np)
    db.commit()
    log_action(db, cu.username, cu.role, "Service Password Changed", "Settings",
               svc_un, f"Password changed for domain: {domain.name}",
               "Success", "", domain_id=cu.domain_id)
    return {"success": True, "message": f"Password changed for {domain.ad_service_account}"}


# ═══════════════════════════════════════════════════════════
# USERS
# ═══════════════════════════════════════════════════════════
@app.get("/api/users")
async def get_users(
    search:        Optional[str]  = None,
    ou:            Optional[str]  = None,
    status_filter: Optional[str]  = None,
    show_builtin:  Optional[bool] = None,
    cu:            AppUser        = Depends(get_current_user),
    db:            Session        = Depends(get_db),
    svc:           ADService      = Depends(get_domain_service)
):
    if show_builtin is None:
        show_builtin = get_setting(db, "show_builtin_users", "false").lower() == "true"
    f = ""
    if search:
        f = (f"(|(sAMAccountName=*{search}*)(displayName=*{search}*)"
             f"(givenName=*{search}*)(sn=*{search}*)(mail=*{search}*)(department=*{search}*))")
    users = svc.get_users(base_dn=ou, search_filter=f, show_builtin=show_builtin)
    if status_filter:
        users = [u for u in users if u["status"] == status_filter]
    return {
        "users":       users,
        "count":       len(users),
        "domain":      svc.domain,
        "ou":          ou or svc._get_fresh_target_ou(),
        "showBuiltin": show_builtin
    }


@app.get("/api/users/{username}")
async def get_one_user(
    username: str,
    cu:       AppUser   = Depends(get_current_user),
    svc:      ADService = Depends(get_domain_service)
):
    u = svc.get_user(username)
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    return u


@app.post("/api/users")
async def create_user(
    data:    dict,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.create_user(data)
    log_action(db, cu.username, cu.role, "User Created", "User",
               data.get("username", ""), m,
               "Success" if s else "Failed", get_client_ip(request), domain_id=cu.domain_id)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.put("/api/users/{username}")
async def update_user(
    username: str,
    payload:  dict,
    request:  Request,
    cu:       AppUser   = Depends(get_current_user),
    db:       Session   = Depends(get_db),
    svc:      ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.update_user(username, payload)
    log_action(db, cu.username, cu.role, "User Updated", "User",
               username, m, "Success" if s else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.delete("/api/users/{username}")
async def delete_user_route(
    username: str,
    request:  Request,
    cu:       AppUser   = Depends(require_admin),
    db:       Session   = Depends(get_db),
    svc:      ADService = Depends(get_domain_service)
):
    s, m = svc.delete_user(username)
    log_action(db, cu.username, cu.role, "User Deleted", "User",
               username, m, "Success" if s else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.post("/api/users/{username}/move")
async def move_user_route(
    username: str,
    payload:  dict,
    request:  Request,
    cu:       AppUser   = Depends(get_current_user),
    db:       Session   = Depends(get_db),
    svc:      ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    tou = payload.get("target_ou", "").strip()
    if not tou:
        raise HTTPException(status_code=400, detail="target_ou required")
    s, m = svc.move_user(username, tou)
    log_action(db, cu.username, cu.role, "User Moved", "User",
               username, f"To {tou}", "Success" if s else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.post("/api/users/bulk-import")
async def bulk_import(
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    ud  = payload.get("users", [])
    if not ud:
        raise HTTPException(status_code=400, detail="No users")
    res = {"total": len(ud), "created": 0, "failed": 0, "errors": [], "success": []}
    for u in ud:
        try:
            if not u.get("ou"):
                u["ou"] = svc.target_ou
            if not u.get("displayName") and u.get("firstName"):
                u["displayName"] = f"{u.get('firstName','')} {u.get('lastName','')}".strip()
            if not u.get("upn") or '@' not in str(u.get("upn", "")):
                u["upn"] = f"{u['username']}@{svc.domain}"
            s, m = svc.create_user(u)
            if s:
                res["created"] += 1
                res["success"].append(u["username"])
                log_action(db, cu.username, cu.role, "User Created (Bulk)", "User",
                           u["username"], m, "Success",
                           get_client_ip(request), domain_id=cu.domain_id)
            else:
                res["failed"] += 1
                res["errors"].append({"username": u.get("username", "?"), "error": m})
        except Exception as e:
            res["failed"] += 1
            res["errors"].append({"username": u.get("username", "?"), "error": str(e)})
    return res


@app.post("/api/users/bulk-modify")
async def bulk_modify(
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    ups = payload.get("updates", [])
    res = {"total": len(ups), "updated": 0, "failed": 0, "errors": [], "success": []}
    for u in ups:
        un = u.pop("username", "").strip()
        if not un:
            continue
        try:
            s, m = svc.update_user(un, u)
            if s:
                res["updated"] += 1
                res["success"].append(un)
                log_action(db, cu.username, cu.role, "User Updated (Bulk)", "User",
                           un, m, "Success", get_client_ip(request), domain_id=cu.domain_id)
            else:
                res["failed"] += 1
                res["errors"].append({"username": un, "error": m})
        except Exception as e:
            res["failed"] += 1
            res["errors"].append({"username": un, "error": str(e)})
    return res


@app.post("/api/users/bulk-update-csv")
async def bulk_update_csv(
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    rows = payload.get("rows", [])
    if not rows:
        return {"total": 0, "updated": 0, "failed": 0, "errors": []}
    column_map = {
        "username": "username", "user": "username", "samaccountname": "username",
        "firstname": "firstName", "first_name": "firstName", "givenname": "firstName",
        "lastname": "lastName", "last_name": "lastName", "surname": "lastName", "sn": "lastName",
        "displayname": "displayName", "display_name": "displayName",
        "email": "email", "mail": "email",
        "department": "department", "dept": "department",
        "title": "title", "jobtitle": "title", "job_title": "title",
        "company": "company", "office": "office",
        "phone": "phone", "telephone": "phone",
        "description": "description", "manager": "manager",
        "homedirectory": "homeDirectory", "home_directory": "homeDirectory",
        "homedir": "homeDirectory", "homefolder": "homeDirectory",
        "homedrive": "homeDrive", "home_drive": "homeDrive", "drive": "homeDrive",
    }
    res = {"total": len(rows), "updated": 0, "failed": 0, "errors": [], "success": []}
    for idx, row in enumerate(rows, 1):
        normalized = {}
        for key, val in row.items():
            k = str(key).strip().lower().replace(" ", "").replace("-", "")
            if k in column_map:
                normalized[column_map[k]] = val
        username = str(normalized.pop("username", "")).strip()
        if not username:
            res["failed"] += 1
            res["errors"].append({"row": idx, "username": "", "error": "Missing username"})
            continue
        update_data = {k: v for k, v in normalized.items() if v and str(v).strip()}
        if not update_data:
            res["failed"] += 1
            res["errors"].append({"row": idx, "username": username, "error": "No fields to update"})
            continue
        try:
            s, m = svc.update_user(username, update_data)
            if s:
                res["updated"] += 1
                res["success"].append(username)
                log_action(db, cu.username, cu.role, "Bulk Update User", "User",
                           username, f"Fields: {list(update_data.keys())}",
                           "Success", get_client_ip(request), domain_id=cu.domain_id)
            else:
                res["failed"] += 1
                res["errors"].append({"row": idx, "username": username, "error": m})
        except Exception as e:
            res["failed"] += 1
            res["errors"].append({"row": idx, "username": username, "error": str(e)})
    return res


@app.post("/api/users/bulk-move")
async def bulk_move(
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    uns = payload.get("usernames", [])
    tou = payload.get("target_ou", "").strip()
    if not uns or not tou:
        raise HTTPException(status_code=400)
    res = {"total": len(uns), "moved": 0, "failed": 0, "errors": [], "success": []}
    for un in uns:
        try:
            s, m = svc.move_user(un, tou)
            if s:
                res["moved"] += 1
                res["success"].append(un)
            else:
                res["failed"] += 1
                res["errors"].append({"username": un, "error": m})
        except Exception as e:
            res["failed"] += 1
            res["errors"].append({"username": un, "error": str(e)})
    return res


@app.post("/api/users/bulk-action")
async def bulk_action(
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    uns = payload.get("usernames", [])
    act = payload.get("action", "").lower()
    ext = payload.get("extra", {})
    if act == "delete" and cu.role != "Admin":
        raise HTTPException(status_code=403)
    res = {"total": len(uns), "success_count": 0, "failed": 0, "errors": [], "success": []}
    for un in uns:
        try:
            s, m = False, "Unknown"
            if act == "enable":          s, m = svc.enable_user(un)
            elif act == "disable":       s, m = svc.disable_user(un)
            elif act == "unlock":        s, m = svc.unlock_user(un)
            elif act == "delete":        s, m = svc.delete_user(un)
            elif act == "reset-password":
                p = ext.get("password", "")
                if p and len(p) >= 8:   s, m = svc.reset_password(un, p, ext.get("forceChange", True))
                else:                   s, m = False, "Password too short"
            if s:
                res["success_count"] += 1
                res["success"].append(un)
            else:
                res["failed"] += 1
                res["errors"].append({"username": un, "error": m})
        except Exception as e:
            res["failed"] += 1
            res["errors"].append({"username": un, "error": str(e)})
    return res


@app.post("/api/users/{username}/disable")
async def disable_user(
    username: str,
    request:  Request,
    cu:       AppUser   = Depends(get_current_user),
    db:       Session   = Depends(get_db),
    svc:      ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.disable_user(username)
    log_action(db, cu.username, cu.role, "User Disabled", "User",
               username, m, "Success" if s else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.post("/api/users/{username}/enable")
async def enable_user(
    username: str,
    request:  Request,
    cu:       AppUser   = Depends(get_current_user),
    db:       Session   = Depends(get_db),
    svc:      ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.enable_user(username)
    log_action(db, cu.username, cu.role, "User Enabled", "User",
               username, m, "Success" if s else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.post("/api/users/{username}/unlock")
async def unlock_user(
    username: str,
    request:  Request,
    cu:       AppUser   = Depends(get_current_user),
    db:       Session   = Depends(get_db),
    svc:      ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.unlock_user(username)
    log_action(db, cu.username, cu.role, "Unlock", "User",
               username, m, "Success" if s else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.post("/api/users/{username}/reset-password")
async def reset_pw(
    username: str,
    payload:  dict,
    request:  Request,
    cu:       AppUser   = Depends(get_current_user),
    db:       Session   = Depends(get_db),
    svc:      ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    p = payload.get("password", "")
    if not p or len(p) < 8:
        raise HTTPException(status_code=400, detail="Password too short")
    s, m = svc.reset_password(username, p, payload.get("forceChange", True))
    log_action(db, cu.username, cu.role, "Password Reset", "User",
               username, m, "Success" if s else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


# ═══════════════════════════════════════════════════════════
# PHOTOS
# ═══════════════════════════════════════════════════════════
@app.get("/api/users/{username}/photo")
async def get_user_photo(
    username: str,
    svc:      ADService = Depends(get_domain_service)
):
    p = svc.get_user_photo(username)
    if not p:
        raise HTTPException(status_code=404, detail="No photo")
    return Response(content=p, media_type="image/jpeg")


@app.post("/api/users/{username}/photo")
async def upload_user_photo(
    username: str,
    file:     UploadFile = File(...),
    cu:       AppUser    = Depends(get_current_user),
    db:       Session    = Depends(get_db),
    svc:      ADService  = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    c = await file.read()
    if len(c) > 100000:
        raise HTTPException(status_code=400, detail="Photo too large")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Must be image")
    s, m = svc.set_user_photo(username, c)
    log_action(db, cu.username, cu.role, "Photo Updated", "User",
               username, m, "Success" if s else "Failed", "", domain_id=cu.domain_id)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.delete("/api/users/{username}/photo")
async def delete_user_photo_route(
    username: str,
    cu:       AppUser   = Depends(get_current_user),
    db:       Session   = Depends(get_db),
    svc:      ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.delete_user_photo(username)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


# ═══════════════════════════════════════════════════════════
# GROUPS
# ═══════════════════════════════════════════════════════════
@app.get("/api/groups")
async def get_groups(
    search:       Optional[str]  = None,
    show_builtin: Optional[bool] = None,
    cu:           AppUser        = Depends(get_current_user),
    db:           Session        = Depends(get_db),
    svc:          ADService      = Depends(get_domain_service)
):
    if show_builtin is None:
        show_builtin = get_setting(db, "show_builtin_groups", "false").lower() == "true"
    g = svc.get_groups(search=search, show_builtin=show_builtin)
    return {"groups": g, "count": len(g), "domain": svc.domain, "showBuiltin": show_builtin}


@app.post("/api/groups")
async def create_group(
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    n = payload.get("name", "").strip()
    if not n:
        raise HTTPException(status_code=400, detail="Name required")
    ou = payload.get("ou") or svc.base_dn
    s, m = svc.create_group(
        n, payload.get("description", ""), ou,
        payload.get("type", "security"), payload.get("scope", "global")
    )
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.delete("/api/groups/{group_name}")
async def delete_group(
    group_name: str,
    cu:         AppUser   = Depends(require_admin),
    svc:        ADService = Depends(get_domain_service)
):
    s, m = svc.delete_group(group_name)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.get("/api/groups/{group_name}/members")
async def group_members(
    group_name: str,
    cu:         AppUser   = Depends(get_current_user),
    svc:        ADService = Depends(get_domain_service)
):
    m = svc.get_group_members(group_name)
    if m is None:
        raise HTTPException(status_code=404, detail="Not found")
    return {"members": m, "count": len(m), "group": group_name}


@app.post("/api/groups/{group_name}/members/{username}")
async def add_member(
    group_name: str,
    username:   str,
    cu:         AppUser   = Depends(get_current_user),
    svc:        ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.add_to_group(username, group_name)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.delete("/api/groups/{group_name}/members/{username}")
async def remove_member(
    group_name: str,
    username:   str,
    cu:         AppUser   = Depends(get_current_user),
    svc:        ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.remove_from_group(username, group_name)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


# ═══════════════════════════════════════════════════════════
# COMPUTERS
# ═══════════════════════════════════════════════════════════
@app.get("/api/computers")
async def get_computers(
    search: Optional[str] = None,
    cu:     AppUser       = Depends(get_current_user),
    svc:    ADService     = Depends(get_domain_service)
):
    c = svc.get_computers(search=search)
    return {"computers": c, "count": len(c), "domain": svc.domain}


@app.post("/api/computers")
async def create_computer(
    payload: dict,
    cu:      AppUser   = Depends(require_admin),
    svc:     ADService = Depends(get_domain_service)
):
    n = payload.get("name", "").strip()
    if not n:
        raise HTTPException(status_code=400)
    ou = payload.get("ou") or f"CN=Computers,{svc.base_dn}"
    s, m = svc.create_computer(n, ou, payload.get("description", ""))
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.delete("/api/computers/{name}")
async def delete_computer(
    name: str,
    cu:   AppUser   = Depends(require_admin),
    svc:  ADService = Depends(get_domain_service)
):
    s, m = svc.delete_computer(name)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.post("/api/computers/{name}/enable")
async def enable_computer(
    name: str,
    cu:   AppUser   = Depends(get_current_user),
    svc:  ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.enable_computer(name)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.post("/api/computers/{name}/disable")
async def disable_computer(
    name: str,
    cu:   AppUser   = Depends(get_current_user),
    svc:  ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    s, m = svc.disable_computer(name)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.post("/api/computers/{name}/move")
async def move_computer(
    name:    str,
    payload: dict,
    cu:      AppUser   = Depends(get_current_user),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    tou = payload.get("target_ou", "").strip()
    if not tou:
        raise HTTPException(status_code=400)
    s, m = svc.move_computer(name, tou)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


# ═══════════════════════════════════════════════════════════
# WINDOWS LAPS
# ═══════════════════════════════════════════════════════════
@app.get("/api/computers/{name}/laps")
async def get_laps_password_route(
    name:    str,
    reason:  Optional[str] = None,
    request: Request       = None,
    cu:      AppUser       = Depends(get_current_user),
    db:      Session       = Depends(get_db),
    svc:     ADService     = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403, detail="Admin or Helpdesk role required")
    reason = (reason or "Viewed via Web UI").strip()[:200]
    ip     = get_client_ip(request)
    data, message = svc.get_laps_password(name)
    log_action(
        db, cu.username, cu.role,
        "LAPS Password Viewed" if data else "LAPS View Failed",
        "Computer", name,
        f"Reason: {reason} | Result: {message}",
        "Success" if data else "Failed",
        ip, domain_id=cu.domain_id
    )
    if not data:
        raise HTTPException(status_code=404, detail=message)
    return data


@app.get("/api/computers/{name}/laps/history")
async def get_laps_history_route(
    name:    str,
    reason:  Optional[str] = None,
    request: Request       = None,
    cu:      AppUser       = Depends(get_current_user),
    db:      Session       = Depends(get_db),
    svc:     ADService     = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403, detail="Admin or Helpdesk role required")
    reason = (reason or "Viewed via Web UI").strip()[:200]
    ip     = get_client_ip(request)
    data, message = svc.get_laps_password_history(name)
    log_action(
        db, cu.username, cu.role,
        "LAPS History Viewed" if data is not None else "LAPS History Failed",
        "Computer", name,
        f"Reason: {reason} | Count: {len(data) if data else 0}",
        "Success" if data is not None else "Failed",
        ip, domain_id=cu.domain_id
    )
    if data is None:
        raise HTTPException(status_code=404, detail=message)
    return {"history": data, "count": len(data)}


@app.post("/api/computers/{name}/laps/rotate")
async def rotate_laps_password_route(
    name:    str,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403, detail="Admin or Helpdesk role required")
    success, message = svc.reset_laps_password(name)
    log_action(
        db, cu.username, cu.role,
        "LAPS Password Rotation Requested",
        "Computer", name, message,
        "Success" if success else "Failed",
        get_client_ip(request), domain_id=cu.domain_id
    )
    if not success:
        raise HTTPException(status_code=500, detail=message)
    return {"success": True, "message": message}


# ═══════════════════════════════════════════════════════════
# OUs
# ═══════════════════════════════════════════════════════════
@app.get("/api/ous")
async def get_ous(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    ous = svc.get_ou_tree()
    return {"ous": ous, "count": len(ous), "domain": svc.domain}


@app.post("/api/ous")
async def create_ou(
    payload: dict,
    cu:      AppUser   = Depends(get_current_user),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    n = payload.get("name", "").strip()
    if not n:
        raise HTTPException(status_code=400)
    s, m = svc.create_ou(
        n,
        payload.get("parent") or svc.base_dn,
        payload.get("description", "")
    )
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.put("/api/ous")
async def update_ou(
    payload: dict,
    cu:      AppUser   = Depends(require_admin),
    svc:     ADService = Depends(get_domain_service)
):
    dn = payload.get("dn", "").strip()
    if not dn:
        raise HTTPException(status_code=400)
    s, m = svc.update_ou(dn, payload.get("description", ""))
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.delete("/api/ous")
async def delete_ou(
    dn:  str,
    cu:  AppUser   = Depends(require_admin),
    svc: ADService = Depends(get_domain_service)
):
    s, m = svc.delete_ou(dn)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": m}


@app.get("/api/ous/contents")
async def ou_contents(
    dn:  str,
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    return svc.get_ou_contents(dn)


# ═══════════════════════════════════════════════════════════
# GPOs
# ═══════════════════════════════════════════════════════════
@app.get("/api/gpos")
async def get_gpos(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    try:
        g = svc.get_gpos()
        return {"gpos": g, "count": len(g), "domain": svc.domain}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed: {str(e)}")


@app.get("/api/gpos/links")
async def get_gpo_links(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    l = svc.get_gpo_links()
    return {"links": l, "count": len(l)}


# ═══════════════════════════════════════════════════════════
# SESSIONS
# ═══════════════════════════════════════════════════════════
@app.get("/api/sessions")
async def get_active_sessions(
    cu: AppUser  = Depends(require_admin),
    db: Session  = Depends(get_db)
):
    co = datetime.utcnow() - timedelta(hours=8)
    db.query(ActiveSession).filter(
        ActiveSession.last_activity < co
    ).delete()
    db.commit()
    ss = db.query(ActiveSession).filter(
        ActiveSession.domain_id == cu.domain_id
    ).order_by(ActiveSession.last_activity.desc()).all()
    return {
        "sessions": [
            {
                "id":           s.id,
                "username":     s.username,
                "displayName":  s.display_name,
                "role":         s.role,
                "ipAddress":    s.ip_address,
                "userAgent":    s.user_agent,
                "loginTime":    s.login_time.isoformat() if s.login_time else None,
                "lastActivity": s.last_activity.isoformat() if s.last_activity else None,
                "isCurrent":    False
            }
            for s in ss
        ],
        "count": len(ss)
    }


@app.delete("/api/sessions/{session_id}")
async def terminate_session(
    session_id: int,
    cu:         AppUser  = Depends(require_admin),
    db:         Session  = Depends(get_db)
):
    s = db.query(ActiveSession).filter(ActiveSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=404)
    un = s.username
    db.delete(s)
    db.commit()
    log_action(db, cu.username, cu.role, "Session Terminated", "Session",
               un, "Forced logout", "Success", "", domain_id=cu.domain_id)
    return {"success": True, "message": f"Session for {un} terminated"}


# ═══════════════════════════════════════════════════════════
# SERVICE ACCOUNTS
# ═══════════════════════════════════════════════════════════
@app.get("/api/service-accounts")
async def list_service_accounts(
    cu: AppUser  = Depends(get_current_user),
    db: Session  = Depends(get_db)
):
    aa = db.query(ServiceAccount).filter(
        ServiceAccount.domain_id == cu.domain_id
    ).order_by(ServiceAccount.created_at.desc()).all()
    return {
        "accounts": [
            {
                "id":                   a.id,
                "username":             a.username,
                "displayName":          a.display_name,
                "email":                a.email,
                "description":          a.description,
                "purpose":              a.purpose,
                "owner":                a.owner,
                "department":           a.department,
                "ou":                   a.ou,
                "adDn":                 a.ad_dn,
                "passwordNeverExpires": a.password_never_expires,
                "cannotChangePassword": a.cannot_change_password,
                "isSystemCritical":     a.is_system_critical,
                "hasAppAccess":         a.has_app_access,
                "appRole":              a.app_role,
                "createdAt":            a.created_at.isoformat() if a.created_at else None,
                "createdBy":            a.created_by,
                "lastPasswordChange":   a.last_password_change.isoformat() if a.last_password_change else None,
                "notes":                a.notes
            }
            for a in aa
        ],
        "count": len(aa)
    }


@app.post("/api/service-accounts")
async def create_service_account(
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    un = payload.get("username", "").strip()
    pw = payload.get("password", "")
    dn = payload.get("displayName", "").strip() or f"Service: {un}"
    if not un:
        raise HTTPException(status_code=400, detail="Username required")
    if not pw or len(pw) < 12:
        raise HTTPException(status_code=400, detail="Password must be 12+ chars")
    if db.query(ServiceAccount).filter(
        ServiceAccount.username == un,
        ServiceAccount.domain_id == cu.domain_id
    ).first():
        raise HTTPException(status_code=400, detail=f"'{un}' already exists")

    ip  = get_client_ip(request)
    ou  = payload.get("ou") or svc.target_ou
    ad_data = {
        "username":            un,
        "displayName":         dn,
        "firstName":           "Service",
        "lastName":            un,
        "email":               payload.get("email") or f"{un}@{svc.domain}",
        "description":         payload.get("description") or payload.get("purpose"),
        "department":          payload.get("department") or "Service Accounts",
        "title":               "Service Account",
        "company":             payload.get("department"),
        "password":            pw,
        "ou":                  ou,
        "passwordNeverExpires":payload.get("passwordNeverExpires", True),
        "mustChangePassword":  False,
        "upn":                 f"{un}@{svc.domain}"
    }
    s, m = svc.create_user(ad_data)
    if not s:
        log_action(db, cu.username, cu.role, "Service Account Create Failed",
                   "ServiceAccount", un, f"AD: {m}", "Failed", ip, domain_id=cu.domain_id)
        raise HTTPException(status_code=500, detail=f"AD creation failed: {m}")

    adn = f"CN={dn},{ou}"
    try:
        sa = ServiceAccount(
            username               = un,
            display_name           = dn,
            email                  = payload.get("email") or f"{un}@{svc.domain}",
            description            = payload.get("description", ""),
            purpose                = payload.get("purpose", ""),
            owner                  = payload.get("owner") or cu.username,
            department             = payload.get("department") or "Service Accounts",
            ou                     = ou,
            ad_dn                  = adn,
            password_never_expires = payload.get("passwordNeverExpires", True),
            cannot_change_password = payload.get("cannotChangePassword", True),
            is_system_critical     = payload.get("isSystemCritical", False),
            has_app_access         = payload.get("hasAppAccess", False),
            app_role               = payload.get("appRole", "Viewer"),
            created_by             = cu.username,
            last_password_change   = datetime.utcnow(),
            notes                  = payload.get("notes", ""),
            domain_id              = cu.domain_id
        )
        db.add(sa)
        if payload.get("hasAppAccess"):
            ex = db.query(AppUser).filter(
                AppUser.username  == un,
                AppUser.domain_id == cu.domain_id
            ).first()
            if not ex:
                db.add(AppUser(
                    username     = un,
                    display_name = dn,
                    email        = payload.get("email") or f"{un}@{svc.domain}",
                    role         = payload.get("appRole", "Viewer"),
                    active       = True,
                    domain_id    = cu.domain_id
                ))
        db.commit()
        log_action(db, cu.username, cu.role, "Service Account Created",
                   "ServiceAccount", un,
                   f"Created. AppAccess: {payload.get('hasAppAccess', False)}",
                   "Success", ip, domain_id=cu.domain_id)
        return {"success": True, "message": f"Service account '{un}' created", "id": sa.id, "adDn": adn}
    except Exception as e:
        try: svc.delete_user(un)
        except: pass
        raise HTTPException(status_code=500, detail=f"DB save failed: {str(e)}")


@app.get("/api/service-accounts/{aid}")
async def get_service_account(
    aid: int,
    cu:  AppUser   = Depends(get_current_user),
    db:  Session   = Depends(get_db),
    svc: ADService = Depends(get_domain_service)
):
    sa = db.query(ServiceAccount).filter(
        ServiceAccount.id        == aid,
        ServiceAccount.domain_id == cu.domain_id
    ).first()
    if not sa:
        raise HTTPException(status_code=404)
    ai = svc.get_user(sa.username)
    return {
        "id": sa.id, "username": sa.username, "displayName": sa.display_name,
        "email": sa.email, "description": sa.description, "purpose": sa.purpose,
        "owner": sa.owner, "department": sa.department, "ou": sa.ou, "adDn": sa.ad_dn,
        "passwordNeverExpires": sa.password_never_expires,
        "cannotChangePassword": sa.cannot_change_password,
        "isSystemCritical": sa.is_system_critical, "hasAppAccess": sa.has_app_access,
        "appRole": sa.app_role,
        "createdAt": sa.created_at.isoformat() if sa.created_at else None,
        "createdBy": sa.created_by,
        "lastPasswordChange": sa.last_password_change.isoformat() if sa.last_password_change else None,
        "notes": sa.notes, "adStatus": ai if ai else {"error": "Not found in AD"}
    }


@app.put("/api/service-accounts/{aid}")
async def update_service_account(
    aid:     int,
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(require_admin),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    sa = db.query(ServiceAccount).filter(
        ServiceAccount.id == aid,
        ServiceAccount.domain_id == cu.domain_id
    ).first()
    if not sa:
        raise HTTPException(status_code=404)
    oaa = sa.has_app_access
    fm  = {
        "displayName": "display_name", "email": "email",
        "description": "description",  "purpose": "purpose",
        "owner":       "owner",         "department": "department",
        "notes":       "notes"
    }
    for k, db_k in fm.items():
        if k in payload:
            setattr(sa, db_k, payload[k])
    if "isSystemCritical" in payload: sa.is_system_critical = payload["isSystemCritical"]
    if "hasAppAccess"     in payload: sa.has_app_access     = payload["hasAppAccess"]
    if "appRole"          in payload: sa.app_role           = payload["appRole"]
    ac = {}
    for fk, ak in {"displayName": "displayName", "email": "email",
                   "description": "description", "department": "department"}.items():
        if fk in payload:
            ac[ak] = payload[fk]
    if ac:
        svc.update_user(sa.username, ac)
    if sa.has_app_access and not oaa:
        ex = db.query(AppUser).filter(
            AppUser.username  == sa.username,
            AppUser.domain_id == cu.domain_id
        ).first()
        if not ex:
            db.add(AppUser(
                username=sa.username, display_name=sa.display_name,
                email=sa.email, role=sa.app_role, active=True, domain_id=cu.domain_id
            ))
    elif not sa.has_app_access and oaa:
        db.query(AppUser).filter(
            AppUser.username  == sa.username,
            AppUser.domain_id == cu.domain_id
        ).delete()
    elif sa.has_app_access and "appRole" in payload:
        au = db.query(AppUser).filter(
            AppUser.username  == sa.username,
            AppUser.domain_id == cu.domain_id
        ).first()
        if au:
            au.role = payload["appRole"]
    db.commit()
    log_action(db, cu.username, cu.role, "Service Account Updated",
               "ServiceAccount", sa.username, "Updated",
               "Success", get_client_ip(request), domain_id=cu.domain_id)
    return {"success": True, "message": "Updated"}


@app.post("/api/service-accounts/{aid}/reset-password")
async def reset_service_password(
    aid:     int,
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ('Admin', 'Helpdesk'):
        raise HTTPException(403, 'Admin or Helpdesk only')
    sa = db.query(ServiceAccount).filter(
        ServiceAccount.id        == aid,
        ServiceAccount.domain_id == cu.domain_id
    ).first()
    if not sa:
        raise HTTPException(status_code=404)
    np = payload.get("password", "")
    if not np or len(np) < 12:
        raise HTTPException(status_code=400, detail="Password must be 12+ chars")
    s, m = svc.reset_password(sa.username, np, force_change=False)
    if not s:
        log_action(db, cu.username, cu.role, "Service Pwd Reset Failed",
                   "ServiceAccount", sa.username, m, "Failed",
                   get_client_ip(request), domain_id=cu.domain_id)
        raise HTTPException(status_code=500, detail=m)
    sa.last_password_change = datetime.utcnow()
    db.commit()
    log_action(db, cu.username, cu.role, "Service Pwd Reset",
               "ServiceAccount", sa.username, "Reset",
               "Success", get_client_ip(request), domain_id=cu.domain_id)
    return {"success": True, "message": f"Password reset for {sa.username}"}


@app.delete("/api/service-accounts/{aid}")
async def delete_service_account(
    aid:       int,
    request:   Request,
    delete_ad: bool     = True,
    cu:        AppUser  = Depends(require_admin),
    db:        Session  = Depends(get_db),
    svc:       ADService = Depends(get_domain_service)
):
    sa = db.query(ServiceAccount).filter(
        ServiceAccount.id        == aid,
        ServiceAccount.domain_id == cu.domain_id
    ).first()
    if not sa:
        raise HTTPException(status_code=404)
    if sa.is_system_critical:
        raise HTTPException(status_code=400, detail="Cannot delete system critical account")
    ip = get_client_ip(request)
    un = sa.username
    am = "AD deletion skipped"
    if delete_ad:
        aok, am = svc.delete_user(un)
        if not aok:
            log_action(db, cu.username, cu.role, "Service Account Delete Failed",
                       "ServiceAccount", un, f"AD: {am}", "Failed", ip, domain_id=cu.domain_id)
            raise HTTPException(status_code=500, detail=f"Could not delete from AD: {am}")
    db.query(AppUser).filter(
        AppUser.username  == un,
        AppUser.domain_id == cu.domain_id
    ).delete()
    db.delete(sa)
    db.commit()
    log_action(db, cu.username, cu.role, "Service Account Deleted",
               "ServiceAccount", un, f"AD: {am}", "Success", ip, domain_id=cu.domain_id)
    return {"success": True, "message": f"Service account '{un}' deleted"}


@app.post("/api/service-accounts/import-existing")
async def import_service_account(
    payload: dict,
    request: Request,
    cu:      AppUser   = Depends(require_admin),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    un = payload.get("username", "").strip()
    if not un:
        raise HTTPException(status_code=400, detail='Username required')
    ai = svc.get_user_info(un)
    if not ai:
        raise HTTPException(status_code=404, detail=f"User '{un}' not found in AD")
    if db.query(ServiceAccount).filter(
        ServiceAccount.username  == un,
        ServiceAccount.domain_id == cu.domain_id
    ).first():
        raise HTTPException(status_code=400, detail="Already imported")
    sa = ServiceAccount(
        username               = un,
        display_name           = ai.get("display_name", un),
        email                  = ai.get("email", ""),
        description            = payload.get("description", ""),
        purpose                = payload.get("purpose", ""),
        owner                  = payload.get("owner") or cu.username,
        department             = payload.get("department") or "Service Accounts",
        ou                     = payload.get("ou", ""),
        ad_dn                  = ai.get("dn", ""),
        password_never_expires = payload.get("passwordNeverExpires", True),
        cannot_change_password = payload.get("cannotChangePassword", True),
        is_system_critical     = payload.get("isSystemCritical", False),
        has_app_access         = payload.get("hasAppAccess", False),
        app_role               = payload.get("appRole", "Viewer"),
        created_by             = cu.username,
        notes                  = payload.get("notes", "Imported from AD"),
        domain_id              = cu.domain_id
    )
    db.add(sa)
    if payload.get("hasAppAccess"):
        ex = db.query(AppUser).filter(
            AppUser.username  == un,
            AppUser.domain_id == cu.domain_id
        ).first()
        if not ex:
            db.add(AppUser(
                username     = un,
                display_name = ai.get("display_name", un),
                email        = ai.get("email", ""),
                role         = payload.get("appRole", "Viewer"),
                active       = True,
                domain_id    = cu.domain_id
            ))
    db.commit()
    log_action(db, cu.username, cu.role, "Service Account Imported",
               "ServiceAccount", un, "Imported",
               "Success", get_client_ip(request), domain_id=cu.domain_id)
    return {"success": True, "message": f"Imported '{un}'", "id": sa.id}


# ═══════════════════════════════════════════════════════════
# TEMPLATES
# ═══════════════════════════════════════════════════════════
@app.get("/api/templates")
async def list_templates(
    cu: AppUser  = Depends(get_current_user),
    db: Session  = Depends(get_db)
):
    tt = db.query(UserTemplate).filter(UserTemplate.domain_id == cu.domain_id).all()
    return {
        "templates": [
            {
                "id": t.id, "name": t.name, "description": t.description,
                "ou": t.ou, "department": t.department, "title": t.title,
                "company": t.company, "office": t.office, "phone": t.phone,
                "manager": t.manager, "groups": t.groups,
                "passwordNeverExpires": t.password_never_expires,
                "mustChangePassword":  t.must_change_password,
                "enabled":             t.enabled,
                "createdAt":           t.created_at.isoformat() if t.created_at else None,
                "createdBy":           t.created_by
            }
            for t in tt
        ],
        "count": len(tt)
    }


@app.post("/api/templates")
async def create_template(
    payload: dict,
    cu:      AppUser  = Depends(require_admin),
    db:      Session  = Depends(get_db)
):
    n = payload.get("name", "").strip()
    if not n:
        raise HTTPException(status_code=400)
    if db.query(UserTemplate).filter(
        UserTemplate.name      == n,
        UserTemplate.domain_id == cu.domain_id
    ).first():
        raise HTTPException(status_code=400, detail="Exists")
    g = payload.get("groups", [])
    if isinstance(g, list):
        g = json.dumps(g)
    t = UserTemplate(
        name                   = n,
        description            = payload.get("description", ""),
        ou                     = payload.get("ou", ""),
        department             = payload.get("department", ""),
        title                  = payload.get("title", ""),
        company                = payload.get("company", ""),
        office                 = payload.get("office", ""),
        phone                  = payload.get("phone", ""),
        manager                = payload.get("manager", ""),
        groups                 = g,
        password_never_expires = payload.get("passwordNeverExpires", False),
        must_change_password   = payload.get("mustChangePassword", True),
        enabled                = payload.get("enabled", True),
        created_by             = cu.username,
        domain_id              = cu.domain_id
    )
    db.add(t)
    db.commit()
    return {"success": True, "id": t.id}


@app.delete("/api/templates/{tid}")
async def delete_template(
    tid: int,
    cu:  AppUser  = Depends(require_admin),
    db:  Session  = Depends(get_db)
):
    t = db.query(UserTemplate).filter(
        UserTemplate.id        == tid,
        UserTemplate.domain_id == cu.domain_id
    ).first()
    if not t:
        raise HTTPException(status_code=404)
    db.delete(t)
    db.commit()
    return {"success": True}


@app.post("/api/templates/{tid}/create-user")
async def create_user_from_template(
    tid:     int,
    payload: dict,
    cu:      AppUser   = Depends(get_current_user),
    db:      Session   = Depends(get_db),
    svc:     ADService = Depends(get_domain_service)
):
    if cu.role not in ["Admin", "Helpdesk"]:
        raise HTTPException(status_code=403)
    t = db.query(UserTemplate).filter(
        UserTemplate.id        == tid,
        UserTemplate.domain_id == cu.domain_id
    ).first()
    if not t:
        raise HTTPException(status_code=404)
    ud = {
        "username":    payload.get("username", "").strip(),
        "firstName":   payload.get("firstName", "").strip(),
        "lastName":    payload.get("lastName", "").strip(),
        "displayName": (payload.get("displayName", "") or
                        f"{payload.get('firstName','')} {payload.get('lastName','')}".strip()),
        "email":       payload.get("email", ""),
        "password":    payload.get("password", ""),
        "ou":          t.ou or svc.target_ou,
        "department":  t.department, "title": t.title, "company": t.company,
        "office":      t.office,     "phone": t.phone, "manager": t.manager,
        "passwordNeverExpires": t.password_never_expires,
        "mustChangePassword":   t.must_change_password
    }
    if not ud["username"] or not ud["password"]:
        raise HTTPException(status_code=400, detail="username and password required")
    s, m = svc.create_user(ud)
    if not s:
        raise HTTPException(status_code=500, detail=m)
    if t.groups and s:
        try:
            gl = json.loads(t.groups) if t.groups else []
            for gdn in gl:
                gn = gdn.split(",")[0].replace("CN=", "")
                svc.add_to_group(ud["username"], gn)
        except:
            pass
    return {"success": True, "message": m}


# ═══════════════════════════════════════════════════════════
# WORKFLOWS
# ═══════════════════════════════════════════════════════════
@app.get("/api/workflows/requests")
async def list_workflow_requests(
    status_filter: Optional[str] = None,
    cu:            AppUser       = Depends(get_current_user),
    db:            Session       = Depends(get_db)
):
    q = db.query(WorkflowRequest).filter(
        WorkflowRequest.domain_id == cu.domain_id
    ).order_by(WorkflowRequest.created_at.desc())
    if cu.role != "Admin":
        q = q.filter(WorkflowRequest.requested_by == cu.username)
    if status_filter:
        q = q.filter(WorkflowRequest.status == status_filter)
    rr = q.all()
    return {
        "requests": [
            {
                "id":             r.id,
                "type":           r.request_type,
                "requestedBy":    r.requested_by,
                "target":         r.target_object,
                "status":         r.status,
                "reason":         r.reason,
                "rejectionReason":r.rejection_reason,
                "approvedBy":     r.approved_by,
                "approvedAt":     r.approved_at.isoformat() if r.approved_at else None,
                "completedAt":    r.completed_at.isoformat() if r.completed_at else None,
                "createdAt":      r.created_at.isoformat(),
                "payload":        r.payload
            }
            for r in rr
        ],
        "count": len(rr)
    }


@app.post("/api/workflows/requests")
async def create_workflow_request(
    payload: dict,
    cu:      AppUser  = Depends(get_current_user),
    db:      Session  = Depends(get_db)
):
    r = WorkflowRequest(
        request_type  = payload.get("type", "modify-user"),
        requested_by  = cu.username,
        target_object = payload.get("target", ""),
        payload       = json.dumps(payload.get("changes", {})),
        reason        = payload.get("reason", ""),
        status        = "pending",
        domain_id     = cu.domain_id
    )
    db.add(r)
    db.commit()
    return {"success": True, "id": r.id}


@app.post("/api/workflows/requests/{rid}/approve")
async def approve_request(
    rid: int,
    cu:  AppUser   = Depends(require_admin),
    db:  Session   = Depends(get_db),
    svc: ADService = Depends(get_domain_service)
):
    r = db.query(WorkflowRequest).filter(
        WorkflowRequest.id        == rid,
        WorkflowRequest.domain_id == cu.domain_id
    ).first()
    if not r:
        raise HTTPException(status_code=404)
    if r.status != "pending":
        raise HTTPException(status_code=400, detail=f"Already {r.status}")
    try:
        p    = json.loads(r.payload) if r.payload else {}
        s, m = False, ""
        if   r.request_type == "modify-user":    s, m = svc.update_user(r.target_object, p)
        elif r.request_type == "create-user":    s, m = svc.create_user(p)
        elif r.request_type == "delete-user":    s, m = svc.delete_user(r.target_object)
        elif r.request_type == "reset-password": s, m = svc.reset_password(r.target_object, p.get("password", ""), p.get("forceChange", True))
        elif r.request_type == "disable-user":   s, m = svc.disable_user(r.target_object)
        elif r.request_type == "enable-user":    s, m = svc.enable_user(r.target_object)
        r.status      = "completed" if s else "approved"
        r.approved_by = cu.username
        r.approved_at = datetime.utcnow()
        if s: r.completed_at = datetime.utcnow()
        db.commit()
        return {"success": s, "message": m, "status": r.status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/workflows/requests/{rid}/reject")
async def reject_request(
    rid:     int,
    payload: dict,
    cu:      AppUser  = Depends(require_admin),
    db:      Session  = Depends(get_db)
):
    r = db.query(WorkflowRequest).filter(
        WorkflowRequest.id        == rid,
        WorkflowRequest.domain_id == cu.domain_id
    ).first()
    if not r:
        raise HTTPException(status_code=404)
    r.status           = "rejected"
    r.approved_by      = cu.username
    r.approved_at      = datetime.utcnow()
    r.rejection_reason = payload.get("reason", "")
    db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════
# AUDIT LOGS
# ═══════════════════════════════════════════════════════════
@app.get("/api/audit-logs")
async def get_audit(
    skip:  int     = 0,
    limit: int     = 500,
    cu:    AppUser = Depends(get_current_user),
    db:    Session = Depends(get_db)
):
    ll = db.query(AuditLog).filter(
        AuditLog.domain_id == cu.domain_id
    ).order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    return {
        "logs": [
            {
                "id":           l.id,
                "timestamp":    l.timestamp.isoformat(),
                "operator":     l.operator,
                "operatorRole": l.operator_role,
                "action":       l.action,
                "objectType":   l.object_type,
                "objectName":   l.object_name,
                "details":      l.details,
                "status":       l.status,
                "ipAddress":    l.ip_address
            }
            for l in ll
        ],
        "count": len(ll),
        "total": db.query(AuditLog).filter(AuditLog.domain_id == cu.domain_id).count()
    }


@app.get("/api/audit-logs/export")
async def export_audit(
    cu: AppUser  = Depends(get_current_user),
    db: Session  = Depends(get_db)
):
    ll  = db.query(AuditLog).filter(
        AuditLog.domain_id == cu.domain_id
    ).order_by(AuditLog.timestamp.desc()).all()
    o   = io.StringIO()
    w   = csv.writer(o)
    w.writerow(["Timestamp","Operator","Role","Action","Object Type","Object Name","Details","Status","IP"])
    for l in ll:
        w.writerow([l.timestamp.isoformat(), l.operator, l.operator_role, l.action,
                    l.object_type, l.object_name, l.details, l.status, l.ip_address])
    o.seek(0)
    return StreamingResponse(o, media_type="text/csv", headers={
        "Content-Disposition": f"attachment; filename=audit-{datetime.now().strftime('%Y%m%d')}.csv"
    })


# ═══════════════════════════════════════════════════════════
# APP USERS
# ═══════════════════════════════════════════════════════════
@app.get("/api/app-users")
async def list_app_users(
    cu: AppUser  = Depends(require_admin),
    db: Session  = Depends(get_db)
):
    uu = db.query(AppUser).filter(AppUser.domain_id == cu.domain_id).all()
    return {
        "users": [
            {
                "id":           u.id,
                "username":     u.username,
                "display_name": u.display_name,
                "email":        u.email,
                "role":         u.role,
                "active":       u.active,
                "last_login":   u.last_login.isoformat() if u.last_login else None
            }
            for u in uu
        ],
        "count": len(uu)
    }


@app.post("/api/app-users")
async def create_app_user(
    payload: dict,
    cu:      AppUser  = Depends(require_admin),
    db:      Session  = Depends(get_db)
):
    un = payload.get("username", "").strip()
    if not un:
        raise HTTPException(status_code=400)
    if payload.get("role") not in ["Admin", "Helpdesk", "Viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    if db.query(AppUser).filter(
        AppUser.username  == un,
        AppUser.domain_id == cu.domain_id
    ).first():
        raise HTTPException(status_code=400, detail="Exists")
    db.add(AppUser(
        username     = un,
        display_name = payload.get("display_name", ""),
        email        = payload.get("email", ""),
        role         = payload["role"],
        active       = True,
        domain_id    = cu.domain_id
    ))
    db.commit()
    return {"success": True}


@app.delete("/api/app-users/{username}")
async def delete_app_user(
    username: str,
    cu:       AppUser  = Depends(require_admin),
    db:       Session  = Depends(get_db)
):
    u = db.query(AppUser).filter(
        AppUser.username  == username,
        AppUser.domain_id == cu.domain_id
    ).first()
    if not u:
        raise HTTPException(status_code=404)
    if u.username == cu.username:
        raise HTTPException(status_code=400, detail="Cannot delete self")
    db.delete(u)
    db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════
@app.post("/api/notifications/test-email")
async def test_email_route(
    payload: dict,
    cu:      AppUser  = Depends(require_admin),
    db:      Session  = Depends(get_db)
):
    to = payload.get("to", "").strip()
    if not to:
        raise HTTPException(status_code=400)
    s, m = send_email(
        to, "DC Manager Pro - Test",
        f"<h2>Test Email</h2><p>SMTP working! Domain: {cu.domain_id}</p>",
        db
    )
    if not s:
        raise HTTPException(status_code=500, detail=m)
    return {"success": True, "message": f"Test email sent to {to}"}


# ═══════════════════════════════════════════════════════════
# REPORTS
# ═══════════════════════════════════════════════════════════
@app.get("/api/reports/summary")
async def report_summary(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    try:
        users     = svc.get_users(show_builtin=False)
        groups    = svc.get_groups(show_builtin=False)
        computers = svc.get_computers()
        ous       = svc.get_ou_tree()
        tu  = len(users)
        ac  = len([u for u in users if u["status"] == "active"])
        di  = len([u for u in users if u["status"] == "disabled"])
        lo  = len([u for u in users if u["status"] == "locked"])
        pn  = len([u for u in users if u.get("passwordNeverExpires")])
        mc  = len([u for u in users if u.get("mustChangePassword")])
        nl  = 0; i30 = 0; i90 = 0; i180 = 0
        for u in users:
            ll = u.get("lastLogon", "")
            if not ll: nl += 1; continue
            try:
                d    = datetime.fromisoformat(ll.replace('Z', '+00:00'))
                days = (datetime.utcnow() - d.replace(tzinfo=None)).days
                if days > 180:  i180 += 1
                elif days > 90: i90  += 1
                elif days > 30: i30  += 1
            except: nl += 1
        return {
            "users": {
                "total": tu, "active": ac, "disabled": di, "locked": lo,
                "passwordNeverExpires": pn, "mustChangePassword": mc,
                "neverLoggedIn": nl, "inactive30Days": i30,
                "inactive90Days": i90, "inactive180Days": i180
            },
            "groups": {
                "total":        len(groups),
                "security":     len([g for g in groups if g["type"] == "security"]),
                "distribution": len([g for g in groups if g["type"] == "distribution"]),
                "empty":        len([g for g in groups if g["memberCount"] == 0])
            },
            "computers": {
                "total":    len(computers),
                "active":   len([c for c in computers if c["status"] == "active"]),
                "inactive": len([c for c in computers if c["status"] == "inactive"]),
                "disabled": len([c for c in computers if c["status"] == "disabled"])
            },
            "ous":          {"total": len(ous)},
            "generated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/reports/users/by-department")
async def users_by_department(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    users = svc.get_users(show_builtin=False)
    d = {}
    for u in users:
        dp = u.get("department", "").strip() or "(No Department)"
        if dp not in d: d[dp] = {"total": 0, "active": 0, "disabled": 0, "locked": 0}
        d[dp]["total"] += 1
        d[dp][u["status"]] += 1
    r = [{"department": k, **v} for k, v in d.items()]
    r.sort(key=lambda x: x["total"], reverse=True)
    return {"departments": r, "count": len(r)}


@app.get("/api/reports/computers/by-os")
async def comp_by_os(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    cc = svc.get_computers()
    oc = {}
    for c in cc:
        o = c.get("os", "").strip() or "Unknown"
        if o not in oc: oc[o] = {"total": 0, "active": 0, "inactive": 0, "disabled": 0}
        oc[o]["total"] += 1
        oc[o][c["status"]] += 1
    r = [{"os": k, **v} for k, v in oc.items()]
    r.sort(key=lambda x: x["total"], reverse=True)
    return {"operatingSystems": r, "count": len(r)}


@app.get("/api/reports/users/recently-active")
async def recently_active_users(
    minutes: int     = 15,
    cu:      AppUser = Depends(get_current_user),
    svc:     ADService = Depends(get_domain_service)
):
    u      = svc.get_users(show_builtin=False)
    now    = datetime.utcnow()
    cutoff = now - timedelta(minutes=minutes)
    active = []
    for x in u:
        ll = x.get("lastLogon", "")
        if not ll: continue
        try:
            d = datetime.fromisoformat(ll.replace('Z', '+00:00')).replace(tzinfo=None)
            if d >= cutoff:
                minutes_ago   = int((now - d).total_seconds() / 60)
                x["minutesAgo"] = minutes_ago
                x["hoursAgo"]   = round(minutes_ago / 60, 1)
                active.append(x)
        except: continue
    active.sort(key=lambda x: x.get("minutesAgo", 999999))
    return {"users": active, "count": len(active), "minutesThreshold": minutes}


@app.get("/api/reports/users/domain-logins-summary")
async def domain_logins_summary(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    u      = svc.get_users(show_builtin=False)
    now    = datetime.utcnow()
    counts = {
        "last15min": 0, "last1hour": 0, "last24hours": 0,
        "last7days": 0, "last30days": 0, "neverLoggedIn": 0, "total": len(u)
    }
    for x in u:
        ll = x.get("lastLogon", "")
        if not ll: counts["neverLoggedIn"] += 1; continue
        try:
            d        = datetime.fromisoformat(ll.replace('Z', '+00:00')).replace(tzinfo=None)
            diff_min = (now - d).total_seconds() / 60
            if diff_min <= 15:    counts["last15min"]   += 1
            if diff_min <= 60:    counts["last1hour"]   += 1
            if diff_min <= 1440:  counts["last24hours"] += 1
            if diff_min <= 10080: counts["last7days"]   += 1
            if diff_min <= 43200: counts["last30days"]  += 1
        except: continue
    return counts


@app.get("/api/reports/users/never-logged-in")
async def never_logged_in(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    u = svc.get_users(show_builtin=False)
    r = [x for x in u if not x.get("lastLogon")]
    return {"users": r, "count": len(r)}


@app.get("/api/reports/users/inactive")
async def inactive_users(
    days: int     = 90,
    cu:   AppUser = Depends(get_current_user),
    svc:  ADService = Depends(get_domain_service)
):
    u  = svc.get_users(show_builtin=False)
    co = datetime.utcnow() - timedelta(days=days)
    r  = []
    for x in u:
        ll = x.get("lastLogon", "")
        if not ll: continue
        try:
            d = datetime.fromisoformat(ll.replace('Z', '+00:00'))
            if d.replace(tzinfo=None) < co: r.append(x)
        except: continue
    return {"users": r, "count": len(r), "daysThreshold": days}


@app.get("/api/reports/users/locked")
async def locked_users(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    u = svc.get_users(show_builtin=False)
    r = [x for x in u if x["status"] == "locked"]
    return {"users": r, "count": len(r)}


@app.get("/api/reports/users/disabled")
async def disabled_report(
    cu:  AppUser   = Depends(get_current_user),
    svc: ADService = Depends(get_domain_service)
):
    u = svc.get_users(show_builtin=False)
    r = [x for x in u if x["status"] == "disabled"]
    return {"users": r, "count": len(r)}


@app.get("/api/reports/export/{report_type}")
async def export_report(
    report_type: str,
    days:        int     = 90,
    cu:          AppUser = Depends(get_current_user),
    svc:         ADService = Depends(get_domain_service)
):
    data    = []
    headers = []
    fn      = f"report-{report_type}-{datetime.now().strftime('%Y%m%d')}.csv"
    if report_type == "all-users":
        u = svc.get_users(show_builtin=False)
        headers = ["Username","Display Name","Email","Department","Status","Last Logon","OU"]
        data = [[str(x.get("username","")), str(x.get("displayName","")),
                 str(x.get("email","")),   str(x.get("department","")),
                 str(x.get("status","")),  str(x.get("lastLogon","")),
                 str(x.get("ou",""))] for x in u]
    elif report_type == "all-groups":
        g = svc.get_groups(show_builtin=False)
        headers = ["Name","Description","Type","Members"]
        data = [[str(x.get("name","")), str(x.get("description","")),
                 str(x.get("type","")), str(x.get("memberCount",""))] for x in g]
    elif report_type == "active-users":
        u      = svc.get_users(show_builtin=False)
        active = [x for x in u if x["status"] == "active"]
        headers = ["Username","Display Name","Email","Department","Title","Last Logon","OU"]
        data = [[str(x.get("username","")), str(x.get("displayName","")),
                 str(x.get("email","")),   str(x.get("department","")),
                 str(x.get("title","")),   str(x.get("lastLogon","")),
                 str(x.get("ou",""))] for x in active]
    elif report_type == "disabled-users":
        u        = svc.get_users(show_builtin=False)
        disabled = [x for x in u if x["status"] == "disabled"]
        headers = ["Username","Display Name","Email","Department","Title","Last Logon","OU"]
        data = [[str(x.get("username","")), str(x.get("displayName","")),
                 str(x.get("email","")),   str(x.get("department","")),
                 str(x.get("title","")),   str(x.get("lastLogon","")),
                 str(x.get("ou",""))] for x in disabled]
    elif report_type == "locked-users":
        u      = svc.get_users(show_builtin=False)
        locked = [x for x in u if x["status"] == "locked"]
        headers = ["Username","Display Name","Email","Department","Title","OU"]
        data = [[str(x.get("username","")), str(x.get("displayName","")),
                 str(x.get("email","")),   str(x.get("department","")),
                 str(x.get("title","")),   str(x.get("ou",""))] for x in locked]
    elif report_type == "never-logged-in":
        u     = svc.get_users(show_builtin=False)
        never = [x for x in u if not x.get("lastLogon")]
        headers = ["Username","Display Name","Email","Department","Created","OU"]
        data = [[str(x.get("username","")), str(x.get("displayName","")),
                 str(x.get("email","")),   str(x.get("department","")),
                 str(x.get("created","")), str(x.get("ou",""))] for x in never]
    elif report_type == "inactive-users":
        u      = svc.get_users(show_builtin=False)
        cutoff = datetime.utcnow() - timedelta(days=days)
        inactive = []
        for x in u:
            ll = x.get("lastLogon", "")
            if not ll: continue
            try:
                d = datetime.fromisoformat(ll.replace('Z', '+00:00'))
                if d.replace(tzinfo=None) < cutoff: inactive.append(x)
            except: continue
        headers = ["Username","Display Name","Email","Department","Last Logon","OU"]
        data = [[str(x.get("username","")), str(x.get("displayName","")),
                 str(x.get("email","")),   str(x.get("department","")),
                 str(x.get("lastLogon","")), str(x.get("ou",""))] for x in inactive]
    elif report_type == "all-computers":
        c = svc.get_computers()
        headers = ["Name","OS","Status","Last Logon"]
        data = [[str(x.get("name","")), str(x.get("os","")),
                 str(x.get("status","")), str(x.get("lastLogon",""))] for x in c]
    else:
        raise HTTPException(status_code=400, detail="Unknown report type")
    o = io.StringIO()
    w = csv.writer(o)
    w.writerow(headers)
    w.writerows(data)
    o.seek(0)
    return StreamingResponse(o, media_type="text/csv", headers={
        "Content-Disposition": f"attachment; filename={fn}"
    })




# ═══════════════════════════════════════════════════════════
# DNS Management (Admin only, per-domain)
# ═══════════════════════════════════════════════════════════
@app.get("/api/dns/zones")
async def list_dns_zones(
    cu:  AppUser    = Depends(get_current_user),
    svc: DNSService = Depends(get_dns_service)
):
    """List all DNS zones on the active domain's DNS server"""
    success, zones, msg = svc.get_zones()
    if not success:
        raise HTTPException(status_code=503, detail=msg)
    return {"zones": zones, "count": len(zones), "activeServer": svc.active_server, "message": msg}


@app.get("/api/dns/zones/{zone_name}/records")
async def list_dns_records(
    zone_name: str,
    record_type: Optional[str] = None,
    cu:  AppUser    = Depends(get_current_user),
    svc: DNSService = Depends(get_dns_service)
):
    """List DNS records in a zone (optionally filtered by A/CNAME/PTR)"""
    success, records, msg = svc.get_records(zone_name, record_type)
    if not success:
        raise HTTPException(status_code=503, detail=msg)
    return {"zone": zone_name, "records": records, "count": len(records), "activeServer": svc.active_server}


@app.post("/api/dns/zones/{zone_name}/records/a")
async def create_dns_a_record(
    zone_name: str,
    payload: dict,
    request: Request,
    cu:  AppUser    = Depends(get_current_user),
    db:  Session    = Depends(get_db),
    svc: DNSService = Depends(get_dns_service)
):
    """Create an A record"""
    name = payload.get("name", "").strip()
    ip   = payload.get("ip", "").strip()
    ttl  = int(payload.get("ttl", 3600))
    if not name or not ip:
        raise HTTPException(status_code=400, detail="name and ip required")
    success, msg = svc.create_a_record(zone_name, name, ip, ttl)
    log_action(db, cu.username, cu.role, "DNS A Record Created", "DNS",
               f"{name}.{zone_name}", f"IP: {ip} | TTL: {ttl} | {msg}",
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


@app.post("/api/dns/zones/{zone_name}/records/cname")
async def create_dns_cname_record(
    zone_name: str,
    payload: dict,
    request: Request,
    cu:  AppUser    = Depends(get_current_user),
    db:  Session    = Depends(get_db),
    svc: DNSService = Depends(get_dns_service)
):
    """Create a CNAME record"""
    alias  = payload.get("alias", "").strip()
    target = payload.get("target", "").strip()
    ttl    = int(payload.get("ttl", 3600))
    if not alias or not target:
        raise HTTPException(status_code=400, detail="alias and target required")
    success, msg = svc.create_cname_record(zone_name, alias, target, ttl)
    log_action(db, cu.username, cu.role, "DNS CNAME Record Created", "DNS",
               f"{alias}.{zone_name}", f"Target: {target} | TTL: {ttl} | {msg}",
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


@app.post("/api/dns/zones/{zone_name}/records/ptr")
async def create_dns_ptr_record(
    zone_name: str,
    payload: dict,
    request: Request,
    cu:  AppUser    = Depends(get_current_user),
    db:  Session    = Depends(get_db),
    svc: DNSService = Depends(get_dns_service)
):
    """Create a PTR record (reverse zone)"""
    name     = payload.get("name", "").strip()  # last octet
    hostname = payload.get("hostname", "").strip()
    ttl      = int(payload.get("ttl", 3600))
    if not name or not hostname:
        raise HTTPException(status_code=400, detail="name and hostname required")
    success, msg = svc.create_ptr_record(zone_name, name, hostname, ttl)
    log_action(db, cu.username, cu.role, "DNS PTR Record Created", "DNS",
               f"{name}.{zone_name}", f"Hostname: {hostname} | TTL: {ttl} | {msg}",
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


@app.put("/api/dns/zones/{zone_name}/records")
async def update_dns_record(
    zone_name: str,
    payload: dict,
    request: Request,
    cu:  AppUser    = Depends(get_current_user),
    db:  Session    = Depends(get_db),
    svc: DNSService = Depends(get_dns_service)
):
    """Update an existing DNS record"""
    hostname    = payload.get("hostname", "").strip()
    record_type = payload.get("type", "").strip().upper()
    old_value   = payload.get("oldValue", "").strip()
    new_value   = payload.get("newValue", "").strip()
    new_ttl     = int(payload.get("ttl", 3600))
    if not all([hostname, record_type, old_value, new_value]):
        raise HTTPException(status_code=400, detail="hostname, type, oldValue, newValue required")
    success, msg = svc.update_record(zone_name, hostname, record_type, old_value, new_value, new_ttl)
    log_action(db, cu.username, cu.role, "DNS Record Updated", "DNS",
               f"{hostname}.{zone_name}",
               f"Type: {record_type} | Old: {old_value} | New: {new_value} | {msg}",
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


@app.delete("/api/dns/zones/{zone_name}/records")
async def delete_dns_record(
    zone_name: str,
    hostname: str,
    record_type: str,
    request: Request,
    cu:  AppUser    = Depends(get_current_user),
    db:  Session    = Depends(get_db),
    svc: DNSService = Depends(get_dns_service)
):
    """Delete a DNS record"""
    record_type = record_type.upper()
    success, msg = svc.delete_record(zone_name, hostname, record_type)
    log_action(db, cu.username, cu.role, "DNS Record Deleted", "DNS",
               f"{hostname}.{zone_name}", f"Type: {record_type} | {msg}",
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


@app.get("/api/dns/test")
async def test_dns_connection(
    cu:  AppUser    = Depends(get_current_user),
    svc: DNSService = Depends(get_dns_service)
):
    """Test DNS server connectivity"""
    success, msg = svc.test_connection()
    return {"connected": success, "message": msg, "activeServer": svc.active_server}



# ═══════════════════════════════════════════════════════════
# DHCP Management (Admin only, per-domain)
# ═══════════════════════════════════════════════════════════
@app.get("/api/dhcp/scopes")
async def list_dhcp_scopes(
    cu:  AppUser     = Depends(get_current_user),
    svc: DHCPService = Depends(get_dhcp_service)
):
    """List all DHCP scopes on the active domain's DHCP server"""
    success, scopes, msg = svc.get_scopes()
    if not success:
        raise HTTPException(status_code=503, detail=msg)
    return {"scopes": scopes, "count": len(scopes), "activeServer": svc.active_server, "message": msg}


# ── Reservations ──────────────────────────────────────────
@app.get("/api/dhcp/scopes/{scope_id}/reservations")
async def list_dhcp_reservations(
    scope_id: str,
    cu:  AppUser     = Depends(get_current_user),
    svc: DHCPService = Depends(get_dhcp_service)
):
    """List reservations in a DHCP scope"""
    success, reservations, msg = svc.get_reservations(scope_id)
    if not success:
        raise HTTPException(status_code=503, detail=msg)
    return {"scopeId": scope_id, "reservations": reservations, "count": len(reservations), "activeServer": svc.active_server}


@app.post("/api/dhcp/scopes/{scope_id}/reservations")
async def create_dhcp_reservation(
    scope_id: str,
    payload: dict,
    request: Request,
    cu:  AppUser     = Depends(get_current_user),
    db:  Session     = Depends(get_db),
    svc: DHCPService = Depends(get_dhcp_service)
):
    """Create a DHCP reservation"""
    ip          = payload.get("ip", "").strip()
    mac         = payload.get("mac", "").strip()
    name        = payload.get("name", "").strip()
    description = payload.get("description", "").strip()
    if not ip or not mac:
        raise HTTPException(status_code=400, detail="ip and mac required")
    success, msg = svc.create_reservation(scope_id, ip, mac, name, description)
    log_action(db, cu.username, cu.role, "DHCP Reservation Created", "DHCP",
               f"{ip} (scope {scope_id})",
               f"MAC: {mac} | Name: {name} | {msg}",
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


@app.put("/api/dhcp/scopes/{scope_id}/reservations/{ip}")
async def update_dhcp_reservation(
    scope_id: str,
    ip: str,
    payload: dict,
    request: Request,
    cu:  AppUser     = Depends(get_current_user),
    db:  Session     = Depends(get_db),
    svc: DHCPService = Depends(get_dhcp_service)
):
    """Update reservation name/description"""
    name        = payload.get("name")
    description = payload.get("description")
    success, msg = svc.update_reservation(scope_id, ip, name, description)
    log_action(db, cu.username, cu.role, "DHCP Reservation Updated", "DHCP",
               f"{ip} (scope {scope_id})",
               f"Name: {name} | Description: {description} | {msg}",
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


@app.delete("/api/dhcp/scopes/{scope_id}/reservations/{ip}")
async def delete_dhcp_reservation(
    scope_id: str,
    ip: str,
    request: Request,
    cu:  AppUser     = Depends(get_current_user),
    db:  Session     = Depends(get_db),
    svc: DHCPService = Depends(get_dhcp_service)
):
    """Delete a DHCP reservation"""
    success, msg = svc.delete_reservation(scope_id, ip)
    log_action(db, cu.username, cu.role, "DHCP Reservation Deleted", "DHCP",
               f"{ip} (scope {scope_id})", msg,
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


# ── Leases ────────────────────────────────────────────────
@app.get("/api/dhcp/scopes/{scope_id}/leases")
async def list_dhcp_leases(
    scope_id: str,
    cu:  AppUser     = Depends(get_current_user),
    svc: DHCPService = Depends(get_dhcp_service)
):
    """List active DHCP leases in a scope"""
    success, leases, msg = svc.get_leases(scope_id)
    if not success:
        raise HTTPException(status_code=503, detail=msg)
    return {"scopeId": scope_id, "leases": leases, "count": len(leases), "activeServer": svc.active_server}


@app.post("/api/dhcp/scopes/{scope_id}/leases/{ip}/release")
async def release_dhcp_lease(
    scope_id: str,
    ip: str,
    request: Request,
    cu:  AppUser     = Depends(get_current_user),
    db:  Session     = Depends(get_db),
    svc: DHCPService = Depends(get_dhcp_service)
):
    """Release/delete an active DHCP lease"""
    success, msg = svc.release_lease(scope_id, ip)
    log_action(db, cu.username, cu.role, "DHCP Lease Released", "DHCP",
               f"{ip} (scope {scope_id})", msg,
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


@app.delete("/api/dhcp/scopes/{scope_id}/leases/{ip}")
async def delete_dhcp_lease(
    scope_id: str,
    ip: str,
    request: Request,
    cu:  AppUser     = Depends(get_current_user),
    db:  Session     = Depends(get_db),
    svc: DHCPService = Depends(get_dhcp_service)
):
    """Delete a DHCP lease record (same as release)"""
    success, msg = svc.delete_lease(scope_id, ip)
    log_action(db, cu.username, cu.role, "DHCP Lease Deleted", "DHCP",
               f"{ip} (scope {scope_id})", msg,
               "Success" if success else "Failed",
               get_client_ip(request), domain_id=cu.domain_id)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"success": True, "message": msg}


@app.get("/api/dhcp/test")
async def test_dhcp_connection(
    cu:  AppUser     = Depends(get_current_user),
    svc: DHCPService = Depends(get_dhcp_service)
):
    """Test DHCP server connectivity"""
    success, msg = svc.test_connection()
    return {"connected": success, "message": msg, "activeServer": svc.active_server}

# ═══════════════════════════════════════════════════════════
# SERVE REACT FRONTEND
# ═══════════════════════════════════════════════════════════
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
INDEX_FILE = os.path.join(STATIC_DIR, "index.html")

if os.path.exists(INDEX_FILE):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_root():
        return FileResponse(INDEX_FILE)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith(("api/", "api", "docs", "redoc", "openapi.json")):
            raise HTTPException(status_code=404)
        fp = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(fp):
            return FileResponse(fp)
        return FileResponse(INDEX_FILE)

    logger.info(f"OK: Frontend serving from: {STATIC_DIR}")
else:
    @app.get("/", include_in_schema=False)
    async def api_only_root():
        return {"app": "DC Manager Pro", "version": "2.5.0", "status": "running"}

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host     = config.APP_HOST,
        port     = int(os.getenv("APP_PORT", "8080")),
        log_level= "info"
    )
