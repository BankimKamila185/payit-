import { useState } from 'react';
import { Shield, Fingerprint, Smartphone } from 'lucide-react';

// Real login: UPI ID + UPI PIN. Backend verifies the PIN, then checks the device
// fingerprint. A KNOWN device logs in straight; a NEW device triggers an OTP
// step-up (account-takeover guard) — exactly like GPay/PhonePe. ANY of the DB's
// accounts can log in (PIN 1234 for all demo accounts), not just the chips below.
export default function Login({ onLogin, onVerifyDevice, deviceId }) {
  const [vpa, setVpa] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [otpStep, setOtpStep] = useState(null);   // { message, otpDemo } when a new device needs OTP
  const [otp, setOtp] = useState('');

  const quick = ['bankimkamila23@payit', 'priya.sharma@okhdfc', 'nikhil129@okkotak'];

  const submit = async () => {
    const id = vpa.trim();
    if (!id) { setErr('Apni UPI ID daalo'); return; }
    if (pin.length < 4) { setErr('4-digit UPI PIN daalo'); return; }
    setBusy(true); setErr('');
    const res = await onLogin(id, pin);
    setBusy(false);
    if (res.ok) return;
    if (res.needOtp) { setOtpStep({ message: res.message, otpDemo: res.otpDemo }); return; }
    setErr(res.error || 'Login failed');
  };

  const verify = async () => {
    if (otp.length < 6) { setErr('6-digit OTP daalo'); return; }
    setBusy(true); setErr('');
    const res = await onVerifyDevice(vpa.trim(), otp);
    setBusy(false);
    if (!res.ok) setErr(res.error || 'Invalid OTP');
  };

  // ---- New-device OTP step (account-takeover guard) ----
  if (otpStep) {
    return (
      <div style={S.wrap}>
        <div style={S.logoRow}>
          <div style={S.logoBadge}><Smartphone size={22} color="#fff" /></div>
          <span style={S.brand}>New device</span>
        </div>
        <h2 style={S.title}>Verify it's you</h2>
        <p style={S.sub}>{otpStep.message}</p>

        <input
          style={S.input} placeholder="6-digit OTP" value={otp} inputMode="numeric" maxLength={6}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && verify()}
        />
        {otpStep.otpDemo && (
          <p style={S.demoHint}>Demo OTP: <b>{otpStep.otpDemo}</b> (real app SMS bhejta)</p>
        )}
        {err && <p style={S.err}>{err}</p>}

        <button style={{ ...S.btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={verify}>
          {busy ? 'Verifying…' : 'Verify & Login'}
        </button>
        <button style={S.linkBtn} onClick={() => { setOtpStep(null); setOtp(''); setErr(''); }}>
          ← Back
        </button>
      </div>
    );
  }

  // ---- Normal login (UPI ID + PIN) ----
  return (
    <div style={S.wrap}>
      <div style={S.logoRow}>
        <div style={S.logoBadge}><Shield size={22} color="#fff" /></div>
        <span style={S.brand}>payit</span>
      </div>
      <h2 style={S.title}>Login to your account</h2>
      <p style={S.sub}>UPI ID + PIN daalo — device securely bind hoga.</p>

      <input
        style={S.input} placeholder="yourname@bank" value={vpa} autoCapitalize="none"
        onChange={(e) => setVpa(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input
        style={S.input} placeholder="4-digit UPI PIN" value={pin} type="password"
        inputMode="numeric" maxLength={4}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />

      <div style={S.chipRow}>
        {quick.map((q) => (
          <button key={q} style={S.chip} onClick={() => { setVpa(q); setErr(''); }}>{q}</button>
        ))}
      </div>
      <p style={S.hint}>Koi bhi DB account chalega (e.g. simran3@ybl, deepak5@okicici). Demo PIN: <b>1234</b></p>

      {err && <p style={S.err}>{err}</p>}

      <button style={{ ...S.btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>
        {busy ? 'Verifying…' : 'Login'}
      </button>

      <div style={S.devRow}>
        <Fingerprint size={14} color="#22e67b" />
        <span style={S.devText}>Device: {deviceId?.slice(0, 14)}… (binds on login)</span>
      </div>
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', padding: '44px 26px',
          background: '#0a0a0a', color: '#fff', overflowY: 'auto' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoBadge: { width: 40, height: 40, borderRadius: 12,
               background: 'linear-gradient(135deg,#eb3b88,#aa33ff)', display: 'flex',
               alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 24, fontWeight: 800 },
  title: { fontSize: 22, margin: '0 0 6px' },
  sub: { fontSize: 13, color: '#888', margin: '0 0 20px' },
  input: { padding: '14px 16px', borderRadius: 12, background: '#161616',
           border: '1px solid #333', color: '#fff', fontSize: 15, outline: 'none',
           marginBottom: 10 },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { padding: '7px 11px', borderRadius: 20, background: '#1c1c1c',
          border: '1px solid #333', color: '#aaa', fontSize: 11, cursor: 'pointer' },
  hint: { fontSize: 11, color: '#666', margin: '10px 0 0' },
  demoHint: { fontSize: 12, color: '#22e67b', margin: '2px 0 0' },
  err: { color: '#ff5470', fontSize: 13, marginTop: 12 },
  btn: { marginTop: 20, padding: '15px', borderRadius: 14, border: 'none',
         background: 'linear-gradient(135deg,#eb3b88,#aa33ff)', color: '#fff',
         fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  linkBtn: { marginTop: 12, padding: '8px', background: 'none', border: 'none',
             color: '#888', fontSize: 13, cursor: 'pointer' },
  devRow: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto',
            justifyContent: 'center', paddingTop: 20 },
  devText: { fontSize: 11, color: '#555' },
};
