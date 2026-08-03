from app import ad_service
from ldap3 import Server, Connection, SIMPLE, ALL

username = "osama.nazimi"
password = "Abasyn456789"

print("Testing AD login for:", username)
print()

# Test 1: Direct LDAP bind with UPN
print("Test 1: Direct LDAP bind (UPN)...")
try:
    server = Server("192.168.100.10", port=389, get_info=ALL)
    upn = username + "@abasyn.local"
    print("  Trying:", upn)
    conn = Connection(server, user=upn, password=password, authentication=SIMPLE, auto_bind=True)
    if conn.bound:
        print("  OK: UPN login successful!")
        conn.unbind()
    else:
        print("  FAILED: Not bound")
except Exception as e:
    print("  FAILED:", str(e))

print()

# Test 2: Domain\username format
print("Test 2: DOMAIN\\username format...")
try:
    conn = Connection(server, user="abasyn\\" + username, password=password, authentication=SIMPLE, auto_bind=True)
    if conn.bound:
        print("  OK: Domain login successful!")
        conn.unbind()
    else:
        print("  FAILED")
except Exception as e:
    print("  FAILED:", str(e))

print()

# Test 3: ad_service.authenticate_user
print("Test 3: ad_service.authenticate_user()...")
result = ad_service.authenticate_user(username, password)
if result:
    print("  OK: Authentication successful!")
    print("  User info:", result)
else:
    print("  FAILED: authenticate_user returned None")

print()

# Test 4: Check AD account status
print("Test 4: Check AD account status...")
user_info = ad_service.get_user(username)
if user_info:
    print("  Found in AD:", user_info.get("display_name"))
    print("  Enabled:", user_info.get("enabled"))
    print("  DN:", user_info.get("dn"))
else:
    print("  NOT FOUND in AD!")