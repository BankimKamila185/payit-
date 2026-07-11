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
  RefreshCw
} from 'lucide-react';

// ─── Real UPI QR card ──────────────────────────────────────────────────────────
const UpiQrCard = ({ upiId, userName }) => {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);

  // UPI deep-link format used by all UPI apps
  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(userName || upiId)}&cu=INR`;

  const generateQr = useCallback(async () => {
    if (!canvasRef.current) return;
    try {
      await QRCode.toCanvas(canvasRef.current, upiUri, {
        width: 220,
        margin: 2,
        color: {
          dark: '#ffffff',   // white modules on dark bg
          light: '#141414',  // dark background
        },
        errorCorrectionLevel: 'H', // highest — allows embedding logo later
      });
    } catch (err) {
      console.error('QR generation failed:', err);
    }
  }, [upiUri]);

  useEffect(() => {
    generateQr();
    // Check Web Share API availability
    setShareSupported(!!navigator.share);
  }, [generateQr]);

  // Copy UPI ID to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
      const el = document.createElement('textarea');
      el.value = upiId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Download QR as PNG
  const handleDownload = () => {
    if (!canvasRef.current) return;
    // Draw a branded version: padded white background + payit label
    const src = canvasRef.current;
    const pad = 24;
    const labelH = 40;
    const out = document.createElement('canvas');
    out.width = src.width + pad * 2;
    out.height = src.height + pad * 2 + labelH;
    const ctx = out.getContext('2d');

    // Background
    ctx.fillStyle = '#141414';
    ctx.roundRect(0, 0, out.width, out.height, 20);
    ctx.fill();

    // QR
    ctx.drawImage(src, pad, pad);

    // payit branding label
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
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

  // Share via Web Share API (mobile) — falls back to download on desktop
  const handleShare = async () => {
    if (!canvasRef.current) return;
    const src = canvasRef.current;
    const blob = await new Promise(resolve => src.toBlob(resolve, 'image/png'));
    const file = new File([blob], `payit-qr-${upiId}.png`, { type: 'image/png' });

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Pay ${userName || upiId} via UPI`,
          text: `Scan to pay me on payit\nUPI ID: ${upiId}`,
          files: [file],
        });
      } catch (e) {
        if (e.name !== 'AbortError') handleDownload(); // fallback
      }
    } else {
      handleDownload(); // desktop fallback
    }
  };

  return (
    <div style={S.qrCard}>
      {/* QR Code Canvas */}
      <div style={S.qrCanvasWrap}>
        <canvas ref={canvasRef} style={S.canvas} id="upi-qr-canvas" />
        {/* payit wordmark overlay at bottom of QR */}
        <div style={S.qrBrand}>
          <span style={S.qrBrandText}>payit</span>
        </div>
      </div>

      {/* UPI ID + copy */}
      <div style={S.upiInfo}>
        <span style={S.upiLabel}>UPI ID</span>
        <div style={S.upiIdRow}>
          <span style={S.upiValue}>{upiId}</span>
          <button style={S.iconActionBtn} onClick={handleCopy} aria-label="Copy UPI ID" title="Copy">
            {copied
              ? <Check size={14} color="var(--accent-neon)" />
              : <Copy size={14} color="var(--accent-neon)" />}
          </button>
        </div>
        {copied && <span style={S.copiedHint}>Copied!</span>}
      </div>

      {/* Action row */}
      <div style={S.actionRow}>
        <button style={S.actionBtn} onClick={handleDownload} aria-label="Download QR code">
          {downloaded
            ? <Check size={15} color="var(--accent-neon)" />
            : <Download size={15} color="var(--accent-neon)" />}
          <span>{downloaded ? 'Saved' : 'Download'}</span>
        </button>

        <div style={S.actionDivider} />

        <button style={S.actionBtn} onClick={handleShare} aria-label="Share QR code">
          <Share2 size={15} color="#aa33ff" />
          <span style={{ color: '#aa33ff' }}>{shareSupported ? 'Share' : 'Save'}</span>
        </button>

        <div style={S.actionDivider} />

        <button style={S.actionBtn} onClick={generateQr} aria-label="Refresh QR code" title="Refresh">
          <RefreshCw size={15} color="rgba(255,255,255,0.35)" />
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>Refresh</span>
        </button>
      </div>
    </div>
  );
};

