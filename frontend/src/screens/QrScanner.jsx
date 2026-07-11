import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, CameraOff, Zap, ZapOff, Check, ArrowRight } from 'lucide-react';

// ─── UPI URI parser ─────────────────────────────────────────────────────────
function parseUpiUri(raw) {
  // Accept upi://pay?pa=VPA&pn=Name and raw VPAs like merchant@okaxis
  try {
    const url = new URL(raw.startsWith('upi://') ? raw : 'upi://' + raw);
    const pa = url.searchParams.get('pa') || '';
    const pn = url.searchParams.get('pn') || '';
    if (pa.includes('@')) {
      return {
        vpa: pa,
        name: decodeURIComponent(pn.replace(/\+/g, ' ')) || pa.split('@')[0],
      };
    }
  } catch (_) {/* fall through */}
  // Raw VPA
  if (raw.includes('@') && !/\s/.test(raw)) {
    return { vpa: raw.trim(), name: raw.split('@')[0] };
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function QrScanner({ onClose, onScanSuccess }) {
  const videoEl  = useRef(null);
  const canvasEl = useRef(null);
  const stream   = useRef(null);
  const raf      = useRef(null);
  const trackRef = useRef(null);
  const scanning = useRef(false); // guard against double detection

  const [phase, setPhase]       = useState('boot');   // boot | live | denied | found
  const [found, setFound]       = useState(null);     // { vpa, name }
  const [torchOn, setTorchOn]   = useState(false);
  const [torchOk, setTorchOk]   = useState(false);
  const [errMsg, setErrMsg]     = useState('');

  // ── stop everything ─────────────────────────────────────────────────────
  function stopAll() {
    scanning.current = false;
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = null; }
    if (stream.current) {
      stream.current.getTracks().forEach(t => t.stop());
      stream.current = null;
    }
  }

  // ── scan loop (called via rAF) ──────────────────────────────────────────
  function tick() {
    const vid = videoEl.current;
    const cvs = canvasEl.current;
    if (!scanning.current || !vid || !cvs) return;

    // Wait until the video has actual frame data
    if (vid.readyState >= 2 && vid.videoWidth > 0) {
      cvs.width  = vid.videoWidth;
      cvs.height = vid.videoHeight;
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(vid, 0, 0);
      const img = ctx.getImageData(0, 0, cvs.width, cvs.height);

      // Try both normal and inverted (handles dark-on-light and light-on-dark QRs)
      const code =
        jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });

      if (code && code.data) {
        const parsed = parseUpiUri(code.data);
        if (parsed) {
          stopAll();
          setFound(parsed);
          setPhase('found');
          return; // do NOT re-queue
        }
      }
    }

    raf.current = requestAnimationFrame(tick);
  }

  // ── start camera ─────────────────────────────────────────────────────────
  async function startCamera() {
    setPhase('boot');
    setErrMsg('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      stream.current = s;
      const track = s.getVideoTracks()[0];
      trackRef.current = track;

      // Detect torch support
      const caps = track.getCapabilities?.() || {};
      setTorchOk(!!caps.torch);

      if (videoEl.current) {
        videoEl.current.srcObject = s;
        // Start scan loop as soon as metadata is ready
        videoEl.current.onloadedmetadata = () => {
          videoEl.current.play().then(() => {
            setPhase('live');
            scanning.current = true;
            raf.current = requestAnimationFrame(tick);
          }).catch(e => {
            console.error('video play error', e);
            setPhase('denied');
            setErrMsg('Could not start video. Try refreshing.');
          });
        };
      }
    } catch (e) {
      console.error('Camera error:', e);
      const msg = e.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access in your browser settings and try again.'
        : e.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : `Camera error: ${e.message}`;
      setErrMsg(msg);
      setPhase('denied');
    }
  }

  // ── torch ─────────────────────────────────────────────────────────────────
  async function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(t => !t);
    } catch (e) {
      console.warn('Torch error:', e);
    }
  }

  // ── mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return stopAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── confirm found QR ──────────────────────────────────────────────────────
  function confirmFound() {
    if (!found) return;
    onScanSuccess(found.name, found.vpa);
  }

  function rescan() {
    setFound(null);
    startCamera();
  }

  function close() {
    stopAll();
    onClose();
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={css.root}>

      {/* ── top bar ─────────────────────────────────────────────── */}
      <div style={css.bar}>
        <button style={css.barBtn} onClick={close} aria-label="Close scanner">
          <X size={20} color="#fff" />
        </button>
        <span style={css.barTitle}>Scan &amp; Pay</span>
        {torchOk ? (
          <button style={css.barBtn} onClick={toggleTorch} aria-label="Toggle torch">
            {torchOn
              ? <ZapOff size={18} color="#ffdd57" />
              : <Zap    size={18} color="#fff"    />}
          </button>
        ) : (
          <div style={{ width: 32 }} /> /* spacer */
        )}
      </div>

      {/* ── viewfinder ──────────────────────────────────────────── */}
      <div style={css.viewport}>

        {/* live video — always in DOM so ref is valid */}
        <video
          ref={videoEl}
          style={{
            ...css.video,
            opacity: phase === 'live' ? 1 : 0,
            transition: 'opacity 0.4s',
          }}
          autoPlay
          playsInline
          muted
        />

        {/* hidden capture canvas */}
        <canvas ref={canvasEl} style={{ display: 'none' }} />

        {/* ── overlays ─────────────────────────────────────────── */}

        {/* boot spinner */}
        {phase === 'boot' && (
          <div style={css.overlay}>
            <div style={css.spinner} />
            <p style={css.overlayText}>Opening camera…</p>
          </div>
        )}

        {/* permission / hardware error */}
        {phase === 'denied' && (
          <div style={css.overlay}>
            <CameraOff size={48} color="#eb3b88" />
            <p style={{ ...css.overlayText, marginTop: 16, color: '#fff', fontWeight: 700 }}>
              Camera unavailable
            </p>
            <p style={{ ...css.overlayText, marginTop: 6, fontSize: 12, color: '#888', lineHeight: 1.6 }}>
              {errMsg}
            </p>
            <button style={css.retryBtn} onClick={() => startCamera()}>
              Try again
            </button>
          </div>
        )}

        {/* live: scanner frame + scan line */}
        {phase === 'live' && (
          <>
            {/* dark vignette around the frame */}
            <div style={css.vignette} />

            {/* corner brackets */}
            <div style={css.frame}>
              <span style={{ ...css.corner, borderTopColor: NEON,    borderLeftColor:  NEON,    top:    0, left:   0 }} />
              <span style={{ ...css.corner, borderTopColor: NEON,    borderRightColor: NEON,    top:    0, right:  0 }} />
              <span style={{ ...css.corner, borderBottomColor: NEON, borderLeftColor:  NEON,    bottom: 0, left:   0 }} />
              <span style={{ ...css.corner, borderBottomColor: NEON, borderRightColor: NEON,    bottom: 0, right:  0 }} />
              {/* animated scan line inside the frame */}
              <div style={css.scanLine} />
            </div>

            <p style={css.hint}>Point at any UPI QR code</p>
          </>
        )}

        {/* found confirmation overlay */}
        {phase === 'found' && found && (
          <div style={css.foundOverlay}>
            <div style={css.foundCircle}>
              <Check size={32} color="#000" strokeWidth={3} />
            </div>
            <p style={css.foundLabel}>QR Detected</p>
            <p style={css.foundName}>{found.name}</p>
            <p style={css.foundVpa}>{found.vpa}</p>
            <button style={css.payBtn} onClick={confirmFound}>
              Pay now <ArrowRight size={16} style={{ marginLeft: 6 }} />
            </button>
            <button style={css.rescanBtn} onClick={rescan}>Scan again</button>
          </div>
        )}
      </div>

      {/* ── bottom labels ────────────────────────────────────────── */}
      <div style={css.footer}>
        <p style={css.footerNote}>Supports all UPI QR codes</p>
        <div style={css.chips}>
          {['GPay', 'PhonePe', 'Paytm', 'BHIM', 'payit'].map((n, i) => (
            <span key={n} style={{ ...css.chip, color: CHIP_COLORS[i] }}>{n}</span>
          ))}
        </div>
      </div>

      {/* keyframe animations via inline style tag */}
      <style>{`
        @keyframes qr-spin  { to { transform: rotate(360deg); } }
        @keyframes qr-sweep {
          0%   { top: 0%;   opacity: 0; }
          5%   {            opacity: 1; }
          95%  {            opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const NEON = '#22e67b';
const CHIP_COLORS = ['#22e67b', '#0088ff', '#00cccc', '#eb3b88', '#aa33ff'];

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%',
    background: '#000', overflow: 'hidden', userSelect: 'none',
  },

  /* top bar */
  bar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    height: 52, padding: '0 12px',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)',
    position: 'relative', zIndex: 10,
  },
  barBtn: {
    width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  barTitle: { fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: 0.2 },

  /* viewport */
  viewport: {
    flex: 1, position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#000', overflow: 'hidden',
  },
  video: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover',
  },

  /* generic centred overlay */
  overlay: {
    position: 'absolute', inset: 0, zIndex: 8,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: '#000', padding: 32, textAlign: 'center',
  },
  overlayText: { color: '#aaa', fontSize: 13, margin: 0 },
  spinner: {
    width: 44, height: 44, borderRadius: '50%',
    border: '3px solid #222', borderTopColor: NEON,
    animation: 'qr-spin 0.75s linear infinite',
    marginBottom: 18,
  },
  retryBtn: {
    marginTop: 20, padding: '10px 24px', borderRadius: 12,
    background: NEON, color: '#000', border: 'none',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },

  /* vignette (semi-transparent dark area outside frame) */
  vignette: {
    position: 'absolute', inset: 0, zIndex: 2,
    background: 'rgba(0,0,0,0.55)',
    /* actual cut-out is done by the frame div sitting on top */
    pointerEvents: 'none',
  },

  /* scanner frame */
  frame: {
    position: 'absolute', zIndex: 3,
    width: 220, height: 220,
    /* vertically center, slightly above mid */
    top: '50%', left: '50%',
    transform: 'translate(-50%, -55%)',
    /* clear the vignette behind the frame */
    background: 'transparent',
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute', width: 26, height: 26,
    borderWidth: 3, borderStyle: 'solid', borderColor: 'transparent',
    borderRadius: 2,
  },
  scanLine: {
    position: 'absolute', left: 4, right: 4, height: 2,
    background: `linear-gradient(90deg, transparent, ${NEON} 40%, ${NEON} 60%, transparent)`,
    boxShadow: `0 0 10px ${NEON}88`,
    animation: 'qr-sweep 2s ease-in-out infinite',
    borderRadius: 1,
  },
  hint: {
    position: 'absolute', bottom: '18%', zIndex: 5,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
    color: '#fff', fontSize: 12, fontWeight: 500,
    padding: '6px 16px', borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.08)', margin: 0,
  },

  /* found overlay */
  foundOverlay: {
    position: 'absolute', inset: 0, zIndex: 10,
    background: 'rgba(0,0,0,0.92)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 28,
  },
  foundCircle: {
    width: 72, height: 72, borderRadius: '50%', background: NEON,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
    boxShadow: `0 0 32px ${NEON}66`,
  },
  foundLabel: { color: NEON, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6, margin: 0 },
  foundName:  { color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 4, margin: '6px 0 2px' },
  foundVpa:   { color: '#666', fontSize: 13, fontWeight: 500, marginBottom: 28, margin: '2px 0 24px' },
  payBtn: {
    background: NEON, color: '#000', border: 'none', borderRadius: 16,
    padding: '14px 36px', fontSize: 16, fontWeight: 800, cursor: 'pointer',
    display: 'flex', alignItems: 'center', marginBottom: 12,
    boxShadow: `0 4px 24px ${NEON}44`,
  },
  rescanBtn: {
    background: 'none', border: 'none', color: '#555',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0',
  },

  /* footer */
  footer: {
    padding: '12px 16px 24px', background: 'rgba(0,0,0,0.9)',
    textAlign: 'center',
  },
  footerNote: { color: '#333', fontSize: 11, fontWeight: 600, margin: '0 0 8px', letterSpacing: 0.3 },
  chips: { display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
  chip: {
    fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    padding: '3px 10px', borderRadius: 20,
  },
};
