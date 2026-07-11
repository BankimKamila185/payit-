/**
 * QrScanner.jsx — Camera-based UPI QR code scanner with a beautiful full-screen camera layout
 *
 * Approach:
 *  - getUserMedia (rear camera preferred)
 *  - setInterval at 8fps for scan frames
 *  - jsQR with attemptBoth for dark/light QR variants
 *  - Cleans up on unmount / close / rescan
 */
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Zap, ZapOff, Check, ArrowRight, CameraOff } from 'lucide-react';

// ─── UPI URI parser ──────────────────────────────────────────────────────────
function parseUpiUri(raw) {
  if (!raw) return null;
  raw = raw.trim();
  
  try {
    const urlStr = raw.startsWith('upi://') ? raw : 'upi://x?' + raw;
    const url = new URL(urlStr);
    
    const pa = url.searchParams.get('pa') || url.searchParams.get('PA') || '';
    const pn = url.searchParams.get('pn') || url.searchParams.get('PN') || '';
    
    if (pa && pa.includes('@')) {
      const decodedName = pn ? decodeURIComponent(pn.replace(/\+/g, ' ')) : pa.split('@')[0];
      return { vpa: pa, name: decodedName || pa.split('@')[0] };
    }
  } catch (_) {/* ignore */}

  const vpaRegex = /[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}/;
  const match = raw.match(vpaRegex);
  if (match) {
    const vpa = match[0];
    return { vpa: vpa, name: vpa.split('@')[0] };
  }
  
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function QrScanner({ onClose, onScanSuccess }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const timerRef    = useRef(null);
  const trackRef    = useRef(null);

  const [phase, setPhase]   = useState('requesting'); // requesting | live | denied | found
  const [found, setFound]   = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [torch, setTorch]   = useState(false);
  const [torchOk, setTorchOk] = useState(false);

  // ── cleanup ────────────────────────────────────────────────────────────────
  function stopEverything() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  // ── one scan tick ─────────────────────────────────────────────────────────
  function scanTick() {
    const vid = videoRef.current;
    const cvs = canvasRef.current;
    if (!vid || !cvs || vid.paused || vid.ended) return;
    if (vid.readyState < 2) return;
    if (vid.videoWidth === 0 || vid.videoHeight === 0) return;

    cvs.width  = vid.videoWidth;
    cvs.height = vid.videoHeight;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(vid, 0, 0);

    let imgData;
    try { imgData = ctx.getImageData(0, 0, cvs.width, cvs.height); }
    catch (_) { return; }

    const decode = (typeof jsQR === 'function') ? jsQR : jsQR?.default;
    if (typeof decode !== 'function') { console.warn('[QR] jsQR decode fn not found'); return; }

    const result = decode(imgData.data, imgData.width, imgData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (result?.data) {
      const parsed = parseUpiUri(result.data);
      if (parsed) {
        stopEverything();
        setFound(parsed);
        setPhase('found');
      }
    }
  }

  // ── start camera ──────────────────────────────────────────────────────────
  async function startCamera() {
    stopEverything();
    setPhase('requesting');
    setErrMsg('');
    setFound(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrMsg('Your browser does not support camera access. Try Chrome on Android or Safari on iOS.');
      setPhase('denied');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (e1) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (e2) {
        const msg =
          e2.name === 'NotAllowedError'  ? 'Camera permission denied. Tap the camera icon in your browser address bar to allow access, then reload.' :
          e2.name === 'NotFoundError'    ? 'No camera found on this device.' :
          e2.name === 'NotReadableError' ? 'Camera is already in use by another app.' :
                                           `Camera error: ${e2.message}`;
        setErrMsg(msg);
        setPhase('denied');
        return;
      }
    }

    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    trackRef.current = track;

    try {
      const caps = track.getCapabilities?.() ?? {};
      setTorchOk(!!caps.torch);
    } catch (_) { setTorchOk(false); }

    const vid = videoRef.current;
    if (!vid) { stopEverything(); return; }

    vid.srcObject = stream;

    await new Promise((resolve) => {
      if (vid.readyState >= 1) { resolve(); return; }
      vid.addEventListener('loadedmetadata', resolve, { once: true });
      setTimeout(resolve, 2000);
    });

    try {
      await vid.play();
      setPhase('live');
      timerRef.current = setInterval(scanTick, 125);
    } catch (e) {
      console.error('[QR] play() failed:', e);
      setErrMsg(`Video playback failed: ${e.message}. Try reloading.`);
      setPhase('denied');
    }
  }

  // ── torch toggle ──────────────────────────────────────────────────────────
  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(t => !t);
    } catch (_) {/* not all phones support torch constraint */}
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return stopEverything;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() { stopEverything(); onClose(); }

  function handleConfirm() {
    if (!found) return;
    onScanSuccess(found.name, found.vpa);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* video is always rendered so the ref stays valid */}
      <video
        ref={videoRef}
        style={{ ...S.video, visibility: phase === 'live' ? 'visible' : 'hidden' }}
        autoPlay
        playsInline
        muted
      />

      {/* hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ── requesting ── */}
      {phase === 'requesting' && (
        <div style={S.center}>
          <div style={S.spinner} />
          <p style={S.centerText}>Opening camera…</p>
        </div>
      )}

      {/* ── denied / error ── */}
      {phase === 'denied' && (
        <div style={S.center}>
          <CameraOff size={52} color="#eb3b88" style={{ marginBottom: 20 }} />
          <p style={{ ...S.centerText, color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 10 }}>
            Camera unavailable
          </p>
          <p style={{ ...S.centerText, fontSize: 12, color: '#888', lineHeight: 1.7, maxWidth: 260 }}>
            {errMsg}
          </p>
          <button style={S.retryBtn} onClick={startCamera}>Try again</button>
          {/* Circular close button for error state */}
          <button style={S.closeCircleBtn} onClick={handleClose} aria-label="Close">
            <X size={24} color="#fff" />
          </button>
        </div>
      )}

      {/* ── live: scanner overlay ── */}
      {phase === 'live' && (
        <>
          {/* Top Right Flash button */}
          {torchOk && (
            <button style={S.flashBtn} onClick={toggleTorch} aria-label="Flashlight">
              {torch ? <ZapOff size={22} color="#ffdd57" /> : <Zap size={22} color="#fff" />}
            </button>
          )}

          {/* target frame corners */}
          <div style={S.frameBox}>
            <span style={{ ...S.corner, top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }} />
            <span style={{ ...S.corner, top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }} />
            <span style={{ ...S.corner, bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }} />
            <span style={{ ...S.corner, bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }} />
            {/* animated scan line */}
            <div style={S.scanLine} />
          </div>

          {/* Bottom info section */}
          <div style={S.bottomSection}>
            <div style={S.hintContainer}>
              <div style={S.hintTextRow}>
                <span>Scan any </span>
                {/* UPI logo */}
                <svg width="28" height="10" viewBox="0 0 40 15" fill="none" style={{ margin: '0 4px', verticalAlign: 'middle' }}>
                  <path d="M2 2 H6 L8 9 L10 2 H14" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M17 2 H21 V5 H17 Z M17 5 H21 V12 H17 Z" fill="#ffffff" />
                  <path d="M25 2 H29 C31 2 32 3 32 5 C32 7 31 8 29 8 H25 V12 H25 Z" fill="#ffffff" />
                  <path d="M36 2 H40" stroke="#ff8c00" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M38 2 V12" stroke="#22e67b" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
                <span> QR code</span>
              </div>
              <div style={S.logoRow}>
                <span style={S.sliceLogo}>slice</span>
                <div style={S.brandItem}>
                  <div style={S.phonepeCircle}>pe</div>
                  <span style={S.brandName}>PhonePe</span>
                </div>
                <div style={S.brandItem}>
                  <div style={S.gpayCircle}>
                    <div style={{width: 5, height: 5, borderRadius: '50%', backgroundColor: '#4285F4'}} />
                    <div style={{width: 5, height: 5, borderRadius: '50%', backgroundColor: '#34A853'}} />
                  </div>
                  <span style={S.brandName}>Google Pay</span>
                </div>
                <span style={S.paytmLogo}>Paytm</span>
              </div>
            </div>

            {/* Bottom floating actions */}
            <div style={S.actionRow}>
              {/* Gallery upload placeholder */}
              <button style={S.actionCircleBtn} aria-label="Upload from gallery">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>

              {/* Close button */}
              <button style={S.actionCircleBtn} onClick={handleClose} aria-label="Close">
                <X size={24} color="#fff" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── found ── */}
      {phase === 'found' && found && (
        <div style={S.foundOverlay}>
          <div style={S.foundCircle}>
            <Check size={34} color="#000" strokeWidth={3} />
          </div>
          <p style={S.foundBadge}>QR Detected</p>
          <p style={S.foundName}>{found.name}</p>
          <p style={S.foundVpa}>{found.vpa}</p>
          <button style={S.payBtn} onClick={handleConfirm}>
            Pay now&nbsp;<ArrowRight size={16} />
          </button>
          <button style={S.rescanBtn} onClick={startCamera}>Scan again</button>
        </div>
      )}

      <style>{`
        @keyframes qs-spin  { to { transform: rotate(360deg); } }
        @keyframes qs-sweep {
          0%,100% { opacity: 0; }
          5%       { opacity: 1; top: 4px;  }
          95%      { opacity: 1; top: calc(100% - 4px); }
        }
      `}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const NEON     = '#22e67b';

const S = {
  root: {
    position: 'relative',
    height: '100%',
    width: '100%',
    background: '#000',
    overflow: 'hidden',
    userSelect: 'none',
  },
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    zIndex: 1,
  },
  center: {
    position: 'absolute',
    inset: 0,
    zIndex: 10,
    background: '#000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    textAlign: 'center',
  },
  centerText: { color: '#aaa', fontSize: 13, margin: 0 },
  spinner: {
    width: 44, height: 44, borderRadius: '50%',
    border: '3px solid #1a1a1a', borderTopColor: NEON,
    animation: 'qs-spin 0.8s linear infinite', marginBottom: 18,
  },
  retryBtn: {
    marginTop: 24, padding: '11px 28px', borderRadius: 14,
    background: NEON, color: '#000', border: 'none',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    marginBottom: 20,
  },
  closeCircleBtn: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  flashBtn: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: 'rgba(0, 0, 0, 0.35)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  frameBox: {
    position: 'absolute',
    width: 240,
    height: 240,
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 5,
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderStyle: 'solid',
    borderColor: '#ffffff',
    borderWidth: 0,
    borderRadius: 8,
  },
  scanLine: {
    position: 'absolute',
    left: 6,
    right: 6,
    height: 2,
    background: 'linear-gradient(90deg, transparent, #ffffff, transparent)',
    boxShadow: '0 0 10px #ffffff',
    animation: 'qs-sweep 2s ease-in-out infinite',
    borderRadius: 1,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 24px 40px',
    background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%)',
  },
  hintContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '32px',
  },
  hintTextRow: {
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.2px',
    display: 'flex',
    alignItems: 'center',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  sliceLogo: {
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: '-0.5px',
  },
  brandItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  phonepeCircle: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    backgroundColor: '#5f259f',
    color: '#ffffff',
    fontSize: '8px',
    fontWeight: '800',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpayCircle: {
    width: 14,
    height: 14,
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1px',
  },
  brandName: {
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: '600',
    opacity: 0.85,
  },
  paytmLogo: {
    color: '#00baf2',
    fontSize: '13px',
    fontWeight: '800',
  },
  actionRow: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: '280px',
  },
  actionCircleBtn: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  foundOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 15,
    background: 'rgba(0,0,0,0.93)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  foundCircle: {
    width: 76,
    height: 76,
    borderRadius: '50%',
    background: '#22e67b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    boxShadow: '0 0 40px rgba(34, 230, 123, 0.35)',
  },
  foundBadge: { color: '#22e67b', fontSize: 11, fontWeight: 800, letterSpacing: 1.2, margin: '0 0 8px' },
  foundName:  { color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 4px' },
  foundVpa:   { color: '#555', fontSize: 13, margin: '0 0 28px' },
  payBtn: {
    background: '#22e67b',
    color: '#000',
    border: 'none',
    borderRadius: 16,
    padding: '14px 40px',
    fontSize: 16,
    fontWeight: 800,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  rescanBtn: {
    background: 'none',
    border: 'none',
    color: '#555',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
