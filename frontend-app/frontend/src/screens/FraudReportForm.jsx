import React, { useState } from 'react';
import { ShieldAlert, Send, FileText, ArrowLeft, Upload, CheckCircle2 } from 'lucide-react';

const FraudReportForm = ({ transaction = {}, onBack, onSubmitSuccess }) => {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState(0);

  const steps = [
    "Locking transaction parameters...",
    "Securing recipient UPI registry details...",
    "Compiling evidence and system metadata...",
    "Filing report with National Cyber Crime Portal (1930)...",
    "Notifying Bank Fraud Control & freezing destination ledger..."
  ];

  const handleFileUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(prev => [...prev, e.target.files[0].name]);
    } else {
      // Mock upload for simulator
      setFiles(prev => [...prev, `screenshot_chat_${Date.now().toString().slice(-4)}.png`]);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!category) return;
    
    setIsSubmitting(true);
    setSubmitStep(0);

    // Simulate stepping through reporting procedures
    const interval = setInterval(() => {
      setSubmitStep(prev => {
        if (prev < steps.length - 1) {
          return prev + 1;
        } else {
          clearInterval(interval);
          setTimeout(() => {
            setIsSubmitting(false);
            if (onSubmitSuccess) {
              onSubmitSuccess({
                id: `FRD-${Math.floor(100000 + Math.random() * 900000)}`,
                transactionId: transaction.transId || 'PAY72981A81B',
                recipient: transaction.recipient || 'Unknown',
                amount: transaction.amount || 0,
                category
              });
            }
          }, 1500);
          return prev;
        }
      });
    }, 1200);
  };

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backBtn} aria-label="Go back">
          <ArrowLeft size={20} color="#ffffff" />
        </button>
        <span style={styles.headerTitle}>Report Fraud</span>
      </div>

      {isSubmitting ? (
        <div style={styles.submittingContainer}>
          <div style={styles.spinnerWrapper}>
            <div style={styles.radarPulse}></div>
            <ShieldAlert size={36} color="var(--accent-pink)" />
          </div>
          
          <h3 style={styles.submittingTitle}>Submitting Fraud Report</h3>
          <p style={styles.submittingSubtitle}>Report ID: FRD-PENDING</p>

          <div style={styles.stepsTimeline}>
            {steps.map((step, idx) => (
              <div key={idx} style={styles.stepRow}>
                <div style={{
                  ...styles.stepDot,
                  backgroundColor: submitStep > idx ? 'var(--accent-neon)' : submitStep === idx ? 'var(--accent-pink)' : 'rgba(255,255,255,0.1)',
                  boxShadow: submitStep === idx ? '0 0 8px var(--accent-pink)' : 'none'
                }}></div>
                <span style={{
                  ...styles.stepText,
                  color: submitStep > idx ? '#ffffff' : submitStep === idx ? 'var(--accent-pink)' : 'rgba(255,255,255,0.4)',
                  fontWeight: submitStep === idx ? '600' : '400'
                }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Pre-filled transaction summary card */}
          <div style={styles.txCard}>
            <div style={styles.txCardRow}>
              <span style={styles.cardLabel}>Recipient</span>
              <span style={styles.cardValue}>{transaction.recipient || 'Gopichand Javanajad'}</span>
            </div>
            <div style={styles.txCardRow}>
              <span style={styles.cardLabel}>Amount</span>
              <span style={{ ...styles.cardValue, color: 'var(--accent-pink)', fontWeight: '700' }}>
                ₹{(transaction.amount || 0).toLocaleString()}
              </span>
            </div>
            <div style={styles.txCardRow}>
              <span style={styles.cardLabel}>Tx Date</span>
              <span style={styles.cardValue}>{transaction.date || 'Today'}</span>
            </div>
            <div style={styles.txCardRow}>
              <span style={styles.cardLabel}>Ref ID</span>
              <span style={{ ...styles.cardValue, fontSize: '11px', fontFamily: 'monospace' }}>
                {transaction.upiRef || '617871427501'}
              </span>
            </div>
          </div>

          {/* Form Fields */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Select Fraud Category *</label>
            <div style={styles.categoryGrid}>
              {[
                { id: 'phishing', label: 'Scam / Phishing Link', desc: 'SMS link or fake website' },
                { id: 'impersonation', label: 'Impersonation', desc: 'Police, Bank or Friend fraud' },
                { id: 'payment_scam', label: 'Lottery / Reward scam', desc: 'Promised money in exchange for fee' },
                { id: 'goods_undelivered', label: 'Goods Undelivered', desc: 'Paid for items but never received' },
                { id: 'unauthorized', label: 'Unauthorized UPI Charge', desc: 'Money debited without consent' }
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  style={{
                    ...styles.categoryCard,
                    borderColor: category === cat.id ? 'var(--accent-pink)' : 'rgba(255,255,255,0.06)',
                    backgroundColor: category === cat.id ? 'rgba(235, 59, 136, 0.06)' : 'rgba(255, 255, 255, 0.02)'
                  }}
                >
                  <span style={{
                    ...styles.categoryLabel,
                    color: category === cat.id ? 'var(--accent-pink)' : '#ffffff'
                  }}>{cat.label}</span>
                  <span style={styles.categoryDesc}>{cat.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label htmlFor="fraud-desc" style={styles.label}>Details / Context (Optional)</label>
            <textarea
              id="fraud-desc"
              placeholder="Provide chat details, phone numbers, or threats made by the scammer..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={styles.textarea}
            />
          </div>

          {/* File Uploader Mockup */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Attach Proof (Chat screenshots, SMS alerts)</label>
            <div style={styles.uploaderBox}>
              <Upload size={20} color="var(--text-secondary)" />
              <div style={styles.uploaderText}>
                <span style={styles.uploadMain}>Upload screenshot/document</span>
                <span style={styles.uploadSub}>PNG, JPG up to 5MB</span>
              </div>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileUpload} 
                style={styles.fileInput} 
                aria-label="Upload evidence"
              />
              <button 
                type="button" 
                onClick={handleFileUpload} 
                style={styles.mockUploadBtn}
              >
                Simulate Attach
              </button>
            </div>

            {files.length > 0 && (
              <div style={styles.fileList}>
                {files.map((filename, i) => (
                  <div key={i} style={styles.fileItem}>
                    <FileText size={12} color="var(--text-secondary)" style={{ marginRight: 6 }} />
                    <span style={styles.fileName}>{filename}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!category}
            style={{
              ...styles.submitBtn,
              opacity: category ? 1 : 0.4,
              cursor: category ? 'pointer' : 'not-allowed'
            }}
          >
            <Send size={16} style={{ marginRight: 8 }} />
            File Fraud Report
          </button>
        </form>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#050506',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    height: '40px',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'var(--font-display)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    flex: 1,
    paddingBottom: '24px',
  },
  txCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '16px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  txCardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  cardLabel: {
    color: 'var(--text-secondary)',
  },
  cardValue: {
    color: '#ffffff',
    fontWeight: '500',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  categoryGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  categoryCard: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '12px',
    padding: '10px 14px',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    transition: 'all 0.2s',
  },
  categoryLabel: {
    fontSize: '13px',
    fontWeight: '600',
  },
  categoryDesc: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
  },
  textarea: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: '12px',
    color: '#ffffff',
    fontSize: '13px',
    fontFamily: 'var(--font-body)',
    minHeight: '80px',
    outline: 'none',
    resize: 'none',
    '&:focus': {
      borderColor: 'var(--accent-pink)',
    }
  },
  uploaderBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    border: '1px dashed rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    position: 'relative',
  },
  uploaderText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  uploadMain: {
    fontSize: '12px',
    color: '#ffffff',
    fontWeight: '600',
  },
  uploadSub: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
  },
  fileInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
    cursor: 'pointer',
  },
  mockUploadBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: 'none',
    borderRadius: '8px',
    color: '#ffffff',
    padding: '6px 10px',
    fontSize: '10px',
    fontWeight: '600',
    cursor: 'pointer',
    zIndex: 2,
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '4px',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '6px',
    padding: '6px 10px',
  },
  fileName: {
    fontSize: '11px',
    color: '#ffffff',
  },
  submitBtn: {
    marginTop: '8px',
    backgroundColor: 'var(--accent-pink)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '24px',
    height: '48px',
    fontSize: '14px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(235, 59, 136, 0.25)',
  },
  submittingContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  spinnerWrapper: {
    position: 'relative',
    width: '80px',
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  radarPulse: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    border: '2px solid var(--accent-pink)',
    animation: 'radarScan 1.5s infinite linear',
  },
  submittingTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '4px',
  },
  submittingSubtitle: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginBottom: '32px',
  },
  stepsTimeline: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  stepDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    transition: 'all 0.3s ease',
  },
  stepText: {
    fontSize: '12px',
    transition: 'all 0.3s ease',
    textAlign: 'left',
  }
};

export default FraudReportForm;
