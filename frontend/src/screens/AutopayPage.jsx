import React, { useState } from 'react';
import LogoAvatar from '../components/LogoAvatar';

const AUTOPAY_LIST = [
  {
    id: 'jio-hotstar',
    name: 'Jio hotstar',
    amount: '₹149',
    desc: 'As per subscription',
    status: 'Paused',
    initial: 'J',
    color: '#1a237e',
    transactions: [
      { label: 'Jio Hotstar', amount: '₹149', date: '12 Jul \'26' },
      { label: 'Jio Hotstar', amount: '₹149', date: '12 Jul \'26' },
    ],
    details: {
      frequency: 'As per subscription',
      mandateAmount: 'Upto ₹149',
      sourceAccount: 'slice credit card',
      uniqueId: '019f1d74a88772efb66fabab737384ed@slc',
      startDate: '1 Jul 2026',
      endDate: '1 Jul 2056',
      createdOn: '1 Jul 2026',
    },
  },
  {
    id: 'slice-credit',
    name: 'slice credit card',
    amount: 'Total due',
    desc: 'As presented',
    status: 'Paused',
    initial: 'S',
    color: '#d000d0',
    transactions: [
      { label: 'Slice Credit', amount: '₹4,200', date: '1 Jul \'26' },
    ],
    details: {
      frequency: 'As per subscription',
      mandateAmount: 'Upto ₹6,000',
      sourceAccount: 'slice credit card',
      uniqueId: '02a7fb34c99881efb66fabab73831dc@slc',
      startDate: '15 Jun 2026',
      endDate: '15 Jun 2056',
      createdOn: '15 Jun 2026',
    },
  },
  {
    id: 'playstore',
    name: 'Playstore',
    amount: '₹15,000',
    desc: 'As presented',
    status: 'Paused',
    initial: 'G',
    color: '#1565c0',
    transactions: [
      { label: 'Google Play', amount: '₹199', date: '5 Jul \'26' },
      { label: 'Google Play', amount: '₹299', date: '5 Jun \'26' },
    ],
    details: {
      frequency: 'Monthly',
      mandateAmount: 'Upto ₹15,000',
      sourceAccount: 'slice credit card',
      uniqueId: '03b9dc45d00992fb77gcbcb84842ed@slc',
      startDate: '1 May 2026',
      endDate: '1 May 2056',
      createdOn: '1 May 2026',
    },
  },
];

// ──────────────────────────────────────────────────────────────────
// Autopay Detail Page
// ──────────────────────────────────────────────────────────────────
function AutopayDetail({ item, onBack }) {
  const [enabled, setEnabled] = React.useState(item.status !== 'Paused');
  const [cancelled, setCancelled] = React.useState(false);

  return (
    <div style={detailStyles.container}>
      <div style={detailStyles.scroll}>
        {/* Header */}
        <div style={detailStyles.header}>
          <button onClick={onBack} style={detailStyles.backBtn}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span style={detailStyles.headerTitle}>{item.name}</span>
          <LogoAvatar name={item.name} size={36} />
        </div>

        {/* Status Card */}
        <div style={detailStyles.card}>
          <div style={detailStyles.cardRow}>
            <div>
              <span style={detailStyles.cardLabel}>Status</span>
              <span style={detailStyles.cardValuePaused}>
                {enabled ? 'Active' : 'Paused'}
              </span>
            </div>
            <label style={detailStyles.toggle} aria-label="Toggle autopay">
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => setEnabled((e) => !e)}
                style={{ display: 'none' }}
              />
              <div style={{
                ...detailStyles.toggleTrack,
                backgroundColor: enabled ? '#22e67b' : 'var(--border-color)',
              }}>
                <div style={{
                  ...detailStyles.toggleThumb,
                  transform: enabled ? 'translateX(18px)' : 'translateX(2px)',
                }} />
              </div>
            </label>
          </div>
        </div>

        {/* Frequency */}
        <div style={detailStyles.card}>
          <div style={detailStyles.cardRow}>
            <div>
              <span style={detailStyles.cardLabel}>Frequency</span>
              <span style={detailStyles.cardValue}>{item.details.frequency}</span>
            </div>
          </div>
        </div>

        {/* Mandate Amount */}
        <div style={detailStyles.card}>
          <div style={detailStyles.cardRow}>
            <div>
              <span style={detailStyles.cardLabel}>Mandate amount</span>
              <span style={detailStyles.cardValue}>{item.details.mandateAmount}</span>
            </div>
          </div>
        </div>

        {/* Source Account */}
        <div style={detailStyles.card}>
          <div style={detailStyles.cardRow}>
            <div>
              <span style={detailStyles.cardLabel}>Source account</span>
              <span style={detailStyles.cardValue}>{item.details.sourceAccount}</span>
            </div>
          </div>
        </div>

        {/* Transactions */}
        {item.transactions.map((tx, i) => (
          <div key={i} style={detailStyles.card}>
            <div style={detailStyles.txSectionLabel}>Transactions</div>
            <div style={detailStyles.txRow}>
              <span style={detailStyles.txLabel}>{tx.label}</span>
              <span style={detailStyles.txAmount}>{tx.amount}</span>
            </div>
            <span style={detailStyles.txDate}>{tx.date}</span>
          </div>
        ))}

        {/* More Details */}
        <div style={detailStyles.card}>
          <div style={detailStyles.txSectionLabel}>More Details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            <div>
              <span style={detailStyles.moreLabel}>Unique autopay number</span>
              <span style={detailStyles.moreValue}>{item.details.uniqueId}</span>
            </div>
            <div>
              <span style={detailStyles.moreLabel}>Start date</span>
              <span style={detailStyles.moreValue}>{item.details.startDate}</span>
            </div>
            <div>
              <span style={detailStyles.moreLabel}>End date</span>
              <span style={detailStyles.moreValue}>{item.details.endDate}</span>
            </div>
            <div>
              <span style={detailStyles.moreLabel}>Created on</span>
              <span style={detailStyles.moreValue}>{item.details.createdOn}</span>
            </div>
          </div>
        </div>

        {/* Cancel Button */}
        <div style={{ padding: '12px 16px 8px' }}>
          <button
            style={{
              ...detailStyles.cancelBtn,
              opacity: cancelled ? 0.5 : 1,
            }}
            onClick={() => setCancelled(true)}
            disabled={cancelled}
          >
            {cancelled ? 'Autopay Cancelled' : 'Cancel autopay'}
          </button>
          <div style={detailStyles.upiLabel}>UPI AUTOPAY</div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Autopay List Page
// ──────────────────────────────────────────────────────────────────
export default function AutopayPage({ onBack }) {
  const [selectedItem, setSelectedItem] = useState(null);

  if (selectedItem) {
    return <AutopayDetail item={selectedItem} onBack={() => setSelectedItem(null)} />;
  }

  return (
    <div style={listStyles.container}>
      {/* Header */}
      <div style={listStyles.header}>
        <button onClick={onBack} style={listStyles.backBtn} aria-label="Go back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span style={listStyles.headerTitle}>autopay</span>
      </div>

      {/* Autopay Cards */}
      <div style={listStyles.list}>
        {AUTOPAY_LIST.map((item) => (
          <div
            key={item.id}
            style={listStyles.card}
            onClick={() => setSelectedItem(item)}
          >
            <div style={listStyles.cardLeft}>
              <LogoAvatar name={item.name} size={40} />
              <div style={listStyles.cardInfo}>
                <span style={listStyles.cardName}>{item.name}</span>
                <span style={listStyles.cardDesc}>{item.desc}</span>
              </div>
            </div>
            <div style={listStyles.cardRight}>
              <span style={listStyles.cardAmount}>{item.amount}</span>
              <span style={listStyles.pausedBadge}>{item.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Styles – List Page
// ──────────────────────────────────────────────────────────────────
const listStyles = {
  container: {
    flex: 1,
    backgroundColor: 'var(--bg-color)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflowY: 'auto',
    scrollbarWidth: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 16px 12px',
    borderBottom: '1px solid var(--border-color)',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'var(--text-primary)',
    fontSize: '20px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 0',
  },
  card: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border-color)',
    transition: 'background 0.15s',
  },
  cardLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  merchantIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-primary)',
    fontSize: '16px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
  },
  cardInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  cardName: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'var(--font-display)',
  },
  cardDesc: {
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: '500',
    fontFamily: 'var(--font-display)',
  },
  cardRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
  },
  cardAmount: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'var(--font-display)',
  },
  pausedBadge: {
    color: 'var(--accent-pink)',
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    letterSpacing: '0.2px',
  },
};

