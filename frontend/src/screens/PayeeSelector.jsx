import React, { useState } from 'react';
import { ChevronLeft, Search, Smartphone, Building, User, FileText, X } from 'lucide-react';
import LogoAvatar from '../components/LogoAvatar';

const FAVOURITES = [
  { name: 'Om Madan Sahani', vpa: 'om.sahani@okaxis', initial: 'O', color: '#c53929' },
  { name: 'Priya Sharma', vpa: 'priya.sharma@okhdfc', initial: 'P', color: '#3949ab' },
  { name: 'Ravi Sharma', vpa: 'ravi.sharma@oksbi', initial: 'R', color: '#00897b' },
  { name: 'Gopichand Javanajad', vpa: 'gopichand@okkotak', initial: 'G', color: '#8e24aa' },
];

const RESOLVED_MAP = {
  'omoffice1305@okaxis': { name: 'OM MADAN SAWANT', vpa: 'omoffice1305@okaxis', initial: 'O', color: '#c53929', history: '↗ ₹2,110 paid on 02 Jun \'26' },
  'om.sahani@okaxis': { name: 'OM MADAN SAHANI', vpa: 'om.sahani@okaxis', initial: 'O', color: '#c53929', history: '↗ ₹500 paid on 10 Jun \'26' },
  'priya.sharma@okhdfc': { name: 'PRIYA SHARMA', vpa: 'priya.sharma@okhdfc', initial: 'P', color: '#3949ab', history: '↗ ₹1,200 paid on 08 Jun \'26' },
  'gopichand@okkotak': { name: 'GOPICHAND JAVANAJAD', vpa: 'gopichand@okkotak', initial: 'G', color: '#8e24aa', history: '↗ ₹3,000 paid on 15 Jun \'26' },
  'ravi.sharma@oksbi': { name: 'RAVI SHARMA', vpa: 'ravi.sharma@oksbi', initial: 'R', color: '#00897b', history: 'New payee' },
};

const resolvePayee = (query) => {
  const clean = query.trim();
  if (RESOLVED_MAP[clean]) return RESOLVED_MAP[clean];
  
  if (clean.includes('@')) {
    const parts = clean.split('@');
    const name = parts[0].toUpperCase();
    return {
      name: name.replace(/[.\-_]/g, ' '),
      vpa: clean,
      initial: name.charAt(0) || 'U',
      color: '#424242',
      history: 'New payee',
    };
  }
  if (/^\d{10}$/.test(clean)) {
    return {
      name: `CONTACT (+91 ${clean})`,
      vpa: `${clean}@payit`,
      initial: 'C',
      color: '#424242',
      history: 'New payee',
    };
  }
  return {
    name: clean.toUpperCase(),
    vpa: `${clean.toLowerCase().replace(/\s+/g, '')}@payit`,
    initial: clean.charAt(0).toUpperCase() || 'U',
    color: '#424242',
    history: 'New payee',
  };
};

