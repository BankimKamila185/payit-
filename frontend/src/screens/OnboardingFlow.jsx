import { useState, useEffect } from 'react';
import { 
  Shield, Lock, Fingerprint, Phone, MessageSquare, MapPin, 
  ArrowRight, ChevronLeft, Building, User, CreditCard, Sparkles, Check 
} from 'lucide-react';
import { api, registerPasskey, loginWithPasskey, hasPasskey } from '../api';

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
  const [selectedBank, setSelectedBank] = useState(null); // {id, name, upi_handle}
  const [banks, setBanks] = useState([]);
  
  // PIN flows
  const [pin, setPin] = useState(''); // for setup & login
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMode, setPinMode] = useState('create'); // 'create' | 'confirm'

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

  // Quick fill phone numbers (from database seed data) for easy testing
  const demoUsers = [
    { name: 'Isha Singh', phone: '9043321819', vpa: 'isha1@oksbi' },
    { name: 'Ravi Sharma', phone: '9265423511', vpa: 'ravi2@okpnb' },
    { name: 'Simran Desai', phone: '9931034131', vpa: 'simran3@ybl' }
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

  const handlePhoneSubmit = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setErr('Enter a valid 10-digit mobile number');
      return;
    }
    setBusy(true); setErr('');
    try {
      const res = await api.phoneLookup(cleanPhone);
      if (!res.ok) {
        setBusy(false);
        setErr('Lookup failed, please try again.');
        return;
      }
      setUserProfile(res.data);
      if (res.data.registered) {
        setFullName(res.data.name);
        setVpa(res.data.vpa);
      } else {
        setFullName('');
        setVpa(cleanPhone + '@payit');
      }
      // Send real OTP via backend (printed to server logs)
      const otpRes = await api.sendOtp(cleanPhone);
      if (otpRes.ok && otpRes.data.otp_demo) {
        setOnboardingOtpDemo(otpRes.data.otp_demo);
      }
      setBusy(false);
      setOtp(['', '', '', '', '', '']);
      setActiveOtpIdx(0);
      setStep('otp_verify');
      setOtpTimer(60);
    } catch {
      setBusy(false);
      setErr('Connection error.');
    }
  };

  const handleOtpSubmit = async () => {
    const code = otp.join('');
    if (code.length < 6) {
      setErr('Enter the 6-digit OTP code');
      return;
    }
    setBusy(true); setErr('');
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const res = await api.verifyOnboardingOtp(cleanPhone, code);
      setBusy(false);
      if (res.ok) {
        setStep('permissions');
      } else {
        setErr(res.data?.detail || 'Incorrect OTP. Please try again.');
      }
    } catch {
      setBusy(false);
      setErr('Verification failed. Please try again.');
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
    } else if (step === 'pin_create') {
      if (pin.length < 4) {
        const nextPin = pin + val;
        setPin(nextPin);
        if (nextPin.length === 4) {
          setTimeout(() => {
            setStep('pin_confirm');
            setConfirmPin('');
          }, 300);
        }
      }
    } else if (step === 'pin_confirm') {
      if (confirmPin.length < 4) {
        const nextPin = confirmPin + val;
        setConfirmPin(nextPin);
        if (nextPin.length === 4) {
          handlePinRegister(nextPin);
        }
      }
    }
  };

  const handleKeypadBackspace = () => {
    setErr('');
    if (step === 'pin_login') {
      setPin(prev => prev.slice(0, -1));
    } else if (step === 'pin_create') {
      setPin(prev => prev.slice(0, -1));
    } else if (step === 'pin_confirm') {
      setConfirmPin(prev => prev.slice(0, -1));
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
    const result = await loginWithPasskey(userProfile.vpa);
    setBiometricBusy(false);
    if (result.ok) {
      // Passkey verified — log the user in with the returned session data
      const d = result.data;
      await onLogin(d.vpa, null, d); // pass pre-verified data
    } else {
      setErr(result.error || 'Biometric login failed. Use UPI PIN instead.');
    }
  };

  const handlePinRegister = async (enteredConfirmPin) => {
    if (pin !== enteredConfirmPin) {
      setErr('PINs do not match. Try again.');
      setStep('pin_create');
      setPin('');
      setConfirmPin('');
      return;
    }
    setBusy(true); setErr('');
    try {
      const payload = {
        phone,
        name: fullName.trim(),
        vpa: vpa.trim(),
        bank_id: selectedBank?.id || 1,
        upi_pin: pin
      };
      const res = await api.register(payload);
      setBusy(false);
      if (res.ok) {
        // Auto-login after registration
        const loginRes = await onLogin(payload.vpa, pin);
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
        setErr(res.data?.detail || 'Registration failed');
      }
    } catch {
      setBusy(false);
      setErr('Registration failed. Server error.');
    }
  };

  const selectDemoUser = (user) => {
    setPhone(user.phone);
    setErr('');
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
      
      {/* -------------------- STEP 1: Welcome/Splash Screen -------------------- */}
      {step === 'welcome' && (
        <div style={S.welcomeContainer}>
          {/* Top graphics / cloud blobs */}
          <div style={S.blob1}></div>
          <div style={S.blob2}></div>
          
          <div style={S.brandHeader}>
            <div style={S.logoBadge}><Shield size={20} color="#fff" /></div>
            <span style={S.brandText}>payit</span>
          </div>

          <div style={S.bankGraphicContainer}>
            {/* Custom SVG Bank Building Graphic */}
            <svg width="140" height="110" viewBox="0 0 140 110" fill="none" style={S.svgBank}>
              <rect x="15" y="45" width="110" height="55" rx="12" fill="#aa33ff" opacity="0.8"/>
              <path d="M10 45 L70 15 L130 45 Z" fill="url(#grad)" />
              <rect x="52" y="65" width="36" height="35" rx="6" fill="#eb3b88" />
              <rect x="28" y="58" width="16" height="16" rx="4" fill="#ffffff" opacity="0.3" />
              <rect x="96" y="58" width="16" height="16" rx="4" fill="#ffffff" opacity="0.3" />
              <circle cx="20" cy="20" r="6" fill="#eb3b88" opacity="0.5"/>
              <circle cx="120" cy="25" r="8" fill="#aa33ff" opacity="0.5"/>
              <defs>
                <linearGradient id="grad" x1="10" y1="15" x2="130" y2="45" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#eb3b88" />
                  <stop offset="1" stopColor="#aa33ff" />
                </linearGradient>
              </defs>
            </svg>
            <div style={S.sparkle1}><Sparkles size={16} color="#e0a5ff" /></div>
            <div style={S.sparkle2}><Sparkles size={20} color="#eb3b88" /></div>
          </div>

          <div style={S.welcomeBody}>
            <h1 style={S.welcomeTitle}>A fully RBI<br/>regulated bank</h1>
          </div>

          <div style={S.welcomeBottom}>
            <p style={S.legalText}>By continuing, you accept <span style={S.link}>Privacy Policy</span> and <span style={S.link}>T&C</span></p>
            <button style={S.startedBtn} onClick={() => setStep('phone_input')}>
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

          {/* Quick Demo selection */}
          <div style={S.demoUsersSection}>
            <p style={S.demoUsersTitle}>Select a demo account from database:</p>
            <div style={S.demoChips}>
              {demoUsers.map(du => (
                <button 
                  key={du.phone} 
                  style={{ ...S.demoChip, border: phone === du.phone ? '1px solid #eb3b88' : '1px solid #222' }}
                  onClick={() => selectDemoUser(du)}
                >
                  <span style={S.demoChipName}>{du.name}</span>
                  <span style={S.demoChipPhone}>{du.phone}</span>
                </button>
              ))}
            </div>
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
                  border: idx === activeOtpIdx ? '2px solid #aa33ff' : '1px solid #333',
                  background: digit ? '#fff' : '#161616',
                  color: digit ? '#000' : '#fff'
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
              <p style={{ color: '#22e67b', fontSize: 11, fontWeight: 700, margin: '3px 0 0 0' }}>Demo OTP: {onboardingOtpDemo} (real app: SMS only)</p>
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, margin: '3px 0 0 0' }}>Check Render / server logs to retrieve code.</p>
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
                  border: selectedBank?.id === bank.id ? '2px solid #eb3b88' : '1px solid #222',
                  background: selectedBank?.id === bank.id ? '#16121a' : '#111'
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
            <button style={{ ...S.nextCircleBtn, opacity: selectedBank ? 1 : 0.5 }} disabled={!selectedBank} onClick={() => setStep('pin_create')}>
              <ArrowRight size={22} color="#fff" />
            </button>
          </div>
        </div>
      )}

      {/* -------------------- STEP 7 & 8: PIN Setup (Create / Confirm) -------------------- */}
      {(step === 'pin_create' || step === 'pin_confirm') && (
        <div style={S.screenContainer}>
          {renderBackBtn(step === 'pin_confirm' ? 'pin_create' : 'bank_select')}
          
          <div style={S.headerSection}>
            <h2 style={S.screenTitle}>
              {step === 'pin_create' ? 'Create UPI PIN' : 'Confirm UPI PIN'}
            </h2>
            <p style={S.screenSub}>
              {step === 'pin_create' 
                ? 'Create a secure 4-digit UPI PIN. Never share this PIN.' 
                : 'Confirm your secure 4-digit UPI PIN by entering it again.'
              }
            </p>
          </div>

          {/* Dot indicators */}
          <div style={S.dotRow}>
            {Array(4).fill(0).map((_, idx) => {
              const enteredLen = step === 'pin_create' ? pin.length : confirmPin.length;
              return (
                <div 
                  key={idx} 
                  style={{
                    ...S.pinDot,
                    background: idx < enteredLen ? '#fff' : 'transparent',
                    border: '2px solid #555'
                  }}
                ></div>
              );
            })}
          </div>

          {err && <div style={S.errText}>{err}</div>}

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

          {/* Fingerprint quick-login (only shown if passkey is registered on this device) */}
          {biometricAvailable && hasPasskey(userProfile?.vpa) && (
            <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
              <button
                style={{
                  background: biometricBusy ? 'rgba(170,51,255,0.1)' : 'rgba(170,51,255,0.08)',
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
                <div style={{ flex: 1, height: 1, background: '#222' }} />
                <span style={{ color: '#444', fontSize: 11, fontWeight: 600 }}>or enter PIN</span>
                <div style={{ flex: 1, height: 1, background: '#222' }} />
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
                  background: idx < pin.length ? '#fff' : 'transparent',
                  border: '2px solid #555'
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
                style={{ background: 'none', border: 'none', color: '#555', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
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
                <Fingerprint size={12} color="#555" />
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
    background: '#0a0a0a', 
    color: '#fff',
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
    color: '#888',
    margin: 0,
    lineHeight: '1.4'
  },
  inputGroup: {
    display: 'flex',
    alignItems: 'center',
    background: '#161616',
    borderRadius: '14px',
    border: '1px solid #282828',
    padding: '4px 16px',
    marginBottom: 20
  },
  phonePrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    marginRight: 10
  },
  phoneInput: {
    flex: 1,
    padding: '12px 0',
    background: 'transparent',
    border: 'none',
    color: '#fff',
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
    color: '#666',
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
    background: '#121212',
    color: '#aaa',
    cursor: 'pointer',
    textAlign: 'left'
  },
  demoChipName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff'
  },
  demoChipPhone: {
    fontSize: 12,
    color: '#888'
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
    color: '#ff5470',
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
    color: '#aaa'
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
    background: '#161616',
    border: '1px solid #333',
    color: '#888',
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
    color: '#666'
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
    color: '#888',
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
    background: '#161616',
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
    color: '#777',
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
    color: '#888'
  },
  inputFieldWrapper: {
    display: 'flex',
    alignItems: 'center',
    background: '#161616',
    border: '1px solid #282828',
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
    color: '#fff',
    fontSize: 14,
    outline: 'none'
  },
  inputHint: {
    fontSize: 11,
    color: '#555',
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
    color: '#fff'
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
    color: '#fff',
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
    color: '#888',
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
    color: '#777',
    textAlign: 'center',
    margin: 0
  },
  forgotLink: {
    background: 'none',
    border: 'none',
    color: '#888',
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
