import React from 'react';
import { Copy, Check } from 'lucide-react';

const REFERRAL_CODE = '$BANKI35848';

const RECOMMENDED = [
  { name: 'ITM Xerox', sub: 'Has 194 friends on slice', initial: 'I', color: '#00897b' },
  { name: 'Tanishq J', sub: 'Has 110 friends on slice', initial: 'T', color: '#8e24aa' },
  { name: 'Pratik Sagvekar', sub: 'Has 83 friends on slice', initial: 'P', color: '#e65100' },
  { name: 'Rahul Verma', sub: 'Has 67 friends on slice', initial: 'R', color: '#1565c0' },
  { name: 'Sneha Patel', sub: 'Has 45 friends on slice', initial: 'S', color: '#c62828' },
];

export default function ReferPage({ onBack }) {
  const [copied, setCopied] = React.useState(false);
  const [invitedIdx, setInvitedIdx] = React.useState([]);

  const handleCopy = () => {
    navigator.clipboard?.writeText(REFERRAL_CODE).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInvite = (i) => {
    setInvitedIdx((prev) => [...new Set([...prev, i])]);
  };

  return (
    <div style={styles.container}>
      {/* Hero Section */}
      <div style={styles.heroSection}>
        {/* Emoji characters illustration */}
        <div style={styles.emojiRow}>
          <div style={styles.emojiLeft}>💜</div>
          <div style={styles.emojiCenter}>
            <div style={styles.emoji1}>🧑‍💻</div>
            <div style={styles.emoji2}>🎉</div>
          </div>
          <div style={styles.emojiRight}>⭐</div>
        </div>

        <h1 style={styles.heroTitle}>Invite &amp; earn ₹500</h1>
        <p style={styles.heroDesc}>
          You both get ₹500 when your friend makes their first UPI payment using slice credit card
        </p>

        {/* Referral Code Row */}
        <div style={styles.codeRow}>
          <span style={styles.codeText}>{REFERRAL_CODE}</span>
          <button style={styles.copyBtn} onClick={handleCopy} aria-label="Copy referral code">
            {copied
              ? <Check size={14} color="#22e67b" />
              : <Copy size={14} color="#8c8c8e" />}
          </button>
        </div>

        {/* Invite Button */}
        <button style={styles.inviteBtn} aria-label="Invite friends">
          <span style={styles.inviteBtnIcon}>👥</span>
          <span style={styles.inviteBtnText}>Invite friends</span>
        </button>
      </div>

      {/* Recommended Section */}
      <div style={styles.recommendedSection}>
        <p style={styles.recommendedLabel}>RECOMMENDED</p>
        <div style={styles.contactsList}>
          {RECOMMENDED.map((c, i) => (
            <div key={c.name} style={styles.contactRow}>
              <div style={{ ...styles.contactAvatar, backgroundColor: c.color }}>
                {c.initial}
              </div>
              <div style={styles.contactInfo}>
                <span style={styles.contactName}>{c.name}</span>
                <span style={styles.contactSub}>{c.sub}</span>
              </div>
              <button
                style={{
                  ...styles.inviteSmallBtn,
                  backgroundColor: invitedIdx.includes(i) ? 'rgba(34,230,123,0.12)' : 'transparent',
                  color: invitedIdx.includes(i) ? 'var(--accent-neon)' : 'var(--accent-pink)',
                  borderColor: invitedIdx.includes(i) ? 'var(--accent-neon)' : 'var(--accent-pink)',
                }}
                onClick={() => handleInvite(i)}
              >
                {invitedIdx.includes(i) ? 'Invited ✓' : 'Invite'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: 'var(--bg-color)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflowY: 'auto',
    scrollbarWidth: 'none',
  },
  heroSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 24px 20px',
    borderBottom: '1px solid var(--border-color)',
  },
  emojiRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '28px',
    marginBottom: '16px',
    userSelect: 'none',
  },
  emojiLeft: { marginBottom: '10px' },
  emojiCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    lineHeight: 1,
  },
  emoji1: { fontSize: '36px' },
  emoji2: { fontSize: '20px' },
  emojiRight: { marginTop: '14px' },
  heroTitle: {
    color: 'var(--text-primary)',
    fontSize: '22px',
    fontWeight: '800',
    margin: '0 0 8px',
    fontFamily: 'var(--font-display)',
    textAlign: 'center',
  },
  heroDesc: {
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: '1.55',
    margin: '0 0 20px',
    fontFamily: 'var(--font-display)',
    maxWidth: '260px',
  },
  codeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: 'var(--surface-color)',
    border: '1.2px solid var(--border-color)',
    borderRadius: '10px',
    padding: '10px 16px',
    marginBottom: '18px',
    cursor: 'pointer',
  },
  codeText: {
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: '0.8px',
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 4px',
    display: 'flex',
    alignItems: 'center',
  },
  inviteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    backgroundColor: 'var(--accent-pink)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '24px',
    padding: '14px 40px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    letterSpacing: '0.3px',
  },
  inviteBtnIcon: {
    fontSize: '16px',
  },
  inviteBtnText: {
    fontSize: '14px',
  },
  recommendedSection: {
    padding: '20px 16px',
  },
  recommendedLabel: {
    color: 'var(--text-secondary)',
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '1px',
    marginBottom: '12px',
    fontFamily: 'var(--font-display)',
  },
  contactsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  contactRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '10px 0',
    borderBottom: '1px solid var(--border-color)',
  },
  contactAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: '700',
    flexShrink: 0,
    fontFamily: 'var(--font-display)',
  },
  contactInfo: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    gap: '2px',
  },
  contactName: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'var(--font-display)',
  },
  contactSub: {
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: '500',
    fontFamily: 'var(--font-display)',
  },
  inviteSmallBtn: {
    border: '1.2px solid',
    borderRadius: '8px',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
  },
};
