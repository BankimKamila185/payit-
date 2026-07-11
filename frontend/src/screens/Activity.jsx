import React, { useState } from 'react';
import { Search, ArrowDownLeft, ArrowUpRight, AlertCircle, ShieldAlert } from 'lucide-react';
import LogoAvatar from '../components/LogoAvatar';

const Activity = ({ onTransactionSelect, onReportFraud, liveTxns, me }) => {
  const [searchQuery, setSearchQuery] = useState("");

  // REAL transactions from backend -> map to this screen's shape.
  const mapped = (liveTxns || []).map((t) => ({
    id: t.id,
    type: t.sender === me ? 'payment' : 'deposit',
    recipient: (t.sender === me ? t.receiver : t.sender) || 'Unknown',
    amount: Math.round(t.amount),
    date: (t.created_at || '').slice(0, 10),
    status: t.label === 'BLOCK' ? 'blocked' : (t.status || 'success'),
    upiRef: '-', transId: String(t.id), label: t.label, score: t.score,
  }));

  const fallback = [
    { id: 1, type: 'payment', recipient: 'Gopichand Javanajad', amount: 20, date: '25 Jun 26', status: 'success', upiRef: '617871427501', transId: 'PAY27867B1E91953D47D9315D39D8361280' },
    { id: 2, type: 'payment', recipient: 'Gopichand Javanajad', amount: 40, date: '25 Jun 26', status: 'success', upiRef: '617871427502', transId: 'PAY27867B1E91953D47D9315D39D8361281' },
    { id: 3, type: 'payment', recipient: 'Umesh Laxman Lohar', amount: 5, date: '25 Jun 26', status: 'success', upiRef: '617871427503', transId: 'PAY27867B1E91953D47D9315D39D8361282' },
    { id: 4, type: 'payment', recipient: 'Minakshi Thakur', amount: 20, date: '25 Jun 26', status: 'success', upiRef: '617871427504', transId: 'PAY27867B1E91953D47D9315D39D8361283' },
    { id: 5, type: 'payment', recipient: 'The Caternation', amount: 40, date: '24 Jun 26', status: 'success', upiRef: '617871427505', transId: 'PAY27867B1E91953D47D9315D39D8361284' },
    { id: 6, type: 'payment', recipient: 'Satyam Fast Foods', amount: 60, date: '24 Jun 26', status: 'success', upiRef: '617871427506', transId: 'PAY27867B1E91953D47D9315D39D8361285' },
    { id: 7, type: 'payment', recipient: 'Alpesh Nagjibhai Ghoghari', amount: 40, date: '24 Jun 26', status: 'success', upiRef: '617871427507', transId: 'PAY27867B1E91953D47D9315D39D8361286' },
    { id: 8, type: 'repayment', recipient: 'Repayment', amount: 10, date: '23 Jun 26', status: 'success', upiRef: '617871427508', transId: 'PAY27867B1E91953D47D9315D39D8361287' },
    { id: 9, type: 'repayment', recipient: 'Repayment', amount: 160, date: '22 Jun 26', status: 'failed', upiRef: '617871427509', transId: 'PAY27867B1E91953D47D9315D39D8361288' },
    { id: 10, type: 'repayment', recipient: 'Repayment', amount: 160, date: '22 Jun 26', status: 'success', upiRef: '617871427510', transId: 'PAY27867B1E91953D47D9315D39D8361289' },
    { id: 11, type: 'deposit', recipient: 'Money added', amount: 180, date: '22 Jun 26', status: 'success', upiRef: '617871427511', transId: 'PAY27867B1E91953D47D9315D39D8361290' },
    { id: 12, type: 'payment', recipient: 'Arvind Krishna Kumar Gupta', amount: 20, date: '22 Jun 26', status: 'success', upiRef: '617871427512', transId: 'PAY27867B1E91953D47D9315D39D8361291' }
  ];

  // Logged in => ALWAYS show this user's real data (even if empty -> empty state).
  // Never show the sample feed to a real user. Sample only if not logged in.
  const transactions = me ? mapped : fallback;

  const filteredTransactions = transactions.filter(t =>
    t.recipient.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name) => {
    if (name === "Money added" || name === "Repayment") return "";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getIcon = (item) => {
    if (item.recipient === "Money added") {
      return <ArrowDownLeft size={16} color="var(--accent-neon)" />;
    }
    if (item.recipient === "Repayment") {
      return <ArrowUpRight size={16} color="var(--accent-pink)" />;
    }
    return <span style={styles.initialsText}>{getInitials(item.recipient)}</span>;
  };

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Search Input Bar */}
      <div style={styles.searchBar}>
        <Search size={16} color="var(--text-secondary)" style={{ marginRight: 10 }} />
        <input 
          type="text" 
          placeholder="Search transactions" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput} 
        />
      </div>

      {/* Transaction List */}
      <div style={styles.listWrapper}>
        {filteredTransactions.length === 0 ? (
          <div style={styles.emptyState}>
            <AlertCircle size={24} color="var(--text-muted)" />
            <p style={{ marginTop: 8, color: 'var(--text-secondary)' }}>No transactions found</p>
          </div>
        ) : (
          filteredTransactions.map((tx) => (
            <div 
              key={tx.id} 
              onClick={() => onTransactionSelect && onTransactionSelect(tx)}
              style={styles.txRow}
            >
              <div style={styles.txLeft}>
                {tx.recipient === 'Money added' ? (
                  <div style={{ ...styles.avatarBox, backgroundColor: 'rgba(34, 230, 123, 0.08)' }}>
                    <ArrowDownLeft size={16} color="var(--accent-neon)" />
                  </div>
                ) : tx.recipient === 'Repayment' ? (
                  <div style={{ ...styles.avatarBox, backgroundColor: 'rgba(235, 59, 136, 0.08)' }}>
                    <ArrowUpRight size={16} color="var(--accent-pink)" />
                  </div>
                ) : (
                  <LogoAvatar name={tx.recipient} size={40} style={{ borderRadius: '50%' }} />
                )}
                <div style={styles.txInfo}>
                  <span style={styles.txRecipient}>{tx.recipient}</span>
                  <span style={styles.txDate}>{tx.date}</span>
                </div>
              </div>

              <div style={styles.txRight}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span 
                    style={{
                      ...styles.txAmount,
                      color: tx.status === 'failed' 
                        ? 'var(--text-muted)' 
                        : tx.type === 'deposit' 
                        ? 'var(--accent-neon)' 
                        : '#ffffff'
                    }}
                  >
                    {tx.type === 'deposit' ? '+' : ''}₹{tx.amount}
                  </span>
                  
                  {tx.type === 'payment' && tx.status === 'success' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onReportFraud) onReportFraud(tx);
                      }}
                      style={styles.reportTextLink}
                      title="Report suspicious transfer"
                    >
                      <ShieldAlert size={14} color="var(--accent-pink)" />
                    </button>
                  )}
                </div>
                
                {tx.status === 'failed' && (
                  <span style={styles.failedBadge}>Failed</span>
                )}
                {tx.recipient === "Repayment" && tx.status === 'success' && (
                  <span style={styles.repaymentBadge}>Repayment</span>
                )}
              </div>
            </div>
          ))
        )}
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
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    padding: '10px 16px',
    border: '1px solid var(--border-color)',
  },
  searchInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: '14px',
  },
  listWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  txRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: 'var(--surface-hover)',
    }
  },
  txLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatarBox: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.03)',
  },
  initialsText: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.3px',
  },
  txInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  txRecipient: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
  },
  txDate: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  txRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '3px',
  },
  txAmount: {
    fontSize: '15px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
  },
  failedBadge: {
    fontSize: '9px',
    fontWeight: '700',
    color: '#ff3333',
    backgroundColor: 'rgba(255, 51, 51, 0.08)',
    padding: '1px 5px',
    borderRadius: '4px',
    border: '1px solid rgba(255, 51, 51, 0.15)',
  },
  repaymentBadge: {
    fontSize: '9px',
    fontWeight: '700',
    color: 'var(--accent-pink)',
    backgroundColor: 'rgba(235, 59, 136, 0.08)',
    padding: '1px 5px',
    borderRadius: '4px',
    border: '1px solid rgba(235, 59, 136, 0.15)',
  },
  reportTextLink: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    transition: 'background-color 0.2s',
    '&:hover': {
      backgroundColor: 'rgba(255,255,255,0.05)',
    }
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
  }
};

export default Activity;
