from models import SessionLocal, DomainProfile
from ad_service import get_ad_service_for_domain

db = SessionLocal()

for d in db.query(DomainProfile).all():
    print("Testing: " + d.name + " (" + d.ad_domain + ")...")
    svc    = get_ad_service_for_domain(d)
    result = svc.test_connection()
    if result.get("connected"):
        print("  OK  Connected to " + d.ad_server_primary + ":" + str(d.ad_port))
    else:
        print("  FAIL  " + str(result.get("error", "Unknown error")))
    print("")

db.close()