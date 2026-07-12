import React, { useEffect, useRef, useState, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Copy,
  Download,
  Share2,
  Plus,
  Smartphone,
  Play,
  Trash2,
  ExternalLink,
  LogOut,
  User,
  Check,
  RefreshCw,
  Lock,
  KeyRound,
  X,
} from 'lucide-react';
import { api } from '../api';

// ── Derive real bank from VPA handle ──────────────────────────────────────────
const BANK_META = {
  okhdfc:  { name: 'HDFC Bank',             icon: '🏦', color: '#1c3f94' },
  oksbi:   { name: 'State Bank of India',    icon: '🏦', color: '#00a4e4' },
  okicici: { name: 'ICICI Bank',             icon: '🏦', color: '#f58220' },
  okaxis:  { name: 'Axis Bank',              icon: '🏦', color: '#97144d' },
  okkotak: { name: 'Kotak Mahindra Bank',    icon: '🏦', color: '#ed1c24' },
  okpnb:   { name: 'Punjab National Bank',   icon: '🏦', color: '#ec1c24' },
  ybl:     { name: 'Yes Bank / PhonePe',     icon: '🏦', color: '#5f259f' },
  okybl:   { name: 'Yes Bank',               icon: '🏦', color: '#5f259f' },
  paytm:   { name: 'Paytm Payments Bank',    icon: '💳', color: '#00b9f1' },
  okpaytm: { name: 'Paytm Payments Bank',    icon: '💳', color: '#00b9f1' },
  payit:   { name: 'payit Bank',             icon: '💎', color: '#aa33ff' },
};

function bankFromVpa(vpa = '') {
  const handle = (vpa.split('@')[1] || '').toLowerCase();
  return BANK_META[handle] || { name: 'Your Bank', icon: '🏦', color: '#333' };
}

