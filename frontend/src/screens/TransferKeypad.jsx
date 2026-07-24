import React, { useState, useEffect } from 'react';
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
  onChangePayee,
  balance = 14580,
  ccSpends = 314,
  initialSource = "bank"
}) => {
  const [amount, setAmount] = useState(prefilledAmount ? prefilledAmount.toString() : "");
  const [paymentSource, setPaymentSource] = useState(initialSource); // 'bank' | 'credit'

  useEffect(() => {
    setAmount(prefilledAmount ? prefilledAmount.toString() : "");
  }, [prefilledAmount]);

  useEffect(() => {
    setPaymentSource(initialSource);
  }, [initialSource]);

  const handleKeyPress = (val) => {
    if (amount === "" && val === "0") return;
    if (val === "." && amount.includes(".")) return;
    // Limit decimal precision to 2 digits
    if (amount.includes(".") && val !== ".") {
      const decimals = amount.split(".")[1];
      if (decimals && decimals.length >= 2) return;
    }
    const nextStr = amount + val;
    const num = parseFloat(nextStr);
    if (!isNaN(num) && num > 100000) return; // NPCI single transaction limit ₹1,00,000
    if (amount.replace(".", "").length < 7) {
      setAmount(nextStr);
    }
  };

  const handleDelete = () => {
    setAmount(prev => prev.slice(0, -1));
  };

  const handleTransfer = () => {
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0 || isNaN(numericAmount)) return;
    const cleanAmt = parseFloat(numericAmount.toFixed(2));
    setAmount("");
    onTransferSuccess(cleanAmt, paymentSource);
  };

  const handleInvest = () => {
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0 || isNaN(numericAmount)) return;
    const cleanAmt = parseFloat(numericAmount.toFixed(2));
    setAmount("");
    onInvestSuccess(cleanAmt);
  };

  // NOTE: Fraud/scam risk is NOT decided here. This screen must never show a
  // client-side "safe" or "scam" claim — a name-keyword guess is not detection.
  // The real verdict (SAFE / REVIEW / BLOCK) comes from the backend at /pay.

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
            <MessageCircle size={18} color="var(--text-primary)" />
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
                background: 'linear-gradient(135deg, #aa33ff 0%, #0088ff 100%)',
                borderColor: 'var(--border-color)'
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

        {/* Payment Source Selector (Bank Account vs Credit Card) */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 12, marginBottom: 8,
          background: 'rgba(255, 255, 255, 0.04)', padding: 4, borderRadius: 14,
          border: '1px solid var(--border-color)'
        }}>
          <button
            type="button"
            onClick={() => setPaymentSource('bank')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 10, border: 'none',
              background: paymentSource === 'bank' ? 'var(--surface-hover)' : 'transparent',
              color: paymentSource === 'bank' ? 'var(--accent-neon)' : 'var(--text-secondary)',
              fontWeight: paymentSource === 'bank' ? '700' : '500',
              fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.2s'
            }}
          >
            🏦 Bank (₹{Number(balance).toLocaleString('en-IN')})
          </button>
          <button
            type="button"
            onClick={() => setPaymentSource('credit')}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 10,
              border: paymentSource === 'credit' ? '1px solid rgba(235, 59, 136, 0.5)' : 'none',
              background: paymentSource === 'credit' ? 'rgba(235, 59, 136, 0.15)' : 'transparent',
              color: paymentSource === 'credit' ? '#eb3b88' : 'var(--text-secondary)',
              fontWeight: paymentSource === 'credit' ? '700' : '500',
              fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.2s'
            }}
          >
            💳 payit Credit (₹{Math.max(0, 100000 - Number(ccSpends)).toLocaleString('en-IN')})
          </button>
        </div>

        {/* Selected source badge */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: '600' }}>
            Paying via: {paymentSource === 'credit' ? '💳 payit Credit Card (0% interest for 45 days)' : '🏦 Bank Account (UPI Direct)'}
          </span>
        </div>

        {/* Action Buttons matching the reference image styling */}
        <div style={styles.actionButtonsRow}>
          <button 
            onClick={handleTransfer}
            disabled={!amount || parseFloat(amount) <= 0}
            style={{
              ...styles.transferBtn,
              backgroundColor: amount && parseFloat(amount) > 0 
                ? (paymentSource === 'credit' ? '#eb3b88' : 'var(--accent-neon)') 
                : 'rgba(255, 255, 255, 0.05)',
              color: amount && parseFloat(amount) > 0 ? '#000000' : 'var(--text-secondary)',
              cursor: amount && parseFloat(amount) > 0 ? 'pointer' : 'default',
              flex: 1
            }}
          >
            {paymentSource === 'credit' ? 'Pay with Credit Card' : 'Transfer'}
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
    backgroundColor: 'var(--bg-color)',
  },
  topHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
  },
  checkBalanceBtn: {
    backgroundColor: 'transparent',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    color: 'var(--text-primary)',
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
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  profileBox: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    backgroundColor: 'var(--surface-hover)',
    border: '1px solid var(--border-color)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    color: 'var(--text-primary)',
    fontWeight: '700',
    fontSize: '13px',
  },
  recipientHeaderCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
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
    color: 'var(--text-primary)',
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
    color: 'var(--text-secondary)',
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
    color: 'var(--text-primary)',
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
    backgroundColor: 'var(--surface-hover)',
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  upiBadge: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--surface-hover)',
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
    color: 'var(--text-primary)',
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
