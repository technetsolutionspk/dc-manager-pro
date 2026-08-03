# add_user.py
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from app import AppUser, SessionLocal

    db = SessionLocal()

    # ── Add your users here ────────────────────────────────────
    users = [
        {
            "username":     "admin",
            "display_name": "AD Manager Admin",
            "email":        "admin@abasyn.local",
            "role":         "Admin",
            "active":       True
        },
        
    ]
    # ──────────────────────────────────────────────────────────

    added   = 0
    skipped = 0

    for user_data in users:
        # Check if user already exists
        existing = db.query(AppUser).filter(
            AppUser.username == user_data["username"]
        ).first()

        if existing:
            print(f"   SKIP: {user_data['username']} already exists")
            skipped += 1
        else:
            new_user = AppUser(
                username=     user_data["username"],
                display_name= user_data["display_name"],
                email=        user_data["email"],
                role=         user_data["role"],
                active=       user_data["active"]
            )
            db.add(new_user)
            print(f"   OK: Added {user_data['username']} ({user_data['role']})")
            added += 1

    db.commit()
    db.close()

    print()
    print(f"   Done: {added} user(s) added, {skipped} skipped")

except ImportError as e:
    print(f"   ERROR: Could not import app: {e}")
    print("   Make sure you are running from the correct folder")
    sys.exit(1)

except Exception as e:
    print(f"   ERROR: {e}")
    sys.exit(1)