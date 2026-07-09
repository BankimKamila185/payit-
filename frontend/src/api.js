// api.js — Payit frontend <-> backend API helper (real transaction flow, no mock)
// Talks to our Python backend (server/app.py) at localhost:3000.

const BASE = "http://localhost:3000";

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
  health: () => get("/health"),
  login: (vpa, pin) => post("/auth/login", { vpa, pin, device_id: getDeviceId() }),
  phoneLookup: (phone) => post("/auth/phone-lookup", { phone }),
  register: ({ phone, name, vpa, bank_id, upi_pin }) =>
    post("/auth/register", { phone, name, vpa, bank_id, upi_pin, device_id: getDeviceId() }),
  setPin: (vpa, upi_pin) => post("/auth/set-pin", { vpa, upi_pin }),
  getBanks: () => get("/banks"),
  resolve: (vpa) => get(`/accounts/${encodeURIComponent(vpa)}`),
  balance: (vpa) => get(`/balance/${encodeURIComponent(vpa)}`),
  history: (vpa) => get(`/transactions/${encodeURIComponent(vpa)}`),
  pay: ({ sender_vpa, receiver_vpa, amount, pin, type = "PAY", channel = "MANUAL" }) =>
    post("/pay", { sender_vpa, receiver_vpa, amount, pin,
                   device_id: getDeviceId(), type, channel }),
  verifyOtp: (pending_txn_id, otp) => post("/pay/verify-otp", { pending_txn_id, otp }),
  report: (reported_vpa, reporter_vpa, reason) =>
    post("/report", { reported_vpa, reporter_vpa, reason }),
  getStats: () => get("/dashboard/stats"),
};
