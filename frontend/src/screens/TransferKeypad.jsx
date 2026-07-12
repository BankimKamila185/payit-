import React, { useState } from 'react';
import { Delete, Sparkles, MessageCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

const TransferKeypad = ({
  recipientName = "",
  prefilledAmount = "",
  onTransferSuccess,
  onInvestSuccess,
  onOpenScanner,
  onCheckBalance,
  userInitial = "U",
  recipientVpa = "",
  onChangePayee
}) => {
  const [amount, setAmount] = useState(prefilledAmount ? prefilledAmount.toString() : "");

  const handleKeyPress = (val) => {
    if (amount === "" && val === "0") return;
    if (val === "." && amount.includes(".")) return;
    if (amount.replace(".", "").length < 7) {
      setAmount(prev => prev + val);
    }
  };

  const handleDelete = () => {
    setAmount(prev => prev.slice(0, -1));
  };

  const handleTransfer = () => {
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) return;
    onTransferSuccess(numericAmount);
  };

  const handleInvest = () => {
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) return;
    onInvestSuccess(numericAmount);
  };

  // Helper to determine if recipient is a flagged scam address
  const isFlaggedScam = () => {
    if (!recipientName) return false;
    const name = recipientName.toLowerCase();
    return name.includes("prize") || 
           name.includes("scam") || 
           name.includes("lottery") || 
           name.includes("mule") ||
           name.includes("unknown_prize");
  };

  const getInitials = (name) => {
    const parts = name.split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Top Header Row matching the reference image */}
      <div style={styles.topHeader}>
        <button onClick={onCheckBalance} style={styles.checkBalanceBtn}>
          Check balance
        </button>
        
        <div style={styles.headerRight}>
          <button style={styles.chatBtn} aria-label="Chat">
            <MessageCircle size={18} color="#ffffff" />
          </button>
          <div style={styles.profileBox}>
            <div style={styles.profileInitial}>{userInitial}</div>
          </div>
        </div>
      </div>

      {/* Recipient Details & Real-Time Scam Warning (rendered only if a recipient is passed) */}
      {recipientName && (
        <>
          <div style={styles.recipientHeaderCard}>
            <div style={styles.recipientLeft}>
              <div style={{
                ...styles.recipientAvatar,
                background: isFlaggedScam() ? 'rgba(235, 59, 136, 0.12)' : 'linear-gradient(135deg, #aa33ff 0%, #0088ff 100%)',
                borderColor: isFlaggedScam() ? 'var(--accent-pink)' : 'rgba(255,255,255,0.06)'
              }}>
                {getInitials(recipientName)}
              </div>
              <div style={styles.recipientInfo}>
                <span style={styles.recipientText}>Paying {recipientName}</span>
                <span style={styles.recipientUpiText}>
                  {recipientVpa || (recipientName.includes("@") ? recipientName
                    : `${recipientName.toLowerCase().replace(/\s+/g, '')}@upi`)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <div style={styles.verifiedTag}>
                {isFlaggedScam() ? (
                  <span style={styles.muleTag}>FLAGGED MULE</span>
                ) : (
                  <span style={styles.safeTag}>VERIFIED SAFE</span>
                )}
              </div>
              {onChangePayee && (
                <button 
                  onClick={onChangePayee} 
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-neon)',
                    fontSize: '11px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    padding: '4px 0',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}
                >
                  Change
                </button>
              )}
            </div>
          </div>


          {isFlaggedScam() && (
            <div style={styles.scamWarningCard}>
              <AlertTriangle size={18} color="var(--accent-pink)" style={{ marginTop: 2 }} />
              <div style={styles.scamWarningText}>
                <span style={styles.scamWarningTitle}>Scam Alert Database Match</span>
                <span style={styles.scamWarningDesc}>
                  Warning: This recipient UPI has been reported 40+ times for cyber fraud lottery claims. Transfers may result in immediate loss of funds.
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Main Display Area (Double click to open QR Scanner) */}
      <div style={styles.displayArea} onDoubleClick={onOpenScanner} title="Double click to scan QR">
        <div style={styles.amountRow}>
          <span style={styles.amountText}>₹{amount || "0"}</span>
        </div>
      </div>

      {/* Keypad Section */}
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
          <button onClick={() => handleKeyPress(".")} style={styles.keyBtn}>.</button>
          <button onClick={() => handleKeyPress("0")} style={styles.keyBtn}>0</button>
          <button onClick={handleDelete} style={styles.keyBtn} aria-label="Backspace">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
              <line x1="18" y1="9" x2="12" y2="15"></line>
              <line x1="12" y1="9" x2="18" y2="15"></line>
            </svg>
          </button>
        </div>

        {/* Action Buttons matching the reference image styling */}
        <div style={styles.actionButtonsRow}>
          <button 
            onClick={handleTransfer}
            disabled={!amount || parseFloat(amount) <= 0}
            style={{
              ...styles.transferBtn,
              backgroundColor: amount && parseFloat(amount) > 0 ? (recipientName && isFlaggedScam() ? 'var(--accent-pink)' : 'var(--accent-neon)') : 'rgba(255, 255, 255, 0.05)',
              color: amount && parseFloat(amount) > 0 ? '#000000' : 'var(--text-secondary)',
              cursor: amount && parseFloat(amount) > 0 ? 'pointer' : 'default',
              flex: 1
            }}
          >
            {recipientName && isFlaggedScam() ? 'Pay Risk Alert' : 'Transfer'}
          </button>
        </div>
      </div>
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
    backgroundColor: '#050506',
  },
  topHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
  },
  checkBalanceBtn: {
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '16px',
    color: '#ffffff',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  chatBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    cursor: 'pointer',
  },
  profileBox: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    backgroundColor: '#3a3a3c',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '13px',
  },
  recipientHeaderCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '16px',
    padding: '10px 12px',
    marginTop: '14px',
  },
  recipientLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  recipientAvatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    borderWidth: '1px',
    borderStyle: 'solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: '700',
  },
  recipientInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  recipientText: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#ffffff',
  },
  recipientUpiText: {
    fontSize: '9px',
    color: 'var(--text-secondary)',
  },
  verifiedTag: {
    display: 'flex',
  },
  safeTag: {
    fontSize: '8px',
    fontWeight: '700',
    color: 'var(--accent-neon)',
    backgroundColor: 'rgba(34, 230, 123, 0.08)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  muleTag: {
    fontSize: '8px',
    fontWeight: '700',
    color: 'var(--accent-pink)',
    backgroundColor: 'rgba(235, 59, 136, 0.08)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  scamWarningCard: {
    backgroundColor: 'rgba(235, 59, 136, 0.05)',
    border: '1px solid rgba(235, 59, 136, 0.15)',
    borderRadius: '12px',
    padding: '10px 12px',
    marginTop: '10px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  scamWarningText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  scamWarningTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--accent-pink)',
  },
  scamWarningDesc: {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.7)',
    lineHeight: '1.4',
  },
  displayArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  amountRow: {
    display: 'flex',
    alignItems: 'baseline',
  },
  amountText: {
    fontSize: '60px',
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-1px',
  },
  pillsRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  earnBadge: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#ffffff',
  },
  upiBadge: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: '6px 14px',
    borderRadius: '16px',
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
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '22px',
    fontWeight: '600',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-display)',
  },
  actionButtonsRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
  },
  investBtn: {
    flex: 1,
    height: '48px',
    borderRadius: '24px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '700',
    transition: 'all 0.2s ease',
  },
  transferBtn: {
    flex: 1.2,
    height: '48px',
    borderRadius: '24px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '700',
    transition: 'all 0.2s ease',
  }
};

export default TransferKeypad;
