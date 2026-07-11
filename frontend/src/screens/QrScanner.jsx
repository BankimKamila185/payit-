import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Image,
  Zap,
  ZapOff,
  HelpCircle,
  X,
  CameraOff,
  Keyboard,
  Check,
  ArrowRight
} from 'lucide-react';

/**
 * Real camera QR scanner using getUserMedia + jsQR.
 * Decodes UPI QR codes (upi://pay?pa=VPA&pn=Name)
 * Falls back gracefully if camera permission is denied.
 */
const QrScanner = ({ onClose, onScanSuccess }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const lastScanRef = useRef(0);

  const [status, setStatus] = useState('requesting'); // 'requesting' | 'live' | 'denied' | 'scanning' | 'found'
  const [torch, setTorch] = useState(false);
  const [trackRef, setTrackRef] = useState(null);
  const [foundData, setFoundData] = useState(null); // { name, vpa }
  const [manualMode, setManualMode] = useState(false);
  const [manualVpa, setManualVpa] = useState('');
  const [manualErr, setManualErr] = useState('');

  // Parse UPI QR URI → { pa (VPA), pn (name) }
  const parseUpiUri = (raw) => {
    try {
      // Accept both upi:// and plain UPI strings
      const url = raw.startsWith('upi://') ? new URL(raw) : new URL('upi://' + raw);
      const pa = url.searchParams.get('pa') || '';
      const pn = url.searchParams.get('pn') || pa.split('@')[0] || 'Unknown';
      if (pa.includes('@')) return { vpa: pa, name: decodeURIComponent(pn.replace(/\+/g, ' ')) };
    } catch {
      // might be a raw VPA like merchant@okaxis
      if (raw.includes('@') && !raw.includes(' ')) return { vpa: raw, name: raw.split('@')[0] };
    }
    return null;
  };

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setTrackRef(track);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setStatus('live');
    } catch (err) {
      console.warn('Camera error:', err);
      setStatus('denied');
    }
  }, []);

  // Scan loop — runs on every animation frame, throttled to ~10fps
  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const now = Date.now();
    if (now - lastScanRef.current < 100) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    lastScanRef.current = now;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code) {
      const parsed = parseUpiUri(code.data);
      if (parsed) {
        stopCamera();
        setStatus('found');
        setFoundData(parsed);
        return; // Stop scanning
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [stopCamera]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (status === 'live') {
      rafRef.current = requestAnimationFrame(scanFrame);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [status, scanFrame]);

  // Torch toggle
  const toggleTorch = async () => {
    if (!trackRef) return;
    try {
      await trackRef.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch {
      console.warn('Torch not supported on this device');
    }
  };

  // Confirm scanned result → navigate to transfer
  const handleConfirm = () => {
    if (!foundData) return;
    stopCamera();
    onScanSuccess(foundData.name, foundData.vpa);
  };

  // Manual VPA entry
  const handleManualSubmit = () => {
    const v = manualVpa.trim();
    if (!v.includes('@')) { setManualErr('Enter a valid UPI ID (e.g. name@okaxis)'); return; }
    stopCamera();
    onScanSuccess(v.split('@')[0], v);
  };

  return (
    <div style={S.container}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={() => { stopCamera(); onClose(); }} style={S.iconBtn} aria-label="Close">
          <X size={20} color="#fff" />
        </button>
        <span style={S.headerTitle}>Scan QR code</span>
        <button style={S.iconBtn} onClick={() => setManualMode(m => !m)} aria-label="Enter UPI ID manually">
          <Keyboard size={18} color="#fff" />
        </button>
      </div>

      {/* Camera viewport */}
      <div style={S.viewport}>
        {/* Live video feed */}
        <video
          ref={videoRef}
          style={{ ...S.video, display: (status === 'live') ? 'block' : 'none' }}
          autoPlay
          playsInline
          muted
        />
        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Scanner frame overlay */}
        {status === 'live' && (
          <>
            <div style={S.overlay} />
            <div style={S.frame}>
              <span style={S.corner_tl} />
              <span style={S.corner_tr} />
              <span style={S.corner_bl} />
              <span style={S.corner_br} />
            </div>
            <div style={S.scanLine} className="scan-animation" />
            <div style={S.tipBubble}>
              <span style={S.tipText}>Point at any UPI QR code to pay</span>
            </div>
          </>
        )}

        {/* Requesting permission */}
        {status === 'requesting' && (
          <div style={S.stateBox}>
            <div style={S.spinnerRing} />
            <p style={S.stateText}>Requesting camera…</p>
          </div>
        )}

        {/* Permission denied */}
        {status === 'denied' && (
          <div style={S.stateBox}>
            <CameraOff size={40} color="#eb3b88" style={{ marginBottom: 12 }} />
            <p style={S.stateText}>Camera access denied</p>
            <p style={S.stateSubText}>
              Enable camera in your browser settings, or enter the UPI ID manually using the keyboard icon above.
            </p>
          </div>
        )}

        {/* QR found confirmation */}
        {status === 'found' && foundData && (
          <div style={S.foundCard}>
            <div style={S.foundCheckCircle}>
              <Check size={28} color="#fff" />
            </div>
            <p style={S.foundLabel}>QR Code Detected!</p>
            <p style={S.foundName}>{foundData.name}</p>
            <p style={S.foundVpa}>{foundData.vpa}</p>
            <button style={S.foundBtn} onClick={handleConfirm}>
              Pay <ArrowRight size={16} style={{ marginLeft: 6 }} />
            </button>
            <button style={S.foundRetryBtn} onClick={() => { setFoundData(null); setStatus('requesting'); startCamera(); }}>
              Scan again
            </button>
          </div>
        )}
      </div>

      {/* Manual UPI ID entry */}
      {manualMode && (
        <div style={S.manualPanel}>
          <p style={S.manualLabel}>Enter UPI ID manually</p>
          <div style={S.manualRow}>
            <input
              style={S.manualInput}
              placeholder="e.g. name@okaxis"
              value={manualVpa}
              onChange={e => { setManualVpa(e.target.value); setManualErr(''); }}
              onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
              autoFocus
              aria-label="UPI ID"
            />
            <button style={S.manualBtn} onClick={handleManualSubmit}>
              <ArrowRight size={18} color="#fff" />
            </button>
          </div>
          {manualErr && <p style={S.manualErr}>{manualErr}</p>}
        </div>
      )}

      {/* Bottom controls */}
      {!manualMode && (
        <div style={S.controls}>
          <div style={S.controlsRow}>
            <button style={S.controlBtn} onClick={() => {/* gallery - web limitation */}}>
              <div style={S.controlIcon}><Image size={18} color="#fff" /></div>
              <span style={S.controlLabel}>Gallery</span>
            </button>
            <button style={S.controlBtn} onClick={toggleTorch}>
              <div style={S.controlIcon}>
                {torch ? <ZapOff size={18} color="#ffdd57" /> : <Zap size={18} color="#fff" />}
              </div>
              <span style={{ ...S.controlLabel, color: torch ? '#ffdd57' : undefined }}>
                {torch ? 'Torch on' : 'Flashlight'}
              </span>
            </button>
          </div>
          <div style={S.logosRow}>
            {['payit', 'PhonePe', 'GPay', 'Paytm'].map((n, i) => (
              <div key={n} style={{ ...S.logoBadge, color: ['#aa33ff','#0088ff','#22e67b','#00cccc'][i] }}>{n}</div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan-line-move {
          0%   { top: 14%; opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { top: 86%; opacity: 0; }
        }
        .scan-animation { animation: scan-line-move 2.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

const NEON = 'var(--accent-neon, #22e67b)';
const S = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: '#000', overflow: 'hidden' },
  header: { height: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', background: '#000', zIndex: 20 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 6 },
  headerTitle: { fontSize: 15, fontWeight: 600, color: '#fff' },

  viewport: { flex: 1, position: 'relative', margin: '0 16px 12px', borderRadius: 24, overflow: 'hidden', background: '#08080a', border: '1px solid #1c1c1f', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  video: { width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 },

  // Dimming overlay with cutout effect via box-shadow
  overlay: {
    position: 'absolute', inset: 0, zIndex: 2,
    boxShadow: 'inset 0 0 0 1000px rgba(0,0,0,0.45)',
    pointerEvents: 'none',
  },
  frame: {
    position: 'absolute', width: 210, height: 210, zIndex: 3,
    top: '50%', left: '50%', transform: 'translate(-50%, -60%)',
  },
  corner_tl: { position: 'absolute', top: 0, left: 0, width: 28, height: 28, borderTop: `3px solid ${NEON}`, borderLeft: `3px solid ${NEON}`, borderTopLeftRadius: 8 },
  corner_tr: { position: 'absolute', top: 0, right: 0, width: 28, height: 28, borderTop: `3px solid ${NEON}`, borderRight: `3px solid ${NEON}`, borderTopRightRadius: 8 },
  corner_bl: { position: 'absolute', bottom: 0, left: 0, width: 28, height: 28, borderBottom: `3px solid ${NEON}`, borderLeft: `3px solid ${NEON}`, borderBottomLeftRadius: 8 },
  corner_br: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderBottom: `3px solid ${NEON}`, borderRight: `3px solid ${NEON}`, borderBottomRightRadius: 8 },

  scanLine: {
    position: 'absolute', left: '15%', width: '70%', height: 2,
    background: `linear-gradient(90deg, transparent, ${NEON}, transparent)`,
    boxShadow: `0 0 12px ${NEON}`,
    zIndex: 4, borderRadius: 1,
  },
  tipBubble: { position: 'absolute', bottom: 20, zIndex: 5, background: 'rgba(0,0,0,0.72)', padding: '7px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' },
  tipText: { fontSize: 11, color: '#fff', fontWeight: 500 },

  stateBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', zIndex: 5 },
  stateText: { color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 6 },
  stateSubText: { color: '#888', fontSize: 11, lineHeight: 1.5 },
  spinnerRing: { width: 40, height: 40, border: '3px solid #333', borderTopColor: NEON, borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 12 },

  foundCard: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.88)', zIndex: 10, padding: 24 },
  foundCheckCircle: { width: 60, height: 60, borderRadius: '50%', background: NEON, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  foundLabel: { color: NEON, fontSize: 13, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 },
  foundName: { color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 2 },
  foundVpa: { color: '#888', fontSize: 12, fontWeight: 500, marginBottom: 20 },
  foundBtn: { background: NEON, color: '#000', border: 'none', borderRadius: 14, padding: '13px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', marginBottom: 10 },
  foundRetryBtn: { background: 'none', border: 'none', color: '#666', fontSize: 12, cursor: 'pointer', fontWeight: 600 },

  manualPanel: { padding: '10px 16px 16px', background: '#0d0d0e', borderTop: '1px solid #1a1a1c' },
  manualLabel: { color: '#888', fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  manualRow: { display: 'flex', gap: 8 },
  manualInput: { flex: 1, background: '#1a1a1c', border: '1px solid #333', borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 13, outline: 'none' },
  manualBtn: { width: 42, height: 42, borderRadius: 10, background: NEON, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  manualErr: { color: '#eb3b88', fontSize: 11, marginTop: 6 },

  controls: { padding: '12px 16px 28px', background: '#0d0d0e', borderTop: '1px solid #1a1a1c' },
  controlsRow: { display: 'flex', justifyContent: 'space-around', marginBottom: 16 },
  controlBtn: { background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' },
  controlIcon: { width: 44, height: 44, borderRadius: '50%', background: '#1c1c1f', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  controlLabel: { fontSize: 11, color: '#888', fontWeight: 500 },
  logosRow: { display: 'flex', justifyContent: 'center', gap: 10 },
  logoBadge: { fontSize: 10, fontWeight: 700, background: '#1c1c1f', padding: '3px 8px', borderRadius: 6 },
};

export default QrScanner;