// ──────────────────────────────────────────────────────────────────
// Styles – Detail Page
// ──────────────────────────────────────────────────────────────────
const detailStyles = {
  container: {
    flex: 1,
    backgroundColor: 'var(--bg-color)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflowY: 'auto',
    scrollbarWidth: 'none',
  },
  scroll: {
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: '20px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 16px 16px',
    borderBottom: '1px solid var(--border-color)',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'var(--text-primary)',
    fontSize: '18px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    flex: 1,
    marginLeft: '12px',
  },
  merchantIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-primary)',
    fontSize: '15px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
  },
  card: {
    margin: '8px 16px 0',
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '14px 16px',
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.4px',
    display: 'block',
    marginBottom: '4px',
    fontFamily: 'var(--font-display)',
  },
  cardValue: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: '500',
    fontFamily: 'var(--font-display)',
  },
  cardValuePaused: {
    color: 'var(--accent-pink)',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'var(--font-display)',
  },
  toggle: {
    cursor: 'pointer',
    userSelect: 'none',
  },
  toggleTrack: {
    width: '40px',
    height: '22px',
    borderRadius: '11px',
    position: 'relative',
    transition: 'background 0.25s',
  },
  toggleThumb: {
    position: 'absolute',
    top: '3px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    transition: 'transform 0.25s',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },
  txSectionLabel: {
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.4px',
    marginBottom: '8px',
    fontFamily: 'var(--font-display)',
  },
  txRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txLabel: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: '500',
    fontFamily: 'var(--font-display)',
  },
  txAmount: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'var(--font-display)',
  },
  txDate: {
    color: 'var(--text-secondary)',
    fontSize: '11px',
    marginTop: '3px',
    fontFamily: 'var(--font-display)',
  },
  moreLabel: {
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.3px',
    display: 'block',
    marginBottom: '2px',
    fontFamily: 'var(--font-display)',
  },
  moreValue: {
    color: 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: '400',
    display: 'block',
    fontFamily: 'var(--font-display)',
    wordBreak: 'break-all',
  },
  cancelBtn: {
    width: '100%',
    padding: '14px',
    border: '1.5px solid var(--accent-pink)',
    borderRadius: '12px',
    backgroundColor: 'transparent',
    color: 'var(--accent-pink)',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    letterSpacing: '0.3px',
  },
  upiLabel: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '1.5px',
    marginTop: '12px',
    fontFamily: 'var(--font-display)',
  },
};
