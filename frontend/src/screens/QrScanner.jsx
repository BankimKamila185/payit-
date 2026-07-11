/**
 * QrScanner.jsx — Camera-based UPI QR code scanner
 *
 * Approach:
 *  - getUserMedia (rear camera preferred)
 *  - setInterval at 8fps for scan frames (more reliable than rAF on mobile)
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
    const url = new URL(raw.startsWith('upi://') ? raw : 'upi://x?' + raw);
    const pa = url.searchParams.get('pa') || '';
    if (pa.includes('@')) {
      const pn = url.searchParams.get('pn') || '';
      return { vpa: pa, name: decodeURIComponent(pn.replace(/\+/g, ' ')) || pa.split('@')[0] };
    }
  } catch (_) {/* ignore */}
  // plain VPA like name@okaxis
  if (/^[^\s@]+@[^\s@]+$/.test(raw)) return { vpa: raw, name: raw.split('@')[0] };
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function QrScanner({ onClose, onScanSuccess }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const timerRef    = useRef(null);   // setInterval handle
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

    // jsqr exports { default: fn } in CJS; Vite ESM interop may give the fn directly or wrapped
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

    // Wait for at least metadata to be loaded before calling play()
    // (required on Safari/iOS where play() before loadedmetadata throws)
    await new Promise((resolve) => {
      if (vid.readyState >= 1) { resolve(); return; } // already have metadata
      vid.addEventListener('loadedmetadata', resolve, { once: true });
      // Safety timeout: resolve after 2s regardless
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

      {/* top bar */}
      <div style={S.bar}>
        <button style={S.barBtn} onClick={handleClose} aria-label="Close">
          <X size={20} color="#fff" />
        </button>
        <span style={S.barTitle}>Scan &amp; Pay</span>
        {torchOk ? (
          <button style={S.barBtn} onClick={toggleTorch} aria-label="Flashlight">
            {torch ? <ZapOff size={18} color="#ffdd57" /> : <Zap size={18} color="#fff" />}
          </button>
        ) : <div style={{ width: 36 }} />}
      </div>

      {/* viewport */}
      <div style={S.viewport}>

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
          </div>
        )}

        {/* ── live: scanner frame ── */}
        {phase === 'live' && (
          <>
            {/* dim everything outside the target frame */}
            <div style={S.vigTop}    />
            <div style={S.vigBottom} />
            <div style={S.vigLeft}   />
            <div style={S.vigRight}  />

            {/* target frame corners */}
            <div style={S.frameBox}>
              <span style={{ ...S.corner, top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }} />
              <span style={{ ...S.corner, top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }} />
              <span style={{ ...S.corner, bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }} />
              <span style={{ ...S.corner, bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }} />
              {/* animated scan line */}
              <div style={S.scanLine} />
            </div>

            <p style={S.hint}>Point at any UPI QR code</p>
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
      </div>

      {/* footer */}
      <div style={S.footer}>
        <p style={S.footerNote}>Works with all UPI QR codes</p>
        <div style={S.chips}>
          {[['GPay','#22e67b'],['PhonePe','#6e3cff'],['Paytm','#00bcd4'],['BHIM','#eb3b88'],['payit','#aa33ff']].map(([n,c]) => (
            <span key={n} style={{ ...S.chip, color: c, borderColor: c + '33' }}>{n}</span>
          ))}
        </div>
      </div>

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
const FRAME_W  = 220;   // px — target box size
const VIG_CLR  = 'rgba(0,0,0,0.6)';

const S = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: '#000', overflow: 'hidden', userSelect: 'none',
  },

  /* bar */
  bar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 10px', height: 52, flexShrink: 0,
    background: 'linear-gradient(180deg,rgba(0,0,0,.95),transparent)',
    position: 'relative', zIndex: 20,
  },
  barBtn: {
    width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  barTitle: { fontSize: 15, fontWeight: 700, color: '#fff' },

  /* viewport */
  viewport: {
    flex: 1, position: 'relative', overflow: 'hidden',
    background: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  video: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover',
  },

  /* centered state overlay */
  center: {
    position: 'absolute', inset: 0, zIndex: 10,
    background: '#000',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 32, textAlign: 'center',
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
  },

  /* vignette panels (4 divs, not box-shadow, to avoid clipping issues) */
  vigTop: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: `calc(50% - ${FRAME_W / 2}px)`, background: VIG_CLR, zIndex: 2,
  },
  vigBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: `calc(50% - ${FRAME_W / 2}px)`, background: VIG_CLR, zIndex: 2,
  },
  vigLeft: {
    position: 'absolute', top: `calc(50% - ${FRAME_W / 2}px)`, left: 0,
    width: `calc(50% - ${FRAME_W / 2}px)`, height: FRAME_W, background: VIG_CLR, zIndex: 2,
  },
  vigRight: {
    position: 'absolute', top: `calc(50% - ${FRAME_W / 2}px)`, right: 0,
    width: `calc(50% - ${FRAME_W / 2}px)`, height: FRAME_W, background: VIG_CLR, zIndex: 2,
  },

  /* target frame */
  frameBox: {
    position: 'absolute',
    width: FRAME_W, height: FRAME_W,
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 3,
  },
  corner: {
    position: 'absolute', width: 28, height: 28,
    borderStyle: 'solid', borderColor: NEON, borderWidth: 0,
    borderRadius: 3,
  },
  scanLine: {
    position: 'absolute', left: 6, right: 6, height: 2,
    background: `linear-gradient(90deg, transparent, ${NEON}, transparent)`,
    boxShadow: `0 0 10px ${NEON}`,
    animation: 'qs-sweep 2s ease-in-out infinite',
    borderRadius: 1,
  },
  hint: {
    position: 'absolute', bottom: '14%', zIndex: 5,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
    color: '#fff', fontSize: 12, fontWeight: 500, margin: 0,
    padding: '7px 18px', borderRadius: 24,
    border: '1px solid rgba(255,255,255,0.07)',
  },

  /* found */
  foundOverlay: {
    position: 'absolute', inset: 0, zIndex: 15,
    background: 'rgba(0,0,0,0.93)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 28,
  },
  foundCircle: {
    width: 76, height: 76, borderRadius: '50%', background: NEON,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, boxShadow: `0 0 40px ${NEON}55`,
  },
  foundBadge: { color: NEON, fontSize: 11, fontWeight: 800, letterSpacing: 1.2, margin: '0 0 8px' },
  foundName:  { color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 4px' },
  foundVpa:   { color: '#555', fontSize: 13, margin: '0 0 28px' },
  payBtn: {
    background: NEON, color: '#000', border: 'none', borderRadius: 16,
    padding: '14px 40px', fontSize: 16, fontWeight: 800, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
  },
  rescanBtn: {
    background: 'none', border: 'none', color: '#555',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },

  /* footer */
  footer: {
    padding: '10px 16px 22px', background: 'rgba(0,0,0,0.95)',
    textAlign: 'center', flexShrink: 0,
  },
  footerNote: { color: '#2a2a2a', fontSize: 11, fontWeight: 600, margin: '0 0 8px' },
  chips: { display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
    background: 'rgba(255,255,255,0.03)', border: '1px solid transparent',
  },
};