// ─── Real UPI QR card ──────────────────────────────────────────────────────────
const UpiQrCard = ({ upiId, userName }) => {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);

  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(userName || upiId)}&cu=INR`;

  const generateQr = useCallback(async () => {
    if (!canvasRef.current) return;
    try {
      await QRCode.toCanvas(canvasRef.current, upiUri, {
        width: 220, margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
    } catch (err) {
      console.error('QR generation failed:', err);
    }
  }, [upiUri]);

  useEffect(() => {
    generateQr();
    setShareSupported(!!navigator.share);
  }, [generateQr]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
    } catch {
      const el = document.createElement('textarea');
      el.value = upiId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const src = canvasRef.current;
    const pad = 24, labelH = 40;
    const out = document.createElement('canvas');
    out.width = src.width + pad * 2;
    out.height = src.height + pad * 2 + labelH;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.roundRect(0, 0, out.width, out.height, 20);
    ctx.fill();
    ctx.drawImage(src, pad, pad);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`payit · ${upiId}`, out.width / 2, src.height + pad + 24);
    const link = document.createElement('a');
    link.download = `payit-qr-${upiId.replace('@', '_')}.png`;
    link.href = out.toDataURL('image/png');
    link.click();
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  const handleShare = async () => {
    if (!canvasRef.current) return;
    const src = canvasRef.current;
    const blob = await new Promise(resolve => src.toBlob(resolve, 'image/png'));
    const file = new File([blob], `payit-qr-${upiId}.png`, { type: 'image/png' });
    if (navigator.share) {
      try {
        await navigator.share({ title: `Pay ${userName || upiId} via UPI`, text: `Scan to pay me on payit\nUPI ID: ${upiId}`, files: [file] });
      } catch (e) {
        if (e.name !== 'AbortError') handleDownload();
      }
    } else {
      handleDownload();
    }
  };

  return (
    <div style={S.qrCard}>
      <div style={S.qrCanvasWrap}>
        <canvas ref={canvasRef} style={S.canvas} id="upi-qr-canvas" />
      </div>
      <div style={S.upiInfo}>
        <span style={S.upiLabel}>UPI ID</span>
        <div style={S.upiIdRow}>
          <span style={S.upiValue}>{upiId}</span>
          <button style={S.iconActionBtn} onClick={handleCopy} aria-label="Copy UPI ID">
            {copied ? <Check size={14} color="var(--accent-neon)" /> : <Copy size={14} color="var(--accent-neon)" />}
          </button>
        </div>
        {copied && <span style={S.copiedHint}>Copied!</span>}
      </div>
      <div style={S.actionRow}>
        <button style={S.actionBtn} onClick={handleDownload} aria-label="Download QR">
          {downloaded ? <Check size={15} color="var(--accent-neon)" /> : <Download size={15} color="var(--accent-neon)" />}
          <span>{downloaded ? 'Saved' : 'Download'}</span>
        </button>
        <div style={S.actionDivider} />
        <button style={S.actionBtn} onClick={handleShare} aria-label="Share QR">
          <Share2 size={15} color="#aa33ff" />
          <span style={{ color: '#aa33ff' }}>{shareSupported ? 'Share' : 'Save'}</span>
        </button>
        <div style={S.actionDivider} />
        <button style={S.actionBtn} onClick={generateQr} aria-label="Refresh QR">
          <RefreshCw size={15} color="rgba(255,255,255,0.35)" />
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>Refresh</span>
        </button>
      </div>
    </div>
  );
};

// ─── Change PIN Modal ──────────────────────────────────────────────────────────
const ChangePinModal = ({ vpa, onClose, onSuccess }) => {
  const [step, setStep] = useState('new');   // 'new' | 'confirm'
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const current = step === 'new' ? newPin : confirmPin;
  const setter  = step === 'new' ? setNewPin : setConfirmPin;
  const prompt  = step === 'new' ? 'Enter new 4-digit UPI PIN' : 'Confirm new UPI PIN';

  const handleKey = (k) => {
    if (k === '⌫') { setter(p => p.slice(0, -1)); return; }
    if (current.length >= 4) return;
    const next = current + k;
    setter(next);
    if (next.length === 4) {
      if (step === 'new') {
        setTimeout(() => { setStep('confirm'); setConfirmPin(''); }, 200);
      } else {
        handleSubmit(next);
      }
    }
  };

  const handleSubmit = async (cPin) => {
    if (newPin !== cPin) {
      setErr("PINs don't match. Try again.");
      setStep('new'); setNewPin(''); setConfirmPin('');
      return;
    }
    setBusy(true); setErr('');
    try {
      const res = await api.setPin(vpa, newPin);
      setBusy(false);
      if (res.ok) {
        setDone(true);
        setTimeout(() => { onSuccess && onSuccess(); onClose(); }, 1500);
      } else {
        setErr(res.data?.detail || 'Failed to update PIN. Try again.');
        setStep('new'); setNewPin(''); setConfirmPin('');
      }
    } catch {
      setBusy(false);
      setErr('Server unreachable. Try again.');
      setStep('new'); setNewPin(''); setConfirmPin('');
    }
  };

  return (
    <div style={modalOvl}>
      <div style={modalCard} className="animate-scale-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={18} color="var(--accent-neon)" />
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>Change UPI PIN</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} color="rgba(255,255,255,0.5)" />
          </button>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Check size={40} color="var(--accent-neon)" style={{ marginBottom: 8 }} />
            <p style={{ color: '#fff', fontWeight: 700 }}>UPI PIN updated!</p>
          </div>
        ) : (
          <>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 20, textAlign: 'center' }}>{prompt}</p>
            {/* Dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < current.length ? 'var(--accent-neon)' : '#333' }} />
              ))}
            </div>
            {/* Keypad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, idx) => (
                <button key={idx} disabled={k === '' || busy}
                  onClick={() => k !== '' && handleKey(k)}
                  style={{ padding: '13px 0', fontSize: 20, borderRadius: 12,
                    background: k === '' ? 'transparent' : '#222', color: '#fff',
                    border: 'none', cursor: k === '' ? 'default' : 'pointer' }}>
                  {k}
                </button>
              ))}
            </div>
            {err && <p style={{ color: '#ff5470', fontSize: 11, textAlign: 'center', fontWeight: 600 }}>{err}</p>}
            {busy && <p style={{ color: 'var(--accent-neon)', fontSize: 12, textAlign: 'center' }}>Saving…</p>}
          </>
        )}
      </div>
    </div>
  );
};

const modalOvl = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
};
const modalCard = {
  background: '#141414', borderRadius: 24, padding: 24, width: 300,
  border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
};

// ─── Main UpiSettings screen ──────────────────────────────────────────────────
const UpiSettings = ({ onAddAccount, upiId = 'you@payit', userName = '', onLogout, onForgotPin }) => {
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [pinChanged, setPinChanged] = useState(false);

  // Derive primary bank from VPA handle
  const primaryBank = bankFromVpa(upiId);
  const accounts = [
    {
      type: 'Savings',
      name: primaryBank.name,
      number: `••••${upiId.split('@')[0].slice(-4).replace(/\D/g, '').padStart(4, '0')}`,
      tag: 'PRIMARY',
      icon: primaryBank.icon,
    },
    { type: 'Credit card', name: 'payit CC', number: '••••3701', icon: '💳' },
  ];

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Change PIN Modal */}
      {showChangePinModal && (
        <ChangePinModal
          vpa={upiId}
          onClose={() => setShowChangePinModal(false)}
          onSuccess={() => setPinChanged(true)}
        />
      )}

      {/* Profile card */}
      <div style={styles.profileCard}>
        <div style={styles.profileAvatar}><User size={20} color="#fff" /></div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={styles.profileName}>{userName || 'Account'}</span>
          <span style={styles.profileVpa}>{upiId}</span>
        </div>
      </div>

      {/* Real QR Card */}
      <UpiQrCard upiId={upiId} userName={userName} />

      {/* Linked Accounts */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>Bank accounts</span>
      </div>

      <div style={styles.accountsList}>
        {accounts.map((acc, idx) => (
          <div key={idx} style={styles.accountRow}>
            <div style={styles.accLeft}>
              <div style={styles.accIconBox}>{acc.icon}</div>
              <div style={styles.accDetails}>
                <div style={styles.accTitleRow}>
                  <span style={styles.accName}>{acc.name}</span>
                  {acc.tag && <span style={styles.primaryBadge}>{acc.tag}</span>}
                </div>
                <span style={styles.accNumber}>{acc.type} • {acc.number}</span>
              </div>
            </div>
            <button style={styles.manageBtn}>
              Manage <ExternalLink size={11} style={{ marginLeft: 4 }} />
            </button>
          </div>
        ))}

        <button onClick={onAddAccount} style={styles.addAccountBtn}>
          <Plus size={16} style={{ marginRight: 8 }} />
          Add account
        </button>
      </div>

      {/* More options */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>Security & PIN</span>
      </div>

      <div style={styles.optionsList}>
        {/* Change UPI PIN */}
        <button style={styles.optionRow} onClick={() => setShowChangePinModal(true)}>
          <div style={styles.optionLeft}>
            <KeyRound size={16} color="var(--accent-neon)" style={{ marginRight: 12 }} />
            <span>{pinChanged ? '✅ UPI PIN updated' : 'Change UPI PIN'}</span>
          </div>
          <span style={styles.optionArrow}>&gt;</span>
        </button>

        {/* Forgot PIN */}
        <button style={styles.optionRow} onClick={() => onForgotPin && onForgotPin()}>
          <div style={styles.optionLeft}>
            <Lock size={16} color="#ff8c00" style={{ marginRight: 12 }} />
            <span style={{ color: '#ff8c00' }}>Forgot UPI PIN</span>
          </div>
          <span style={styles.optionArrow}>&gt;</span>
        </button>

        <button style={styles.optionRow}>
          <div style={styles.optionLeft}>
            <Smartphone size={16} color="var(--text-secondary)" style={{ marginRight: 12 }} />
            <span>Manage UPI numbers</span>
          </div>
          <span style={styles.optionArrow}>&gt;</span>
        </button>
        <button style={{ ...styles.optionRow, borderBottom: 'none' }}>
          <div style={styles.optionLeft}>
            <Play size={16} color="var(--text-secondary)" style={{ marginRight: 12 }} />
            <span>UPI Autoplay</span>
          </div>
          <span style={styles.optionArrow}>&gt;</span>
        </button>
      </div>

      {/* Deregister */}
      <div style={styles.optionsList}>
        <button style={{ ...styles.optionRow, borderBottom: 'none' }}>
          <div style={styles.optionLeft}>
            <Trash2 size={16} color="#ff3333" style={{ marginRight: 12 }} />
            <span style={{ color: '#ff3333' }}>Deregister UPI</span>
          </div>
          <span style={styles.optionArrow}>&gt;</span>
        </button>
      </div>

      {/* Logout */}
      <button style={styles.logoutBtn} onClick={onLogout}>
        <LogOut size={16} style={{ marginRight: 8 }} />
        Switch account / Log out
      </button>
    </div>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = {
  qrCard: {
    backgroundColor: 'var(--surface-color)', borderRadius: 24, padding: 24,
    border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 16,
  },
  qrCanvasWrap: {
    position: 'relative', borderRadius: 16, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)', background: '#ffffff',
    padding: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  },
  canvas: { display: 'block', borderRadius: 8 },
  upiInfo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  upiLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  upiIdRow: { display: 'flex', alignItems: 'center', gap: 8 },
  upiValue: { fontSize: 15, fontWeight: 700, color: '#fff' },
  iconActionBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  copiedHint: { fontSize: 11, color: 'var(--accent-neon)', fontWeight: 600 },
  actionRow: { display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-around', background: '#1c1c1f', borderRadius: 14, padding: '4px 0', border: '1px solid rgba(255,255,255,0.04)' },
  actionBtn: { flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 0', color: 'var(--accent-neon)', fontSize: 11, fontWeight: 600 },
  actionDivider: { width: 1, height: 32, background: 'rgba(255,255,255,0.06)' },
};

const styles = {
  container: { padding: 16, display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 },
  sectionHeader: { marginTop: 8, marginBottom: 2 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' },
  accountsList: { display: 'flex', flexDirection: 'column', gap: 10 },
  accountRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: 'var(--surface-color)', borderRadius: 16, border: '1px solid var(--border-color)' },
  accLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  accIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#1c1c1f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 },
  accDetails: { display: 'flex', flexDirection: 'column', gap: 2 },
  accTitleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  accName: { fontSize: 14, fontWeight: 600, color: '#fff' },
  primaryBadge: { fontSize: 9, fontWeight: 700, color: 'var(--accent-neon)', backgroundColor: 'rgba(34,230,123,0.08)', border: '1px solid rgba(34,230,123,0.2)', padding: '2px 6px', borderRadius: 4 },
  accNumber: { fontSize: 12, color: 'var(--text-secondary)' },
  manageBtn: { backgroundColor: '#1c1c1f', border: 'none', borderRadius: 12, color: 'var(--text-secondary)', padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center' },
  addAccountBtn: { width: '100%', height: 48, backgroundColor: 'transparent', border: '1px dashed var(--border-color)', borderRadius: 16, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  optionsList: { backgroundColor: 'var(--surface-color)', borderRadius: 16, border: '1px solid var(--border-color)', overflow: 'hidden' },
  optionRow: { width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, cursor: 'pointer', color: '#fff', fontSize: 14, textAlign: 'left' },
  optionLeft: { display: 'flex', alignItems: 'center' },
  optionArrow: { color: 'var(--text-muted)', fontSize: 14, fontWeight: 'bold' },
  profileCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', backgroundColor: 'var(--surface-color)', borderRadius: 16, border: '1px solid var(--border-color)' },
  profileAvatar: { width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#eb3b88,#aa33ff)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  profileName: { fontSize: 15, fontWeight: 700, color: '#fff' },
  profileVpa: { fontSize: 12, color: 'var(--text-secondary)' },
  logoutBtn: { width: '100%', height: 48, marginTop: 4, backgroundColor: 'rgba(255,51,51,0.06)', border: '1px solid rgba(255,51,51,0.2)', borderRadius: 16, color: '#ff5470', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};

export default UpiSettings;
