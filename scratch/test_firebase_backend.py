import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth
    print("✓ firebase-admin is successfully installed on backend server!")
    
    if Path("serviceAccountKey.json").exists():
        print("✓ serviceAccountKey.json found for project: payit-194e6")
    else:
        print("⚠ serviceAccountKey.json not found in root")
except Exception as e:
    print("Backend check:", e)
