"""
DC Manager Pro - DNS Service (v2.6.0)
======================================
Handles DNS zone and record management via PowerShell remoting.
Uses per-domain DNS server IP from domain_profiles table.
Auto-failover: tries primary DNS server first, falls back to secondary.
"""

import json
import logging
import subprocess
from typing import Optional, List, Dict, Any, Tuple

from models import DomainProfile, get_domain_password

logger = logging.getLogger(__name__)

SUPPORTED_RECORD_TYPES = ["A", "CNAME", "PTR"]
POWERSHELL_TIMEOUT = 60


class DNSService:
    """
    DNS Management Service.
    Executes PowerShell cmdlets remotely on the DNS server for a specific domain.
    """

    def __init__(self, domain_profile: DomainProfile):
        self.domain = domain_profile
        self.primary_server = (domain_profile.dns_server_primary or "").strip()
        self.secondary_server = (domain_profile.dns_server_secondary or "").strip()
        self.service_account = domain_profile.ad_service_account
        self.service_password = get_domain_password(domain_profile)
        self.active_server = None

    # ── Core PowerShell execution ──────────────────────────
    def _run_ps(self, script: str) -> Tuple[bool, str, str]:
        """
        Execute PowerShell script on the configured DNS server.
        Returns (success, stdout, stderr).
        Handles automatic failover if primary fails.
        """
        # Try primary first
        if self.primary_server:
            success, stdout, stderr = self._invoke_on_server(self.primary_server, script)
            if success:
                self.active_server = self.primary_server
                return True, stdout, stderr
            logger.warning(f"DNS primary {self.primary_server} failed: {stderr[:200]}")

        # Try secondary
        if self.secondary_server:
            success, stdout, stderr = self._invoke_on_server(self.secondary_server, script)
            if success:
                self.active_server = self.secondary_server
                logger.info(f"DNS failed over to secondary {self.secondary_server}")
                return True, stdout, stderr
            logger.error(f"DNS secondary {self.secondary_server} also failed: {stderr[:200]}")

        return False, "", "No DNS server available"

    def _invoke_on_server(self, server: str, script: str) -> Tuple[bool, str, str]:
        """Execute PowerShell against a specific server IP."""
        try:
            escaped_script = script.replace('"', '`"')
            escaped_password = self.service_password.replace("'", "''")
            escaped_account = self.service_account.replace("'", "''")

            wrapper = f"""
$pw = ConvertTo-SecureString '{escaped_password}' -AsPlainText -Force
$cred = New-Object PSCredential('{escaped_account}', $pw)
$ErrorActionPreference = 'Stop'
try {{
    $result = Invoke-Command -ComputerName '{server}' -Credential $cred -ScriptBlock {{
        {script}
    }} -ErrorAction Stop
    $result | ConvertTo-Json -Depth 4 -Compress
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"""
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", wrapper],
                capture_output=True,
                text=True,
                timeout=POWERSHELL_TIMEOUT
            )

            if result.returncode != 0:
                return False, result.stdout or "", result.stderr or ""

            return True, result.stdout or "", ""

        except subprocess.TimeoutExpired:
            return False, "", f"Timeout after {POWERSHELL_TIMEOUT}s"
        except Exception as e:
            return False, "", str(e)

    # ── Zones ───────────────────────────────────────────────
    def get_zones(self) -> Tuple[bool, List[Dict], str]:
        script = "Get-DnsServerZone | Select-Object ZoneName,ZoneType,IsAutoCreated,IsReverseLookupZone,IsDsIntegrated,DynamicUpdate"
        success, stdout, stderr = self._run_ps(script)
        if not success:
            return False, [], stderr

        try:
            data = json.loads(stdout) if stdout.strip() else []
            if isinstance(data, dict):
                data = [data]
            zones = []
            for z in data:
                zones.append({
                    "name": z.get("ZoneName", ""),
                    "type": z.get("ZoneType", ""),
                    "isAutoCreated": z.get("IsAutoCreated", False),
                    "isReverseLookup": z.get("IsReverseLookupZone", False),
                    "isDsIntegrated": z.get("IsDsIntegrated", False),
                    "dynamicUpdate": z.get("DynamicUpdate", ""),
                })
            return True, zones, f"Retrieved from {self.active_server}"
        except json.JSONDecodeError as e:
            return False, [], f"JSON parse error: {e}"

    # ── Records ─────────────────────────────────────────────
    def get_records(self, zone_name: str, record_type: Optional[str] = None) -> Tuple[bool, List[Dict], str]:
        """Get all records in a zone (optionally filtered by type)."""
        if record_type and record_type not in SUPPORTED_RECORD_TYPES:
            return False, [], f"Unsupported record type: {record_type}"

        type_filter = f" -RRType {record_type}" if record_type else ""
        script = f"""
Get-DnsServerResourceRecord -ZoneName '{zone_name}'{type_filter} | ForEach-Object {{
    $rec = $_
    $value = ''
    switch ($rec.RecordType) {{
        'A'      {{ $value = $rec.RecordData.IPv4Address.IPAddressToString }}
        'AAAA'   {{ $value = $rec.RecordData.IPv6Address.IPAddressToString }}
        'CNAME'  {{ $value = $rec.RecordData.HostNameAlias }}
        'PTR'    {{ $value = $rec.RecordData.PtrDomainName }}
        'MX'     {{ $value = $rec.RecordData.MailExchange }}
        'TXT'    {{ $value = $rec.RecordData.DescriptiveText -join ' ' }}
        'NS'     {{ $value = $rec.RecordData.NameServer }}
        'SRV'    {{ $value = $rec.RecordData.DomainName }}
        default  {{ $value = $rec.RecordData.ToString() }}
    }}
    [PSCustomObject]@{{
        HostName   = $rec.HostName
        RecordType = $rec.RecordType
        Value      = $value
        TTL        = $rec.TimeToLive.TotalSeconds
        Timestamp  = if ($rec.Timestamp) {{ $rec.Timestamp.ToString('o') }} else {{ '' }}
    }}
}}
"""
        success, stdout, stderr = self._run_ps(script)
        if not success:
            return False, [], stderr

        try:
            data = json.loads(stdout) if stdout.strip() else []
            if isinstance(data, dict):
                data = [data]
            records = []
            for r in data:
                rt = r.get("RecordType", "")
                if record_type and rt != record_type:
                    continue
                if rt not in SUPPORTED_RECORD_TYPES:
                    # Filter to supported types only unless explicitly requested
                    if record_type is None and rt in ["A", "CNAME", "PTR"]:
                        pass
                    elif record_type is None:
                        continue
                records.append({
                    "hostname": r.get("HostName", ""),
                    "type": rt,
                    "value": r.get("Value", ""),
                    "ttl": int(r.get("TTL", 3600)),
                    "timestamp": r.get("Timestamp", ""),
                })
            return True, records, f"Retrieved from {self.active_server}"
        except json.JSONDecodeError as e:
            return False, [], f"JSON parse error: {e}"

    # ── Create A record ─────────────────────────────────────
    def create_a_record(self, zone: str, name: str, ip: str, ttl: int = 3600) -> Tuple[bool, str]:
        script = f"""
Add-DnsServerResourceRecordA -ZoneName '{zone}' -Name '{name}' -IPv4Address '{ip}' -TimeToLive (New-TimeSpan -Seconds {ttl})
"""
        success, stdout, stderr = self._run_ps(script)
        if not success:
            return False, stderr
        return True, f"A record created: {name}.{zone} -> {ip}"

    # ── Create CNAME record ─────────────────────────────────
    def create_cname_record(self, zone: str, alias: str, target: str, ttl: int = 3600) -> Tuple[bool, str]:
        if not target.endswith("."):
            target = target + "."
        script = f"""
Add-DnsServerResourceRecordCName -ZoneName '{zone}' -Name '{alias}' -HostNameAlias '{target}' -TimeToLive (New-TimeSpan -Seconds {ttl})
"""
        success, stdout, stderr = self._run_ps(script)
        if not success:
            return False, stderr
        return True, f"CNAME record created: {alias}.{zone} -> {target}"

    # ── Create PTR record ───────────────────────────────────
    def create_ptr_record(self, reverse_zone: str, ip_last_octet: str, hostname: str, ttl: int = 3600) -> Tuple[bool, str]:
        if not hostname.endswith("."):
            hostname = hostname + "."
        script = f"""
Add-DnsServerResourceRecordPtr -ZoneName '{reverse_zone}' -Name '{ip_last_octet}' -PtrDomainName '{hostname}' -TimeToLive (New-TimeSpan -Seconds {ttl})
"""
        success, stdout, stderr = self._run_ps(script)
        if not success:
            return False, stderr
        return True, f"PTR record created: {ip_last_octet}.{reverse_zone} -> {hostname}"

    # ── Update record ───────────────────────────────────────
    def update_record(self, zone: str, hostname: str, record_type: str,
                      old_value: str, new_value: str, new_ttl: int = 3600) -> Tuple[bool, str]:
        """Update an existing record by removing old and adding new."""
        if record_type not in SUPPORTED_RECORD_TYPES:
            return False, f"Unsupported type: {record_type}"

        # Remove old
        del_ok, del_msg = self.delete_record(zone, hostname, record_type, old_value)
        if not del_ok:
            return False, f"Failed to remove old record: {del_msg}"

        # Add new
        if record_type == "A":
            return self.create_a_record(zone, hostname, new_value, new_ttl)
        elif record_type == "CNAME":
            return self.create_cname_record(zone, hostname, new_value, new_ttl)
        elif record_type == "PTR":
            return self.create_ptr_record(zone, hostname, new_value, new_ttl)

        return False, "Unknown record type"

    # ── Delete record ───────────────────────────────────────
    def delete_record(self, zone: str, hostname: str, record_type: str, value: Optional[str] = None) -> Tuple[bool, str]:
        if record_type not in SUPPORTED_RECORD_TYPES:
            return False, f"Unsupported type: {record_type}"

        script = f"""
Remove-DnsServerResourceRecord -ZoneName '{zone}' -RRType '{record_type}' -Name '{hostname}' -Force
"""
        success, stdout, stderr = self._run_ps(script)
        if not success:
            return False, stderr
        return True, f"Record deleted: {hostname}.{zone} ({record_type})"

    # ── Health check ────────────────────────────────────────
    def test_connection(self) -> Tuple[bool, str]:
        """Test if DNS server is reachable."""
        script = "Get-DnsServer | Select-Object -First 1 ServerSetting"
        success, stdout, stderr = self._run_ps(script)
        if success:
            return True, f"Connected to {self.active_server}"
        return False, stderr


# ═══════════════════════════════════════════════════════════
# Factory
# ═══════════════════════════════════════════════════════════
def get_dns_service_for_domain(domain_profile: DomainProfile) -> DNSService:
    """Create DNSService instance for the given domain profile."""
    return DNSService(domain_profile)