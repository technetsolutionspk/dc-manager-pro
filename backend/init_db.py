# init_db.py
import os
import sys

# Add the backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from sqlalchemy import create_engine
    from app import Base, AppUser, SessionLocal

    # Create database directory
    os.makedirs('database', exist_ok=True)

    # Create all tables
    engine = create_engine('sqlite:///./database/audit.db')
    Base.metadata.create_all(engine)

    # Create default admin user
    db = SessionLocal()
    existing_admin = db.query(AppUser).filter(AppUser.username == 'admin').first()
    
    if not existing_admin:
        admin = AppUser(
            username='admin',
            display_name='AD Manager Admin',
            email='admin@corp.com',
            role='Admin',
            active=True
        )
        db.add(admin)
        db.commit()
        print('   OK: Default admin user created (username: admin)')
    else:
        print('   OK: Database already initialized')
    
    db.close()
    print('   OK: Database setup complete')

except ImportError as e:
    print(f'   WARNING: Could not import app modules: {e}')
    print('   OK: Database will initialize on first run')
    
except Exception as e:
    print(f'   WARNING: Database setup error: {e}')
    print('   OK: Database will initialize on first run')