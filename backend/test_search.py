# test_search.py
from ldap3 import Server, Connection, SIMPLE, SUBTREE, ALL
from app import config, ad_service

print("=" * 60)
print("AD SEARCH DIAGNOSTIC")
print("=" * 60)
print(f"Server      : {config.AD_SERVER_PRIMARY}:{config.AD_PORT}")
print(f"LDAPS       : {config.AD_USE_LDAPS}")
print(f"Domain      : {config.AD_DOMAIN}")
print(f"Service Acct: {config.AD_SERVICE_ACCOUNT}")
print(f"Password    : {'*' * len(config.AD_SERVICE_PASSWORD) if config.AD_SERVICE_PASSWORD else 'EMPTY!'}")
print()

# Test 1: Direct connection (same as my earlier test)
print("=" * 60)
print("TEST 1: Direct connection (no service object)")
print("=" * 60)
try:
    server = Server(config.AD_SERVER_PRIMARY, port=config.AD_PORT, use_ssl=config.AD_USE_LDAPS, get_info=ALL)
    conn = Connection(
        server,
        user=config.AD_SERVICE_ACCOUNT,
        password=config.AD_SERVICE_PASSWORD,
        authentication=SIMPLE,
        auto_bind=True
    )
    print(f"  Bound: {conn.bound}")
    
    conn.search(
        search_base='DC=abasyn,DC=local',
        search_filter='(&(objectClass=user)(objectCategory=person))',
        search_scope=SUBTREE,
        attributes=['sAMAccountName'],
        size_limit=10
    )
    print(f"  Entries: {len(conn.entries)}")
    for e in conn.entries[:3]:
        print(f"    - {e.sAMAccountName}")
    conn.unbind()
except Exception as e:
    print(f"  ERROR: {e}")
print()

# Test 2: Using ad_service._get_connection()
print("=" * 60)
print("TEST 2: Using ad_service._get_connection()")
print("=" * 60)
try:
    conn = ad_service._get_connection()
    print(f"  Bound: {conn.bound}")
    print(f"  Strategy: {type(conn.strategy).__name__}")
    
    result = conn.search(
        search_base='DC=abasyn,DC=local',
        search_filter='(&(objectClass=user)(objectCategory=person))',
        search_scope=SUBTREE,
        attributes=['sAMAccountName'],
        size_limit=10
    )
    print(f"  Search returned: {result}")
    print(f"  Type of result: {type(result)}")
    print(f"  Entries: {len(conn.entries)}")
    for e in conn.entries[:3]:
        print(f"    - {e.sAMAccountName}")
    conn.unbind()
except Exception as e:
    print(f"  ERROR: {e}")
print()

# Test 3: Call ad_service.get_users() directly
print("=" * 60)
print("TEST 3: Call ad_service.get_users() directly")
print("=" * 60)
try:
    users = ad_service.get_users()
    print(f"  Returned: {len(users)} users")
    for u in users[:3]:
        print(f"    - {u['username']}")
except Exception as e:
    print(f"  ERROR: {e}")