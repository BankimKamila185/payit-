import { useState, useEffect } from 'react';
import { 
  Shield, Lock, Fingerprint, Phone, MessageSquare, MapPin, 
  ArrowRight, ChevronLeft, Building, User, CreditCard, Sparkles, Check 
} from 'lucide-react';
import { api, registerPasskey, loginWithPasskey, hasPasskey } from '../api';
import { sendFirebaseOtp, verifyFirebaseOtp } from '../firebase';

export default function OnboardingFlow({ onLogin, deviceId }) {
  // Onboarding steps: 'welcome' | 'phone_input' | 'otp_verify' | 'register_profile' | 'permissions' | 'bank_select' | 'pin_create' | 'pin_confirm' | 'pin_login'
  const [step, setStep] = useState('welcome');
  
  // Form fields
  const [phone, setPhone] = useState('');
  // OTP fields
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [activeOtpIdx, setActiveOtpIdx] = useState(0);
  const [otpTimer, setOtpTimer] = useState(60);
  const [fullName, setFullName] = useState('');
  const [vpa, setVpa] = useState('');
  const [onboardingOtpDemo, setOnboardingOtpDemo] = useState('');
  const [fbConfirmation, setFbConfirmation] = useState(null);
  const [selectedBank, setSelectedBank] = useState(null); // {id, name, upi_handle}
  const [banks, setBanks] = useState([]);
  
  // PIN flows
  const [pin, setPin] = useState(''); // for login screen
  const [appPin, setAppPin] = useState(''); // for setup
  const [confirmAppPin, setConfirmAppPin] = useState('');
  const [upiPin, setUpiPin] = useState('');
  const [confirmUpiPin, setConfirmUpiPin] = useState('');

  // Network/Error states
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [userProfile, setUserProfile] = useState(null); // Resolved after phone lookup

  // Biometric / passkey state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  // Check platform biometric availability on mount
  useEffect(() => {
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(ok => setBiometricAvailable(ok))
        .catch(() => setBiometricAvailable(false));
    }
  }, []);

  // Popular banks hardcoded fallback + fetch
  const defaultBanks = [
    { id: 2, name: 'HDFC Bank', upi_handle: 'okhdfc', color: '#1c3f94' },
    { id: 1, name: 'State Bank of India', upi_handle: 'oksbi', color: '#00a4e4' },
    { id: 3, name: 'ICICI Bank', upi_handle: 'okicici', color: '#f58220' },
    { id: 4, name: 'Axis Bank', upi_handle: 'okaxis', color: '#97144d' },
    { id: 5, name: 'Kotak Bank', upi_handle: 'okkotak', color: '#ed1c24' },
    { id: 6, name: 'Punjab National Bank', upi_handle: 'okpnb', color: '#ec1c24' }
  ];

  // Load banks list
  useEffect(() => {
    api.getBanks().then((r) => {
      if (r.ok && Array.isArray(r.data)) {
        // Merge fetched bank colors
        const enriched = r.data.map(b => {
          const match = defaultBanks.find(d => d.name.toLowerCase().includes(b.name.toLowerCase()) || b.name.toLowerCase().includes(d.name.toLowerCase()));
          return { ...b, color: match ? match.color : '#333' };
        });
        setBanks(enriched);
      } else {
        setBanks(defaultBanks);
      }
    }).catch(() => setBanks(defaultBanks));
  }, []);

  // OTP resend timer countdown
  useEffect(() => {
    if (step !== 'otp_verify' || otpTimer <= 0) return;
    const t = setInterval(() => setOtpTimer(prev => prev - 1), 1000);
    return () => clearInterval(t);
  }, [step, otpTimer]);

  const handlePhoneSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErr('Please enter a valid 10-digit mobile number');
      return;
    }
    setBusy(true); setErr('');
    try {
      const res = await api.phoneLookup(cleanPhone);
      if (res.ok && res.data) {
        setUserProfile(res.data);
        if (res.data.registered) {
          setFullName(res.data.name);
          setVpa(res.data.vpa);
        } else {
          setFullName('');
          setVpa(cleanPhone + '@payit');
        }
      } else {
        setUserProfile({ registered: false });
        setFullName('');
        setVpa(cleanPhone + '@payit');
      }

      // 1. Try Firebase Phone Auth
      const fbRes = await sendFirebaseOtp(cleanPhone, 'recaptcha-container');
      if (fbRes.success && fbRes.confirmationResult) {
        setFbConfirmation(fbRes.confirmationResult);
      } else {
        if (fbRes.error) {
          console.warn("[Firebase Phone Auth Error]:", fbRes.error);
        }
        // Fallback to server OTP
        const otpRes = await api.sendOtp(cleanPhone);
        if (otpRes.ok && otpRes.data && otpRes.data.otp_demo) {
          setOnboardingOtpDemo(otpRes.data.otp_demo);
        } else {
          setOnboardingOtpDemo('123456');
        }
      }
      setBusy(false);
      setOtp(['', '', '', '', '', '']);
      setActiveOtpIdx(0);
      setStep('otp_verify');
      setOtpTimer(60);
    } catch {
      // Offline fallback: allow smooth demo onboarding so user is never blocked by connection error
      setUserProfile({ registered: false });
      setFullName('');
      setVpa(cleanPhone + '@payit');
      setOnboardingOtpDemo('123456');
      setBusy(false);
      setOtp(['', '', '', '', '', '']);
      setActiveOtpIdx(0);
      setStep('otp_verify');
      setOtpTimer(60);
    }
  };

  const handleOtpSubmit = async (overrideCode) => {
    const code = overrideCode || otp.join('');
    if (code.length < 6) {
      setErr('Enter the 6-digit OTP code');
      return;
    }
    setBusy(true); setErr('');
    try {
      const cleanPhone = phone.replace(/\D/g, '');

      // Try Firebase verification if confirmationResult exists and user did not use Demo OTP
      if (fbConfirmation && code !== onboardingOtpDemo && code !== '123456') {
        const fbVerify = await verifyFirebaseOtp(fbConfirmation, code);
        if (fbVerify.success && fbVerify.idToken) {
          const fbLoginRes = await api.firebaseLogin(fbVerify.idToken);
          setBusy(false);
          if (fbLoginRes.ok) {
            if (fbLoginRes.data?.registered && fbLoginRes.data?.token) {
              setUserProfile(fbLoginRes.data);
            }
            setStep('permissions');
            return;
          }
        } else if (fbVerify.error && code !== onboardingOtpDemo && code !== '123456') {
          setBusy(false);
          setErr(fbVerify.error.includes('invalid-verification-code') 
            ? 'Incorrect Firebase OTP code. Enter the code from SMS or tap Demo OTP Auto-fill.' 
            : (fbVerify.error || 'Firebase OTP verification failed.'));
          return;
        }
      }

      // Backend / Demo OTP verification (handles Auto-fill and server demo OTPs)
      const res = await api.verifyOnboardingOtp(cleanPhone, code);
      setBusy(false);
      if (res.ok) {
        setStep('permissions');
      } else if (code === onboardingOtpDemo || code === '123456') {
        setStep('permissions');
      } else {
        setErr(res.data?.detail || 'Incorrect OTP. Please try again.');
      }
    } catch {
      setBusy(false);
      if (code === onboardingOtpDemo || code === '123456') {
        setStep('permissions');
      } else {
        setErr('Verification failed. Please try again.');
      }
    }
  };

  const handleRegisterProfileSubmit = () => {
    if (!fullName.trim()) {
      setErr('Please enter your full name');
      return;
    }
    if (!vpa.trim() || !vpa.includes('@')) {
      setErr('Please enter a valid UPI VPA ID (e.g. name@payit)');
      return;
    }
    setErr('');
    setStep('bank_select');
  };

  const handleBankSelect = (bank) => {
    setSelectedBank(bank);
    setErr('');
  };

  const handlePermissionsNext = () => {
    setErr('');
    if (userProfile?.registered) {
      // Existing user goes to enter PIN login
      setStep('pin_login');
      setPin('');
    } else {
      // New user goes to Profile details registration
      setStep('register_profile');
    }
  };

  const handleKeypadPress = (val) => {
    setErr('');
    if (step === 'pin_login') {
      if (pin.length < 4) {
        const nextPin = pin + val;
        setPin(nextPin);
        if (nextPin.length === 4) {
          handlePinLogin(nextPin);
        }
      }
    } else if (step === 'app_pin_create') {
      if (appPin.length < 4) {
        const nextPin = appPin + val;
        setAppPin(nextPin);
        if (nextPin.length === 4) {
          setTimeout(() => {
            setStep('app_pin_confirm');
            setConfirmAppPin('');
          }, 300);
        }
      }
    } else if (step === 'app_pin_confirm') {
      if (confirmAppPin.length < 4) {
        const nextPin = confirmAppPin + val;
        setConfirmAppPin(nextPin);
        if (nextPin.length === 4) {
          if (appPin !== nextPin) {
            setErr("PINs do not match. Try again.");
            setStep('app_pin_create');
            setAppPin('');
            setConfirmAppPin('');
          } else {
            setTimeout(() => {
              setStep('upi_pin_create');
              setUpiPin('');
            }, 300);
          }
        }
      }
    } else if (step === 'upi_pin_create') {
      if (upiPin.length < 6) {
        const nextPin = upiPin + val;
        setUpiPin(nextPin);
        if (nextPin.length === 6) {
          setTimeout(() => {
            setStep('upi_pin_confirm');
            setConfirmUpiPin('');
          }, 300);
        }
      }
    } else if (step === 'upi_pin_confirm') {
      if (confirmUpiPin.length < 6) {
        const nextPin = confirmUpiPin + val;
        setConfirmUpiPin(nextPin);
        if (nextPin.length === 6) {
          handlePinRegister(nextPin);
        }
      }
    }
  };

  const handleKeypadBackspace = () => {
    setErr('');
    if (step === 'pin_login') {
      setPin(prev => prev.slice(0, -1));
    } else if (step === 'app_pin_create') {
      setAppPin(prev => prev.slice(0, -1));
    } else if (step === 'app_pin_confirm') {
      setConfirmAppPin(prev => prev.slice(0, -1));
    } else if (step === 'upi_pin_create') {
      setUpiPin(prev => prev.slice(0, -1));
    } else if (step === 'upi_pin_confirm') {
      setConfirmUpiPin(prev => prev.slice(0, -1));
    }
  };

  const handlePinLogin = async (enteredPin) => {
    setBusy(true); setErr('');
    try {
      const res = await onLogin(userProfile.vpa, enteredPin);
      setBusy(false);
      if (!res.ok) {
        setErr(res.error || 'Incorrect UPI PIN');
        setPin('');
      }
    } catch {
      setBusy(false);
      setErr('Login failed. Server error.');
      setPin('');
    }
  };

  const handleFingerprintLogin = async () => {
    if (!userProfile?.vpa) return;
    setBiometricBusy(true); setErr('');
    let result = await loginWithPasskey(userProfile.vpa);
    if (!result.ok && result.error && (result.error.includes('No passkey') || result.error.includes('not supported'))) {
      const reg = await registerPasskey(userProfile.vpa);
      if (reg.ok) {
        result = await loginWithPasskey(userProfile.vpa);
      }
    }
    setBiometricBusy(false);
    if (result.ok) {
      const d = result.data;
      await onLogin(d.vpa, null, d);
    } else {
      setErr(result.error || 'Biometric login failed. Use App PIN instead.');
    }
  };

  const handlePinRegister = async (enteredConfirmUpiPin) => {
    if (upiPin !== enteredConfirmUpiPin) {
      setErr('UPI PINs do not match. Try again.');
      setStep('upi_pin_create');
      setUpiPin('');
      setConfirmUpiPin('');
      return;
    }
    setBusy(true); setErr('');
    try {
      const payload = {
        phone,
        name: fullName.trim(),
        vpa: vpa.trim(),
        bank_id: selectedBank?.id || 1,
        upi_pin: upiPin,
        login_pin: appPin
      };
      const res = await api.register(payload);
      setBusy(false);
      if (res.ok) {
        // Auto-login after registration (uses 4-digit App PIN)
        const loginRes = await onLogin(payload.vpa, appPin);
        if (!loginRes.ok) {
          setErr(loginRes.error || 'Failed to login after registration');
          return;
        }
        // Offer passkey enrollment if biometrics are available
        if (biometricAvailable) {
          setBiometricBusy(true);
          await registerPasskey(payload.vpa);
          setBiometricBusy(false);
        }
      } else {
        const isAlreadyReg = res.data?.detail?.includes('already registered');
        if (isAlreadyReg) {
          setErr('UPI ID / VPA already registered. Redirecting to Login...');
          setUserProfile(prev => ({ ...prev, registered: true, vpa: payload.vpa }));
          setTimeout(() => {
            setStep('pin_login');
            setPin('');
            setErr('');
          }, 1200);
        } else {
          setErr(res.data?.detail || 'Registration failed');
        }
      }
    } catch {
      setBusy(false);
      setErr('Registration failed. Server error.');
    }
  };

  // Render back button helper
  const renderBackBtn = (prevStep) => (
    <button style={S.backBtn} onClick={() => { setStep(prevStep); setErr(''); }}>
      <ChevronLeft size={22} color="#fff" />
    </button>
  );

  // Render screens based on current step state
  return (
    <div style={S.wrap}>
      <div id="recaptcha-container"></div>
      
      {/* -------------------- STEP 1: Welcome/Splash Screen -------------------- */}
      {step === 'welcome' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '100%',
          width: '100%',
          position: 'relative',
          backgroundImage: 'url(/onboarding-hero.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          padding: '24px 20px 28px',
          boxSizing: 'border-box',
          borderRadius: '32px',
          overflow: 'hidden'
        }} className="animate-fade-in">
          {/* Subtle bottom gradient to ensure text readability */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '180px',
            background: 'linear-gradient(to top, rgba(248, 246, 255, 0.95) 0%, rgba(248, 246, 255, 0.6) 60%, transparent 100%)',
            pointerEvents: 'none',
            zIndex: 1
          }} />

          <div style={{ zIndex: 2, width: '100%' }} />

          {/* Bottom CTA & Legal Section */}
          <div style={{ width: '100%', textAlign: 'center', zIndex: 2, marginTop: 'auto' }}>
            <p style={{
              fontSize: '11px',
              color: '#444455',
              marginBottom: '14px',
              fontWeight: '500'
            }}>
              By continuing, you accept <span style={{ textDecoration: 'underline', fontWeight: '700', cursor: 'pointer', color: '#5632eb' }}>Privacy Policy</span> and <span style={{ textDecoration: 'underline', fontWeight: '700', cursor: 'pointer', color: '#5632eb' }}>T&C</span>
            </p>
            <button
              style={{
                width: '100%',
                padding: '16px 20px',
                borderRadius: '30px',
                border: 'none',
                background: 'linear-gradient(135deg, #6c47ff 0%, #5632eb 100%)',
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 10px 25px rgba(108, 71, 255, 0.35)',
                transition: 'transform 0.15s ease-in-out, boxShadow 0.15s ease-in-out'
              }}
              onClick={() => setStep('phone_input')}
            >
              Get started
            </button>
          </div>
        </div>
      )}

      {/* -------------------- STEP 2: Phone Input Screen -------------------- */}
      {step === 'phone_input' && (
        <div style={S.screenContainer}>
          {renderBackBtn('welcome')}
          
          <div style={S.headerSection}>
            <h2 style={S.screenTitle}>Enter phone number</h2>
            <p style={S.screenSub}>Please enter your mobile number linked with your bank accounts.</p>
          </div>

          <div style={S.inputGroup}>
            <div style={S.phonePrefix}>+91</div>
            <input
              type="tel"
              style={S.phoneInput}
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              onKeyDown={(e) => e.key === 'Enter' && handlePhoneSubmit()}
              autoFocus
            />
          </div>

          {err && <div style={S.errText}>{err}</div>}

          <div style={S.actionRowRight}>
            <button style={{ ...S.nextCircleBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={handlePhoneSubmit}>
              {busy ? '…' : <ArrowRight size={22} color="#fff" />}
            </button>
          </div>
        </div>
      )}

      {/* -------------------- STEP 3: OTP Verification -------------------- */}
      {step === 'otp_verify' && (
        <div style={S.screenContainer}>
          {renderBackBtn('phone_input')}
          
          <div style={S.headerSection}>
            <div style={S.otpPhoneRow}>
              <span style={S.otpSubText}>Sent to +91 {phone}</span>
              <button style={S.changeLink} onClick={() => setStep('phone_input')}>Change</button>
            </div>
          </div>

          {/* 6 box input blocks */}
          <div style={S.otpGrid}>
            {otp.map((digit, idx) => (
              <input
                key={idx}
                id={`otp-box-${idx}`}
                type="tel"
                maxLength="1"
                style={{
                  ...S.otpBox,
                  border: idx === activeOtpIdx ? '2px solid #aa33ff' : '1px solid var(--border-color)',
                  background: digit ? 'var(--text-primary)' : 'var(--surface-color)',
                  color: digit ? 'var(--bg-color)' : 'var(--text-primary)'
                }}
                value={digit}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  const nextOtp = [...otp];
                  nextOtp[idx] = val;
                  setOtp(nextOtp);
                  setErr('');
                  if (val && idx < 5) {
                    setActiveOtpIdx(idx + 1);
                    document.getElementById(`otp-box-${idx + 1}`)?.focus();
                  }
                  if (nextOtp.every(d => d !== '') && nextOtp.join('').length === 6) {
                    handleOtpSubmit(nextOtp.join(''));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace') {
                    if (!otp[idx] && idx > 0) {
                      setActiveOtpIdx(idx - 1);
                      document.getElementById(`otp-box-${idx - 1}`)?.focus();
                    } else {
                      const nextOtp = [...otp];
                      nextOtp[idx] = '';
                      setOtp(nextOtp);
                    }
                  }
                }}
                onFocus={() => setActiveOtpIdx(idx)}
                autoFocus={idx === activeOtpIdx}
              />
            ))}
          </div>

          {/* Server-log notice */}
          <div style={{ backgroundColor: 'rgba(170,51,255,0.07)', border: '1px solid rgba(170,51,255,0.2)', borderRadius: 10, padding: '8px 12px', marginBottom: 10, textAlign: 'center' }}>
            <p style={{ color: '#aa33ff', fontSize: 11, fontWeight: 600, margin: 0 }}>📱 OTP sent to +91 {phone.slice(-4).padStart(phone.length, '•')}</p>
            {onboardingOtpDemo ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ color: '#22e67b', fontSize: 11, fontWeight: 700 }}>Demo OTP: {onboardingOtpDemo}</span>
                <button
                  type="button"
                  onClick={() => {
                    const digits = onboardingOtpDemo.split('').slice(0, 6);
                    setOtp(digits);
                    handleOtpSubmit(onboardingOtpDemo);
                  }}
                  style={{ background: 'var(--accent-neon, #22e67b)', color: '#000', border: 'none', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                >
                  ⚡ Auto-fill
                </button>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 10, margin: '3px 0 0 0' }}>Check Render / server logs to retrieve code.</p>
            )}
          </div>

          <div style={S.otpResendRow}>
            {otpTimer > 0 ? (
              <span style={S.timerText}>Resend in 0:{otpTimer < 10 ? `0${otpTimer}` : otpTimer}</span>
            ) : (
              <button style={S.resendBtn} onClick={async () => {
                const cleanPhone = phone.replace(/\D/g, '');
                const otpRes = await api.sendOtp(cleanPhone);
                if (otpRes.ok && otpRes.data.otp_demo) {
                  setOnboardingOtpDemo(otpRes.data.otp_demo);
                }
                setOtpTimer(60);
                setErr('');
              }}>Resend OTP</button>
            )}
          </div>

          {err && <div style={S.errText}>{err}</div>}

          <div style={S.actionRowRight}>
            <button style={S.nextCircleBtn} onClick={handleOtpSubmit}>
              <ArrowRight size={22} color="#fff" />
            </button>
          </div>
        </div>
      )}

      {/* -------------------- STEP 4: Registration Profile details (For New Users) -------------------- */}
      {step === 'register_profile' && (
        <div style={S.screenContainer}>
          {renderBackBtn('otp_verify')}
          
          <div style={S.headerSection}>
            <h2 style={S.screenTitle}>Create profile</h2>
            <p style={S.screenSub}>Please enter details to set up your UPI account.</p>
          </div>

          <div style={S.formGroup}>
            <label style={S.label}>Full Name</label>
            <div style={S.inputFieldWrapper}>
              <User size={18} color="#666" style={S.inputIcon} />
              <input
                type="text"
                style={S.textInput}
                placeholder="Ravi Kumar"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  // Auto-suggest VPA on name input
                  const cleanName = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '');
                  if (cleanName) {
                    setVpa(cleanName + '@payit');
                  }
                }}
              />
            </div>
          </div>

          <div style={S.formGroup}>
            <label style={S.label}>Create UPI VPA ID</label>
            <div style={S.inputFieldWrapper}>
              <Shield size={18} color="#666" style={S.inputIcon} />
              <input
                type="text"
                style={S.textInput}
                placeholder="ravi@payit"
                value={vpa}
                onChange={(e) => setVpa(e.target.value)}
              />
            </div>
            <span style={S.inputHint}>This will be your address to receive money.</span>
          </div>

          {err && <div style={S.errText}>{err}</div>}

          <div style={S.actionRowRight}>
            <button style={S.nextCircleBtn} onClick={handleRegisterProfileSubmit}>
              <ArrowRight size={22} color="#fff" />
            </button>
          </div>
        </div>
      )}

      {/* -------------------- STEP 5: Permissions Screen -------------------- */}
      {step === 'permissions' && (
        <div style={S.screenContainer}>
          <div style={S.permissionsHeader}>
            <button style={S.denyBtn} onClick={() => setStep('welcome')}>Deny</button>
          </div>
          
          <div style={S.headerSection}>
            <h2 style={S.screenTitle}>Let's get started</h2>
            <p style={S.screenSub}>We need some permissions to continue</p>
          </div>

          {/* Permissions Lists */}
          <div style={S.permissionsList}>
            <div style={S.permItem}>
              <div style={S.permIconContainer}>
                <MessageSquare size={22} color="#eb3b88" />
              </div>
              <div style={S.permContent}>
                <h3 style={S.permItemTitle}>SMS</h3>
                <p style={S.permItemText}>We sync SMS to enable UPI as per RBI and NPCI guidelines, support risk assessment, and help prevent fraud.</p>
              </div>
            </div>

            <div style={S.permItem}>
              <div style={S.permIconContainer}>
                <Phone size={22} color="#aa33ff" />
              </div>
              <div style={S.permContent}>
                <h3 style={S.permItemTitle}>Phone</h3>
                <p style={S.permItemText}>We collect phone number to match SIM on the device to your registered phone number.</p>
              </div>
            </div>

            <div style={S.permItem}>
              <div style={S.permIconContainer}>
                <MapPin size={22} color="#eb3b88" />
              </div>
              <div style={S.permContent}>
                <h3 style={S.permItemTitle}>Location</h3>
                <p style={S.permItemText}>We use your location for KYC verification, enhanced security and seamless banking services.</p>
              </div>
            </div>
          </div>

          <div style={S.actionRowRight}>
            <button style={S.nextCircleBtn} onClick={handlePermissionsNext}>
              <ArrowRight size={22} color="#fff" />
            </button>
          </div>
        </div>
      )}

      {/* -------------------- STEP 6: Bank Account Linking -------------------- */}
      {step === 'bank_select' && (
        <div style={S.screenContainer}>
          {renderBackBtn('register_profile')}
          
          <div style={S.headerSection}>
            <h2 style={S.screenTitle}>Select Bank Account</h2>
            <p style={S.screenSub}>Select the bank where your account is located to link it to your UPI ID.</p>
          </div>

          <div style={S.bankGrid}>
            {banks.map(bank => (
              <button 
                key={bank.id} 
                style={{ 
                  ...S.bankCard, 
                  border: selectedBank?.id === bank.id ? '2px solid #eb3b88' : '1px solid var(--border-color)',
                  background: selectedBank?.id === bank.id ? 'rgba(235, 59, 136, 0.08)' : 'var(--surface-color)'
                }}
                onClick={() => handleBankSelect(bank)}
              >
                <div style={{ ...S.bankLogoSquare, background: bank.color }}>
                  <Building size={20} color="#fff" />
                </div>
                <div style={S.bankCardName}>{bank.name}</div>
                {selectedBank?.id === bank.id && (
                  <div style={S.selectedBadge}><Check size={10} color="#fff" /></div>
                )}
              </button>
            ))}
          </div>

          {err && <div style={S.errText}>{err}</div>}

          <div style={S.actionRowRight}>
            <button style={{ ...S.nextCircleBtn, opacity: selectedBank ? 1 : 0.5 }} disabled={!selectedBank} onClick={() => setStep('app_pin_create')}>
              <ArrowRight size={22} color="#fff" />
            </button>
          </div>
        </div>
      )}

      {/* -------------------- STEP 7 & 8: PIN Setup (Create / Confirm) -------------------- */}
      {(step === 'app_pin_create' || step === 'app_pin_confirm' || step === 'upi_pin_create' || step === 'upi_pin_confirm') && (
        <div style={S.screenContainer}>
          {renderBackBtn(
            step === 'app_pin_confirm' ? 'app_pin_create' :
            step === 'upi_pin_create' ? 'app_pin_confirm' :
            step === 'upi_pin_confirm' ? 'upi_pin_create' :
            'bank_select'
          )}
          
          <div style={S.headerSection}>
            <h2 style={S.screenTitle}>
              {step === 'app_pin_create' ? 'Create App PIN' :
               step === 'app_pin_confirm' ? 'Confirm App PIN' :
               step === 'upi_pin_create' ? 'Create UPI PIN' : 'Confirm UPI PIN'}
            </h2>
            <p style={S.screenSub}>
              {step === 'app_pin_create' ? 'Create a secure 4-digit App PIN to lock the application.' :
               step === 'app_pin_confirm' ? 'Confirm your secure 4-digit App PIN by entering it again.' :
               step === 'upi_pin_create' ? 'Create a secure 6-digit UPI transaction PIN. Never share it.' :
               'Confirm your secure 6-digit UPI PIN by entering it again.'}
            </p>
          </div>

          {/* Dot indicators */}
          <div style={S.dotRow}>
            {Array(
              (step === 'app_pin_create' || step === 'app_pin_confirm') ? 4 : 6
            ).fill(0).map((_, idx) => {
              const enteredLen = 
                step === 'app_pin_create' ? appPin.length :
                step === 'app_pin_confirm' ? confirmAppPin.length :
                step === 'upi_pin_create' ? upiPin.length : confirmUpiPin.length;
              return (
                <div 
                  key={idx} 
                  style={{
                    ...S.pinDot,
                    background: idx < enteredLen ? 'var(--text-primary)' : 'transparent',
                    border: '2px solid var(--text-muted)'
                  }}
                ></div>
              );
            })}
          </div>

          {err && (
            <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
              <div style={S.errText}>{err}</div>
              {err.includes('already registered') && (
                <button
                  type="button"
                  onClick={() => {
                    setStep('pin_login');
                    setPin('');
                    setErr('');
                  }}
                  style={{
                    marginTop: 8,
                    background: 'var(--accent-neon, #22e67b)',
                    color: '#000',
                    border: 'none',
                    borderRadius: 16,
                    padding: '8px 18px',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(34,230,123,0.2)'
                  }}
                >
                  🔑 Switch to PIN Login
                </button>
              )}
            </div>
          )}

          {/* Numeric Keypad */}
          <div style={S.keypadContainer}>
            <div style={S.keypadGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button key={num} style={S.keyBtn} onClick={() => handleKeypadPress(num.toString())}>
                  {num}
                </button>
              ))}
              <button style={S.keyBtn} onClick={() => handleKeypadPress('0')}>0</button>
              <button style={S.keyBtnBack} onClick={handleKeypadBackspace}>⌫</button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------- STEP 9: Enter PIN Login Screen -------------------- */}
      {step === 'pin_login' && (
        <div style={S.screenContainer}>
          <div style={S.headerSection}>
            <h2 style={S.loginNameTitle}>Hi {fullName || 'User'}</h2>
            <p style={S.loginPhoneSub}>+91 {phone.slice(0, 3)}••••••{phone.slice(-4)}</p>
          </div>

          {/* Fingerprint quick-login (shown if biometrics available on device or passkey registered) */}
          {(biometricAvailable || hasPasskey(userProfile?.vpa)) && (
            <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
              <button
                style={{
                  background: biometricBusy ? 'rgba(170,51,255,0.15)' : 'rgba(170,51,255,0.08)',
                  border: '1px solid rgba(170,51,255,0.35)',
                  borderRadius: 20,
                  padding: '14px 28px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: biometricBusy ? 'default' : 'pointer',
                  color: '#aa33ff',
                  fontSize: 14,
                  fontWeight: 700,
                  boxShadow: '0 0 20px rgba(170,51,255,0.18)',
                  transition: 'all 0.2s',
                }}
                onClick={handleFingerprintLogin}
                disabled={biometricBusy}
                aria-label="Login with fingerprint"
              >
                <Fingerprint
                  size={24}
                  color="#aa33ff"
                  style={{ animation: biometricBusy ? 'pulse 1s ease-in-out infinite' : 'none' }}
                />
                {biometricBusy ? 'Verifying…' : 'Use Fingerprint / Face ID'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 6px', padding: '0 24px' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600 }}>OR ENTER APP LOGIN PIN</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
              </div>
            </div>
          )}

          {/* Dots indicating pin entry length */}
          <div style={S.dotRow}>
            {Array(4).fill(0).map((_, idx) => (
              <div
                key={idx}
                style={{
                  ...S.pinDot,
                  background: idx < pin.length ? 'var(--text-primary)' : 'transparent',
                  border: '2px solid var(--text-muted)'
                }}
              ></div>
            ))}
          </div>

          <button style={S.forgotLink} onClick={() => { setStep('phone_input'); setPin(''); }}>
            Forgot Pin ?
          </button>

          {err && <div style={S.errText}>{err}</div>}

          {/* Custom numeric keypad */}
          <div style={S.keypadContainer}>
            <div style={S.keypadGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button key={num} style={S.keyBtn} onClick={() => handleKeypadPress(num.toString())}>
                  {num}
                </button>
              ))}
              {/* Backspace on left, 0 in middle, Next button on right */}
              <button style={S.keyBtnBack} onClick={handleKeypadBackspace}>⌫</button>
              <button style={S.keyBtn} onClick={() => handleKeypadPress('0')}>0</button>
              <button style={{ ...S.keyBtnCircleNext, opacity: pin.length === 4 ? 1 : 0.5 }} onClick={() => handlePinLogin(pin)}>
                {busy ? '…' : '→'}
              </button>
            </div>
          </div>

          {/* Enable fingerprint for next time (if available but not yet enrolled) */}
          {biometricAvailable && !hasPasskey(userProfile?.vpa) && (
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                onClick={async () => {
                  if (!userProfile?.vpa) return;
                  setBiometricBusy(true); setErr('');
                  const r = await registerPasskey(userProfile.vpa);
                  setBiometricBusy(false);
                  if (!r.ok) setErr(r.error);
                  else setErr(''); // trigger re-render to show the full button
                }}
                disabled={biometricBusy}
              >
                <Fingerprint size={12} color="var(--text-secondary)" />
                {biometricBusy ? 'Registering fingerprint…' : 'Enable Fingerprint Login'}
              </button>
            </div>
          )}
        </div>
      )}



    </div>
  );
}

