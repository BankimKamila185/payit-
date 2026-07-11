import React, { useState } from 'react';
import { 
  Lock,
  Unlock,
  RotateCw,
  Tv,
  Wifi,
  Zap
} from 'lucide-react';
import LogoAvatar from '../components/LogoAvatar';

const Banking = ({
  onAddMoney,
  onSendToContact,
  onCheckBalance,
  onFixedDepositClick,
  onMascotClick,
  liveTxns = [],
  me = "",
  balance = 0,
  userName = ""
}) => {
  const savingsBalance = Number(balance) || 0;          // REAL logged-in balance
  const holderName = (userName || 'Account Holder').toUpperCase();
  const moniesPoints = 3902;

  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showCvv, setShowCvv] = useState(false);

  const cards = [
    {
      id: 'savings',
      title: 'Savings Account',
      themeClass: 'theme-savings',
      balanceLabel: 'Savings Balance',
      balanceValue: `₹${savingsBalance.toLocaleString('en-IN')}`,
      subText: '',
      number: '4532 5069 8214 5069',
      holder: holderName,
      expiry: '08/31',
      network: 'RU PAY',
      cvv: '235'
    },
    {
      id: 'credit',
      title: 'payit credit',
      themeClass: 'theme-credit',
      balanceLabel: 'Available Limit',
      balanceValue: '₹99,686',
      subText: 'Spends this month: ₹314',
      number: '4129 8251 3065 1983',
      holder: holderName,
      expiry: '12/30',
      network: 'VISA',
      cvv: '512'
    },
    {
      id: 'rewards',
      title: 'monies Rewards',
      themeClass: 'theme-rewards',
      balanceLabel: 'monies Balance',
      balanceValue: moniesPoints.toLocaleString('en-IN'),
      subText: 'Reward rate at 1%',
      number: '8831 9253 4012 3902',
      holder: holderName,
      expiry: '05/35',
      network: 'RU PAY',
      cvv: '908'
    }
  ];

  // "Quick Send" people are built from the user's REAL transaction history
  // (unique counterparties, most-recent first) — not a hardcoded list. Tapping
  // one pays that exact VPA. Falls back to a sample only if history is empty.
  const GRADIENTS = [
    'linear-gradient(135deg, #eb3b88 0%, #aa33ff 100%)',
    'linear-gradient(135deg, #aa33ff 0%, #0088ff 100%)',
    'linear-gradient(135deg, #0088ff 0%, #22e67b 100%)',
    'linear-gradient(135deg, #22e67b 0%, #ff8c00 100%)',
    'linear-gradient(135deg, #ff8c00 0%, #eb3b88 100%)'
  ];
  const prettyName = (vpa) => {
    const local = (vpa || '').split('@')[0].replace(/[._0-9]+/g, ' ').trim();
    if (!local) return vpa || 'Unknown';
    return local.split(' ').filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
  };
  const initialsOf = (name) => {
    const p = name.split(' ').filter(Boolean);
    return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase()
      || name.slice(0, 2).toUpperCase();
  };

  const derived = [];
  const seen = new Set();
  for (const t of (liveTxns || [])) {
    const other = t.sender === me ? t.receiver : t.sender;   // the counterparty
    if (!other || other === me || seen.has(other)) continue;
    seen.add(other);
    const name = prettyName(other);
    derived.push({
      name, vpa: other, initials: initialsOf(name),
      bgGradient: GRADIENTS[derived.length % GRADIENTS.length]
    });
    if (derived.length >= 8) break;
  }

  const fallbackContacts = [
    { name: 'Gopichand Javanajad', initials: 'GJ', bgGradient: GRADIENTS[0] },
    { name: 'Amit Patel', initials: 'AP', bgGradient: GRADIENTS[1] },
    { name: 'Priya Nair', initials: 'PN', bgGradient: GRADIENTS[2] },
    { name: 'Rahul Sharma', initials: 'RS', bgGradient: GRADIENTS[3] },
    { name: 'Sneha Gupta', initials: 'SG', bgGradient: GRADIENTS[4] }
  ];

  // Logged in => only real counterparties (may be empty). Sample only if not logged in.
  const contacts = me ? derived : fallbackContacts;

  const bills = [
    { id: 'netflix', name: 'Netflix', amount: 199, dueText: 'Due in 2 days', status: 'soon', icon: <Tv size={18} color="var(--accent-pink)" /> },
    { id: 'airtel', name: 'Airtel Broadband', amount: 799, dueText: 'Due in 5 days', status: 'soon', icon: <Wifi size={18} color="var(--accent-blue)" /> },
    { id: 'bescom', name: 'BESCOM Electricity', amount: 1450, dueText: 'Overdue by 1 day', status: 'overdue', icon: <Zap size={18} color="var(--accent-neon)" /> }
  ];

  const handleCardClick = (index, rank, e) => {
    // If user clicks interactive buttons (like CVV reveal), do not flip/change stack
    if (e.target.closest('button') || e.target.closest('a')) {
      return;
    }
    if (rank !== 0) {
      setActiveCardIndex(index);
      setIsFlipped(false);
      setShowCvv(false);
    } else {
      setIsFlipped(!isFlipped);
    }
  };

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* 3D Stacked Virtual Card Section */}
      <div className="virtual-card-stack-wrapper">
        {cards.map((card, index) => {
          // Compute rank: active card is rank 0, next is rank 1, previous is rank 2
          const rank = (index - activeCardIndex + 3) % 3;
          
          return (
            <div 
              key={card.id}
              onClick={(e) => handleCardClick(index, rank, e)}
              className={`virtual-card-perspective stack-rank-${rank}`}
            >
              <div className={`virtual-card-inner ${rank === 0 && isFlipped ? 'is-flipped' : ''}`}>
                {/* Card Front */}
                <div className={`virtual-card-front ${card.themeClass}`}>
                  {rank === 0 && isLocked && (
                    <div className="card-lock-overlay">
                      <Lock size={26} color="var(--accent-pink)" />
                      <span className="card-lock-text">Card Blocked</span>
                      <span className="card-lock-sub">Unlock to resume payments</span>
                    </div>
                  )}
                  
                  <div className="card-header-row">
                    <span className="card-brand-logo">
                      payit<span className="card-brand-pink">.</span>
                    </span>
                    <span className="card-type-label">{card.title}</span>
                  </div>

                  <div className="card-middle-row" style={{ marginTop: 4 }}>
                    <div className="card-chip"></div>
                    <div className="card-contactless">
                      <div className="card-contactless-wave" style={{ height: 10 }}></div>
                      <div className="card-contactless-wave" style={{ height: 14 }}></div>
                      <div className="card-contactless-wave" style={{ height: 18 }}></div>
                    </div>
                  </div>

                  <div className="card-balance-display">
                    <span className="card-balance-label">{card.balanceLabel}</span>
                    <h2 className="card-balance-value">{card.balanceValue}</h2>
                    {card.subText && (
                      <span className="interestSub" style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                        {card.subText}
                      </span>
                    )}
                  </div>

                  <div className="card-bottom-row">
                    <div className="card-holder-info">
                      <span className="card-holder-title">Card Holder</span>
                      <span className="card-holder-name">{card.holder}</span>
                    </div>
                    <div className="card-expiry-info">
                      <span className="card-expiry-title">Expires</span>
                      <span className="card-expiry-date">{card.expiry}</span>
                    </div>
                  </div>
                </div>

                {/* Card Back */}
                <div className="virtual-card-back">
                  {rank === 0 && isLocked && (
                    <div className="card-lock-overlay">
                      <Lock size={26} color="var(--accent-pink)" />
                      <span className="card-lock-text">Card Blocked</span>
                      <span className="card-lock-sub">Unlock to resume payments</span>
                    </div>
                  )}
                  <div className="card-magnetic-strip"></div>
                  
                  <div className="card-back-details">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="card-holder-title" style={{ paddingLeft: 20 }}>CVV / Security Code</span>
                      <div className="card-signature-area">
                        <div className="card-signature-strip"></div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (rank === 0) setShowCvv(!showCvv);
                          }}
                          className="card-cvv-box"
                          style={{ border: 'none', cursor: rank === 0 ? 'pointer' : 'default' }}
                        >
                          {rank === 0 && showCvv ? card.cvv : '•••'}
                        </button>
                      </div>
                    </div>

                    <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span className="card-holder-title" style={{ display: 'block' }}>Card Number</span>
                        <span style={{ fontSize: 13, fontWeight: '600', fontFamily: 'var(--font-display)', color: '#fff', letterSpacing: 1.5 }}>
                          {card.number}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span className="card-holder-title">Network</span>
                        <span style={{ fontSize: 10, fontWeight: '700', color: 'var(--accent-neon)' }}>{card.network}</span>
                      </div>
                    </div>
                  </div>

                  <p className="card-back-text">
                    This card is digital property of payit. For support, access your payit app or visit support@payit.com. Do not share CVV/PIN with anyone.
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Card Controls */}
      <div className="card-controls-container">
        <button 
          onClick={() => setIsFlipped(!isFlipped)} 
          className="card-control-btn"
        >
          <RotateCw size={12} />
          {isFlipped ? "Show Front" : "Flip Card"}
        </button>
        <button 
          onClick={() => setIsLocked(!isLocked)} 
          className={`card-control-btn ${isLocked ? 'active' : ''}`}
        >
          {isLocked ? <Unlock size={12} /> : <Lock size={12} />}
          {isLocked ? "Unlock Card" : "Lock Card"}
        </button>
      </div>

      {/* Card Actions (Dynamic based on active card) */}
      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
        {activeCardIndex === 0 ? (
          <>
            <button 
              onClick={onCheckBalance} 
              disabled={isLocked}
              style={{ 
                ...styles.checkBalanceBtn, 
                flex: 1, 
                opacity: isLocked ? 0.4 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                height: '44px',
                backgroundColor: '#1c1c1f',
                border: '1px solid #232326',
                borderRadius: '16px',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '13px'
              }}
            >
              Check balance
            </button>
            <button 
              onClick={onAddMoney} 
              disabled={isLocked}
              style={{ 
                ...styles.addMoneyBtn, 
                flex: 1,
                opacity: isLocked ? 0.4 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                marginTop: 0
              }}
            >
              Add money
            </button>
          </>
        ) : activeCardIndex === 1 ? (
          <>
            <button 
              onClick={() => onAddMoney()} 
              disabled={isLocked}
              style={{ 
                ...styles.checkBalanceBtn, 
                flex: 1, 
                opacity: isLocked ? 0.4 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                height: '44px',
                backgroundColor: '#1c1c1f',
                border: '1px solid #232326',
                borderRadius: '16px',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '13px'
              }}
            >
              Repay bill
            </button>
            <button 
              onClick={onCheckBalance} 
              disabled={isLocked}
              style={{ 
                ...styles.addMoneyBtn, 
                flex: 1,
                opacity: isLocked ? 0.4 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                marginTop: 0,
                backgroundColor: 'var(--accent-purple)'
              }}
            >
              Card settings
            </button>
          </>
        ) : (
          <>
            <button 
              onClick={onFixedDepositClick} 
              disabled={isLocked}
              style={{ 
                ...styles.checkBalanceBtn, 
                flex: 1, 
                opacity: isLocked ? 0.4 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                height: '44px',
                backgroundColor: '#1c1c1f',
                border: '1px solid #232326',
                borderRadius: '16px',
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '13px'
              }}
            >
              Redeem points
            </button>
            <button 
              onClick={onMascotClick} 
              disabled={isLocked}
              style={{ 
                ...styles.addMoneyBtn, 
                flex: 1,
                opacity: isLocked ? 0.4 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                marginTop: 0,
                backgroundColor: 'var(--accent-neon)',
                color: '#000000'
              }}
            >
              Play & Win
            </button>
          </>
        )}
      </div>

      {/* Quick Send Section */}
      <div className="quick-send-section">
        <h3 className="quick-send-title">Quick Send</h3>
        
        <div className="quick-send-carousel">
          {/* Add New Contact Button */}
          <div className="quick-send-item">
            <button 
              onClick={() => onAddMoney()} 
              disabled={isLocked}
              className="quick-send-avatar-add"
              style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}
            >
              +
            </button>
            <span className="quick-send-name">Add New</span>
          </div>

          {/* Frequent Contacts */}
          {contacts.map((contact, idx) => (
            <div key={idx} className="quick-send-item">
              <button
                onClick={() => contact.vpa
                  ? onSendToContact(contact.name, contact.vpa)
                  : onAddMoney(contact.name)}
                disabled={isLocked}
                className="quick-send-avatar"
                style={{ 
                  background: contact.bgGradient,
                  cursor: isLocked ? 'not-allowed' : 'pointer'
                }}
              >
                {contact.initials}
              </button>
              <span className="quick-send-name">{contact.name.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bill Reminders Section */}
      <div className="bill-reminders-section">
        <h3 className="bill-reminders-title">Upcoming Bills</h3>
        
        <div className="bill-reminders-list">
          {bills.map((bill) => (
            <div key={bill.id} className="bill-reminder-row">
              <div className="bill-row-left">
                <LogoAvatar name={bill.name} size={38} style={{ borderRadius: '10px' }} />
                <div className="bill-info">
                  <span className="bill-name">{bill.name}</span>
                  <div className="bill-status-indicator">
                    <span className={`bill-status-dot dot-${bill.status}`}></span>
                    <span className="bill-due-text">{bill.dueText}</span>
                  </div>
                </div>
              </div>

              <div className="bill-row-right">
                <span className="bill-amount">₹{bill.amount}</span>
                <button 
                  onClick={() => onAddMoney(bill.name, bill.amount)}
                  disabled={isLocked}
                  className="bill-pay-btn"
                  style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}
                >
                  Pay
                </button>
              </div>
            </div>
          ))}
        </div>
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
  balanceCard: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '24px',
    padding: '20px',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  savingsLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    fontWeight: '600',
  },
  savingsAmount: {
    fontSize: '32px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
    color: '#ffffff',
  },
  interestSub: {
    fontSize: '10px',
    color: 'var(--accent-neon)',
    fontWeight: '600',
    marginTop: '4px',
  },
  checkBalanceBtn: {
    backgroundColor: '#1c1c1f',
    border: '1px solid #232326',
    borderRadius: '12px',
    color: '#ffffff',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  addMoneyBtn: {
    backgroundColor: 'var(--accent-pink)',
    border: 'none',
    borderRadius: '16px',
    height: '44px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'transform 0.1s ease',
    '&:active': {
      transform: 'scale(0.98)',
    }
  },
  atomCard: {
    backgroundColor: '#120b18', // Deep violet hue background
    borderRadius: '20px',
    padding: '18px',
    border: '1px solid rgba(170, 51, 255, 0.15)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    height: '140px',
  },
  atomLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    zIndex: 2,
  },
  atomTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  atomLogo: {
    fontSize: '16px',
    fontWeight: '800',
    color: '#ffffff',
    fontStyle: 'italic',
  },
  atomTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--accent-pink)',
  },
  liveBadge: {
    fontSize: '8px',
    fontWeight: '800',
    backgroundColor: 'var(--accent-neon)',
    color: '#000000',
    padding: '1px 4px',
    borderRadius: '4px',
    marginLeft: '4px',
  },
  atomSub: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    marginBottom: '8px',
  },
  letsGoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'var(--accent-pink)',
    border: 'none',
    borderRadius: '12px',
    color: '#ffffff',
    padding: '6px 16px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  atomRight: {
    width: '100px',
    height: '100px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  orbitContainer: {
    width: '64px',
    height: '64px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nucleus: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-pink)',
    boxShadow: '0 0 10px var(--accent-pink)',
  },
  orbitOne: {
    width: '60px',
    height: '24px',
    borderRadius: '50%',
    border: '1px solid rgba(170, 51, 255, 0.4)',
    position: 'absolute',
    transform: 'rotate(45deg)',
  },
  orbitTwo: {
    width: '60px',
    height: '24px',
    borderRadius: '50%',
    border: '1px solid rgba(170, 51, 255, 0.4)',
    position: 'absolute',
    transform: 'rotate(-45deg)',
  },
  electronOne: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-neon)',
    position: 'absolute',
    top: '16px',
    left: '8px',
  },
  electronTwo: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#0088ff',
    position: 'absolute',
    bottom: '16px',
    right: '8px',
  },
  fdCard: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
  },
  cardRowBetween: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fdLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  fdIconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'rgba(34, 230, 123, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fdTexts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  fdTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
  },
  fdSub: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  fdInterest: {
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
  fdRight: {
    display: 'flex',
    alignItems: 'center',
  },
  fdAmount: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'var(--font-display)',
  },
  moniesCard: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
  },
  moniesLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  moniesIconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: 'rgba(235, 59, 136, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moniesTexts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  moniesTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
  },
  moniesSub: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  moniesRight: {
    display: 'flex',
    alignItems: 'center',
  },
  moniesAmount: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'var(--font-display)',
  },
  mascotWidget: {
    backgroundColor: '#0a101d',
    border: '1px solid rgba(0, 136, 255, 0.1)',
    borderRadius: '16px',
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
  },
  mascotTexts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  widgetTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#ffffff',
  },
  widgetSub: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  widgetMascot: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotBody: {
    width: '28px',
    height: '28px',
    backgroundColor: 'var(--accent-pink)',
    borderRadius: '8px',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyes: {
    display: 'flex',
    gap: '4px',
    marginBottom: '2px',
  },
  eye: {
    width: '3px',
    height: '3px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
  },
  smile: {
    width: '8px',
    height: '3px',
    borderBottom: '1.5px solid #ffffff',
    borderRadius: '0 0 4px 4px',
  }
};

export default Banking;
