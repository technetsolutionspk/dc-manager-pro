"""
DC Manager Pro - Active Directory Service
==========================================
Contains: ADService class with all LDAP operations + Windows LAPS integration
"""

import re
import json
import logging
import subprocess
from datetime import datetime, timedelta
from fastapi import HTTPException
from models import (
    config, SessionLocal, AppSetting, DomainProfile,
    safe_int, safe_str, safe_datetime_str, clean_value,
    is_builtin_user, is_builtin_group, is_in_builtin_container,
    get_fresh_password, get_domain_password, decrypt_value
)

logger = logging.getLogger(__name__)

try:
    from ldap3 import (
        Server, Connection, ALL, SIMPLE, SUBTREE, LEVEL, BASE,
        MODIFY_REPLACE, MODIFY_ADD, MODIFY_DELETE,
        ServerPool, ROUND_ROBIN
    )
    from ldap3.core.exceptions import LDAPException, LDAPBindError
    LDAP_AVAILABLE = True
    logger.info("ldap3 loaded")
except ImportError:
    LDAP_AVAILABLE = False


class ADService:
    def __init__(self, domain_profile=None):
        """
        domain_profile: DomainProfile ORM object (optional).
        If provided, all LDAP operations use that domain's credentials.
        If None, falls back to global config (default domain).
        """
        self._profile = domain_profile

        if domain_profile:
            self.base_dn   = domain_profile.ad_base_dn
            self.target_ou = domain_profile.ad_default_user_ou or domain_profile.ad_base_dn
            self.domain    = domain_profile.ad_domain
        else:
            self.base_dn   = config.AD_BASE_DN
            self.target_ou = config.AD_TARGET_OU
            self.domain    = config.AD_DOMAIN

        self._lockout_cache     = None
        self._lockout_cached_at = None

    # ── Internal helpers ───────────────────────────────────────
    def _get_primary_server(self):
        if self._profile:
            return self._profile.ad_server_primary
        return config.AD_SERVER_PRIMARY

    def _get_secondary_server(self):
        if self._profile:
            return self._profile.ad_server_secondary or ""
        return config.AD_SERVER_SECONDARY

    def _get_port(self):
        if self._profile:
            return self._profile.ad_port
        return config.AD_PORT

    def _get_use_ssl(self):
        if self._profile:
            return self._profile.ad_use_ldaps
        return config.AD_USE_LDAPS

    def _get_service_account(self):
        if self._profile:
            return self._profile.ad_service_account
        return config.AD_SERVICE_ACCOUNT

    def _get_service_password(self):
        if self._profile:
            return get_domain_password(self._profile)
        return get_fresh_password()

    def _get_server(self, address):
        return Server(
            address,
            port    = self._get_port(),
            use_ssl = self._get_use_ssl(),
            get_info= ALL
        )

    def _get_connection(self):
        """Get LDAP connection using domain profile credentials"""
        if not LDAP_AVAILABLE:
            raise HTTPException(status_code=503, detail="LDAP3 not installed")

        svc_account = self._get_service_account()
        svc_password = self._get_service_password()

        servers = [self._get_server(self._get_primary_server())]
        secondary = self._get_secondary_server()
        if secondary:
            servers.append(self._get_server(secondary))

        server = (
            ServerPool(servers, ROUND_ROBIN, active=True, exhaust=True)
            if len(servers) > 1 else servers[0]
        )
        try:
            return Connection(
                server,
                user            = svc_account,
                password        = svc_password,
                authentication  = SIMPLE,
                auto_bind       = True,
                raise_exceptions= True
            )
        except LDAPBindError as e:
            logger.error(f"AD bind failed [{self.domain}]: {e}")
            raise HTTPException(status_code=503, detail=f"AD bind failed: {str(e)}")
        except Exception as e:
            logger.error(f"AD connection error [{self.domain}]: {e}")
            raise HTTPException(status_code=503, detail=f"AD error: {e}")

    def _get_fresh_target_ou(self):
        db = SessionLocal()
        try:
            if self._profile:
                return self._profile.ad_default_user_ou or self.target_ou
            s = db.query(AppSetting).filter(AppSetting.key == 'ad_default_user_ou').first()
            return s.value if (s and s.value) else self.target_ou
        finally:
            db.close()

    def _get_lockout_duration(self):
        if (self._lockout_cache is not None
                and self._lockout_cached_at is not None
                and (datetime.utcnow() - self._lockout_cached_at).total_seconds() < 3600):
            return self._lockout_cache
        try:
            conn = self._get_connection()
            conn.search(
                search_base   = self.base_dn,
                search_filter = '(objectClass=domain)',
                attributes    = ['lockoutDuration']
            )
            d = 30 * 60
            if conn.entries:
                dur = conn.entries[0].lockoutDuration.value
                if dur:
                    if isinstance(dur, int): d = abs(dur) / 10_000_000
                    elif hasattr(dur, 'total_seconds'): d = abs(dur.total_seconds())
            conn.unbind()
            self._lockout_cache     = d
            self._lockout_cached_at = datetime.utcnow()
            return d
        except:
            return 30 * 60

    def _is_user_locked(self, lv, ld):
        if not lv: return False
        try:
            dt = None
            if hasattr(lv, 'year'):
                dt = lv.replace(tzinfo=None) if lv.tzinfo else lv
            elif isinstance(lv, int) and lv > 0:
                dt = datetime(1601, 1, 1) + timedelta(seconds=lv / 10_000_000)
            if not dt: return False
            t = (datetime.utcnow() - dt).total_seconds()
            return 0 < t < ld
        except:
            return False

    # ── Authentication ─────────────────────────────────────────
    def authenticate_user(self, username, password):
        if not LDAP_AVAILABLE: return None
        upn = f"{username}@{self.domain}" if "@" not in username else username
        try:
            server = self._get_server(self._get_primary_server())
            conn   = Connection(
                server,
                user           = upn,
                password       = password,
                authentication = SIMPLE,
                auto_bind      = True
            )
            if conn.bound:
                info = self.get_user(username.split("@")[0])
                conn.unbind()
                return info or {"username": username}
        except:
            return None
        return None

    def get_user(self, username):
        try:
            conn = self._get_connection()
            conn.search(
                search_base   = self.base_dn,
                search_filter = f"(&(objectClass=user)(objectCategory=person)(sAMAccountName={username}))",
                search_scope  = SUBTREE,
                attributes    = ["sAMAccountName", "displayName", "mail",
                                 "userAccountControl", "distinguishedName"]
            )
            if not conn.entries:
                conn.unbind()
                return None
            e   = conn.entries[0]
            uac = safe_int(e.userAccountControl.value, 0)
            conn.unbind()
            return {
                "username":     safe_str(e.sAMAccountName.value),
                "display_name": safe_str(e.displayName.value),
                "email":        safe_str(e.mail.value),
                "enabled":      not bool(uac & 0x0002),
                "dn":           safe_str(e.distinguishedName.value)
            }
        except:
            return None

    def get_users(self, base_dn=None, search_filter="", show_builtin=False):
        lf   = (f"(&(objectClass=user)(objectCategory=person){search_filter})"
                if search_filter else "(&(objectClass=user)(objectCategory=person))")
        ft   = self._get_fresh_target_ou()
        sb   = base_dn or ft or self.base_dn
        ld   = self._get_lockout_duration()
        conn = self._get_connection()
        attrs = [
            "sAMAccountName", "givenName", "sn", "displayName", "userPrincipalName",
            "mail", "description", "physicalDeliveryOfficeName", "telephoneNumber",
            "department", "title", "manager", "company", "distinguishedName",
            "whenCreated", "whenChanged", "lastLogonTimestamp", "pwdLastSet",
            "userAccountControl", "memberOf", "lockoutTime", "accountExpires",
            "thumbnailPhoto", "homeDirectory", "homeDrive"
        ]
        try:
            conn.search(
                search_base   = sb,
                search_filter = lf,
                search_scope  = SUBTREE,
                attributes    = attrs,
                paged_size    = 1000
            )
        except Exception as e:
            conn.unbind()
            raise HTTPException(status_code=500, detail=f"AD search failed: {e}")
        users = []
        for e in conn.entries:
            try:
                un = safe_str(e.sAMAccountName.value)
                dn = safe_str(e.distinguishedName.value)
                if not show_builtin:
                    if is_builtin_user(un): continue
                    if is_in_builtin_container(dn): continue
                uac = safe_int(e.userAccountControl.value, 0)
                dis = bool(uac & 0x0002)
                loc = self._is_user_locked(e.lockoutTime.value, ld)
                st  = "locked" if loc else ("disabled" if dis else "active")
                pr  = e.pwdLastSet.value
                pe  = ""
                mc  = False
                if pr is None or pr == "":
                    mc = True
                elif isinstance(pr, int):
                    mc = (pr == 0)
                    if pr > 0:
                        try:
                            pe = (datetime(1601, 1, 1) + timedelta(seconds=pr / 10_000_000) + timedelta(days=90)).isoformat()
                        except: pass
                elif hasattr(pr, 'isoformat'):
                    try: pe = (pr + timedelta(days=90)).isoformat()
                    except: pass
                gr = []
                try:
                    if e.memberOf.values: gr = [safe_str(g) for g in e.memberOf.values]
                except: pass
                hp = False
                try:
                    if e.thumbnailPhoto.value: hp = True
                except: pass
                users.append({
                    "id":                   dn,
                    "username":             un,
                    "firstName":            safe_str(e.givenName.value),
                    "lastName":             safe_str(e.sn.value),
                    "displayName":          safe_str(e.displayName.value),
                    "upn":                  safe_str(e.userPrincipalName.value),
                    "email":                safe_str(e.mail.value),
                    "description":          safe_str(e.description.value),
                    "office":               safe_str(e.physicalDeliveryOfficeName.value),
                    "phone":                safe_str(e.telephoneNumber.value),
                    "department":           safe_str(e.department.value),
                    "title":                safe_str(e.title.value),
                    "manager":              safe_str(e.manager.value),
                    "company":              safe_str(e.company.value),
                    "homeDirectory":        safe_str(e.homeDirectory.value),
                    "homeDrive":            safe_str(e.homeDrive.value),
                    "ou":                   ",".join(dn.split(",")[1:]) if dn else "",
                    "groups":               gr,
                    "status":               st,
                    "enabled":              not dis,
                    "locked":               loc,
                    "created":              safe_datetime_str(e.whenCreated.value),
                    "modified":             safe_datetime_str(e.whenChanged.value),
                    "lastLogon":            safe_datetime_str(e.lastLogonTimestamp.value),
                    "passwordExpiry":       pe,
                    "passwordNeverExpires": bool(uac & 0x10000),
                    "mustChangePassword":   mc,
                    "isBuiltin":            is_builtin_user(un),
                    "hasPhoto":             hp,
                })
            except: continue
        conn.unbind()
        return users

    def get_user_photo(self, username):
        try:
            conn = self._get_connection()
            conn.search(
                search_base   = self.base_dn,
                search_filter = f"(&(objectClass=user)(sAMAccountName={username}))",
                attributes    = ["thumbnailPhoto"]
            )
            if not conn.entries:
                conn.unbind()
                return None
            p = conn.entries[0].thumbnailPhoto.value
            conn.unbind()
            if p:
                if isinstance(p, bytes): return p
                elif isinstance(p, list) and len(p) > 0:
                    return p[0] if isinstance(p[0], bytes) else None
            return None
        except:
            return None

    def set_user_photo(self, username, photo_bytes):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            if not u: conn.unbind(); return False, "User not found"
            if len(photo_bytes) > 100000:
                conn.unbind(); return False, "Photo too large (max 100KB)"
            r = conn.modify(
                safe_str(u.distinguishedName.value),
                {"thumbnailPhoto": [(MODIFY_REPLACE, [photo_bytes])]}
            )
            conn.unbind()
            return r, "Photo uploaded" if r else f"Failed: {conn.result}"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def delete_user_photo(self, username):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            if not u: conn.unbind(); return False, "User not found"
            r = conn.modify(
                safe_str(u.distinguishedName.value),
                {"thumbnailPhoto": [(MODIFY_REPLACE, [])]}
            )
            conn.unbind()
            return r, "Photo deleted" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def create_user(self, data):
        """Two-step user creation - avoids empty attribute and UAC errors"""
        conn    = self._get_connection()
        ou      = data.get("ou") or self.target_ou
        un      = data.get("username", "").strip()
        dn_name = data.get("displayName", "").strip() or un
        if not un:
            conn.unbind(); return False, "Username required"
        dn  = f"CN={dn_name},{ou}"
        upn = clean_value(data.get("upn")) or f"{un}@{self.domain}"
        if upn and '@' not in upn:
            upn = f"{upn}@{self.domain}"
        attrs = {
            "objectClass":        ["top", "person", "organizationalPerson", "user"],
            "sAMAccountName":     un,
            "displayName":        dn_name,
            "userPrincipalName":  upn,
        }
        home_dir = data.get("homeDirectory")
        if home_dir:
            home_dir = str(home_dir).strip().replace("%username%", un).replace("%USERNAME%", un)
        opt = {
            "givenName":                  data.get("firstName"),
            "sn":                         data.get("lastName"),
            "mail":                       data.get("email"),
            "department":                 data.get("department"),
            "title":                      data.get("title"),
            "company":                    data.get("company"),
            "description":                data.get("description"),
            "physicalDeliveryOfficeName": data.get("office"),
            "telephoneNumber":            data.get("phone"),
            "homeDirectory":              home_dir,
            "homeDrive":                  data.get("homeDrive"),
        }
        for k, v in opt.items():
            c = clean_value(v)
            if c: attrs[k] = c
        logger.info(f"Creating user '{un}' in domain '{self.domain}' at DN: {dn}")
        try:
            r = conn.add(dn, attributes=attrs)
            if not r:
                msg = f"{conn.result.get('description','Unknown')}: {conn.result.get('message','')[:200]}"
                logger.error(f"LDAP add failed: {msg}")
                conn.unbind(); return False, msg
            pw = data.get("password", "")
            if pw:
                pv = f'"{pw}"'.encode("utf-16-le")
                pr = conn.modify(dn, {"unicodePwd": [(MODIFY_REPLACE, [pv])]})
                if not pr:
                    logger.error(f"Password set failed: {conn.result}")
                    try: conn.delete(dn)
                    except: pass
                    conn.unbind()
                    return False, f"Password failed: {conn.result.get('message','')[:100]}"
            uac = 512
            if data.get("passwordNeverExpires"): uac |= 0x10000
            conn.modify(dn, {"userAccountControl": [(MODIFY_REPLACE, [uac])]})
            if data.get("mustChangePassword"):
                conn.modify(dn, {"pwdLastSet": [(MODIFY_REPLACE, [0])]})
            conn.unbind()
            logger.info(f"OK: User '{un}' created in '{self.domain}'")
            return True, f"User {un} created"
        except Exception as e:
            logger.error(f"Exception: {e}")
            try: conn.delete(dn)
            except: pass
            conn.unbind(); return False, str(e)

    def delete_user(self, username):
        if is_builtin_user(username):
            return False, f"Cannot delete built-in account '{username}'"
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            if not u:
                conn.unbind(); return False, f"User '{username}' not found"
            dn = safe_str(u.distinguishedName.value)
            r  = conn.delete(dn)
            conn.unbind()
            return r, f"User {username} deleted" if r else f"Failed: {conn.result}"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def update_user(self, username, data):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            if not u:
                conn.unbind(); return False, f"User '{username}' not found"
            dn = safe_str(u.distinguishedName.value)
            ch = {}
            fm = {
                "firstName":     "givenName",
                "lastName":      "sn",
                "displayName":   "displayName",
                "email":         "mail",
                "department":    "department",
                "title":         "title",
                "company":       "company",
                "description":   "description",
                "office":        "physicalDeliveryOfficeName",
                "phone":         "telephoneNumber",
                "manager":       "manager",
                "upn":           "userPrincipalName",
                "homeDirectory": "homeDirectory",
                "homeDrive":     "homeDrive",
            }
            for fk, aa in fm.items():
                if fk in data:
                    c = clean_value(data[fk])
                    if c:
                        if aa == "userPrincipalName":
                            if '@' not in c: c = f"{c}@{self.domain}"
                            ch[aa] = [(MODIFY_REPLACE, [c])]
                        elif aa == "homeDirectory":
                            c = c.replace("%username%", username).replace("%USERNAME%", username)
                            ch[aa] = [(MODIFY_REPLACE, [c])]
                        else:
                            ch[aa] = [(MODIFY_REPLACE, [c])]
                    else:
                        if aa != "userPrincipalName":
                            ch[aa] = [(MODIFY_REPLACE, [])]
            if "passwordNeverExpires" in data or "accountDisabled" in data:
                uac = safe_int(u.userAccountControl.value, 512)
                if "passwordNeverExpires" in data:
                    if data["passwordNeverExpires"]: uac |= 0x10000
                    else: uac &= ~0x10000
                if "accountDisabled" in data:
                    if data["accountDisabled"]: uac |= 0x0002
                    else: uac &= ~0x0002
                ch["userAccountControl"] = [(MODIFY_REPLACE, [uac])]
            if not ch:
                conn.unbind(); return False, "No changes"
            r = conn.modify(dn, ch)
            if not r:
                msg = f"Failed: {conn.result}"
                conn.unbind(); return False, msg
            conn.unbind()
            return True, f"User {username} updated"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def move_user(self, username, target_ou):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            if not u: conn.unbind(); return False, f"User '{username}' not found"
            cdn = safe_str(u.distinguishedName.value)
            rdn = cdn.split(",")[0]
            r   = conn.modify_dn(cdn, rdn, new_superior=target_ou)
            conn.unbind()
            return r, "User moved" if r else f"Failed: {conn.result}"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def disable_user(self, username):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            if not u: conn.unbind(); return False, "Not found"
            uac = safe_int(u.userAccountControl.value, 512) | 0x0002
            r   = conn.modify(
                safe_str(u.distinguishedName.value),
                {"userAccountControl": [(MODIFY_REPLACE, [uac])]}
            )
            conn.unbind()
            return r, "Disabled" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def enable_user(self, username):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            if not u: conn.unbind(); return False, "Not found"
            uac = safe_int(u.userAccountControl.value, 514) & ~0x0002
            r   = conn.modify(
                safe_str(u.distinguishedName.value),
                {"userAccountControl": [(MODIFY_REPLACE, [uac])]}
            )
            conn.unbind()
            return r, "Enabled" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def unlock_user(self, username):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            if not u: conn.unbind(); return False, "Not found"
            r = conn.modify(
                safe_str(u.distinguishedName.value),
                {"lockoutTime": [(MODIFY_REPLACE, [0])]}
            )
            conn.unbind()
            return r, "Unlocked" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def reset_password(self, username, new_password, force_change=True):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            if not u: conn.unbind(); return False, "Not found"
            dn = safe_str(u.distinguishedName.value)
            pv = f'"{new_password}"'.encode("utf-16-le")
            r  = conn.modify(dn, {"unicodePwd": [(MODIFY_REPLACE, [pv])]})
            if r and force_change:
                conn.modify(dn, {"pwdLastSet": [(MODIFY_REPLACE, [0])]})
            conn.unbind()
            return r, "Password reset" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def add_to_group(self, username, group_name):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            g = self._find_group(conn, group_name)
            if not u or not g: conn.unbind(); return False, "Not found"
            r = conn.modify(
                safe_str(g.distinguishedName.value),
                {"member": [(MODIFY_ADD, [safe_str(u.distinguishedName.value)])]}
            )
            conn.unbind()
            return r, "Added" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def remove_from_group(self, username, group_name):
        conn = self._get_connection()
        try:
            u = self._find_user(conn, username)
            g = self._find_group(conn, group_name)
            if not u or not g: conn.unbind(); return False, "Not found"
            r = conn.modify(
                safe_str(g.distinguishedName.value),
                {"member": [(MODIFY_DELETE, [safe_str(u.distinguishedName.value)])]}
            )
            conn.unbind()
            return r, "Removed" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def get_groups(self, search=None, show_builtin=False):
        conn = self._get_connection()
        f    = f"(&(objectClass=group)(cn=*{search}*))" if search else "(objectClass=group)"
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = f,
                search_scope  = SUBTREE,
                attributes    = ["cn", "description", "groupType", "mail", "member",
                                 "memberOf", "distinguishedName", "whenCreated", "whenChanged"],
                size_limit    = 500
            )
        except Exception as e:
            conn.unbind(); raise HTTPException(status_code=500, detail=str(e))
        groups = []
        for e in conn.entries:
            try:
                n  = safe_str(e.cn.value)
                dn = safe_str(e.distinguishedName.value)
                if not show_builtin:
                    if is_builtin_group(n): continue
                    if is_in_builtin_container(dn): continue
                gt  = safe_int(e.groupType.value, 0)
                sec = bool(gt & 0x80000000)
                sc  = {4: "domain-local", 2: "global", 8: "universal"}.get(gt & 0xF, "global")
                m   = [safe_str(x) for x in (e.member.values or [])] if e.member else []
                groups.append({
                    "id":          dn,
                    "name":        n,
                    "description": safe_str(e.description.value),
                    "type":        "security" if sec else "distribution",
                    "scope":       sc,
                    "email":       safe_str(e.mail.value),
                    "memberCount": len(m),
                    "members":     m,
                    "memberOf":    [safe_str(x) for x in (e.memberOf.values or [])] if e.memberOf else [],
                    "ou":          ",".join(dn.split(",")[1:]) if dn else "",
                    "created":     safe_datetime_str(e.whenCreated.value),
                    "modified":    safe_datetime_str(e.whenChanged.value),
                    "isBuiltin":   is_builtin_group(n),
                })
            except: pass
        conn.unbind()
        return groups

    def create_group(self, name, description, ou, group_type, scope):
        conn = self._get_connection()
        tv   = 0x80000000 if group_type == "security" else 0
        sv   = {"global": 2, "domain-local": 4, "universal": 8}.get(scope, 2)
        gt   = tv | sv
        if gt > 0x7FFFFFFF: gt -= 0x100000000
        dn   = f"CN={name},{ou}"
        try:
            attrs = {"objectClass": ["top", "group"], "sAMAccountName": name, "groupType": gt}
            cd = clean_value(description)
            if cd: attrs["description"] = cd
            r = conn.add(dn, attributes=attrs)
            conn.unbind()
            return r, "Group created" if r else f"Failed: {conn.result}"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def delete_group(self, group_name):
        if is_builtin_group(group_name):
            return False, "Cannot delete built-in group"
        conn = self._get_connection()
        try:
            g = self._find_group(conn, group_name)
            if not g: conn.unbind(); return False, "Not found"
            r = conn.delete(safe_str(g.distinguishedName.value))
            conn.unbind()
            return r, "Deleted" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def get_group_members(self, group_name):
        conn = self._get_connection()
        try:
            g   = self._find_group(conn, group_name)
            if not g: conn.unbind(); return None
            mds = [safe_str(m) for m in (g.member.values or [])] if g.member else []
            members = []
            for md in mds:
                try:
                    conn.search(
                        search_base   = md,
                        search_filter = "(objectClass=*)",
                        attributes    = ["sAMAccountName", "displayName", "mail",
                                         "userAccountControl", "objectClass"]
                    )
                    if conn.entries:
                        e   = conn.entries[0]
                        uac = safe_int(e.userAccountControl.value, 0)
                        members.append({
                            "dn":          md,
                            "username":    safe_str(e.sAMAccountName.value),
                            "displayName": safe_str(e.displayName.value),
                            "email":       safe_str(e.mail.value),
                            "enabled":     not bool(uac & 0x0002),
                            "type":        "user" if "user" in [safe_str(c).lower()
                                           for c in (e.objectClass.values or [])] else "other",
                        })
                except:
                    members.append({"dn": md, "displayName": md, "type": "unknown"})
            conn.unbind()
            return members
        except Exception as e:
            conn.unbind(); raise HTTPException(status_code=500, detail=str(e))

    def get_computers(self, search=None):
        conn = self._get_connection()
        if search:
            f = f"(&(objectClass=computer)(|(cn=*{search}*)(dNSHostName=*{search}*)(operatingSystem=*{search}*)(operatingSystemVersion=*{search}*)(description=*{search}*)))"
        else:
            f = "(objectClass=computer)"
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = f,
                search_scope  = SUBTREE,
                attributes    = ["cn", "dNSHostName", "operatingSystem", "operatingSystemVersion",
                                 "description", "distinguishedName", "lastLogonTimestamp",
                                 "whenCreated", "whenChanged", "userAccountControl", "managedBy"],
                size_limit    = 500
            )
        except Exception as e:
            conn.unbind(); raise HTTPException(status_code=500, detail=str(e))
        comps = []
        for e in conn.entries:
            try:
                uac  = safe_int(e.userAccountControl.value, 0)
                dis  = bool(uac & 0x0002)
                ll   = e.lastLogonTimestamp.value
                days = 999
                if ll and hasattr(ll, 'year'):
                    try: days = (datetime.utcnow() - ll.replace(tzinfo=None)).days
                    except: pass
                st = "disabled" if dis else ("inactive" if days > 90 else "active")
                dn = safe_str(e.distinguishedName.value)
                comps.append({
                    "id":          dn,
                    "name":        safe_str(e.cn.value),
                    "dnsName":     safe_str(e.dNSHostName.value),
                    "os":          safe_str(e.operatingSystem.value),
                    "osVersion":   safe_str(e.operatingSystemVersion.value),
                    "description": safe_str(e.description.value),
                    "ou":          ",".join(dn.split(",")[1:]) if dn else "",
                    "status":      st,
                    "enabled":     not dis,
                    "lastLogon":   safe_datetime_str(ll),
                    "created":     safe_datetime_str(e.whenCreated.value),
                    "modified":    safe_datetime_str(e.whenChanged.value),
                    "managedBy":   safe_str(e.managedBy.value),
                })
            except: pass
        conn.unbind()
        return comps

    def create_computer(self, name, ou, description=""):
        conn = self._get_connection()
        try:
            dn    = f"CN={name},{ou}"
            attrs = {
                "objectClass":      ["top", "person", "organizationalPerson", "user", "computer"],
                "cn":               name,
                "sAMAccountName":   f"{name}$",
                "userAccountControl": 4096
            }
            cd = clean_value(description)
            if cd: attrs["description"] = cd
            r = conn.add(dn, attributes=attrs)
            conn.unbind()
            return r, f"Computer {name} created" if r else f"Failed: {conn.result}"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def delete_computer(self, name):
        conn = self._get_connection()
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = f"(&(objectClass=computer)(cn={name}))",
                attributes    = ["distinguishedName"]
            )
            if not conn.entries: conn.unbind(); return False, "Not found"
            r = conn.delete(safe_str(conn.entries[0].distinguishedName.value))
            conn.unbind()
            return r, "Deleted" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def enable_computer(self, name):
        conn = self._get_connection()
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = f"(&(objectClass=computer)(cn={name}))",
                attributes    = ["distinguishedName", "userAccountControl"]
            )
            if not conn.entries: conn.unbind(); return False, "Not found"
            e   = conn.entries[0]
            uac = safe_int(e.userAccountControl.value, 4096) & ~0x0002
            r   = conn.modify(
                safe_str(e.distinguishedName.value),
                {"userAccountControl": [(MODIFY_REPLACE, [uac])]}
            )
            conn.unbind()
            return r, "Enabled" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def disable_computer(self, name):
        conn = self._get_connection()
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = f"(&(objectClass=computer)(cn={name}))",
                attributes    = ["distinguishedName", "userAccountControl"]
            )
            if not conn.entries: conn.unbind(); return False, "Not found"
            e   = conn.entries[0]
            uac = safe_int(e.userAccountControl.value, 4096) | 0x0002
            r   = conn.modify(
                safe_str(e.distinguishedName.value),
                {"userAccountControl": [(MODIFY_REPLACE, [uac])]}
            )
            conn.unbind()
            return r, "Disabled" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def move_computer(self, name, target_ou):
        """Move computer to another OU with detailed error reporting"""
        conn = self._get_connection()
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = f"(&(objectClass=computer)(cn={name}))",
                search_scope  = SUBTREE,
                attributes    = ["distinguishedName"]
            )
            if not conn.entries:
                conn.unbind()
                return False, f"Computer '{name}' not found in AD"
            cdn = safe_str(conn.entries[0].distinguishedName.value)
            rdn = cdn.split(",")[0]
            try:
                conn.search(
                    search_base   = target_ou,
                    search_filter = "(objectClass=*)",
                    search_scope  = BASE,
                    attributes    = ["distinguishedName"]
                )
                if not conn.entries:
                    conn.unbind()
                    return False, f"Target OU not accessible: {target_ou}"
            except Exception as ex:
                conn.unbind()
                return False, f"Target OU error: {str(ex)}"
            current_parent = ",".join(cdn.split(",")[1:])
            if current_parent.lower() == target_ou.lower():
                conn.unbind()
                return False, "Computer already in this OU"
            logger.info(f"Moving computer: FROM {cdn} TO {rdn},{target_ou}")
            r = conn.modify_dn(cdn, rdn, new_superior=target_ou)
            if not r:
                desc = conn.result.get('description', 'Unknown')
                msg  = conn.result.get('message', '')[:300]
                code = conn.result.get('result', -1)
                logger.error(f"Move failed: code={code}, desc={desc}, msg={msg}")
                conn.unbind()
                return False, f"AD rejected move: {desc} ({msg})"
            conn.unbind()
            logger.info(f"OK: Moved {name} to {target_ou}")
            return True, f"Moved '{name}' to '{target_ou}'"
        except Exception as e:
            logger.error(f"move_computer exception: {type(e).__name__}: {e}")
            try: conn.unbind()
            except: pass
            return False, f"Exception: {type(e).__name__}: {str(e)}"

    def get_ou_tree(self):
        conn = self._get_connection()
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = "(objectClass=organizationalUnit)",
                search_scope  = SUBTREE,
                attributes    = ["ou", "description", "distinguishedName"]
            )
        except Exception as e:
            conn.unbind(); raise HTTPException(status_code=500, detail=str(e))
        ous = []
        for e in conn.entries:
            try:
                dn = safe_str(e.distinguishedName.value)
                p  = ",".join(dn.split(",")[1:])
                ous.append({
                    "id":          dn,
                    "name":        safe_str(e.ou.value),
                    "dn":          dn,
                    "description": safe_str(e.description.value),
                    "parent":      p if p != self.base_dn else None
                })
            except: pass
        conn.unbind()
        return ous

    def create_ou(self, name, parent, description):
        conn = self._get_connection()
        dn   = f"OU={name},{parent}"
        try:
            attrs = {"objectClass": ["top", "organizationalUnit"], "ou": name}
            cd = clean_value(description)
            if cd: attrs["description"] = cd
            r = conn.add(dn, attributes=attrs)
            conn.unbind()
            return r, "OU created" if r else f"Failed: {conn.result}"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def delete_ou(self, dn):
        conn = self._get_connection()
        try:
            r = conn.delete(dn)
            conn.unbind()
            return r, "OU deleted" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def update_ou(self, dn, description):
        conn = self._get_connection()
        try:
            cd = clean_value(description)
            ch = {"description": [(MODIFY_REPLACE, [cd])] if cd else [(MODIFY_REPLACE, [])]}
            r  = conn.modify(dn, ch)
            conn.unbind()
            return r, "OU updated" if r else "Failed"
        except Exception as e:
            conn.unbind(); return False, str(e)

    def get_ou_contents(self, dn):
        conn = self._get_connection()
        try:
            conn.search(
                search_base   = dn,
                search_filter = "(objectClass=*)",
                search_scope  = LEVEL,
                attributes    = ["objectClass", "cn", "ou", "sAMAccountName", "displayName",
                                 "description", "distinguishedName", "userAccountControl"]
            )
            users, groups, computers, ous = [], [], [], []
            for e in conn.entries:
                try:
                    cl = [safe_str(c).lower() for c in (e.objectClass.values or [])]
                    od = safe_str(e.distinguishedName.value)
                    if "organizationalunit" in cl:
                        ous.append({"name": safe_str(e.ou.value), "dn": od,
                                    "description": safe_str(e.description.value)})
                    elif "computer" in cl:
                        uac = safe_int(e.userAccountControl.value, 0)
                        computers.append({"name": safe_str(e.cn.value), "dn": od,
                                          "enabled": not bool(uac & 0x0002)})
                    elif "group" in cl:
                        groups.append({"name": safe_str(e.cn.value), "dn": od,
                                       "description": safe_str(e.description.value)})
                    elif "user" in cl:
                        uac = safe_int(e.userAccountControl.value, 0)
                        users.append({"username": safe_str(e.sAMAccountName.value),
                                      "displayName": safe_str(e.displayName.value),
                                      "dn": od, "enabled": not bool(uac & 0x0002)})
                except: pass
            conn.unbind()
            return {
                "dn": dn, "users": users, "groups": groups,
                "computers": computers, "ous": ous,
                "counts": {"users": len(users), "groups": len(groups),
                           "computers": len(computers), "ous": len(ous)}
            }
        except Exception as e:
            conn.unbind(); raise HTTPException(status_code=500, detail=str(e))

    def get_gpos(self):
        conn  = self._get_connection()
        gpos  = []
        search_bases = [
            f"CN=Policies,CN=System,{self.base_dn}",
            f"CN=System,{self.base_dn}",
            self.base_dn
        ]
        for sb in search_bases:
            try:
                logger.info(f"Searching GPOs in: {sb}")
                conn.search(
                    search_base   = sb,
                    search_filter = "(objectClass=groupPolicyContainer)",
                    search_scope  = SUBTREE,
                    attributes    = ["cn", "displayName", "gPCFileSysPath", "versionNumber",
                                     "flags", "whenCreated", "whenChanged", "distinguishedName"]
                )
                if conn.entries:
                    logger.info(f"Found {len(conn.entries)} GPOs in {sb}")
                    for e in conn.entries:
                        try:
                            fl = safe_int(e.flags.value, 0)
                            ud = bool(fl & 1)
                            cd = bool(fl & 2)
                            st = ("disabled" if (ud and cd) else "user-disabled" if ud
                                  else "computer-disabled" if cd else "enabled")
                            gpos.append({
                                "id":              safe_str(e.cn.value),
                                "name":            safe_str(e.displayName.value) or safe_str(e.cn.value),
                                "guid":            safe_str(e.cn.value),
                                "path":            safe_str(e.gPCFileSysPath.value),
                                "version":         safe_int(e.versionNumber.value, 0),
                                "status":          st,
                                "userEnabled":     not ud,
                                "computerEnabled": not cd,
                                "dn":              safe_str(e.distinguishedName.value),
                                "created":         safe_datetime_str(e.whenCreated.value),
                                "modified":        safe_datetime_str(e.whenChanged.value),
                            })
                        except: pass
                    break
                else:
                    logger.info(f"No GPOs in {sb}, trying next...")
            except Exception as ex:
                logger.warning(f"GPO search failed in {sb}: {ex}")
                continue
        conn.unbind()
        if not gpos: logger.warning("No GPOs found in any location")
        return gpos

    def get_gpo_links(self):
        conn = self._get_connection()
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = "(gPLink=*)",
                search_scope  = SUBTREE,
                attributes    = ["ou", "name", "distinguishedName", "gPLink", "objectClass"]
            )
            links = []
            for e in conn.entries:
                try:
                    gl = safe_str(e.gPLink.value)
                    if not gl: continue
                    lg      = []
                    matches = re.findall(r'\[LDAP://([^;]+);(\d+)\]', gl, re.IGNORECASE)
                    for gdn, fl in matches:
                        guid = gdn.split(',')[0].replace('CN=', '').replace('cn=', '')
                        lg.append({
                            "guid":     guid,
                            "enabled":  not (int(fl) & 1),
                            "enforced": bool(int(fl) & 2),
                            "dn":       gdn
                        })
                    if lg:
                        n = safe_str(e.ou.value) or safe_str(e.name.value) or "Domain Root"
                        links.append({
                            "ou":   n,
                            "dn":   safe_str(e.distinguishedName.value),
                            "gpos": lg
                        })
                except: pass
            conn.unbind()
            logger.info(f"Found {len(links)} GPO links")
            return links
        except Exception as ex:
            conn.unbind()
            logger.error(f"GPO links failed: {ex}")
            return []

    def test_connection(self, custom_settings=None):
        if not LDAP_AVAILABLE:
            return {"connected": False, "error": "ldap3 not installed"}
        s    = custom_settings or {}
        addr = s.get("ad_server_primary",  self._get_primary_server())
        port = int(s.get("ad_port",        self._get_port()))
        ssl  = str(s.get("ad_use_ldaps",   self._get_use_ssl())).lower() == "true"
        acc  = s.get("ad_service_account", self._get_service_account())
        pwd  = s.get("ad_service_password", self._get_service_password())
        bdn  = s.get("ad_base_dn",         self.base_dn)
        try:
            server = Server(addr, port=port, use_ssl=ssl, get_info=ALL)
            conn   = Connection(
                server, user=acc, password=pwd,
                authentication=SIMPLE, auto_bind=True, raise_exceptions=True
            )
            conn.search(
                search_base   = bdn,
                search_filter = "(objectClass=*)",
                attributes    = ["distinguishedName"],
                size_limit    = 1
            )
            conn.unbind()
            return {
                "connected": True, "success": True,
                "message":   f"Connected to {addr}:{port}",
                "server":    addr, "port": port, "ldaps": ssl, "base_dn": bdn
            }
        except Exception as e:
            return {"connected": False, "success": False, "error": str(e), "server": addr, "port": port}

    # ═══════════════════════════════════════════════════════════
    # WINDOWS LAPS INTEGRATION
    # ═══════════════════════════════════════════════════════════
    def get_laps_password(self, computer_name):
        """Retrieve Windows LAPS password via PowerShell"""
        try:
            safe_name = ''.join(c for c in computer_name if c.isalnum() or c in '-_')
            if safe_name != computer_name or not safe_name:
                return None, "Invalid computer name"
            ps_script = f'''
$ErrorActionPreference = 'Stop'
try {{
    Import-Module LAPS -ErrorAction SilentlyContinue
    $r = Get-LapsADPassword -Identity '{safe_name}' -AsPlainText
    if ($r.DecryptionStatus -ne 'Success') {{
        $obj = @{{
            error = "Decryption failed: $($r.DecryptionStatus)"
            authorizedDecryptor = "$($r.AuthorizedDecryptor)"
        }}
    }} else {{
        $upd = ''
        if ($r.PasswordUpdateTime) {{ $upd = $r.PasswordUpdateTime.ToString('o') }}
        $exp = ''
        if ($r.ExpirationTimestamp) {{ $exp = $r.ExpirationTimestamp.ToString('o') }}
        $obj = @{{
            computerName = "$($r.ComputerName)"
            account = "$($r.Account)"
            password = "$($r.Password)"
            updated = $upd
            expires = $exp
            source = "$($r.Source)"
            status = "$($r.DecryptionStatus)"
            authorizedDecryptor = "$($r.AuthorizedDecryptor)"
            dn = "$($r.DistinguishedName)"
        }}
    }}
    $obj | ConvertTo-Json -Compress
}} catch {{
    @{{ error = "$($_.Exception.Message)" }} | ConvertTo-Json -Compress
}}
'''
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode != 0:
                stderr = (result.stderr or "")[:300]
                logger.error(f"LAPS PowerShell failed: {stderr}")
                return None, f"PowerShell error: {stderr}"
            stdout = (result.stdout or "").strip()
            if not stdout:
                return None, "No response from PowerShell"
            try:
                data = json.loads(stdout)
            except json.JSONDecodeError:
                logger.error(f"LAPS JSON parse failed: {stdout[:200]}")
                return None, "Invalid response format from PowerShell"
            if data.get("error"):
                return None, data["error"]
            return data, "Password retrieved"
        except subprocess.TimeoutExpired:
            return None, "PowerShell timeout (30 seconds)"
        except FileNotFoundError:
            return None, "PowerShell not found on server"
        except Exception as e:
            logger.error(f"LAPS retrieval exception: {e}")
            return None, f"Error: {str(e)}"

    def get_laps_password_history(self, computer_name):
        """Get Windows LAPS password history"""
        try:
            safe_name = ''.join(c for c in computer_name if c.isalnum() or c in '-_')
            if safe_name != computer_name or not safe_name:
                return None, "Invalid computer name"
            ps_script = f'''
$ErrorActionPreference = 'Stop'
try {{
    Import-Module LAPS -ErrorAction SilentlyContinue
    $h = Get-LapsADPassword -Identity '{safe_name}' -IncludeHistory -AsPlainText
    $arr = @()
    foreach ($p in $h) {{
        $upd = ''
        if ($p.PasswordUpdateTime) {{ $upd = $p.PasswordUpdateTime.ToString('o') }}
        $arr += @{{
            password = "$($p.Password)"
            updated = $upd
            status = "$($p.DecryptionStatus)"
            source = "$($p.Source)"
            account = "$($p.Account)"
        }}
    }}
    if ($arr.Count -eq 0) {{ '[]' }}
    else {{ $arr | ConvertTo-Json -Compress -Depth 3 }}
}} catch {{
    @{{ error = "$($_.Exception.Message)" }} | ConvertTo-Json -Compress
}}
'''
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode != 0:
                return None, f"PowerShell error: {(result.stderr or '')[:200]}"
            stdout = (result.stdout or "").strip()
            if not stdout:
                return [], "No history available"
            try:
                data = json.loads(stdout)
            except json.JSONDecodeError:
                return None, "Invalid response format"
            if isinstance(data, dict) and data.get("error"):
                return None, data["error"]
            if isinstance(data, dict):
                data = [data]
            return data, f"Retrieved {len(data)} password(s)"
        except subprocess.TimeoutExpired:
            return None, "PowerShell timeout"
        except Exception as e:
            logger.error(f"LAPS history exception: {e}")
            return None, f"Error: {str(e)}"

    def reset_laps_password(self, computer_name):
        """Force LAPS to rotate password on computer next check-in"""
        conn = self._get_connection()
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = f"(&(objectClass=computer)(cn={computer_name}))",
                search_scope  = SUBTREE,
                attributes    = ["distinguishedName"]
            )
            if not conn.entries:
                conn.unbind()
                return False, f"Computer '{computer_name}' not found"
            dn = safe_str(conn.entries[0].distinguishedName.value)
            r  = conn.modify(dn, {"msLAPS-PasswordExpirationTime": [(MODIFY_REPLACE, ["0"])]})
            if not r:
                error = conn.result.get('description', 'Unknown')
                msg   = conn.result.get('message', '')[:200]
                conn.unbind()
                return False, f"AD modify failed: {error} - {msg}"
            conn.unbind()
            logger.info(f"OK: LAPS rotation scheduled for {computer_name}")
            return True, f"Password rotation scheduled for '{computer_name}' on next check-in"
        except Exception as e:
            try: conn.unbind()
            except: pass
            logger.error(f"LAPS rotate exception: {e}")
            return False, str(e)

    def check_laps_enabled(self, computer_name):
        """Check if LAPS is configured for a computer"""
        conn = self._get_connection()
        try:
            conn.search(
                search_base   = self.base_dn,
                search_filter = f"(&(objectClass=computer)(cn={computer_name}))",
                search_scope  = SUBTREE,
                attributes    = ["msLAPS-Password", "msLAPS-EncryptedPassword",
                                 "msLAPS-PasswordExpirationTime"]
            )
            if not conn.entries:
                conn.unbind()
                return False
            e        = conn.entries[0]
            has_laps = False
            try:
                if e['msLAPS-Password'].value: has_laps = True
            except: pass
            try:
                if e['msLAPS-EncryptedPassword'].value: has_laps = True
            except: pass
            conn.unbind()
            return has_laps
        except:
            try: conn.unbind()
            except: pass
            return False

    # ── Private finders ────────────────────────────────────────
    def _find_user(self, conn, username):
        conn.search(
            search_base   = self.base_dn,
            search_filter = f"(&(objectClass=user)(objectCategory=person)(sAMAccountName={username}))",
            search_scope  = SUBTREE,
            attributes    = ["distinguishedName", "userAccountControl", "pwdLastSet", "lockoutTime"]
        )
        return conn.entries[0] if conn.entries else None

    def _find_group(self, conn, group_name):
        conn.search(
            search_base   = self.base_dn,
            search_filter = f"(&(objectClass=group)(cn={group_name}))",
            search_scope  = SUBTREE,
            attributes    = ["distinguishedName", "member"]
        )
        return conn.entries[0] if conn.entries else None


# ═══════════════════════════════════════════════════════════
# FACTORY FUNCTION
# ═══════════════════════════════════════════════════════════
def get_ad_service_for_domain(domain_profile) -> ADService:
    """
    Returns an ADService instance configured for the given DomainProfile.
    Call this in every API route using the domain_id from the request header.
    """
    return ADService(domain_profile=domain_profile)


# Default instance using global config (fallback only)
ad_service = ADService()
