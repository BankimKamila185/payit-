// api.js — Payit frontend <-> backend API helper (real transaction flow, no mock)
// Talks to our Python backend (server/app.py) at localhost:3000.

const BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

// ---- device fingerprint (browser) -> stable device_id ----
// Real fraud systems use FingerprintJS; here a lightweight canvas+env hash,
// cached in localStorage so the SAME browser => same id, a DIFFERENT browser
// / incognito / cleared-storage => new id (i.e. "new device" is detectable).
export function getDeviceId() {
  const cached = localStorage.getItem("payit_device_id");
  if (cached) return cached;
  let sig = [navigator.userAgent, navigator.language, screen.width,
             screen.height, new Date().getTimezoneOffset()].join("|");
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("payit-fp", 2, 2);
    sig += c.toDataURL();
  } catch { /* ignore */ }
  // small hash
  let h = 0;
  for (let i = 0; i < sig.length; i++) { h = (h * 31 + sig.charCodeAt(i)) | 0; }
  const id = "dev_" + Math.abs(h).toString(36);
  localStorage.setItem("payit_device_id", id);
  return id;
}

// force a "new device" for demo (attack simulation)
export function forgetDevice() { localStorage.removeItem("payit_device_id"); }

// ---- remembered login (like GPay: enter account ONCE, then app remembers) ----
// After first login the device is bound + VPA saved here, so re-opening the app
// goes straight to Home (only the UPI PIN is asked on each payment). "Switch
// account" (logout) clears this but keeps the device id.
export function saveSession(vpa) { localStorage.setItem("payit_session_vpa", vpa); }
export function getSession() { return localStorage.getItem("payit_session_vpa") || ""; }
export function clearSession() { localStorage.removeItem("payit_session_vpa"); }

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function get(path) {
  const res = await fetch(BASE + path);
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export const api = {
  health:      () => get("/health"),

  // Auth
  login:       (vpa, pin) => post("/auth/login", { vpa, pin, device_id: getDeviceId() }),
  phoneLookup: (phone) => post("/auth/phone-lookup", { phone }),
  register:    ({ phone, name, vpa, bank_id, upi_pin, login_pin }) =>
    post("/auth/register", { phone, name, vpa, bank_id, upi_pin, login_pin, device_id: getDeviceId() }),
  setPin:      (vpa, upi_pin) => post('/auth/set-pin', { vpa, upi_pin }),
  verifyUpiPin: (vpa, upi_pin) => post('/auth/verify-upi-pin', { vpa, upi_pin }),
  forgotPin:   (vpa) => post('/auth/forgot-pin', { vpa }),
  resetPin:    (vpa, otp, new_pin) => post('/auth/reset-pin', { vpa, otp, new_pin }),

  // Onboarding OTP — real send + real verify (no mock bypass)
  sendOtp:     (phone) => post("/auth/send-otp", { phone }),
  verifyOnboardingOtp: (phone, code) => post("/auth/verify-otp", { phone, code }),

  // Account
  getBanks:    () => get("/banks"),
  resolve:     (vpa) => get(`/accounts/${encodeURIComponent(vpa)}`),
  balance:     (vpa) => get(`/balance/${encodeURIComponent(vpa)}`),
  history:     (vpa) => get(`/transactions/${encodeURIComponent(vpa)}`),

  // Payments — RASP fields (rooted, screen_share) are forwarded to fraud engine
  pay: ({ sender_vpa, receiver_vpa, amount, pin,
          type = "PAY", channel = "MANUAL",
          rooted = 0, screen_share = 0, sim_mismatch = 0 }) =>
    post("/pay", {
      sender_vpa, receiver_vpa, amount, pin,
      device_id: getDeviceId(),
      type, channel,
      rooted,       // 1 = rooted/Xposed/emulator detected by app RASP
      screen_share, // 1 = AnyDesk/TeamViewer screen sharing active
      sim_mismatch, // 1 = SIM number ≠ carrier records
    }),

  // Step-up OTP verification (REVIEW transactions)
  verifyOtp:   (pending_txn_id, otp) => post("/pay/verify-otp", { pending_txn_id, otp }),
  resendOtp:   (pending_txn_id) => post("/pay/resend-otp", { pending_txn_id }),

  // F2: pre-payment beneficiary risk (at payee-select) | F3: recall a completed payment
  precheck:    (sender_vpa, receiver_vpa) => post("/precheck", { sender_vpa, receiver_vpa }),
  recall:      (txid) => post(`/pay/recall/${txid}`, {}),

  // Reporting & Stats
  report:      (reported_vpa, reporter_vpa, reason) =>
    post("/report", { reported_vpa, reporter_vpa, reason }),
  getStats:    () => get("/dashboard/stats"),
};

// -------- WebAuthn / Passkey helpers (browser-side ceremony) --------
// Converts ArrayBuffer ↔ base64url (required by WebAuthn API)
function bufToB64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64urlToBuf(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
}

/**
 * Register a new passkey (fingerprint/Face ID) for the given VPA.
 * Returns { ok, error }
 */
export async function registerPasskey(vpa) {
  if (!window.PublicKeyCredential) return { ok: false, error: 'WebAuthn not supported in this browser.' };
  try {
    // 1. Get creation options (challenge) from backend
    const optRes = await post('/auth/webauthn/register-options', { vpa });
    if (!optRes.ok) return { ok: false, error: optRes.data?.detail || 'Could not start registration.' };
    const options = optRes.data;

    // 2. Call browser API — shows fingerprint / Face ID prompt
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: b64urlToBuf(options.challenge),
        rp: options.rp,
        user: {
          id: b64urlToBuf(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        authenticatorSelection: options.authenticatorSelection,
        attestation: options.attestation,
      },
    });

    // 3. Send credential to backend for storage
    const regRes = await post('/auth/webauthn/register', {
      vpa,
      credential_id: bufToB64url(cred.rawId),
      public_key: bufToB64url(cred.response.getPublicKey()),
      client_data_json: bufToB64url(cred.response.clientDataJSON),
      attestation_object: bufToB64url(cred.response.attestationObject),
    });
    if (!regRes.ok) return { ok: false, error: regRes.data?.detail || 'Registration failed.' };
    // Remember that this VPA has a passkey so we can show the biometric button next time
    localStorage.setItem('payit_passkey_vpa', vpa);
    return { ok: true };
  } catch (e) {
    if (e.name === 'NotAllowedError') return { ok: false, error: 'Biometric prompt cancelled.' };
    console.error('WebAuthn register error', e);
    return { ok: false, error: e.message || 'Registration failed.' };
  }
}