// ─── Main UpiSettings screen ──────────────────────────────────────────────────
const UpiSettings = ({ onAddAccount, upiId = 'you@payit', userName = '', onLogout }) => {
  const accounts = [
    { type: 'Savings',     name: 'State Bank Of India', number: '••••5069', tag: 'PRIMARY', icon: '🏦' },
    { type: 'Credit card', name: 'payit CC',            number: '••••3701', icon: '💳' },
    { type: 'Savings',     name: 'HDFC Bank',           number: '••••5015', icon: '🏦' },
  ];

  return (
    <div style={styles.container} className="animate-slide-up">
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
        <span style={styles.sectionTitle}>More options</span>
      </div>

      <div style={styles.optionsList}>
        <button style={styles.optionRow}>
          <div style={styles.optionLeft}>
            <Smartphone size={16} color="var(--text-secondary)" style={{ marginRight: 12 }} />
            <span>Manage UPI numbers</span>
          </div>
          <span style={styles.optionArrow}>&gt;</span>
        </button>
        <button style={styles.optionRow}>
          <div style={styles.optionLeft}>
            <Play size={16} color="var(--text-secondary)" style={{ marginRight: 12 }} />
            <span>UPI Autoplay</span>
          </div>
          <span style={styles.optionArrow}>&gt;</span>
        </button>
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
    backgroundColor: 'var(--surface-color)',
    borderRadius: 24,
    padding: 24,
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  qrCanvasWrap: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.06)',
    background: '#141414',
  },
  canvas: {
    display: 'block',
    borderRadius: 14,
  },
  qrBrand: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(20,20,20,0.82)',
    backdropFilter: 'blur(4px)',
    textAlign: 'center',
    padding: '3px 0 5px',
  },
  qrBrandText: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.5)',
  },
  upiInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  upiLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  upiIdRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  upiValue: {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
  },
  iconActionBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiedHint: {
    fontSize: 11,
    color: 'var(--accent-neon)',
    fontWeight: 600,
  },
  actionRow: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    background: '#1c1c1f',
    borderRadius: 14,
    padding: '4px 0',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  actionBtn: {
    flex: 1,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '10px 0',
    color: 'var(--accent-neon)',
    fontSize: 11,
    fontWeight: 600,
  },
  actionDivider: {
    width: 1,
    height: 32,
    background: 'rgba(255,255,255,0.06)',
  },
};

const styles = {
  container: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    paddingBottom: 40,
  },
  sectionHeader: { marginTop: 8, marginBottom: 2 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  accountsList: { display: 'flex', flexDirection: 'column', gap: 10 },
  accountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'var(--surface-color)',
    borderRadius: 16,
    border: '1px solid var(--border-color)',
  },
  accLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  accIconBox: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#1c1c1f',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
  },
  accDetails: { display: 'flex', flexDirection: 'column', gap: 2 },
  accTitleRow: { display: 'flex', alignItems: 'center', gap: 8 },
  accName: { fontSize: 14, fontWeight: 600, color: '#fff' },
  primaryBadge: {
    fontSize: 9, fontWeight: 700, color: 'var(--accent-neon)',
    backgroundColor: 'rgba(34,230,123,0.08)', border: '1px solid rgba(34,230,123,0.2)',
    padding: '2px 6px', borderRadius: 4,
  },
  accNumber: { fontSize: 12, color: 'var(--text-secondary)' },
  manageBtn: {
    backgroundColor: '#1c1c1f', border: 'none', borderRadius: 12,
    color: 'var(--text-secondary)', padding: '6px 12px', fontSize: 11,
    fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center',
  },
  addAccountBtn: {
    width: '100%', height: 48, backgroundColor: 'transparent',
    border: '1px dashed var(--border-color)', borderRadius: 16,
    color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  optionsList: {
    backgroundColor: 'var(--surface-color)', borderRadius: 16,
    border: '1px solid var(--border-color)', overflow: 'hidden',
  },
  optionRow: {
    width: '100%', background: 'none',
    border: 'none', borderBottom: '1px solid var(--border-color)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, cursor: 'pointer', color: '#fff', fontSize: 14, textAlign: 'left',
  },
  optionLeft: { display: 'flex', alignItems: 'center' },
  optionArrow: { color: 'var(--text-muted)', fontSize: 14, fontWeight: 'bold' },
  profileCard: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
    backgroundColor: 'var(--surface-color)', borderRadius: 16,
    border: '1px solid var(--border-color)',
  },
  profileAvatar: {
    width: 40, height: 40, borderRadius: '50%',
    background: 'linear-gradient(135deg,#eb3b88,#aa33ff)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  profileName: { fontSize: 15, fontWeight: 700, color: '#fff' },
  profileVpa:  { fontSize: 12, color: 'var(--text-secondary)' },
  logoutBtn: {
    width: '100%', height: 48, marginTop: 4,
    backgroundColor: 'rgba(255,51,51,0.06)', border: '1px solid rgba(255,51,51,0.2)',
    borderRadius: 16, color: '#ff5470', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};

export default UpiSettings;
