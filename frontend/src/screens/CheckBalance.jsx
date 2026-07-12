import React, { useState } from 'react';
import { RefreshCw, Delete } from 'lucide-react';
import { api } from '../api';

const CheckBalance = ({ onBack, upiId = "you@payit", realBalance = 0 }) => {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [err, setErr] = useState('');

  // Masking the UPI ID in compliance with security guidelines
  const maskUpiId = (rawId) => {
    const [local, domain] = rawId.split('@');
    if (local.length <= 4) return `***@${domain}`;
    return `${local.slice(0, 3)}***${local.slice(-1)}@${domain}`;
  };

  const handleKeyPress = (val) => {
    if (pin.length < 4) {
      setPin(prev => prev + val);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleCheckBalance = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setErr('');
    try {
      // Verify UPI PIN against backend first (real 2nd-factor check)
      const loginRes = await api.login(upiId, pin);
      if (!loginRes.ok) {
        setLoading(false);
        setErr('Incorrect UPI PIN. Please try again.');
        setPin('');
        return;
      }
      // Fetch live balance from DB
      const balRes = await api.balance(upiId);
      setLoading(false);
      if (balRes.ok) {
        setBalance(Math.round(Number(balRes.data.balance) || 0));
      } else {
        setBalance(Math.round(Number(realBalance) || 0));
      }
    } catch {
      setLoading(false);
      // Fallback to prop balance if server unreachable
      setBalance(Math.round(Number(realBalance) || 0));
    }
  };

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Top Details */}
      <div style={styles.header}>
        <span style={styles.upiLabel}>UPI ID: {maskUpiId(upiId)}</span>
      </div>

      {/* Main Display Area */}
      <div style={styles.displayArea}>
        {balance !== null ? (
          <div style={styles.balanceWrapper} className="animate-fade-in">
            <span style={styles.balanceLabel}>Account Balance</span>
            <h2 style={styles.balanceAmount}>₹{balance.toLocaleString('en-IN')}.00</h2>
            <button onClick={() => { setBalance(null); setPin(""); }} style={styles.resetBtn}>
              Check another
            </button>
          </div>
        ) : (
          <div style={styles.pinWrapper}>
            <span style={styles.pinPromptText}>Enter 4-digit UPI PIN</span>
            <div style={styles.dotsRow}>
              {[0, 1, 2, 3].map((idx) => (
                <div 
                  key={idx} 
                  style={{
                    ...styles.dot,
                    backgroundColor: idx < pin.length ? 'var(--accent-neon)' : 'transparent',
                    borderColor: idx < pin.length ? 'var(--accent-neon)' : 'var(--text-muted)'
                  }}
                ></div>
              ))}
            </div>
            {err && <p style={{ color: '#ff5470', fontSize: 12, fontWeight: 600, textAlign: 'center', marginTop: 4 }}>{err}</p>}
            {loading && (
              <div style={styles.loaderRow}>
                <RefreshCw size={16} className="spin" style={styles.spinner} />
                <span style={styles.loadingText}>Fetching balance...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Numeric Keypad */}
      {balance === null && !loading && (
        <div style={styles.keypadWrapper}>
          <div style={styles.keypadRow}>
            <button onClick={() => handleKeyPress("1")} style={styles.keyBtn}>1</button>
            <button onClick={() => handleKeyPress("2")} style={styles.keyBtn}>2</button>
            <button onClick={() => handleKeyPress("3")} style={styles.keyBtn}>3</button>
          </div>
          <div style={styles.keypadRow}>
            <button onClick={() => handleKeyPress("4")} style={styles.keyBtn}>4</button>
            <button onClick={() => handleKeyPress("5")} style={styles.keyBtn}>5</button>
            <button onClick={() => handleKeyPress("6")} style={styles.keyBtn}>6</button>
          </div>
          <div style={styles.keypadRow}>
            <button onClick={() => handleKeyPress("7")} style={styles.keyBtn}>7</button>
            <button onClick={() => handleKeyPress("8")} style={styles.keyBtn}>8</button>
            <button onClick={() => handleKeyPress("9")} style={styles.keyBtn}>9</button>
          </div>
          <div style={styles.keypadRow}>
            <button style={styles.emptyBtn} disabled></button>
            <button onClick={() => handleKeyPress("0")} style={styles.keyBtn}>0</button>
            <button onClick={handleDelete} style={styles.keyBtn} aria-label="Backspace">
              <Delete size={20} color="#ffffff" />
            </button>
          </div>

          {/* Action Button */}
          <button 
            onClick={handleCheckBalance} 
            disabled={pin.length < 4}
            style={{
              ...styles.checkBalanceBtn,
              backgroundColor: pin.length === 4 ? 'var(--accent-neon)' : '#1c1c1f',
              color: pin.length === 4 ? '#000000' : 'var(--text-muted)',
              cursor: pin.length === 4 ? 'pointer' : 'not-allowed'
            }}
          >
            Submit PIN
          </button>
        </div>
      )}

      {/* Spinner animation inside document */}
      <style>{`
        @keyframes spinner-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spinner-spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

const styles = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '16px',
    paddingBottom: '32px',
    height: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '10px',
  },
  upiLabel: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: '600',
    backgroundColor: '#1c1c1f',
    padding: '6px 12px',
    borderRadius: '12px',
  },
  displayArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
  },
  pinPromptText: {
    fontSize: '15px',
    color: '#ffffff',
    fontWeight: '500',
  },
  dotsRow: {
    display: 'flex',
    gap: '16px',
  },
  dot: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    border: '2px solid',
    transition: 'all 0.15s ease',
  },
  loaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '16px',
  },
  spinner: {
    color: 'var(--accent-neon)',
  },
  loadingText: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  balanceWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  balanceLabel: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: '36px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
    color: '#ffffff',
  },
  resetBtn: {
    marginTop: '16px',
    backgroundColor: '#1c1c1f',
    border: '1px solid #232326',
    color: 'var(--accent-neon)',
    padding: '8px 20px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  keypadWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  keypadRow: {
    display: 'flex',
    justifyContent: 'space-around',
    gap: '8px',
  },
  keyBtn: {
    flex: 1,
    height: '56px',
    backgroundColor: '#121214',
    border: 'none',
    borderRadius: '16px',
    fontSize: '22px',
    fontWeight: '600',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'background-color 0.1s',
    '&:active': {
      backgroundColor: '#1c1c1f',
    }
  },
  emptyBtn: {
    flex: 1,
    background: 'none',
    border: 'none',
    cursor: 'default',
  },
  checkBalanceBtn: {
    width: '100%',
    height: '48px',
    borderRadius: '16px',
    border: 'none',
    fontSize: '15px',
    fontWeight: '700',
    marginTop: '16px',
    transition: 'all 0.2s ease',
  }
};

export default CheckBalance;
