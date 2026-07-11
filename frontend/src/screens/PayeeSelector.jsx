import React, { useState } from 'react';
import { ChevronLeft, Search, Smartphone, Building, User, FileText } from 'lucide-react';

const FAVOURITES = [
  { name: 'Om Madan Sahani', vpa: 'om.sahani@okaxis', initial: 'O', color: '#c53929' },
  { name: 'Priya Sharma', vpa: 'priya.sharma@okhdfc', initial: 'P', color: '#3949ab' },
  { name: 'Ravi Sharma', vpa: 'ravi.sharma@oksbi', initial: 'R', color: '#00897b' },
  { name: 'Gopichand Javanajad', vpa: 'gopichand@okkotak', initial: 'G', color: '#8e24aa' },
];

export default function PayeeSelector({ amount, balance = 5000.00, onBack, onPayeeSelected }) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    if (query.includes('@')) {
      onPayeeSelected(query.split('@')[0], query);
    } else if (/^\d{10}$/.test(query)) {
      onPayeeSelected(`User (+91 ${query})`, `${query}@payit`);
    } else {
      onPayeeSelected(query, `${query.toLowerCase().replace(/\s+/g, '')}@payit`);
    }
  };

  return (
    <div style={styles.container} className="animate-slide-up">
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
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </form>

      {/* Quick Pay Actions Section */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>QUICK PAY</h4>
        <div style={styles.quickPayRow}>
          <div style={styles.quickPayItem} onClick={() => onPayeeSelected('Mobile Contact', 'mobile@payit')}>
            <div style={{ ...styles.quickCircle, backgroundColor: '#f57c00' }}>
              <Smartphone size={20} color="#ffffff" />
            </div>
            <span style={styles.quickLabel}>Mobile number</span>
          </div>

          <div style={styles.quickPayItem} onClick={() => onPayeeSelected('Bank Account', 'bank@payit')}>
            <div style={{ ...styles.quickCircle, backgroundColor: '#1976d2' }}>
              <Building size={20} color="#ffffff" />
            </div>
            <span style={styles.quickLabel}>Bank transfer</span>
          </div>

          <div style={styles.quickPayItem} onClick={() => onPayeeSelected('Self Transfer', 'self@payit')}>
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
              onClick={() => onPayeeSelected(fav.name, fav.vpa)}
            >
              <div style={{ ...styles.favAvatar, backgroundColor: fav.color }}>
                {fav.initial}
              </div>
              <span style={styles.favName}>{fav.name.split(' ').slice(0, 2).join(' ')}</span>
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
    backgroundColor: '#050506',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px',
    paddingBottom: '32px',
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
  searchInput: {
    width: '100%',
    height: '48px',
    backgroundColor: '#0d0d10',
    border: '1px solid #1a1a1f',
    borderRadius: '14px',
    paddingLeft: '44px',
    paddingRight: '16px',
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
};
