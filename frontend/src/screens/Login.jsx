import { useState } from 'react';
import { Shield, Fingerprint } from 'lucide-react';

// Real login: enter a VPA, backend verifies it exists + binds this browser's
// device fingerprint to the account (first login = device registered).
// Lets ANY user (from the DB) log in — not a hardcoded account.
export default function Login({ onLogin, deviceId }) {
  const [vpa, setVpa] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const quick = [
    'bankimkamila23@payit',
    'priya.sharma@okhdfc',
    'nikhil129@okkotak',
  ];

  const submit = async (v) => {
    const id = (v || vpa).trim();
    if (!id) { setErr('Enter your UPI ID'); return; }
    setBusy(true); setErr('');
    const res = await onLogin(id);
    setBusy(false);
    if (!res.ok) setErr(res.error || 'Login failed — account not found');
  };

  return (
    <div style={S.wrap}>
      <div style={S.logoRow}>
        <div style={S.logoBadge}><Shield size={22} color="#fff" /></div>
        <span style={S.brand}>payit</span>
      </div>
      <h2 style={S.title}>Login to your account</h2>
      <p style={S.sub}>Enter your UPI ID — we'll bind this device securely.</p>

      <input
        style={S.input} placeholder="yourname@bank" value={vpa}
        onChange={(e) => setVpa(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />

      <div style={S.chipRow}>
        {quick.map((q) => (
          <button key={q} style={S.chip} onClick={() => { setVpa(q); submit(q); }}>{q}</button>
        ))}
      </div>

      {err && <p style={S.err}>{err}</p>}

      <button style={{ ...S.btn, opacity: busy ? 0.6 : 1 }} disabled={busy}
        onClick={() => submit()}>
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
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', padding: '48px 26px',
          background: '#0a0a0a', color: '#fff' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 },
  logoBadge: { width: 40, height: 40, borderRadius: 12,
               background: 'linear-gradient(135deg,#eb3b88,#aa33ff)', display: 'flex',
               alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 24, fontWeight: 800 },
  title: { fontSize: 22, margin: '0 0 6px' },
  sub: { fontSize: 13, color: '#888', margin: '0 0 24px' },
  input: { padding: '14px 16px', borderRadius: 12, background: '#161616',
           border: '1px solid #333', color: '#fff', fontSize: 15, outline: 'none' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { padding: '7px 11px', borderRadius: 20, background: '#1c1c1c',
          border: '1px solid #333', color: '#aaa', fontSize: 11, cursor: 'pointer' },
  err: { color: '#ff5470', fontSize: 13, marginTop: 12 },
  btn: { marginTop: 24, padding: '15px', borderRadius: 14, border: 'none',
         background: 'linear-gradient(135deg,#eb3b88,#aa33ff)', color: '#fff',
         fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  devRow: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto',
            justifyContent: 'center' },
  devText: { fontSize: 11, color: '#555' },
};
