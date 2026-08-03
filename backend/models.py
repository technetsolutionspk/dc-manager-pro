"""
DC Manager Pro - Models, Config, Database, Auth, Helpers, Encryption
======================================================================
Contains: Config class, database models, encryption, auth helpers, utility functions
"""

import os
import base64
import hashlib
import logging
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from fastapi import HTTPException, Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import create_engine, Column, String, DateTime, Integer, Boolean, Text, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv
from pydantic import BaseModel

os.makedirs("logs", exist_ok=True)
os.makedirs("database", exist_ok=True)
os.makedirs("certs", exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    handlers=[logging.FileHandler("logs/app.log"), logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

try:
    from cryptography.fernet import Fernet
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False

load_dotenv()

# ═══════════════════════════════════════════════════════════
# BUILT-IN AD OBJECTS
# ═══════════════════════════════════════════════════════════
BUILTIN_USERS = [
    "Administrator", "Guest", "krbtgt", "DefaultAccount",
    "WDAGUtilityAccount", "HelpAssistant", "SUPPORT_388945a0"
]

BUILTIN_GROUPS = [
    "Account Operators", "Administrators", "Backup Operators", "Cert Publishers",
    "Cloneable Domain Controllers", "DnsAdmins", "DnsUpdateProxy", "Domain Admins",
    "Domain Computers", "Domain Controllers", "Domain Guests", "Domain Users",
    "Enterprise Admins", "Enterprise Read-only Domain Controllers", "Event Log Readers",
    "Group Policy Creator Owners", "Guests", "Hyper-V Administrators", "IIS_IUSRS",
    "Incoming Forest Trust Builders", "Network Configuration Operators",
    "Performance Log Users", "Performance Monitor Users",
    "Pre-Windows 2000 Compatible Access", "Print Operators", "Protected Users",
    "RAS and IAS Servers", "RDS Endpoint Servers", "RDS Management Servers",
    "RDS Remote Access Servers", "Read-only Domain Controllers", "Remote Desktop Users",
    "Remote Management Users", "Replicator", "Schema Admins", "Server Operators",
    "Storage Replica Administrators", "System Managed Accounts Group",
    "Terminal Server License Servers", "Users", "Windows Authorization Access Group",
]

BUILTIN_CONTAINERS = [
    "CN=Users", "CN=Builtin", "CN=Computers",
    "CN=ForeignSecurityPrincipals", "CN=Managed Service Accounts", "CN=System"
]

def is_builtin_user(u): return u in BUILTIN_USERS
def is_builtin_group(n): return n in BUILTIN_GROUPS
def is_in_builtin_container(dn):
    if not dn: return False
    d = dn.upper()
    return any(c.upper() in d for c in BUILTIN_CONTAINERS)

# ═══════════════════════════════════════════════════════════
# SAFE HELPERS
# ═══════════════════════════════════════════════════════════
def safe_int(v, d=0):
    if v is None: return d
    if isinstance(v, bool): return int(v)
    if isinstance(v, int): return v
    if hasattr(v, 'year'): return d
    try: return int(v)
    except: return d

def safe_str(v, d=""):
    if v is None: return d
    if isinstance(v, (list, tuple)): return ", ".join(str(x) for x in v)
    return str(v)

def safe_datetime_str(v, d=""):
    if v is None or v == "": return d
    if hasattr(v, 'isoformat'):
        try: return v.isoformat()
        except: return d
    return str(v)

def clean_value(v):
    if v is None: return None
    c = str(v).strip()
    return c if c else None

# ═══════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════
class Config:
    AD_SERVER_PRIMARY   = os.getenv("AD_SERVER_PRIMARY", "192.168.200.10")
    AD_SERVER_SECONDARY = os.getenv("AD_SERVER_SECONDARY", "")
    AD_DOMAIN           = os.getenv("AD_DOMAIN", "abasyn.local")
    AD_BASE_DN          = os.getenv("AD_BASE_DN", "DC=abasyn,DC=local")
    AD_TARGET_OU        = os.getenv("AD_TARGET_OU", "DC=abasyn,DC=local")
    AD_SERVICE_ACCOUNT  = os.getenv("AD_SERVICE_ACCOUNT", "svc-dcmanager@abasyn.local")
    AD_SERVICE_PASSWORD = os.getenv("AD_SERVICE_PASSWORD", "CHANGE_ME")
    AD_USE_LDAPS        = os.getenv("AD_USE_LDAPS", "true").lower() == "true"
    AD_PORT             = int(os.getenv("AD_PORT", "636"))
    SECRET_KEY          = os.getenv("SECRET_KEY", "change-me-in-production")
    ALGORITHM           = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = 480
    DATABASE_URL = "sqlite:///./database/audit.db"
    APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
    APP_PORT = int(os.getenv("APP_PORT", "8080"))

config = Config()

# ═══════════════════════════════════════════════════════════
# DATABASE MODELS
# ═══════════════════════════════════════════════════════════
Base = declarative_base()

# ── NEW: Domain Profiles ────────────────────────────────────
class DomainProfile(Base):
    __tablename__       = "domain_profiles"
    id                  = Column(Integer, primary_key=True, index=True)
    name                = Column(String(100), unique=True, nullable=False)
    ad_server_primary   = Column(String(100), nullable=False)
    ad_server_secondary = Column(String(100), default="")
    ad_domain           = Column(String(100), nullable=False)
    ad_base_dn          = Column(String(200), nullable=False)
    ad_service_account  = Column(String(200), nullable=False)
    ad_service_password = Column(Text, nullable=False)
    ad_use_ldaps        = Column(Boolean, default=True)
    ad_port             = Column(Integer, default=636)
    ad_default_user_ou  = Column(String(500), default="")
    is_default          = Column(Boolean, default=False)
    dns_server_primary  = Column(String(100), default="")
    dns_server_secondary= Column(String(100), default="")
    dhcp_server_primary = Column(String(100), default="")
    dhcp_server_secondary=Column(String(100), default="")
    created_at          = Column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id            = Column(Integer, primary_key=True, index=True)
    timestamp     = Column(DateTime, default=datetime.utcnow)
    operator      = Column(String(100))
    operator_role = Column(String(20))
    action        = Column(String(100))
    object_type   = Column(String(50))
    object_name   = Column(String(200))
    details       = Column(Text)
    status        = Column(String(20))
    ip_address    = Column(String(50))
    domain_id     = Column(Integer, index=True)

class AppUser(Base):
    __tablename__ = "app_users"
    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(100), index=True)
    display_name  = Column(String(200))
    email         = Column(String(200))
    role          = Column(String(20), default="Viewer")
    active        = Column(Boolean, default=True)
    last_login    = Column(DateTime)
    domain_id     = Column(Integer, ForeignKey("domain_profiles.id"), nullable=False)
    domain        = relationship("DomainProfile")
    __table_args__ = (
        UniqueConstraint("username", "domain_id", name="uq_appuser_username_domain"),
    )

class AppSetting(Base):
    __tablename__ = "app_settings"
    id         = Column(Integer, primary_key=True, index=True)
    key        = Column(String(100), unique=True, index=True)
    value      = Column(Text)
    category   = Column(String(50))
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(String(100))

class UserTemplate(Base):
    __tablename__          = "user_templates"
    id                     = Column(Integer, primary_key=True, index=True)
    name                   = Column(String(100), unique=True, index=True)
    description            = Column(Text)
    ou                     = Column(String(500))
    department             = Column(String(200))
    title                  = Column(String(200))
    company                = Column(String(200))
    office                 = Column(String(200))
    phone                  = Column(String(50))
    manager                = Column(String(500))
    groups                 = Column(Text)
    password_never_expires = Column(Boolean, default=False)
    must_change_password   = Column(Boolean, default=True)
    enabled                = Column(Boolean, default=True)
    created_at             = Column(DateTime, default=datetime.utcnow)
    created_by             = Column(String(100))
    domain_id              = Column(Integer, ForeignKey("domain_profiles.id"), index=True)

class WorkflowRequest(Base):
    __tablename__    = "workflow_requests"
    id               = Column(Integer, primary_key=True, index=True)
    request_type     = Column(String(50))
    requested_by     = Column(String(100))
    target_object    = Column(String(200))
    payload          = Column(Text)
    status           = Column(String(20), default="pending")
    reason           = Column(Text)
    rejection_reason = Column(Text)
    approved_by      = Column(String(100))
    approved_at      = Column(DateTime)
    completed_at     = Column(DateTime)
    created_at       = Column(DateTime, default=datetime.utcnow)
    domain_id        = Column(Integer, ForeignKey("domain_profiles.id"), index=True)

class ActiveSession(Base):
    __tablename__  = "active_sessions"
    id             = Column(Integer, primary_key=True, index=True)
    username       = Column(String(100), index=True)
    display_name   = Column(String(200))
    role           = Column(String(20))
    ip_address     = Column(String(50))
    user_agent     = Column(String(500))
    login_time     = Column(DateTime, default=datetime.utcnow)
    last_activity  = Column(DateTime, default=datetime.utcnow)
    token_hash     = Column(String(100), index=True)
    domain_id      = Column(Integer, ForeignKey("domain_profiles.id"), index=True)

class ServiceAccount(Base):
    __tablename__          = "service_accounts"
    id                     = Column(Integer, primary_key=True, index=True)
    username               = Column(String(100), index=True)
    display_name           = Column(String(200))
    email                  = Column(String(200))
    description            = Column(Text)
    purpose                = Column(Text)
    owner                  = Column(String(100))
    department             = Column(String(100))
    ad_dn                  = Column(String(500))
    ou                     = Column(String(500))
    password_never_expires = Column(Boolean, default=True)
    cannot_change_password = Column(Boolean, default=True)
    is_system_critical     = Column(Boolean, default=False)
    has_app_access         = Column(Boolean, default=False)
    app_role               = Column(String(20), default="Viewer")
    created_at             = Column(DateTime, default=datetime.utcnow)
    created_by             = Column(String(100))
    last_password_change   = Column(DateTime)
    notes                  = Column(Text)
    domain_id              = Column(Integer, ForeignKey("domain_profiles.id"), index=True)

engine       = create_engine(config.DATABASE_URL, connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

# ═══════════════════════════════════════════════════════════
# ENCRYPTION
# ═══════════════════════════════════════════════════════════
def get_encryption_key():
    return base64.urlsafe_b64encode(
        config.SECRET_KEY.encode('utf-8')[:32].ljust(32, b'0')
    )

def encrypt_value(v):
    if not v or not CRYPTO_AVAILABLE: return v or ""
    try: return Fernet(get_encryption_key()).encrypt(v.encode()).decode()
    except: return v

def decrypt_value(v):
    if not v or not CRYPTO_AVAILABLE: return v or ""
    try: return Fernet(get_encryption_key()).decrypt(v.encode()).decode()
    except: return v

# ═══════════════════════════════════════════════════════════
# DOMAIN PROFILE HELPERS
# ═══════════════════════════════════════════════════════════
def init_default_domains(db: Session):
    """Seed two default domain profiles if none exist"""
    if db.query(DomainProfile).count() == 0:
        d1 = DomainProfile(
            name                = "Abasyn Staff",
            ad_server_primary   = "192.168.200.10",
            ad_server_secondary = "",
            ad_domain           = "abasyn.local",
            ad_base_dn          = "DC=abasyn,DC=local",
            ad_service_account  = "svc-dcmanager@abasyn.local",
            ad_service_password = encrypt_value("CHANGE_ME"),
            ad_use_ldaps        = True,
            ad_port             = 636,
            ad_default_user_ou  = "DC=abasyn,DC=local",
            is_default          = True
        )
        d2 = DomainProfile(
            name                = "Abasyn Student",
            ad_server_primary   = "172.16.200.10",
            ad_server_secondary = "",
            ad_domain           = "aup.local",
            ad_base_dn          = "DC=aup,DC=local",
            ad_service_account  = "svc-dcmanager@aup.local",
            ad_service_password = encrypt_value("CHANGE_ME"),
            ad_use_ldaps        = True,
            ad_port             = 636,
            ad_default_user_ou  = "DC=aup,DC=local",
            is_default          = False
        )
        db.add(d1)
        db.add(d2)
        db.commit()
        logger.info("Default domain profiles seeded: Abasyn Staff, Abasyn Student")

def get_domain_profile(db: Session, domain_id: int):
    """Get a domain profile by ID"""
    return db.query(DomainProfile).filter(DomainProfile.id == domain_id).first()

def get_domain_password(domain: DomainProfile) -> str:
    """Decrypt and return the service account password for a domain profile"""
    if domain and domain.ad_service_password:
        pwd = decrypt_value(domain.ad_service_password)
        if pwd and pwd != PASSWORD_MASK:
            return pwd
    return ""

# ═══════════════════════════════════════════════════════════
# SETTINGS (kept for backward compatibility)
# ═══════════════════════════════════════════════════════════
DEFAULT_SETTINGS = {
    "show_builtin_users":        "false",
    "show_builtin_groups":       "false",
    "show_builtin_containers":   "false",
    "pwd_min_length":            "8",
    "pwd_require_upper":         "true",
    "pwd_require_lower":         "true",
    "pwd_require_number":        "true",
    "pwd_require_special":       "true",
    "pwd_history_count":         "5",
    "pwd_max_age_days":          "90",
    "notify_smtp_server":        "",
    "notify_smtp_port":          "587",
    "notify_smtp_user":          "",
    "notify_smtp_password":      "",
    "notify_from_email":         "",
    "notify_admin_email":        "",
    "notify_on_lockout":         "true",
    "notify_on_password_expiry": "true",
}
ENCRYPTED_KEYS = ["notify_smtp_password"]
PASSWORD_MASK  = "********"

def get_setting_category(k):
    if k.startswith("ad_") or k.startswith("show_"): return "ad"
    if k.startswith("pwd_"):    return "password"
    if k.startswith("notify_"): return "notification"
    return "general"

def init_default_settings(db):
    for k, v in DEFAULT_SETTINGS.items():
        if not db.query(AppSetting).filter(AppSetting.key == k).first():
            db.add(AppSetting(key=k, value=v, category=get_setting_category(k), updated_by="system"))
    db.commit()

def get_setting(db, key, default=""):
    s = db.query(AppSetting).filter(AppSetting.key == key).first()
    return s.value if s else default

def get_fresh_password():
    """Fallback - reads from .env only. Per-domain password use get_domain_password()"""
    return config.AD_SERVICE_PASSWORD

def reload_config_from_db(db, ad_service=None):
    """Reload global config from default domain profile"""
    try:
        domain = db.query(DomainProfile).filter(DomainProfile.is_default == True).first()
        if domain:
            config.AD_SERVER_PRIMARY   = domain.ad_server_primary
            config.AD_SERVER_SECONDARY = domain.ad_server_secondary or ""
            config.AD_DOMAIN           = domain.ad_domain
            config.AD_BASE_DN          = domain.ad_base_dn
            config.AD_SERVICE_ACCOUNT  = domain.ad_service_account
            config.AD_TARGET_OU        = domain.ad_default_user_ou or domain.ad_base_dn
            config.AD_USE_LDAPS        = domain.ad_use_ldaps
            config.AD_PORT             = domain.ad_port
            pwd = get_domain_password(domain)
            if pwd: config.AD_SERVICE_PASSWORD = pwd
            if ad_service:
                ad_service.base_dn   = config.AD_BASE_DN
                ad_service.target_ou = config.AD_TARGET_OU
                ad_service.domain    = config.AD_DOMAIN
            logger.info(f"Config reloaded from domain profile: {domain.name}")
    except Exception as e:
        logger.error(f"Config reload failed: {e}")

# ═══════════════════════════════════════════════════════════
# AUTH HELPERS
# ═══════════════════════════════════════════════════════════
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

class Token(BaseModel):
    access_token : str
    token_type   : str
    role         : str
    display_name : str
    username     : str
    domain_id    : int
    domain_name  : str

def create_access_token(data):
    to_encode = data.copy()
    to_encode.update({
        "exp": datetime.utcnow() + timedelta(minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES)
    })
    return jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)

def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()[:32]

def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Validates JWT and returns AppUser scoped to the ACTIVE domain.

    Domain resolution priority:
    1. X-Domain-ID header (if user is authorized in that domain)
    2. JWT domain_id (login domain fallback)

    If X-Domain-ID header points to a domain where the user has no authorization,
    raises 403 with a clear message.
    """
    err = HTTPException(status_code=401, detail="Invalid or expired token")

    # Decode JWT
    try:
        payload       = jwt.decode(token, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        username      = payload.get("sub")
        jwt_domain_id = payload.get("domain_id")
        if not username or not jwt_domain_id:
            raise err
    except JWTError:
        raise err

    # Check for domain switch via X-Domain-ID header
    active_domain_id = jwt_domain_id
    header_value     = request.headers.get("X-Domain-ID") if request else None

    if header_value:
        try:
            header_domain_id = int(header_value)
            if header_domain_id != jwt_domain_id:
                # User is switching domains - verify they are authorized in the target domain
                swap_user = db.query(AppUser).filter(
                    AppUser.username  == username,
                    AppUser.domain_id == header_domain_id,
                    AppUser.active    == True
                ).first()
                if swap_user:
                    active_domain_id = header_domain_id
                else:
                    raise HTTPException(
                        status_code=403,
                        detail=f"User '{username}' is not authorized for the selected domain. Please log out and log in directly to that domain."
                    )
        except (ValueError, TypeError):
            pass

    # Load the user in the active domain
    user = db.query(AppUser).filter(
        AppUser.username  == username,
        AppUser.domain_id == active_domain_id,
        AppUser.active    == True
    ).first()

    if not user:
        raise err

    # Update session activity
    try:
        th = hash_token(token)
        s  = db.query(ActiveSession).filter(ActiveSession.token_hash == th).first()
        if s:
            s.last_activity = datetime.utcnow()
            db.commit()
    except: pass

    return user

def require_admin(current_user: AppUser = Depends(get_current_user)):
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return current_user

def log_action(db, operator, role, action, obj_type, obj_name, details, result, ip="", domain_id=None):
    try:
        db.add(AuditLog(
            operator=operator, operator_role=role, action=action,
            object_type=obj_type, object_name=obj_name,
            details=details, status=result, ip_address=ip,
            domain_id=domain_id
        ))
        db.commit()
    except: pass

def get_client_ip(r):
    if not r: return "unknown"
    f = r.headers.get("X-Forwarded-For")
    if f: return f.split(",")[0].strip()
    return r.client.host if r.client else "unknown"

def get_user_agent(r):
    if not r: return ""
    return r.headers.get("User-Agent", "")[:500]

def send_email(to, subject, html_body, db):
    try:
        ss  = db.query(AppSetting).filter(AppSetting.key == "notify_smtp_server").first()
        sp  = db.query(AppSetting).filter(AppSetting.key == "notify_smtp_port").first()
        su  = db.query(AppSetting).filter(AppSetting.key == "notify_smtp_user").first()
        spw = db.query(AppSetting).filter(AppSetting.key == "notify_smtp_password").first()
        fe  = db.query(AppSetting).filter(AppSetting.key == "notify_from_email").first()
        if not ss or not ss.value: return False, "SMTP not configured"
        msg            = MIMEMultipart()
        msg['From']    = fe.value if fe else "noreply@dcmanager.local"
        msg['To']      = to
        msg['Subject'] = subject
        msg.attach(MIMEText(html_body, 'html'))
        server = smtplib.SMTP(ss.value, int(sp.value or 587), timeout=10)
        server.starttls()
        if su and su.value:
            pwd = decrypt_value(spw.value) if spw and spw.value else ""
            server.login(su.value, pwd)
        server.send_message(msg)
        server.quit()
        return True, "Email sent"
    except Exception as e:
        return False, str(e)