/**
 * Authenticate with passkey (fingerprint / Face ID) for the given VPA.
 * Returns { ok, data } where data matches the normal /auth/login response.
 */
export async function loginWithPasskey(vpa) {
  if (!window.PublicKeyCredential) return { ok: false, error: 'WebAuthn not supported.' };
  try {
    // 1. Get assertion options
    const optRes = await post('/auth/webauthn/login-options', { vpa });
    if (!optRes.ok) return { ok: false, error: optRes.data?.detail || 'No passkey registered for this account.' };
    const options = optRes.data;

    // 2. Browser shows fingerprint / Face ID prompt
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: b64urlToBuf(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification,
        allowCredentials: options.allowCredentials.map(c => ({
          type: c.type,
          id: b64urlToBuf(c.id),
        })),
      },
    });

    // 3. Send assertion to backend for verification
    const loginRes = await post('/auth/webauthn/login', {
      vpa,
      credential_id: bufToB64url(assertion.rawId),
      authenticator_data: bufToB64url(assertion.response.authenticatorData),
      client_data_json: bufToB64url(assertion.response.clientDataJSON),
      signature: bufToB64url(assertion.response.signature),
    });
    return { ok: loginRes.ok, data: loginRes.data };
  } catch (e) {
    if (e.name === 'NotAllowedError') return { ok: false, error: 'Biometric prompt cancelled.' };
    console.error('WebAuthn login error', e);
    return { ok: false, error: e.message || 'Authentication failed.' };
  }
}

/** Returns true if this device has a registered passkey for the given VPA */
export function hasPasskey(vpa) {
  return localStorage.getItem('payit_passkey_vpa') === vpa;
}

