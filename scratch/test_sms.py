import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.app import send_sms_otp

print("Testing send_sms_otp with Demo Fallback:")
res_demo = send_sms_otp("9876543210", "123456", context="Test Onboarding")
print("Result (Demo Mode):", res_demo)

assert res_demo["delivered"] == False
assert res_demo["provider"] == "demo"
assert res_demo["otp_demo"] == "123456"

print("✓ SMS OTP handler test passed successfully!")
