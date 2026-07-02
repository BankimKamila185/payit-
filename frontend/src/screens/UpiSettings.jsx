import React from 'react';
import { 
  Copy, 
  QrCode, 
  Plus, 
  Smartphone, 
  Play, 
  Trash2, 
  ExternalLink 
} from 'lucide-react';

const UpiSettings = ({ onAddAccount, upiId = "bankimkamila23@payit" }) => {
  // PII masking for safety
  const maskText = (text, visibleStart = 4, visibleEnd = 4) => {
    if (text.length <= visibleStart + visibleEnd) return text;
    return text.substring(0, visibleStart) + "•••" + text.substring(text.length - visibleEnd);
  };

  const accounts = [
    { type: "Savings", name: "State Bank Of India", number: "••••5069", tag: "PRIMARY", icon: "🏦" },
    { type: "Credit card", name: "payit CC", number: "••••3701", icon: "💳" },
    { type: "Savings", name: "HDFC Bank", number: "••••5015", icon: "🏦" }
  ];

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* QR Code Card */}
      <div style={styles.qrCard}>
        <div style={styles.qrWrapper}>
          <QrCode size={140} color="#ffffff" style={{ margin: 'auto' }} />
        </div>
        <div style={styles.upiInfo}>
          <span style={styles.upiLabel}>UPI ID</span>
          <div style={styles.upiIdRow}>
            <span style={styles.upiValue}>{upiId}</span>
            <button style={styles.copyBtn} aria-label="Copy UPI ID">
              <Copy size={14} color="var(--accent-neon)" />
            </button>
          </div>
        </div>
      </div>

      {/* Linked Accounts Header */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>Bank accounts</span>
      </div>

      {/* Linked Accounts List */}
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

        {/* Add Account Button */}
        <button onClick={onAddAccount} style={styles.addAccountBtn}>
          <Plus size={16} style={{ marginRight: 8 }} />
          Add account
        </button>
      </div>

      {/* More Options Section */}
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
    </div>
  );
};

const styles = {
  container: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '40px',
  },
  qrCard: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '24px',
    padding: '24px',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '16px',
  },
  qrWrapper: {
    padding: '16px',
    backgroundColor: '#1c1c1f',
    borderRadius: '16px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  upiInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  upiLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  upiIdRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  upiValue: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'var(--font-display)',
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    marginTop: '8px',
    marginBottom: '2px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  accountsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  accountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    border: '1px solid var(--border-color)',
  },
  accLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  accIconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: '#1c1c1f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
  },
  accDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  accTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  accName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
  },
  primaryBadge: {
    fontSize: '9px',
    fontWeight: '700',
    color: 'var(--accent-neon)',
    backgroundColor: 'rgba(34, 230, 123, 0.08)',
    border: '1px solid rgba(34, 230, 123, 0.2)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  accNumber: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  manageBtn: {
    backgroundColor: '#1c1c1f',
    border: 'none',
    borderRadius: '12px',
    color: 'var(--text-secondary)',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  addAccountBtn: {
    width: '100%',
    height: '48px',
    backgroundColor: 'transparent',
    border: '1px dashed var(--border-color)',
    borderRadius: '16px',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    '&:hover': {
      borderColor: 'var(--text-secondary)',
      color: '#ffffff',
    }
  },
  optionsList: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    border: '1px solid var(--border-color)',
    overflow: 'hidden',
  },
  optionRow: {
    width: '100%',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    cursor: 'pointer',
    color: '#ffffff',
    fontSize: '14px',
    textAlign: 'left',
    transition: 'background-color 0.2s',
  },
  optionLeft: {
    display: 'flex',
    alignItems: 'center',
  },
  optionArrow: {
    color: 'var(--text-muted)',
    fontSize: '14px',
    fontWeight: 'bold',
  }
};

export default UpiSettings;
