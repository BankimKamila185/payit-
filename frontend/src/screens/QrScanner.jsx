import React from 'react';
import { 
  Image, 
  Zap, 
  HelpCircle, 
  X,
  CreditCard,
  User,
  ArrowRight
} from 'lucide-react';

const QrScanner = ({ onClose, onScanSuccess }) => {
  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Scanner Header */}
      <div style={styles.header}>
        <button onClick={onClose} style={styles.closeBtn} aria-label="Close Scanner">
          <X size={20} color="#ffffff" />
        </button>
        <span style={styles.headerTitle}>Scan QR code</span>
        <button style={styles.helpBtn}>
          <HelpCircle size={18} color="#ffffff" />
        </button>
      </div>

      {/* Camera Simulator viewport */}
      <div style={styles.cameraViewport}>
        {/* Animated Scanning Line */}
        <div style={styles.scanLine} className="scan-animation"></div>

        {/* Framing Corners */}
        <div style={styles.frameCornerTopLeft}></div>
        <div style={styles.frameCornerTopRight}></div>
        <div style={styles.frameCornerBottomLeft}></div>
        <div style={styles.frameCornerBottomRight}></div>

        {/* Guidance texts */}
        <div style={styles.guidanceOverlay}>
          <span style={styles.scanTipText}>Point at any UPI QR code to pay</span>
        </div>

        {/* QR Code Graphic in Background */}
        <div style={styles.qrBackgroundGraphic}>
          <div style={styles.mockQrDot}></div>
          <div style={styles.mockQrDot}></div>
          <div style={styles.mockQrSquare}></div>
        </div>

        {/* Quick Tappable Trigger to Simulate Successful Scan */}
        <button 
          onClick={() => onScanSuccess("Aravind Kumar", "aravind***@okhdfcbank")} 
          style={styles.simScanBtn}
        >
          [ Simulate QR Scan ]
        </button>
      </div>

      {/* Bottom controls panel */}
      <div style={styles.controlsPanel}>
        <div style={styles.controlsRow}>
          <button style={styles.controlBtn}>
            <div style={styles.controlIconBox}>
              <Image size={18} color="#ffffff" />
            </div>
            <span style={styles.controlLabel}>Upload from gallery</span>
          </button>
          
          <button style={styles.controlBtn}>
            <div style={styles.controlIconBox}>
              <Zap size={18} color="#ffffff" />
            </div>
            <span style={styles.controlLabel}>Flashlight</span>
          </button>
        </div>

        {/* UPI Payments Logos */}
        <div style={styles.upiLogosSection}>
          <span style={styles.upiLogosLabel}>Supported payment partners</span>
          <div style={styles.logosRow}>
            <div style={{ ...styles.logoBadge, color: '#aa33ff' }}>payit</div>
            <div style={{ ...styles.logoBadge, color: '#0088ff' }}>PhonePe</div>
            <div style={{ ...styles.logoBadge, color: '#22e67b' }}>GPay</div>
            <div style={{ ...styles.logoBadge, color: '#00cccc' }}>Paytm</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scan-line-move {
          0% { top: 15%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 85%; opacity: 0; }
        }
        .scan-animation {
          animation: scan-line-move 2.5s ease-in-out infinite;
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
    backgroundColor: '#000000',
    height: '100%',
  },
  header: {
    height: '48px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 16px',
    zIndex: 10,
    backgroundColor: '#000000',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
  },
  headerTitle: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#ffffff',
  },
  helpBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
  },
  cameraViewport: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#08080a',
    margin: '16px',
    borderRadius: '24px',
    overflow: 'hidden',
    border: '1px solid #1c1c1f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute',
    left: '10%',
    width: '80%',
    height: '2px',
    backgroundColor: 'var(--accent-neon)',
    boxShadow: '0 0 10px var(--accent-neon), 0 0 4px var(--accent-neon)',
    zIndex: 3,
  },
  frameCornerTopLeft: {
    position: 'absolute',
    top: '30px',
    left: '30px',
    width: '24px',
    height: '24px',
    borderTop: '3px solid var(--accent-neon)',
    borderLeft: '3px solid var(--accent-neon)',
    borderTopLeftRadius: '8px',
    zIndex: 4,
  },
  frameCornerTopRight: {
    position: 'absolute',
    top: '30px',
    right: '30px',
    width: '24px',
    height: '24px',
    borderTop: '3px solid var(--accent-neon)',
    borderRight: '3px solid var(--accent-neon)',
    borderTopRightRadius: '8px',
    zIndex: 4,
  },
  frameCornerBottomLeft: {
    position: 'absolute',
    bottom: '30px',
    left: '30px',
    width: '24px',
    height: '24px',
    borderBottom: '3px solid var(--accent-neon)',
    borderLeft: '3px solid var(--accent-neon)',
    borderBottomLeftRadius: '8px',
    zIndex: 4,
  },
  frameCornerBottomRight: {
    position: 'absolute',
    bottom: '30px',
    right: '30px',
    width: '24px',
    height: '24px',
    borderBottom: '3px solid var(--accent-neon)',
    borderRight: '3px solid var(--accent-neon)',
    borderBottomRightRadius: '8px',
    zIndex: 4,
  },
  guidanceOverlay: {
    position: 'absolute',
    bottom: '40px',
    zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: '8px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.05)',
  },
  scanTipText: {
    fontSize: '11px',
    color: '#ffffff',
    fontWeight: '500',
  },
  qrBackgroundGraphic: {
    width: '120px',
    height: '120px',
    opacity: 0.15,
    border: '4px solid #ffffff',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockQrDot: {
    width: '16px',
    height: '16px',
    backgroundColor: '#ffffff',
    position: 'absolute',
    top: '8px',
    left: '8px',
  },
  mockQrSquare: {
    width: '40px',
    height: '40px',
    border: '8px solid #ffffff',
    position: 'absolute',
    bottom: '16px',
    right: '16px',
  },
  simScanBtn: {
    position: 'absolute',
    top: '40px',
    backgroundColor: 'rgba(34, 230, 123, 0.15)',
    border: '1px solid var(--accent-neon)',
    borderRadius: '12px',
    color: 'var(--accent-neon)',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    zIndex: 6,
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: 'var(--accent-neon)',
      color: '#000000',
    }
  },
  controlsPanel: {
    backgroundColor: '#0d0d0e',
    borderTop: '1px solid #1a1a1c',
    padding: '20px 16px 30px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  controlsRow: {
    display: 'flex',
    justifyContent: 'space-around',
  },
  controlBtn: {
    background: 'none',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
  },
  controlIconBox: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    backgroundColor: '#1c1c1f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    fontWeight: '500',
  },
  upiLogosSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
  },
  upiLogosLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: '600',
  },
  logosRow: {
    display: 'flex',
    gap: '12px',
  },
  logoBadge: {
    fontSize: '10px',
    fontWeight: '700',
    backgroundColor: '#1c1c1f',
    padding: '3px 8px',
    borderRadius: '6px',
  }
};

export default QrScanner;
