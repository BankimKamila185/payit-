import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  MapPin, 
  ChevronDown, 
  ChevronUp, 
  Share2, 
  Copy, 
  Map, 
  HelpCircle,
  AlertTriangle,
  Clock,
  RotateCcw,
  ShieldAlert
} from 'lucide-react';

const PaidSuccess = ({ 
  onPayAgain, 
  transactionDetails = {}, 
  onRecallTransaction,
  onReportFraud
}) => {
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  
  const recipientName = transactionDetails.recipient || "Gopichand Javanajad";
  const amount = transactionDetails.amount || 20;
  const date = transactionDetails.date || "25 Jun, 11:54 AM";
  const upiRef = transactionDetails.upiRef || "617871427501";
  const transId = transactionDetails.transId || "PAY27867B1E91953D47D9315D39D8361280";
  const status = transactionDetails.status || "success"; // 'success', 'cooling_off', 'recalled'
  const timeLeft = transactionDetails.timeLeft !== undefined ? transactionDetails.timeLeft : 0;

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Top Margin Spacer */}
      <div style={styles.topBar}>
        <span style={{ 
          color: status === 'cooling_off' ? '#ff8c00' : status === 'recalled' ? 'var(--accent-pink)' : 'var(--text-primary)', 
          fontWeight: '700',
          textTransform: 'uppercase',
          fontSize: '11px',
          letterSpacing: '0.5px'
        }}>
          {status === 'cooling_off' ? 'Pending Settlement' : status === 'recalled' ? 'Transaction Recalled' : 'Success'}
        </span>
        <button style={styles.iconButton} aria-label="Share">
          <Share2 size={18} color="var(--text-primary)" />
        </button>
      </div>

      {/* Success/Pending/Recalled status header */}
      {status === 'cooling_off' ? (
        <div style={styles.pendingWrapper}>
          <div style={styles.pendingPulse}>
            <Clock size={64} color="#ff8c00" className="animate-pulse" />
          </div>
          <h2 style={{ ...styles.amountText, color: '#ff8c00' }}>Holding ₹{amount}</h2>
          <p style={styles.recipientSub}>To {recipientName}</p>
          <p style={styles.pendingBannerText}>
            Approval Window Active: Holding for {timeLeft}s to prevent fraud.
          </p>

          <div style={styles.pendingActions}>
            <button 
              onClick={() => onRecallTransaction && onRecallTransaction(transactionDetails.id || transId)}
              style={styles.recallBtnBig}
            >
              <RotateCcw size={16} style={{ marginRight: 6 }} />
              Recall & Cancel Payment
            </button>
          </div>
        </div>
      ) : status === 'flagged' ? (
        <div style={styles.pendingWrapper}>
          <div style={styles.pendingPulse}>
            <Clock size={64} color="#ff8c00" className="animate-pulse" />
          </div>
          <h2 style={{ ...styles.amountText, color: '#ff8c00' }}>Paid ₹{amount}</h2>
          <p style={styles.recipientSub}>To {recipientName}</p>
          <p style={{ 
            ...styles.pendingBannerText, 
            color: (transactionDetails.score || 0) >= 35 ? 'var(--accent-pink)' : '#ff8c00', 
            fontSize: '13px', 
            fontWeight: 'bold', 
            maxWidth: '300px', 
            margin: '12px auto' 
          }}>
            {(transactionDetails.score || 0) >= 35 
              ? `⚠️ Security Alert: Payment flagged by Fraud Shield. If confirmed fraudulent, ₹${amount} will be refunded automatically within 60 seconds.`
              : `⚠️ Security Hold: New recipient detected. For your safety, ₹${amount} is in cooling-off window (settles in 60s). Instant Recall available.`}
          </p>
          <div style={styles.pendingActions}>
            <button
              onClick={() => onRecallTransaction && onRecallTransaction(transactionDetails.txId || transId)}
              style={styles.recallBtnBig}
            >
              <RotateCcw size={16} style={{ marginRight: 6 }} />
              Recall payment — get ₹{amount} back
            </button>
          </div>

          {/* Dispute Raised / Settlement Hold Widget */}
          <div style={{
            marginTop: '20px',
            backgroundColor: 'var(--surface-color)',
            border: (transactionDetails.score || 0) >= 35 
              ? '1px solid rgba(235, 59, 136, 0.2)' 
              : '1px solid rgba(255, 140, 0, 0.2)',
            borderRadius: '16px',
            padding: '16px',
            width: '100%',
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <ShieldAlert size={18} color={(transactionDetails.score || 0) >= 35 ? "var(--accent-pink)" : "#ff8c00"} />
              <span style={{ 
                fontSize: '12px', 
                fontWeight: '800', 
                color: (transactionDetails.score || 0) >= 35 ? 'var(--accent-pink)' : '#ff8c00', 
                letterSpacing: '0.5px', 
                textTransform: 'uppercase' 
              }}>
                {(transactionDetails.score || 0) >= 35 ? "Dispute raised → Bank/NPCI" : "Safety cooling-off active"}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace', lineHeight: '1.4' }}>
              <div>• <strong>Transaction ID:</strong> {transactionDetails.id || `TX-${transId}`}</div>
              <div>• <strong>Amount:</strong> ₹{amount}, <strong>Receiver:</strong> {transactionDetails.recipientVpa || '—'}</div>
              <div>• <strong>Fraud score:</strong> {transactionDetails.score ?? '—'}/100</div>
              <div>
                • <strong>WHY flagged:</strong> "
                {transactionDetails.reasons && transactionDetails.reasons.length > 0
                  ? transactionDetails.reasons.join(' + ')
                  : "—"}
                "
              </div>
            </div>
            <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '10px', color: '#22e67b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🔄</span>
              <span>
                {(transactionDetails.score || 0) >= 35
                  ? "Recall available → files a reversal REQUEST to the bank; the bank adjudicates (no automatic clawback)."
                  : "Payment settled to recipient."}
              </span>
            </div>
          </div>
        </div>
      ) : status === 'recalled' ? (
        <div style={styles.recalledWrapper}>
          <div style={styles.recalledPulse}>
            <ShieldAlert size={64} color="var(--accent-pink)" />
          </div>
          <h2 style={{ ...styles.amountText, color: 'var(--accent-pink)' }}>Cancelled ₹{amount}</h2>
          <p style={styles.recipientSub}>To {recipientName}</p>
          <p style={styles.recalledBannerText}>
            Payment recalled successfully. Funds restored to Savings Account.
          </p>
          <button onClick={onPayAgain} style={{ ...styles.payAgainBtn, borderColor: 'var(--accent-pink)', color: 'var(--accent-pink)' }}>
            Retry transfer
          </button>
        </div>
      ) : status === 'blocked' ? (
        <div style={styles.blockedWrapper}>
          <div style={styles.blockedPulse}>
            <ShieldAlert size={64} color="var(--accent-pink)" />
          </div>
          <h2 style={{ ...styles.amountText, color: 'var(--accent-pink)' }}>Blocked ₹{amount}</h2>
          <p style={styles.recipientSub}>To {recipientName}</p>
          <p style={styles.blockedBannerText}>
            This payment was blocked by Fraud Shield. Money was not deducted from your account.
          </p>
          
          {/* Mule Chain visualizer */}
          <div style={styles.muleGraphBox}>
            <span style={styles.graphTitle}>AI INTERCEPT: MULE CHAIN DETECTED</span>
            <div style={styles.muleChainRow}>
              {/* Node 1: You */}
              <div style={styles.muleNode}>
                <div style={styles.nodeIconBox}>👤</div>
                <span style={styles.nodeLabel}>You</span>
                <span style={styles.nodeSub}>Sender</span>
              </div>

              {/* Link 1 */}
              <div style={styles.muleArrowCol}>
                <span style={{ color: 'var(--accent-pink)', fontSize: '8px', fontWeight: '700' }}>₹{amount}</span>
                <div style={styles.muleLinePink}></div>
                <span style={{ color: 'var(--accent-pink)', fontSize: '8px', fontWeight: '700' }}>BLOCKED</span>
              </div>

              {/* Node 2: Target (Mule) */}
              <div style={{ ...styles.muleNode, borderColor: 'var(--accent-pink)', backgroundColor: 'rgba(235,59,136,0.05)' }}>
                <div style={{ ...styles.nodeIconBox, backgroundColor: 'rgba(235,59,136,0.1)' }}>🔴</div>
                <span style={{ ...styles.nodeLabel, color: 'var(--accent-pink)' }}>Recipient</span>
                <span style={styles.nodeSub}>{recipientName}</span>
              </div>

              {/* Link 2 */}
              <div style={styles.muleArrowCol}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '8px' }}>Auto-Forward</span>
                <div style={styles.muleLineDashed}></div>
                <span style={{ color: 'var(--accent-pink)', fontSize: '8px', fontWeight: '700' }}>INTERCEPTED</span>
              </div>

              {/* Node 3: Cashout */}
              <div style={{ ...styles.muleNode, opacity: 0.5 }}>
                <div style={styles.nodeIconBox}>💰</div>
                <span style={styles.nodeLabel}>Cashout Wallet</span>
                <span style={styles.nodeSub}>Mule Terminal</span>
              </div>
            </div>
            <p style={styles.graphDesc}>
              Our neural network intercepted the transaction because {recipientName} has been identified as a transit point (money mule) forwarding funds to unverified endpoints.
            </p>
          </div>

          <button onClick={onPayAgain} style={{ ...styles.payAgainBtn, borderColor: 'var(--accent-pink)', color: 'var(--accent-pink)', marginTop: 16 }}>
            Back to Payments
          </button>
        </div>
      ) : (
        <div style={styles.successWrapper}>
          <div style={styles.checkmarkPulse}>
            <CheckCircle2 size={64} color="#22e67b" style={styles.checkmarkIcon} />
          </div>
          <h2 style={styles.amountText}>Paid ₹{amount}</h2>
          <p style={styles.recipientSub}>To {recipientName}</p>
          <p style={styles.dateSub}>{date}</p>
          
          <button onClick={onPayAgain} style={styles.payAgainBtn}>
            Pay again
          </button>
        </div>
      )}

      {/* Notes / Tag Box */}
      <div style={styles.card}>
        <div style={styles.cardRow}>
          <span style={styles.noteLabel}>Status:</span>
          <span style={{ 
            ...styles.noteValue, 
            color: status === 'cooling_off' ? '#ff8c00' : status === 'recalled' || status === 'blocked' ? 'var(--accent-pink)' : 'var(--accent-neon)' 
          }}>
            {status === 'cooling_off' ? 'Escrow Cooling-off' : status === 'recalled' ? 'RECALLED & BLOCKED' : status === 'blocked' ? 'AUTO-BLOCKED (FRAUD)' : 'Settled on UPI'}
          </span>
        </div>
        {status === 'success' && (
          <div style={styles.moniesRow}>
            <span style={styles.moniesBadge}>💰 {amount} monies earned</span>
          </div>
        )}
      </div>

      {/* Report Fraud / Scam - Prominent Section */}
      {status !== 'recalled' && (
        <div style={{ ...styles.card, border: '1px solid rgba(235, 59, 136, 0.15)', backgroundColor: 'rgba(235, 59, 136, 0.02)' }}>
          <div style={styles.cardRowBetween}>
            <div style={styles.categoryLeft}>
              <AlertTriangle size={20} color="var(--accent-pink)" />
              <div style={styles.categoryTexts}>
                <span style={{ ...styles.categoryTitle, color: 'var(--accent-pink)' }}>Suspicious of this transfer?</span>
                <span style={styles.categorySub}>Report immediately to freeze recipient's account.</span>
              </div>
            </div>
            <button 
              onClick={() => onReportFraud && onReportFraud(transactionDetails)}
              style={styles.reportFraudBtn}
            >
              Report Fraud
            </button>
          </div>
        </div>
      )}

      {/* Category selector */}
      <div style={styles.card}>
        <div style={styles.cardRowBetween}>
          <div style={styles.categoryLeft}>
            <span style={styles.emojiIcon}>🍔</span>
            <div style={styles.categoryTexts}>
              <span style={styles.categoryTitle}>Food & dining</span>
              <span style={styles.categorySub}>Auto-categorized</span>
            </div>
          </div>
          <button style={styles.editCategoryBtn}>Edit</button>
        </div>
      </div>

      {/* Transaction Details Collapsible */}
      <div style={styles.card}>
        <button 
          onClick={() => setDetailsExpanded(!detailsExpanded)} 
          style={styles.collapsibleHeader}
        >
          <span style={styles.detailsTitle}>Details</span>
          {detailsExpanded ? <ChevronUp size={16} color="#8c8c8e" /> : <ChevronDown size={16} color="#8c8c8e" />}
        </button>

        {detailsExpanded && (
          <div style={styles.detailsContent} className="animate-fade-in">
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>From</span>
              <span style={styles.detailValue}>payit CC (•• 3701)</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>To</span>
              <span style={styles.detailValue}>{recipientName}</span>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>UPI Ref ID</span>
              <div style={styles.copyableValue}>
                <span>{upiRef}</span>
                <Copy size={12} color="#8c8c8e" style={{ marginLeft: 6, cursor: 'pointer' }} />
              </div>
            </div>
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Transaction ID</span>
              <div style={styles.copyableValue}>
                <span style={{ fontSize: '10px' }}>{transId.substring(0, 18)}...</span>
                <Copy size={12} color="#8c8c8e" style={{ marginLeft: 6, cursor: 'pointer' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Styled Mini-Map Preview Widget */}
      <div style={styles.mapCard}>
        <div style={styles.mapOverlay}>
          <div style={styles.mapDetails}>
            <MapPin size={16} color="#ff3388" />
            <span style={styles.mapText}>Gopichand Store, Bangalore</span>
          </div>
          <button style={styles.mapBtn}>
            <Map size={14} style={{ marginRight: 4 }} />
            Open maps
          </button>
        </div>
        <div style={styles.mapGraphics}>
          <div style={styles.mapLine}></div>
          <div style={styles.mapDotGreen}></div>
          <div style={styles.mapDotRed}></div>
        </div>
      </div>

      {/* Extra Notes Input field */}
      <div style={styles.inputContainer}>
        <input 
          type="text" 
          placeholder="Add extra notes (e.g. dinner bill)" 
          style={styles.extraNotesInput} 
        />
      </div>

      {/* Contact & Footer badges */}
      <div style={styles.footer}>
        <button style={styles.contactBtn}>
          <HelpCircle size={14} style={{ marginRight: 6 }} />
          Contact us
        </button>
        <div style={styles.upiBadges}>
          <span style={styles.upiBadgeText}>UPI Secured</span>
          <span style={styles.npciText}>NPCI Partner</span>
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
    gap: '12px',
    paddingBottom: '40px',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  iconButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--surface-hover)',
  },
  successWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    margin: '12px 0 20px 0',
  },
  pendingWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    margin: '12px 0 20px 0',
    backgroundColor: 'rgba(255, 140, 0, 0.03)',
    border: '1px solid rgba(255, 140, 0, 0.15)',
    borderRadius: '24px',
    padding: '18px 12px',
  },
  recalledWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    margin: '12px 0 20px 0',
    backgroundColor: 'rgba(235, 59, 136, 0.03)',
    border: '1px solid rgba(235, 59, 136, 0.15)',
    borderRadius: '24px',
    padding: '18px 12px',
  },
  checkmarkPulse: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    padding: '8px',
    backgroundColor: 'rgba(34, 230, 123, 0.08)',
    boxShadow: '0 0 16px rgba(34, 230, 123, 0.1)',
    marginBottom: '16px',
  },
  pendingPulse: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    padding: '14px',
    backgroundColor: 'rgba(255, 140, 0, 0.08)',
    boxShadow: '0 0 16px rgba(255, 140, 0, 0.15)',
    marginBottom: '16px',
  },
  recalledPulse: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    padding: '14px',
    backgroundColor: 'rgba(235, 59, 136, 0.08)',
    boxShadow: '0 0 16px rgba(235, 59, 136, 0.15)',
    marginBottom: '16px',
  },
  checkmarkIcon: {
    display: 'block',
  },
  amountText: {
    fontSize: '32px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-primary)',
    marginBottom: '4px',
  },
  recipientSub: {
    fontSize: '15px',
    color: 'var(--text-primary)',
    fontWeight: '500',
  },
  dateSub: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  },
  pendingBannerText: {
    fontSize: '11px',
    color: '#ff8c00',
    marginTop: '8px',
    fontWeight: '600',
    maxWidth: '240px',
    lineHeight: '1.4',
  },
  recalledBannerText: {
    fontSize: '11px',
    color: 'var(--accent-pink)',
    marginTop: '8px',
    fontWeight: '600',
    maxWidth: '240px',
    lineHeight: '1.4',
  },
  payAgainBtn: {
    marginTop: '16px',
    backgroundColor: 'var(--surface-hover)',
    border: '1px solid var(--border-color)',
    color: 'var(--accent-neon)',
    padding: '8px 20px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  recallBtnBig: {
    marginTop: '14px',
    backgroundColor: 'var(--accent-pink)',
    border: 'none',
    color: '#ffffff',
    padding: '10px 22px',
    borderRadius: '24px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 6px 16px rgba(235, 59, 136, 0.25)',
  },
  card: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid var(--border-color)',
  },
  cardRow: {
    display: 'flex',
    gap: '8px',
    fontSize: '14px',
  },
  cardRowBetween: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteLabel: {
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  noteValue: {
    color: 'var(--text-primary)',
    fontWeight: '600',
  },
  moniesRow: {
    marginTop: '8px',
    display: 'flex',
  },
  moniesBadge: {
    backgroundColor: 'rgba(170, 51, 255, 0.12)',
    color: '#c480ff',
    fontSize: '12px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(170, 51, 255, 0.2)',
  },
  categoryLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  emojiIcon: {
    fontSize: '24px',
  },
  categoryTexts: {
    display: 'flex',
    flexDirection: 'column',
  },
  categoryTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  categorySub: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    lineHeight: '1.3',
    maxWidth: '180px',
  },
  editCategoryBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent-pink)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  reportFraudBtn: {
    backgroundColor: 'rgba(235, 59, 136, 0.12)',
    border: '1px solid rgba(235, 59, 136, 0.3)',
    color: 'var(--accent-pink)',
    borderRadius: '12px',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  collapsibleHeader: {
    width: '100%',
    background: 'none',
    border: 'none',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    padding: 0,
  },
  detailsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  detailsContent: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    borderTop: '1px solid var(--border-color)',
    paddingTop: '12px',
  },
  detailItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  detailLabel: {
    color: 'var(--text-secondary)',
  },
  detailValue: {
    color: 'var(--text-primary)',
    fontWeight: '500',
  },
  copyableValue: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text-primary)',
    fontWeight: '500',
  },
  mapCard: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    height: '100px',
    position: 'relative',
    overflow: 'hidden',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: '12px',
  },
  mapOverlay: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  mapDetails: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  mapText: {
    fontSize: '11px',
    color: 'var(--text-primary)',
    fontWeight: '500',
  },
  mapBtn: {
    backgroundColor: 'var(--bg-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    color: 'var(--text-primary)',
    padding: '4px 10px',
    fontSize: '10px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  mapGraphics: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'radial-gradient(circle at 70% 30%, var(--surface-hover) 0%, var(--surface-color) 70%)',
    zIndex: 1,
  },
  mapLine: {
    position: 'absolute',
    top: '30%',
    left: '20%',
    width: '60%',
    height: '2px',
    background: 'dashed 2px rgba(255, 255, 255, 0.1)',
    transform: 'rotate(-15deg)',
  },
  mapDotGreen: {
    position: 'absolute',
    top: '40%',
    left: '25%',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-neon)',
  },
  mapDotRed: {
    position: 'absolute',
    top: '25%',
    left: '70%',
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-pink)',
  },
  inputContainer: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    padding: '4px 16px',
    border: '1px solid var(--border-color)',
  },
  extraNotesInput: {
    width: '100%',
    height: '40px',
    background: 'none',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: '13px',
  },
  footer: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  contactBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent-pink)',
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  upiBadges: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    opacity: 0.5,
  },
  upiBadgeText: {
    fontSize: '10px',
    color: 'var(--text-primary)',
    fontWeight: '600',
    border: '1px solid var(--text-primary)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  npciText: {
    fontSize: '10px',
    color: 'var(--text-primary)',
    fontWeight: '600',
  },
  blockedWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    margin: '12px 0 20px 0',
    backgroundColor: 'rgba(235, 59, 136, 0.03)',
    border: '1px solid rgba(235, 59, 136, 0.15)',
    borderRadius: '24px',
    padding: '18px 12px',
    width: '100%',
  },
  blockedPulse: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    padding: '8px',
    backgroundColor: 'rgba(235, 59, 136, 0.08)',
    boxShadow: '0 0 16px rgba(235, 59, 136, 0.1)',
    marginBottom: '16px',
  },
  blockedBannerText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    margin: '8px 16px 0 16px',
  },
  muleGraphBox: {
    marginTop: '16px',
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '14px',
    width: '100%',
    textAlign: 'left',
  },
  graphTitle: {
    fontSize: '9px',
    fontWeight: '800',
    color: 'var(--accent-pink)',
    letterSpacing: '0.5px',
    display: 'block',
    marginBottom: '12px',
    textTransform: 'uppercase',
  },
  muleChainRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: '12px',
    gap: '4px',
  },
  muleNode: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 4px',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    backgroundColor: 'var(--surface-hover)',
  },
  nodeIconBox: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    backgroundColor: 'var(--surface-hover)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    marginBottom: '6px',
  },
  nodeLabel: {
    fontSize: '9px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    textAlign: 'center',
  },
  nodeSub: {
    fontSize: '7px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    marginTop: '1px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '55px',
  },
  muleArrowCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '45px',
    textAlign: 'center',
  },
  muleLinePink: {
    width: '100%',
    height: '2px',
    backgroundColor: 'var(--accent-pink)',
    margin: '4px 0',
    position: 'relative',
  },
  muleLineDashed: {
    width: '100%',
    height: '0px',
    borderBottom: '2px dashed var(--border-color)',
    margin: '4px 0',
  },
  graphDesc: {
    fontSize: '9px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    margin: '0',
  }
};

export default PaidSuccess;