export default function PayeeSelector({ amount, balance = 5000.00, onBack, onPayeeSelected }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [resolvedPayee, setResolvedPayee] = useState(null);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    const payee = resolvePayee(query);
    setResolvedPayee(payee);
    // Keep VPA in the search input as shown in the screenshot
    setSearchQuery(payee.vpa);
  };

  const handleFavClick = (fav) => {
    setSearchQuery(fav.vpa);
    setResolvedPayee(resolvePayee(fav.vpa));
  };

  const handleClear = () => {
    setSearchQuery('');
    setResolvedPayee(null);
  };

  const handleConfirm = () => {
    if (resolvedPayee) {
      onPayeeSelected(resolvedPayee.name, resolvedPayee.vpa);
    }
  };

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Content wrapper to separate header/body from the sticky bottom Confirm button */}
      <div style={styles.contentScroll}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <button onClick={onBack} style={styles.backBtn} aria-label="Go back">
              <ChevronLeft size={24} color="#ffffff" />
            </button>
            <span style={styles.headerTitle}>Transfer ₹{amount}</span>
          </div>
          <button style={styles.notesBtn} aria-label="Add Note">
            <FileText size={20} color="#8c8c8e" />
          </button>
        </div>

        {/* From Account Selector */}
        <div style={styles.fromContainer}>
          <div style={styles.fromRow}>
            <span style={styles.fromLabel}>From: </span>
            <span style={styles.fromValue}>Savings • ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={styles.dropdownIcon}>
            <path d="M1 1 L5 5 L9 1" stroke="#8c8c8e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSearchSubmit} style={styles.searchForm}>
          <div style={styles.searchWrapper}>
            <Search size={18} color="#8c8c8e" style={styles.searchIcon} />
            <input
              type="text"
              placeholder="To: Name, phone number or UPI ID"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // Reset resolved payee if user clears the box completely
                if (!e.target.value) setResolvedPayee(null);
              }}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button type="button" onClick={handleClear} style={styles.clearBtn} aria-label="Clear">
                <X size={16} color="#ffffff" />
              </button>
            )}
          </div>
        </form>

        {resolvedPayee ? (
          /* SELECTED PAYEE Detail Section */
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>SELECTED PAYEE</h4>
            <div style={styles.selectedPayeeCard}>
              <LogoAvatar name={resolvedPayee.name} size={48} />
              <div style={styles.payeeInfo}>
                <span style={styles.payeeName}>{resolvedPayee.name}</span>
                <span style={styles.payeeVpa}>{resolvedPayee.vpa}</span>
                <div style={styles.payeeHistoryRow}>
                  {resolvedPayee.history.startsWith('↗') ? (
                    <>
                      <span style={styles.historyArrow}>↗</span>
                      <span style={styles.historyText}>{resolvedPayee.history.substring(2)}</span>
                    </>
                  ) : (
                    <span style={styles.historyTextNew}>{resolvedPayee.history}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Default Quick Pay & Favourites */
          <>
            {/* Quick Pay Actions Section */}
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>QUICK PAY</h4>
              <div style={styles.quickPayRow}>
                <div style={styles.quickPayItem} onClick={() => {
                  setSearchQuery('Mobile number');
                  setResolvedPayee(resolvePayee('9876543210'));
                }}>
                  <div style={{ ...styles.quickCircle, backgroundColor: '#f57c00' }}>
                    <Smartphone size={20} color="#ffffff" />
                  </div>
                  <span style={styles.quickLabel}>Mobile number</span>
                </div>

                <div style={styles.quickPayItem} onClick={() => {
                  setSearchQuery('Bank transfer');
                  setResolvedPayee(resolvePayee('ACC1298453@payit'));
                }}>
                  <div style={{ ...styles.quickCircle, backgroundColor: '#1976d2' }}>
                    <Building size={20} color="#ffffff" />
                  </div>
                  <span style={styles.quickLabel}>Bank transfer</span>
                </div>

                <div style={styles.quickPayItem} onClick={() => {
                  setSearchQuery('Self transfer');
                  setResolvedPayee(resolvePayee('self@payit'));
                }}>
                  <div style={{ ...styles.quickCircle, backgroundColor: '#388e3c' }}>
                    <User size={20} color="#ffffff" />
                  </div>
                  <span style={styles.quickLabel}>Self transfer</span>
                </div>
              </div>
            </div>

            {/* Favourites Section */}
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>FAVOURITE</h4>
              <div style={styles.favGrid}>
                {FAVOURITES.map((fav) => (
                  <div
                    key={fav.vpa}
                    style={styles.favItem}
                    onClick={() => handleFavClick(fav)}
                  >
                    <LogoAvatar name={fav.name} size={44} />
                    <span style={styles.favName}>{fav.name.split(' ').slice(0, 2).join(' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sticky Bottom Actions Container */}
      {resolvedPayee && (
        <div style={styles.bottomStickyActions}>
          <button onClick={handleConfirm} style={styles.confirmBtn}>
            Confirm
          </button>
          
          <div style={styles.poweredByRow}>
            <span style={styles.poweredByText}>POWERED BY</span>
            <div style={styles.upiBadge}>
              <svg width="28" height="10" viewBox="0 0 40 15" fill="none">
                <path d="M2 2 H6 L8 9 L10 2 H14" stroke="#8c8c8e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M17 2 H21 V5 H17 Z M17 5 H21 V12 H17 Z" fill="#8c8c8e" />
                <path d="M25 2 H29 C31 2 32 3 32 5 C32 7 31 8 29 8 H25 V12 H25 Z" fill="#8c8c8e" />
                <path d="M36 2 H40" stroke="#8c8c8e" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M38 2 V12" stroke="#8c8c8e" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#050506',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px',
    position: 'relative',
    justifyContent: 'space-between',
  },
  contentScroll: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '48px',
    marginTop: '4px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
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
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
  },
  notesBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fromContainer: {
    backgroundColor: '#0e0e11',
    border: '1.2px solid #1c1c20',
    borderRadius: '16px',
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '20px',
    cursor: 'pointer',
  },
  fromRow: {
    display: 'flex',
    gap: '6px',
    fontSize: '14px',
    fontFamily: 'var(--font-display)',
  },
  fromLabel: {
    color: '#8c8c8e',
    fontWeight: '500',
  },
  fromValue: {
    color: '#ffffff',
    fontWeight: '600',
  },
  dropdownIcon: {
    marginLeft: '8px',
  },
  searchForm: {
    marginTop: '16px',
    width: '100%',
  },
  searchWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
  },
  clearBtn: {
    position: 'absolute',
    right: '12px',
    background: 'rgba(255, 255, 255, 0.12)',
    border: 'none',
    borderRadius: '50%',
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  searchInput: {
    width: '100%',
    height: '48px',
    backgroundColor: '#0d0d10',
    border: '1px solid #1a1a1f',
    borderRadius: '14px',
    paddingLeft: '44px',
    paddingRight: '44px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '500',
    outline: 'none',
    fontFamily: 'var(--font-display)',
  },
  section: {
    marginTop: '28px',
  },
  sectionTitle: {
    color: '#8c8c8e',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.8px',
    marginBottom: '16px',
    fontFamily: 'var(--font-display)',
  },
  quickPayRow: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: '12px',
  },
  quickPayItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    cursor: 'pointer',
  },
  quickCircle: {
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: '500',
    textAlign: 'center',
    fontFamily: 'var(--font-display)',
  },
  favGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginTop: '8px',
  },
  favItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  favAvatar: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: '17px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
  },
  favName: {
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: '500',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    width: '100%',
    fontFamily: 'var(--font-display)',
  },
  selectedPayeeCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '8px 0',
  },
  avatarCircle: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
  },
  payeeInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontFamily: 'var(--font-display)',
  },
  payeeName: {
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: '600',
    letterSpacing: '0.2px',
  },
  payeeVpa: {
    color: '#8c8c8e',
    fontSize: '13px',
    fontWeight: '500',
  },
  payeeHistoryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
  },
  historyArrow: {
    color: '#22e67b',
    fontSize: '13px',
    fontWeight: '700',
  },
  historyText: {
    color: '#8c8c8e',
    fontSize: '12px',
    fontWeight: '500',
  },
  historyTextNew: {
    color: 'var(--accent-pink)',
    fontSize: '12px',
    fontWeight: '600',
  },
  bottomStickyActions: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: '16px',
    marginTop: 'auto',
    paddingBottom: '8px',
  },
  confirmBtn: {
    width: '100%',
    height: '48px',
    backgroundColor: '#d000d0', // Violet / pink confirmation color matching screenshot
    color: '#ffffff',
    border: 'none',
    borderRadius: '24px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    letterSpacing: '0.4px',
  },
  poweredByRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  poweredByText: {
    color: '#555558',
    fontSize: '8px',
    fontWeight: '700',
    letterSpacing: '0.8px',
    fontFamily: 'var(--font-display)',
  },
  upiBadge: {
    display: 'flex',
    alignItems: 'center',
  },
};