// Inline styles for high-fidelity dark UI mirroring the mockups
const S = {
  wrap: { 
    display: 'flex', 
    flexDirection: 'column', 
    height: '100%', 
    background: 'var(--bg-color)', 
    color: 'var(--text-primary)',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative',
    overflow: 'hidden'
  },
  welcomeContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '30px 24px',
    background: 'linear-gradient(185deg, #a04ef6 0%, #ec3e8d 100%)',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative'
  },
  blob1: {
    position: 'absolute',
    width: '180px',
    height: '60px',
    background: 'rgba(255, 255, 255, 0.15)',
    borderRadius: '100px',
    top: '12%',
    left: '-40px',
    transform: 'rotate(-10deg)'
  },
  blob2: {
    position: 'absolute',
    width: '120px',
    height: '40px',
    background: 'rgba(255, 255, 255, 0.12)',
    borderRadius: '100px',
    top: '32%',
    right: '-30px',
    transform: 'rotate(15deg)'
  },
  brandHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    zIndex: 2
  },
  brandText: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '-0.5px'
  },
  bankGraphicContainer: {
    margin: 'auto 0',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '240px',
    width: '100%',
    zIndex: 2
  },
  svgBank: {
    filter: 'drop-shadow(0 15px 25px rgba(0,0,0,0.3))'
  },
  sparkle1: { position: 'absolute', top: '15%', left: '18%' },
  sparkle2: { position: 'absolute', bottom: '15%', right: '15%' },
  welcomeBody: {
    width: '100%',
    textAlign: 'center',
    marginBottom: '20px',
    zIndex: 2
  },
  welcomeTitle: {
    fontSize: '34px',
    fontWeight: '800',
    lineHeight: '1.2',
    letterSpacing: '-1px',
    margin: 0
  },
  welcomeBottom: {
    width: '100%',
    textAlign: 'center',
    zIndex: 2
  },
  legalText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.75)',
    marginBottom: 20
  },
  link: {
    textDecoration: 'underline',
    fontWeight: '600',
    cursor: 'pointer'
  },
  startedBtn: {
    width: '100%',
    padding: '16px 20px',
    borderRadius: '28px',
    border: 'none',
    background: '#fff',
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    transition: 'transform 0.15s ease-in-out'
  },
  screenContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '24px 22px',
    boxSizing: 'border-box'
  },
  backBtn: {
    alignSelf: 'flex-start',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 0',
    marginBottom: 20
  },
  headerSection: {
    marginBottom: 32
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '700',
    margin: '0 0 8px 0',
    letterSpacing: '-0.5px'
  },
  screenSub: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: '1.4'
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--surface-color)',
    borderRadius: '14px',
    border: '1px solid var(--border-color)',
    padding: '4px 16px',
    marginBottom: 20
  },
  phonePrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginRight: 10
  },
  phoneInput: {
    flex: 1,
    padding: '12px 0',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 16,
    fontWeight: '600',
    outline: 'none'
  },
  demoUsersSection: {
    marginTop: 10,
    marginBottom: 20
  },
  demoUsersTitle: {
    fontSize: 12,
    color: 'var(--text-muted)',
    marginBottom: 10
  },
  demoChips: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  demoChip: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderRadius: '10px',
    background: 'var(--surface-color)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    textAlign: 'left'
  },
  demoChipName: {
    fontSize: 13,
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  demoChipPhone: {
    fontSize: 12,
    color: 'var(--text-secondary)'
  },
  actionRowRight: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 'auto',
    paddingBottom: 10
  },
  nextCircleBtn: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#a04ef6',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 8px 16px rgba(160, 78, 246, 0.3)'
  },
  errText: {
    color: 'var(--danger-color)',
    fontSize: 12,
    marginTop: 10,
    fontWeight: '500'
  },
  otpPhoneRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    width: '100%'
  },
  otpSubText: {
    fontSize: 14,
    color: 'var(--text-secondary)'
  },
  changeLink: {
    background: 'none',
    border: 'none',
    color: '#a04ef6',
    fontSize: 14,
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline'
  },
  otpGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: 8,
    marginTop: 20,
    marginBottom: 20
  },
  otpBox: {
    height: 52,
    borderRadius: '10px',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
  },
  quickFillOtpBtn: {
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
    alignSelf: 'center',
    marginBottom: 20
  },
  otpResendRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: 10
  },
  timerText: {
    fontSize: 13,
    color: 'var(--text-muted)'
  },
  resendBtn: {
    background: 'none',
    border: 'none',
    color: '#a04ef6',
    fontSize: 13,
    fontWeight: '600',
    cursor: 'pointer'
  },
  permissionsHeader: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 10
  },
  denyBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 14,
    cursor: 'pointer'
  },
  permissionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    margin: '20px 0'
  },
  permItem: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start'
  },
  permIconContainer: {
    width: 44,
    height: 44,
    borderRadius: '12px',
    background: 'var(--surface-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  permContent: {
    flex: 1
  },
  permItemTitle: {
    fontSize: 16,
    fontWeight: '700',
    margin: '0 0 4px 0'
  },
  permItemText: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: '1.4'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 20
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: 'var(--text-secondary)'
  },
  inputFieldWrapper: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '0 14px'
  },
  inputIcon: {
    marginRight: 10
  },
  textInput: {
    flex: 1,
    padding: '14px 0',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none'
  },
  inputHint: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 2
  },
  bankGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    marginTop: 10,
    maxHeight: '340px',
    overflowY: 'auto',
    padding: '2px'
  },
  bankCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 10px',
    borderRadius: '14px',
    cursor: 'pointer',
    position: 'relative'
  },
  bankLogoSquare: {
    width: 44,
    height: 44,
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  bankCardName: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    color: 'var(--text-primary)'
  },
  selectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#eb3b88',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dotRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 20,
    margin: '30px 0'
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: '50%'
  },
  keypadContainer: {
    marginTop: 'auto',
    width: '100%',
    paddingBottom: 10
  },
  keypadGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 15,
    justifyItems: 'center',
    alignItems: 'center'
  },
  keyBtn: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 24,
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  keyBtnBack: {
    width: 60,
    height: 60,
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginNameTitle: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    margin: '20px 0 6px 0',
    letterSpacing: '-0.5px'
  },
  loginPhoneSub: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    textAlign: 'center',
    margin: 0
  },
  forgotLink: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 14,
    fontWeight: '600',
    cursor: 'pointer',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 30
  },
  keyBtnCircleNext: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: '#a04ef6',
    border: 'none',
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 16px rgba(160, 78, 246, 0.3)'
  }
};
