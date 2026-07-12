import { useState, useEffect, useRef } from 'react';
import './App.css';

// Component Imports
import PhoneFrame from './components/PhoneFrame';
import Banking from './screens/Banking';
import Explore from './screens/Explore';
import QrScanner from './screens/QrScanner';
import SliceShield from './screens/SliceShield';
import Activity from './screens/Activity';
import PaidSuccess from './screens/PaidSuccess';
import Analytics from './screens/Analytics';
import CheckBalance from './screens/CheckBalance';
import UpiSettings from './screens/UpiSettings';
import TransferKeypad from './screens/TransferKeypad';
import RechargeBills from './screens/RechargeBills';
import FraudReportForm from './screens/FraudReportForm';
import OnboardingFlow from './screens/OnboardingFlow';
import PayeeSelector from './screens/PayeeSelector';
import ReferPage from './screens/ReferPage';
import AutopayPage from './screens/AutopayPage';
import { api, getDeviceId, saveSession, getSession, clearSession, loginWithPasskey, hasPasskey } from './api';

import { Shield, Lock, ShieldCheck, AlertTriangle, Fingerprint, Phone, X, Check, Bell, Clock, MapPin, Smartphone, ShieldAlert } from 'lucide-react';

// Map a few demo display-NAMES (from QR/recharge/repay flows that only carry a
// name, not a VPA) to real DB accounts, so those flows still pay real accounts.
// Real tapped contacts DON'T use this — they carry their exact VPA. The logged-in
// user is dynamic (state `currentUser`), never hardcoded.
const NAME_TO_VPA = {
  "Gopichand Javanajad": "priya.sharma@okhdfc",    // safe contact
  "Amit Patel": "priya.sharma@okhdfc",             // safe contact
  "Priya Nair": "priya.sharma@okhdfc",             // safe contact
  "Rahul Sharma": "reliancefresh.store@okaxis",    // safe merchant
  "Sneha Gupta": "quickcash777@okpnb",             // 🔴 MULE -> BLOCK demo
  "Aravind Kumar": "quickcash777@okpnb",           // 🔴 QR-scan scam -> BLOCK
};

function App() {
  // Navigation stack
  const [history, setHistory] = useState(['banking']);
  const activeScreen = history[history.length - 1] || 'banking';

  // Global State (shared between screens)
  const [recipient, setRecipient] = useState('Gopichand Javanajad');
  const [balance, setBalance] = useState(14580);
  const [fixedDeposit, setFixedDeposit] = useState(0);
  const [monies, setMonies] = useState(3902);
  const [ccSpends, setCcSpends] = useState(314);
  const [payAmount, setPayAmount] = useState("");
  const [payeeVpa] = useState("priya.sharma@okhdfc");   // default fallback VPA (name-only flows)
  const [selectedPayee, setSelectedPayee] = useState(null);  // {name, vpa} — exact target when a real contact is tapped
  const [pinModal, setPinModal] = useState(null);       // {amount, isInvest} pending payment
  const [pinInput, setPinInput] = useState("");         // entered UPI PIN

  // --- REAL login: null until the user logs in (device binds on login) ---
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserName, setCurrentUserName] = useState('');
  const [realTxns, setRealTxns] = useState([]);

  const [booting, setBooting] = useState(true);         // checking saved session on open

  const handleLogin = async (vpa, pin, preVerifiedData = null) => {
    // preVerifiedData: already-verified WebAuthn response ({ name, balance, token })
    // — skip the PIN-based api.login call entirely.
    let name, balance;
    if (preVerifiedData) {
      name = preVerifiedData.name;
      balance = preVerifiedData.balance;
    } else {
      const { ok, data } = await api.login(vpa, pin);   // verifies account + binds device
      if (!ok) return { ok: false, error: data.detail || 'Incorrect PIN or account not found' };
      name = data.name;
      balance = data.balance;
    }
    setCurrentUser(vpa);
    setCurrentUserName(name || vpa);
    if (balance != null) setBalance(balance);
    saveSession(vpa);                                   // remember on this device (like GPay)
    api.history(vpa).then((r) => { if (r.ok) setRealTxns(r.data); }).catch(() => {});
    return { ok: true };
  };

  const handleLogout = () => {                          // "switch account" for the demo
    clearSession();
    setCurrentUser(null); setCurrentUserName(''); setRealTxns([]);
  };

  // On app open: if this device already has a bound account, restore it silently
  // then LOCK the app — user must re-enter PIN or use fingerprint before home screen.
  useEffect(() => {
    const saved = getSession();
    if (!saved) { setBooting(false); setAppLocked(false); return; }  // no session = show login (not the lock gate)
    handleLogin(saved)
      .then((r) => { if (!r || !r.ok) { clearSession(); setAppLocked(false); } })  // account gone -> clean login
      .finally(() => setBooting(false));
    // appLocked remains true — the PIN gate will display on top of home
  }, []);

  const refreshTxns = () => {
    if (currentUser) api.history(currentUser).then((r) => { if (r.ok) setRealTxns(r.data); });
  };
  const [lastTx, setLastTx] = useState(null);

  // --- NEW SECURITY STATES ---
  const [isFrozen, setIsFrozen] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);

  // --- APP LOCK (re-auth on every app open / refresh) ---
  // true on mount so the PIN gate appears before anything is shown.
  // Set to false after user proves identity (PIN or fingerprint).
  const [appLocked, setAppLocked] = useState(true);
  const [appPinInput, setAppPinInput] = useState('');
  const [appPinError, setAppPinError] = useState('');
  const [appPinBusy, setAppPinBusy] = useState(false);

  // --- FORGOT-PIN (OTP flow, triggered from PIN gate or UpiSettings) ---
  const [showForgotPin, setShowForgotPin] = useState(false);
  const [forgotStep, setForgotStep] = useState('send');  // 'send' | 'otp' | 'newpin' | 'confirm'
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPin, setForgotNewPin] = useState('');
  const [forgotConfirmPin, setForgotConfirmPin] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotErr, setForgotErr] = useState('');
  const [forgotOtpDemo, setForgotOtpDemo] = useState('');
  const [forgotPinCameFromSettings, setForgotPinCameFromSettings] = useState(false);
  
  // Approval Window Settings
  const [isApprovalWindowActive, setIsApprovalWindowActive] = useState(true);
  const [approvalWindowDelay, setApprovalWindowDelay] = useState(15); // seconds
  const [pendingTransactions, setPendingTransactions] = useState([]); // cooling-off queue

  // High-Value Transaction Settings
  const [isHighValueAuthActive, setIsHighValueAuthActive] = useState(true);
  const [highValueThreshold, setHighValueThreshold] = useState(5000);

  // Trusted Guardian Settings
  const [isGuardianModeActive, setIsGuardianModeActive] = useState(false);
  const [guardianLimit, setGuardianLimit] = useState(10000);
  const [guardians, setGuardians] = useState([
    { name: "Trusted Guardian", phone: "98•••39210", relation: "Family", upi: "guardian@upi" }
  ]);

  // Demo Simulation Parameters
  const [deviceStatus, setDeviceStatus] = useState('registered'); // 'registered' or 'new'
  const [locationStatus, setLocationStatus] = useState('normal'); // 'normal' or 'unusual'
  const [isDeviceRooted, setIsDeviceRooted] = useState(false);
  const [isActiveScreenShare, setIsActiveScreenShare] = useState(false);

  // Security Event Log
  const [securityLog, setSecurityLog] = useState([
    { message: "payit shield activated", type: "system", time: "12:00 PM" },
    { message: "Real-time AI monitoring active", type: "system", time: "12:05 PM" }
  ]);

  // Real-Time Notification Banners
  const [notifications, setNotifications] = useState([]);

  // Modal / Dialogue States
  const [reportingTx, setReportingTx] = useState(null); // Transaction currently being reported
  const [showPinModal, setShowPinModal] = useState(false);
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinPurpose, setPinPurpose] = useState(""); // 'unfreeze' | 'unlock' | 'pay'
  const [tempPayDetails, setTempPayDetails] = useState(null);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpModalTx, setOtpModalTx] = useState(null);
  const [otpModalCode, setOtpModalCode] = useState('');
  const [otpModalError, setOtpModalError] = useState('');
  const [otpResendStatus, setOtpResendStatus] = useState(''); // '' | 'sending' | 'sent'

  // AI Scanning Loader
  const [aiScanningTx, setAiScanningTx] = useState(null);
  const [aiScanProgress, setAiScanProgress] = useState("");

  // Guardian Request Simulation Overlay
  const [guardianRequest, setGuardianRequest] = useState(null);
  const [guardianTimer, setGuardianTimer] = useState(120);

  // Navigation handlers
  const pushScreen = (screenName) => {
    setHistory(prev => [...prev, screenName]);
  };

  const popScreen = () => {
    if (history.length > 1) {
      setHistory(prev => prev.slice(0, -1));
    }
  };

  const resetToScreen = (screenName) => {
    setHistory([screenName]);
  };

  // --- NOTIFICATION BANNER SYSTEM ---
  const triggerNotification = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    // Add to audit log
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setSecurityLog(prev => [
      { message, type, time: timeStr },
      ...prev.slice(0, 19)
    ]);

    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4500);
  };

  // Log Kill Switch changes (skip the initial mount so nothing pops on load)
  const frozenInit = useRef(true);
  useEffect(() => {
    if (frozenInit.current) { frozenInit.current = false; return; }
    if (isFrozen) {
      triggerNotification("Kill Switch Activated: All banking frozen", "alert");
    } else {
      triggerNotification("Kill Switch Deactivated: Services unlocked", "info");
    }
  }, [isFrozen]);

  // Log Account Lock changes (skip initial mount)
  const lockInit = useRef(true);
  useEffect(() => {
    if (lockInit.current) { lockInit.current = false; return; }
    if (isAccountLocked) {
      triggerNotification("Emergency Account Lock: Profile secured", "alert");
    } else {
      triggerNotification("Emergency Account Lock Lifted", "info");
    }
  }, [isAccountLocked]);

  // --- APPROVAL WINDOW COUNTDOWN TIMER ---
  useEffect(() => {
    if (pendingTransactions.length === 0) return;
    const interval = setInterval(() => {
      setPendingTransactions(prev => {
        const updated = prev.map(tx => {
          if (tx.timeLeft > 1) {
            return { ...tx, timeLeft: tx.timeLeft - 1 };
          } else if (tx.status === 'cooling_off') {
            // Timer expired, finalize the transaction!
            triggerNotification(`Payment of ₹${tx.amount} to ${tx.recipient} settled`, "info");
            executeFinancialAdjustment(tx.recipient, tx.amount, tx.isInvest);
            
            // If the user is currently viewing this pending transaction on PaidSuccess, update it live
            if (lastTx.id === tx.id) {
              setLastTx(prev => ({ ...prev, status: 'success', timeLeft: 0 }));
            }
            return { ...tx, timeLeft: 0, status: 'success' };
          }
          return tx;
        });

        // Filter out completed ones after a while, or keep them to render in list
        return updated.filter(tx => tx.timeLeft > 0 || tx.status === 'success' || tx.status === 'recalled');
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pendingTransactions, lastTx]);

  // --- GUARDIAN REQUEST SIMULATOR TIMER ---
  useEffect(() => {
    if (!guardianRequest) return;
    const timer = setInterval(() => {
      setGuardianTimer(prev => {
        if (prev > 1) {
          return prev - 1;
        } else {
          // Expired
          clearInterval(timer);
          handleGuardianDecision(false, "Timeout");
          return 0;
        }
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [guardianRequest]);

  // --- CORE FINANCIAL ADJUSTMENT (Modifies balances) ---
  const executeFinancialAdjustment = (recipName, amount, isInvest) => {
    const isAddingMoney = recipName === "Add money";
    setMonies(prev => prev + amount);

    if (isAddingMoney) {
      setBalance(prev => prev + amount);
    } else if (isInvest) {
      setBalance(prev => Math.max(0, prev - amount));
      setFixedDeposit(prev => prev + amount);
    } else {
      setBalance(prev => Math.max(0, prev - amount));
      if (recipName.includes("payit CC") || recipName.includes("Credit card")) {
        setCcSpends(prev => Math.max(0, prev - amount));
      } else {
        setCcSpends(prev => prev + amount);
      }
    }
  };

  // --- INTERCEPTED TRANSACTION FLOW ---
  // Step A: user confirms amount -> show the UPI PIN pad (2nd factor)
  const handlePaymentProcess = (amount, isInvest = false) => {
    if (isFrozen) { triggerNotification("Blocked: Kill Switch is currently active", "alert"); return; }
    if (isAccountLocked) { triggerNotification("Blocked: Account is locked", "alert"); return; }
    setPinInput("");
    setPinModal({ amount, isInvest });        // open PIN entry screen
  };

  // Step B: user entered UPI PIN -> run REAL backend payment + fraud engine
  const executePayment = async (amount, isInvest, pin) => {
    setPinModal(null);
    setTempPayDetails({ amount, isInvest, recipientName: recipient });
    // exact VPA of a tapped real contact wins; else map the display name; else default
    const receiver = (selectedPayee && selectedPayee.name === recipient)
      ? selectedPayee.vpa
      : (NAME_TO_VPA[recipient] || payeeVpa);

    // fraud-scan animation (the REAL engine runs on the backend)
    setAiScanningTx({ amount, recipientName: recipient });
    setAiScanProgress("Verifying UPI PIN...");
    setTimeout(() => setAiScanProgress("Running fraud engine (behavioral + device + graph)..."), 500);

    try {
      const { ok, status, data } = await api.pay({
        sender_vpa: currentUser, receiver_vpa: receiver,
        amount, pin, channel: "MANUAL",
        rooted: isDeviceRooted ? 1 : 0,
        screen_share: isActiveScreenShare ? 1 : 0,
      });
      setAiScanningTx(null);
      if (!ok) {
        triggerNotification(status === 401 ? "❌ Incorrect UPI PIN"
                            : (data.detail || "Payment failed"), "alert");
        return;
      }

      const now = new Date().toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hour12:true });
      const baseTx = { id:`TX-${data.transaction_id}`, recipient, amount, date: now,
                       upiRef: data.txn_ref || "-", transId: String(data.transaction_id),
                       reasons: data.reasons, score: data.score };

      if (data.label === "BLOCK") {
        triggerNotification("🔴 Blocked by Fraud Shield", "alert");
        setLastTx({ ...baseTx, status: 'blocked' });
        pushScreen('paid-success');
      } else if (data.label === "REVIEW") {
        setOtpModalTx({ ...baseTx, transaction_id: data.transaction_id, otpDemo: data.otp_demo });
        setOtpModalCode('');
        setOtpModalError('');
        setOtpResendStatus('');
        setOtpModalOpen(true);
      } else {                                  // SAFE
        setBalance(data.sender_balance);
        if (data.post_review) {                 // F3: completed but flagged in hindsight
          setLastTx({ ...baseTx, status: 'flagged', postMessage: data.post_message, txId: data.transaction_id });
          triggerNotification("⚠️ Payment flagged after completion — recall available", "alert");
        } else {
          setLastTx({ ...baseTx, status: 'success' });
          triggerNotification("Payment successful", "info");
        }
        pushScreen('paid-success');
      }
      refreshTxns();                            // reload real history after any result
    } catch (e) {
      setAiScanningTx(null);
      triggerNotification("⚠️ Backend not reachable — start server on :3000", "alert");
    }
  };

  const handleOtpSubmit = async (enteredOtp) => {
    if (!otpModalTx) return;
    setOtpModalError('');
    try {
      const v = await api.verifyOtp(otpModalTx.transaction_id, enteredOtp);
      if (v.ok) {
        setBalance(v.data.sender_balance);
        setOtpModalOpen(false);
        setOtpModalTx(null);
        if (v.data.post_review) {               // F3: flagged after OTP-completed
          setLastTx({ ...otpModalTx, status: 'flagged', postMessage: v.data.post_message,
                      txId: otpModalTx.transaction_id });
          triggerNotification("⚠️ Payment flagged after completion — recall available", "alert");
        } else {
          setLastTx({ ...otpModalTx, status: 'success' });
          triggerNotification("Verified — payment completed", "info");
        }
        pushScreen('paid-success');
        refreshTxns();
      } else {
        setOtpModalError("Invalid OTP code. Please try again.");
        triggerNotification("Invalid OTP — payment blocked", "alert");
      }
    } catch (e) {
      setOtpModalError("Verification failed. Server unreachable.");
    }
  };

  // Post Risk-Authentication flow
  const proceedToVerificationPipeline = (amount, isInvest, riskScore) => {
    // Step 3: Check Guardian Approval (Senior Citizen Protection)
    const isGuardianInterception = isGuardianModeActive && (amount >= guardianLimit);

    if (isGuardianInterception) {
      triggerNotification("Guardian approval requested (paused)", "alert");
      setGuardianTimer(120);
      setGuardianRequest({
        amount,
        recipient: recipient,
        riskScore,
        isInvest,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      });
    } else {
      finalizeTransactionRouting(amount, isInvest);
    }
  };

  const handleGuardianDecision = (approved, reason = "") => {
    const req = guardianRequest;
    setGuardianRequest(null);

    if (approved) {
      triggerNotification("Guardian approved payment", "info");
      // Optional biometric confirmation from the sender after guardian approval
      setShowBiometricModal(true);
      setPinPurpose("pay_after_guardian");
    } else {
      triggerNotification(`Guardian rejected payment: ${reason}`, "alert");
      const dateStr = new Date().toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
      });
      
      // Render failed success screen
      setLastTx({
        id: `TX-${Math.floor(10000 + Math.random() * 90000)}`,
        recipient: req.recipient,
        amount: req.amount,
        date: dateStr,
        upiRef: Math.floor(100000000000 + Math.random() * 900000000000).toString(),
        transId: "PAY" + Math.random().toString(36).substring(2, 15).toUpperCase(),
        status: 'recalled'
      });
      pushScreen('paid-success');
    }
  };

  const finalizeTransactionRouting = (amount, isInvest) => {
    const dateStr = new Date().toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
    });
    const randomRef = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    const randomId = "PAY" + Math.random().toString(36).substring(2, 15).toUpperCase();
    const uniqueTxId = `TX-${Math.floor(10000 + Math.random() * 90000)}`;

    if (isApprovalWindowActive) {
      // Hold in pending list
      const newTx = {
        id: uniqueTxId,
        recipient: recipient,
        amount: amount,
        date: dateStr,
        upiRef: randomRef,
        transId: randomId,
        status: 'cooling_off',
        timeLeft: approvalWindowDelay,
        isInvest
      };
      
      setPendingTransactions(prev => [...prev, newTx]);
      setLastTx(newTx);
      triggerNotification(`Transaction delayed in Approval Window (${approvalWindowDelay}s)`, "info");
      pushScreen('paid-success');
    } else {
      // Complete instantly
      const newTx = {
        id: uniqueTxId,
        recipient: recipient,
        amount: amount,
        date: dateStr,
        upiRef: randomRef,
        transId: randomId,
        status: 'success',
        timeLeft: 0,
        isInvest
      };
      
      setLastTx(newTx);
      executeFinancialAdjustment(recipient, amount, isInvest);
      triggerNotification("Payment successfully settled", "info");
      pushScreen('paid-success');
    }
  };

  // --- RECALL / CANCEL TRANSACTION ---
  const handleRecallTransaction = async (txId) => {
    const realTxId = lastTx && lastTx.txId;   // F3: real backend txn -> actually reverse money
    if (realTxId) {
      const r = await api.recall(realTxId);
      if (r.ok) {
        setBalance(r.data.sender_balance);
        setLastTx(prev => ({ ...prev, status: 'recalled', timeLeft: 0 }));
        triggerNotification(`✅ ${r.data.message}`, "info");
        refreshTxns && refreshTxns();
      } else {
        triggerNotification(r.data.detail || "Recall failed", "alert");
      }
      return;
    }
    setPendingTransactions(prev => prev.filter(tx => tx.id !== txId));
    triggerNotification("Transaction Cancelled: Funds recalled safely", "info");
    setLastTx(prev => ({ ...prev, status: 'recalled', timeLeft: 0 }));
  };

  // F2: pre-payment beneficiary check — warn EARLY when a risky payee is selected
  const runPrecheck = (vpa) => {
    if (!currentUser || !vpa) return;
    api.precheck(currentUser, vpa).then((r) => {
      if (r.ok && r.data.warn) triggerNotification(`⚠️ ${r.data.reasons?.[0] || 'Risky payee'}`, "alert");
    }).catch(() => {});
  };

  // --- ONE-TAP FRAUD REPORT DRAWERS ---
  const handleReportFraud = (tx) => {
    setReportingTx(tx);
    pushScreen('fraud-report');
  };

  const handleFraudReportSuccess = (reportDetails) => {
    popScreen(); // close report form
    triggerNotification(`Fraud Report ${reportDetails.id} submitted successfully`, "info");
    
    // Block recipient list
    setSecurityLog(prev => [
      { message: `Flagged Scammer: ${reportDetails.recipient} added to blocked registry`, type: "alert", time: new Date().toLocaleTimeString() },
      ...prev
    ]);
  };

  // --- BIOMETRICS & PIN VERIFICATIONS ---
  const handleBiometricSuccess = () => {
    setShowBiometricModal(false);
    if (pinPurpose === "pay") {
      proceedToVerificationPipeline(tempPayDetails.amount, tempPayDetails.isInvest, "Authenticated");
    } else if (pinPurpose === "pay_after_guardian") {
      finalizeTransactionRouting(tempPayDetails.amount, tempPayDetails.isInvest);
    } else if (pinPurpose === "unfreeze") {
      setIsFrozen(false);
      triggerNotification("Identity verified. Payment systems restored.", "info");
    } else if (pinPurpose === "unlock") {
      setIsAccountLocked(false);
      triggerNotification("Identity verified. Account unlocked.", "info");
    }
  };

  // Render active screens
  const renderMobileScreen = () => {
    switch (activeScreen) {
      case 'banking':
        return (
          <Banking
            liveTxns={realTxns}
            me={currentUser}
            balance={balance}
            userName={currentUserName}
            onAddMoney={(name, amount) => {
              setRecipient(name && typeof name === 'string' ? name : "Add money");
              setPayAmount(amount || "");
              pushScreen('transfer');
            }}
            onSendToContact={(displayName, vpa) => {   // real person from txn history
              setRecipient(displayName);
              setSelectedPayee({ name: displayName, vpa });   // exact target, wins over name-map
              runPrecheck(vpa);                               // F2: early beneficiary warning
              setPayAmount("");
              pushScreen('transfer');
            }}
            onCheckBalance={() => pushScreen('check-balance')}
            onFixedDepositClick={() => {
              setRecipient("Fixed Deposit");
              pushScreen('transfer');
            }}
            onMascotClick={() => pushScreen('qr-scanner')}
          />
        );
      case 'explore':
        return (
          <Explore 
            onRechargeClick={(name) => {
              if (name && typeof name === 'string') {
                setRecipient(name);
                pushScreen('transfer');
              } else {
                pushScreen('recharge-bills');
              }
            }}
            onPromoClick={(id) => {
              if (id === 'spends') pushScreen('analytics');
              else if (id === 'autopay') pushScreen('autopay');
              else if (id === 'referral') pushScreen('refer');
              else {
                setRecipient("payit rewards bonus");
                pushScreen('transfer');
              }
            }}
          />
        );
      case 'recharge-bills':
        return (
          <RechargeBills 
            onItemClick={(name) => {
              setRecipient(name);
              pushScreen('transfer');
            }}
          />
        );
      case 'qr-scanner':
        return (
          <QrScanner
            onClose={() => resetToScreen('transfer')}
            onScanSuccess={(name, vpa) => {
              setRecipient(name);
              if (vpa && vpa.includes('@')) {
                setSelectedPayee({ name, vpa });
                runPrecheck(vpa);                             // F2: early beneficiary warning
              }
              popScreen();
              pushScreen('transfer');
            }}
          />
        );
      case 'slice-shield':
        return (
          <SliceShield 
            isFrozen={isFrozen}
            setIsFrozen={setIsFrozen}
            isAccountLocked={isAccountLocked}
            setIsAccountLocked={setIsAccountLocked}
            isApprovalWindowActive={isApprovalWindowActive}
            setIsApprovalWindowActive={setIsApprovalWindowActive}
            approvalWindowDelay={approvalWindowDelay}
            setApprovalWindowDelay={setApprovalWindowDelay}
            isHighValueAuthActive={isHighValueAuthActive}
            setIsHighValueAuthActive={setIsHighValueAuthActive}
            highValueThreshold={highValueThreshold}
            setHighValueThreshold={setHighValueThreshold}
            isGuardianModeActive={isGuardianModeActive}
            setIsGuardianModeActive={setIsGuardianModeActive}
            guardianLimit={guardianLimit}
            setGuardianLimit={setGuardianLimit}
            guardians={guardians}
            onAddGuardian={(g) => setGuardians(prev => [...prev, g])}
            onRemoveGuardian={(idx) => setGuardians(prev => prev.filter((_, i) => i !== idx))}
            pendingTransactions={pendingTransactions.filter(tx => tx.status === 'cooling_off')}
            onRecallTransaction={handleRecallTransaction}
            securityLog={securityLog}
            deviceStatus={deviceStatus}
            setDeviceStatus={setDeviceStatus}
            locationStatus={locationStatus}
            setLocationStatus={setLocationStatus}
            isDeviceRooted={isDeviceRooted}
            setIsDeviceRooted={setIsDeviceRooted}
            isActiveScreenShare={isActiveScreenShare}
            setIsActiveScreenShare={setIsActiveScreenShare}
          />
        );
      case 'activity':
        return (
          <Activity
            liveTxns={realTxns}
            me={currentUser}
            onTransactionSelect={(tx) => {
              setLastTx(tx);
              pushScreen('paid-success');
            }}
            onReportFraud={handleReportFraud}
          />
        );
      case 'paid-success':
        return (
          <PaidSuccess 
            transactionDetails={lastTx}
            onPayAgain={() => {
              setRecipient(lastTx.recipient);
              pushScreen('transfer');
            }}
            onRecallTransaction={handleRecallTransaction}
            onReportFraud={handleReportFraud}
          />
        );
      case 'analytics':
        return (
          <Analytics
            liveTxns={realTxns}
            me={currentUser}
            onCategoryClick={(name) => {
              setRecipient(name);
              pushScreen('transfer');
            }}
          />
        );
      case 'check-balance':
        return (
          <CheckBalance
            upiId={currentUser}
            realBalance={balance}
            onBack={popScreen}
          />
        );
      case 'upi-settings':
        return (
          <UpiSettings
            upiId={currentUser}
            userName={currentUserName}
            onLogout={handleLogout}
            onForgotPin={() => { setAppLocked(true); setShowForgotPin(true); setForgotPinCameFromSettings(true); setForgotStep('send'); setForgotErr(''); setForgotMsg(''); setForgotOtp(''); setForgotNewPin(''); setForgotConfirmPin(''); }}
            onAddAccount={() => {
              setRecipient("SBI Bank Link");
              pushScreen('transfer');
            }}
          />
        );
      case 'transfer': {
        const resolvedVpa = (selectedPayee && selectedPayee.name === recipient)
          ? selectedPayee.vpa : (NAME_TO_VPA[recipient] || '');
        const hasRecipient = !!recipient && recipient !== 'Add money' && recipient !== 'Fixed Deposit' && recipient !== 'SBI Bank Link' && !!resolvedVpa;

        return (
          <TransferKeypad
            recipientName={hasRecipient ? recipient : ''}
            recipientVpa={hasRecipient ? resolvedVpa : ''}
            userInitial={(currentUserName || 'U').trim().charAt(0).toUpperCase()}
            prefilledAmount={payAmount}
            onTransferSuccess={(amt) => {
              if (hasRecipient) {
                handlePaymentProcess(amt, false);
              } else {
                setPayAmount(amt.toString());
                pushScreen('payee-selector');
              }
            }}
            onInvestSuccess={(amt) => handlePaymentProcess(amt, true)}
            onOpenScanner={() => pushScreen('qr-scanner')}
            onCheckBalance={() => pushScreen('check-balance')}
          />
        );
      }
      case 'payee-selector':
        return (
          <PayeeSelector
            amount={payAmount}
            balance={balance}
            onBack={popScreen}
            onPayeeSelected={(name, vpa) => {
              setRecipient(name);
              setSelectedPayee({ name, vpa });
              runPrecheck(vpa);                               // F2: early beneficiary warning
              handlePaymentProcess(parseFloat(payAmount), false);
            }}
          />
        );
      case 'fraud-report':
        return (
          <FraudReportForm 
            transaction={reportingTx}
            onBack={popScreen}
            onSubmitSuccess={handleFraudReportSuccess}
          />
        );
      case 'refer':
        return (
          <ReferPage onBack={popScreen} />
        );
      case 'autopay':
        return (
          <AutopayPage onBack={popScreen} />
        );
      default:
        return (
          <Banking 
            onAddMoney={(name, amount) => {
              setRecipient(name && typeof name === 'string' ? name : "Add money");
              setPayAmount(amount || "");
              pushScreen('transfer');
            }} 
          />
        );
    }
  };

  const getHeaderTitle = () => {
    const titles = {
      banking: 'Banking',
      explore: 'Explore',
      'recharge-bills': 'Recharge & Bills',
      'slice-shield': '',
      activity: 'Activity',
      analytics: 'Analytics',
      'check-balance': 'UPI Security',
      'upi-settings': 'UPI Settings',
      transfer: 'Transfer',
      'payee-selector': 'Select Payee',
      'fraud-report': '',
      'refer': 'Invite & Earn',
      'autopay': ''
    };
    return titles[activeScreen] || '';
  };

  const showBackButton = () => {
    return ['recharge-bills', 'analytics', 'check-balance', 'upi-settings', 'transfer', 'qr-scanner', 'paid-success', 'fraud-report', 'payee-selector', 'refer', 'autopay'].includes(activeScreen);
  };

  // While restoring a saved session on open, don't flash the login screen.
  if (booting) {
    return (
      <div className="mobile-app-wrapper">
        <PhoneFrame currentScreen="login" title="" showBackButton={false} hideNav>
          <div style={{ display: 'flex', height: '100%', alignItems: 'center',
                        justifyContent: 'center', background: '#0a0a0a', color: '#666' }}>
            Loading…
          </div>
        </PhoneFrame>
      </div>
    );
  }

  // --- LOGIN GATE: only shows the FIRST time on this device (or after logout).
  // Once logged in the account is remembered (getSession), so re-opening the app
  // skips this and goes straight to Home — only the UPI PIN is asked on payments. ---
  if (!currentUser) {
    return (
      <div className="mobile-app-wrapper">
        <PhoneFrame currentScreen="login" title="" showBackButton={false}>
          <OnboardingFlow onLogin={handleLogin} deviceId={getDeviceId()} />
        </PhoneFrame>
      </div>
    );
  }

  return (
    <div className="mobile-app-wrapper">
      <PhoneFrame
        currentScreen={activeScreen}
        onScreenChange={resetToScreen}
        title={getHeaderTitle()}
        showBackButton={showBackButton()}
        onBackClick={popScreen}
      >
        {renderMobileScreen()}

        {/* --- SECURITY NOTIFICATION PUSH BANNER --- */}
        {notifications.map((n, index) => (
          <div 
            key={n.id} 
            style={{
              ...styles.pushNotification,
              top: `${50 + index * 54}px`
            }}
            className="animate-slide-up"
          >
            <div style={styles.pushIconBox}>
              <Bell size={14} color="#000000" />
            </div>
            <div style={styles.pushTexts}>
              <span style={styles.pushTitle}>Security Guard Alert</span>
              <span style={styles.pushMessage}>{n.message}</span>
            </div>
          </div>
        ))}

        {/* --- MOCK AI SCANNING LOADER --- */}
        {aiScanningTx && (
          <div style={styles.aiOverlay} className="animate-fade-in">
            <div style={styles.aiCard}>
              <div style={styles.aiScannerContainer}>
                <div style={styles.aiScannerBar}></div>
                <Shield size={44} color="var(--accent-neon)" className="animate-pulse" />
              </div>
              <h3 style={styles.aiTitle}>AI Shield Scanning</h3>
              <p style={styles.aiDetails}>Paying ₹{aiScanningTx.amount} to {aiScanningTx.recipientName}</p>
              <div style={styles.progressContainer}>
                <span style={styles.progressText}>{aiScanProgress}</span>
              </div>
            </div>
          </div>
        )}

        {/* --- UPI PIN ENTRY MODAL (2nd factor) --- */}
        {pinModal && (
          <div style={styles.modalOverlay} className="animate-fade-in">
            <div style={{ background: '#141414', borderRadius: 20, padding: 24, width: 300,
                          textAlign: 'center', border: '1px solid #333' }} className="animate-scale-in">
              <Lock size={28} color="#22e67b" style={{ marginBottom: 8 }} />
              <h3 style={{ color: '#fff', margin: '4px 0' }}>Enter UPI PIN</h3>
              <p style={{ color: '#888', fontSize: 13, marginBottom: 2 }}>
                Paying ₹{pinModal.amount} to {recipient}
              </p>
              <p style={{ color: '#555', fontSize: 11, marginBottom: 16 }}>(demo PIN: 1234)</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ width: 14, height: 14, borderRadius: '50%',
                    background: i < pinInput.length ? '#22e67b' : '#333' }} />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, idx) => (
                  <button key={idx} disabled={k === ''}
                    onClick={() => {
                      if (k === '⌫') { setPinInput(p => p.slice(0, -1)); return; }
                      if (k === '') return;
                      const next = (pinInput + k).slice(0, 4);
                      setPinInput(next);
                      if (next.length === 4) {
                        const pm = pinModal;
                        setTimeout(() => executePayment(pm.amount, pm.isInvest, next), 150);
                      }
                    }}
                    style={{ padding: '14px 0', fontSize: 20, borderRadius: 12,
                      background: k === '' ? 'transparent' : '#222', color: '#fff',
                      border: 'none', cursor: k === '' ? 'default' : 'pointer' }}>
                    {k}
                  </button>
                ))}
              </div>
              <button onClick={() => { setPinModal(null); setPinInput(""); }}
                style={{ marginTop: 16, background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* --- BIOMETRIC CHECKING MODAL --- */}
        {showBiometricModal && (
          <div style={styles.modalOverlay} className="animate-fade-in">
            <div style={styles.biometricCard} className="animate-scale-in">
              <div style={styles.biometricCloseBtnRow}>
                <button 
                  onClick={() => setShowBiometricModal(false)} 
                  style={styles.circleCloseBtn}
                  aria-label="Close biometrics"
                >
                  <X size={16} color="#ffffff" />
                </button>
              </div>
              
              <div style={styles.fingerprintLogoWrapper}>
                <Fingerprint size={48} color="var(--accent-neon)" style={styles.fingerprintIcon} />
                <div style={styles.fingerprintScannerLaser}></div>
              </div>

              <h3 style={styles.biometricTitle}>Biometric Verification</h3>
              <p style={styles.biometricDesc}>
                Place your finger on the sensor or face the camera to authenticate the transaction securely.
              </p>

              <button 
                type="button" 
                onClick={handleBiometricSuccess} 
                style={styles.biometricSimulateBtn}
              >
                Simulate Touch ID / Face ID
              </button>
            </div>
          </div>
        )}

        {/* --- GUARDIAN DECISION SIMULATOR PANEL --- */}
        {guardianRequest && (
          <div style={styles.modalOverlay} className="animate-fade-in">
            <div style={styles.guardianSimCard} className="animate-scale-in">
              <div style={styles.guardianSimHeader}>
                <div style={styles.simBadge}>DEMO GUARDIAN SIMULATOR</div>
                <p style={styles.simDesc}>
                  Your payment is paused. You can act as the Guardian on their device to decide:
                </p>
              </div>

              <div style={styles.guardianMobileNotification}>
                <div style={styles.gNotifHeader}>
                  <div style={styles.gNotifLogo}>🏦 payit guardian</div>
                  <span style={styles.gNotifTime}>Now</span>
                </div>
                <h4 style={styles.gNotifTitle}>Approval Request</h4>
                <p style={styles.gNotifBody}>
                  <strong>{currentUserName || 'Account holder'}</strong> wants to transfer <strong>₹{guardianRequest.amount}</strong> to <strong>{guardianRequest.recipient}</strong>.
                </p>
                <div style={styles.gNotifRiskBlock}>
                  <div style={styles.riskRow}>
                    <span style={styles.riskLabel}>AI Risk Score:</span>
                    <span style={{ 
                      ...styles.riskBadge,
                      color: guardianRequest.riskScore === 'High' ? 'var(--accent-pink)' : guardianRequest.riskScore === 'Medium' ? '#ff9c00' : 'var(--accent-neon)',
                      backgroundColor: guardianRequest.riskScore === 'High' ? 'rgba(235,59,136,0.1)' : guardianRequest.riskScore === 'Medium' ? 'rgba(255,156,0,0.1)' : 'rgba(34,230,123,0.1)'
                    }}>{guardianRequest.riskScore}</span>
                  </div>
                  <div style={styles.detailsRow}>
                    <MapPin size={10} color="var(--text-secondary)" style={{ marginRight: 4 }} />
                    <span style={styles.locText}>Location: {locationStatus === 'unusual' ? '🔴 43km Unusual' : '🟢 Registered'}</span>
                  </div>
                  <div style={styles.detailsRow}>
                    <Smartphone size={10} color="var(--text-secondary)" style={{ marginRight: 4 }} />
                    <span style={styles.devText}>Device: {deviceStatus === 'new' ? '🔴 Unrecognized' : '🟢 Registered'}</span>
                  </div>
                </div>

                <div style={styles.timerRow}>
                  <Clock size={12} color="var(--accent-pink)" style={{ marginRight: 4 }} />
                  <span>Request expires in: {Math.floor(guardianTimer / 60)}:{(guardianTimer % 60).toString().padStart(2, '0')}</span>
                </div>

                <div style={styles.guardianActionGrid}>
                  <button 
                    onClick={() => handleGuardianDecision(true)} 
                    style={styles.gApproveBtn}
                  >
                    <Check size={14} style={{ marginRight: 4 }} /> Approve
                  </button>
                  <button 
                    onClick={() => handleGuardianDecision(false, "Scam Risk Rejected")} 
                    style={styles.gRejectBtn}
                  >
                    <X size={14} style={{ marginRight: 4 }} /> Reject
                  </button>
                  <button 
                    onClick={() => triggerNotification(`Calling ${currentUserName || 'account holder'}...`, "info")}
                    style={styles.gCallBtn}
                  >
                    <Phone size={14} style={{ marginRight: 4 }} /> Call
                  </button>
                </div>
              </div>

              <button 
                onClick={() => handleGuardianDecision(false, "No response from Guardian")} 
                style={styles.simTimeoutBtn}
              >
                Simulate Expiry (Cancel & Request PIN)
              </button>
            </div>
          </div>
        )}

        {/* --- CUSTOM REACT OTP VERIFICATION MODAL --- */}
        {otpModalOpen && otpModalTx && (
          <div style={styles.modalOverlay} className="animate-fade-in">
            <div style={{
              background: '#141414',
              borderRadius: 24,
              padding: 24,
              width: 320,
              textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.06)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
            }} className="animate-scale-in">
              <ShieldAlert size={36} color="#ff8c00" style={{ marginBottom: 12 }} />
              <h3 style={{ color: '#fff', margin: '4px 0', fontSize: '18px', fontWeight: '700' }}>Extra Verification Needed</h3>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 16 }}>
                We detected anomalous behavior. To complete your payment of <strong>₹{otpModalTx.amount}</strong> to <strong>{otpModalTx.recipient}</strong>, enter the 6-digit OTP sent to your registered mobile.
              </p>

              {/* OTP hint — shows the demo code locally; real app = SMS only */}
              <div style={{ backgroundColor: 'rgba(255,140,0,0.06)', border: '1px solid rgba(255,140,0,0.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 16, textAlign: 'left' }}>
                <p style={{ color: '#ff8c00', fontSize: 11, fontWeight: 600, margin: 0 }}>📱 OTP sent to your registered mobile number</p>
                {otpModalTx.otpDemo ? (
                  <p style={{ color: '#22e67b', fontSize: 12, margin: '4px 0 0 0' }}>Demo OTP: <b>{otpModalTx.otpDemo}</b> (real app: SMS only)</p>
                ) : (
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, margin: '4px 0 0 0' }}>Check server logs if testing locally.</p>
                )}
              </div>

              <input
                type="text"
                maxLength={6}
                value={otpModalCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtpModalCode(val);
                }}
                placeholder="------"
                style={{
                  width: '100%',
                  backgroundColor: '#0c0c0e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '12px',
                  fontSize: '20px',
                  textAlign: 'center',
                  color: '#fff',
                  letterSpacing: '6px',
                  fontWeight: '700',
                  marginBottom: 12,
                  outline: 'none'
                }}
                aria-label="OTP verification code"
              />

              {otpModalError && (
                <p style={{ color: 'var(--accent-pink)', fontSize: '11px', margin: '0 0 12px 0', fontWeight: '600' }}>
                  {otpModalError}
                </p>
              )}

              {/* Resend OTP */}
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <button
                  disabled={otpResendStatus === 'sending' || otpResendStatus === 'sent'}
                  onClick={async () => {
                    setOtpResendStatus('sending');
                    try {
                      const rr = await api.resendOtp(otpModalTx.transaction_id);
                      if (rr.ok && rr.data.otp_demo)   // update shown demo code
                        setOtpModalTx(prev => ({ ...prev, otpDemo: rr.data.otp_demo }));
                      setOtpResendStatus('sent');
                      setTimeout(() => setOtpResendStatus(''), 30000);
                    } catch {
                      setOtpResendStatus('');
                    }
                  }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: otpResendStatus === 'sent' ? 'var(--accent-neon)' : 'rgba(255,255,255,0.4)',
                    fontSize: 11, fontWeight: 600
                  }}
                >
                  {otpResendStatus === 'sending' ? 'Sending…' : otpResendStatus === 'sent' ? '✓ OTP resent' : 'Resend OTP'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    setOtpModalOpen(false);
                    setOtpModalTx(null);
                    triggerNotification("Payment cancelled", "info");
                  }}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.6)',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={otpModalCode.length < 6}
                  onClick={() => handleOtpSubmit(otpModalCode)}
                  style={{
                    flex: 2,
                    padding: '12px 0',
                    borderRadius: 12,
                    background: otpModalCode.length < 6 ? '#222' : 'linear-gradient(135deg, #ff8c00, #e65c00)',
                    color: otpModalCode.length < 6 ? '#555' : '#fff',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: otpModalCode.length < 6 ? 'default' : 'pointer'
                  }}
                >
                  Verify & Pay
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- GLOBAL SERVICES FROZEN OVERLAY (Kill Switch) --- */}
        {isFrozen && activeScreen !== 'slice-shield' && (
          <div style={styles.globalFreezeOverlay}>
            <ShieldAlert size={56} color="var(--accent-pink)" />
            <h2 style={styles.freezeTitle}>Banking Services Frozen</h2>
            <p style={styles.freezeDesc}>
              All UPI transactions, mobile banking, cards, and internet banking have been instantly blocked via the Kill Switch.
            </p>
            
            <button 
              onClick={() => {
                setPinPurpose("unfreeze");
                setShowBiometricModal(true);
              }}
              style={styles.unfreezeActBtn}
            >
              Verify Identity & Unlock Services
            </button>
            
            <button 
              onClick={() => resetToScreen('slice-shield')} 
              style={styles.gotoShieldBtn}
            >
              Configure Shield Settings
            </button>
          </div>
        )}

        {/* --- EMERGENCY ACCOUNT LOCKED OVERLAY --- */}
        {isAccountLocked && activeScreen !== 'slice-shield' && (
          <div style={styles.globalLockOverlay}>
            <Lock size={56} color="#ff9c00" />
            <h2 style={styles.freezeTitle}>payit Profile Locked</h2>
            <p style={styles.freezeDesc}>
              Emergency Lockdown has been activated for this profile. All access to payit resources is restricted.
            </p>

            <button 
              onClick={() => {
                setPinPurpose("unlock");
                setShowBiometricModal(true);
              }}
              style={{ ...styles.unfreezeActBtn, backgroundColor: '#ff9c00' }}
            >
              Re-authenticate Profile
            </button>
            
            <button 
              onClick={() => resetToScreen('slice-shield')} 
              style={styles.gotoShieldBtn}
            >
              Go to Security Settings
            </button>
          </div>
        )}
      </PhoneFrame>

      {/* ═══════════════════════════════════════════════════════════════════
          APP PIN GATE — shown on every refresh/reopen (like real UPI apps).
          Overlays the entire PhoneFrame so nothing is accessible without auth.
      ══════════════════════════════════════════════════════════════════════ */}
      {appLocked && currentUser && (
        <div style={appGateStyles.overlay}>
          <div style={appGateStyles.card} className="animate-scale-in">
            {/* Forgot PIN flow */}
            {showForgotPin ? (
              <>
                <div style={appGateStyles.logoRow}>
                  <div style={appGateStyles.logoBadge}><Lock size={20} color="#fff" /></div>
                  <span style={appGateStyles.logoText}>Reset PIN</span>
                </div>

                {forgotStep === 'send' && (
                  <>
                    <p style={appGateStyles.subtitle}>We'll send an OTP to your registered mobile to reset your UPI PIN.</p>
                    <p style={appGateStyles.vpaText}>{currentUser}</p>
                    {forgotErr && <p style={appGateStyles.errText}>{forgotErr}</p>}
                    {forgotMsg && <p style={appGateStyles.successText}>{forgotMsg}</p>}
                    <button
                      disabled={forgotBusy}
                      style={{ ...appGateStyles.primaryBtn, marginTop: 16 }}
                      onClick={async () => {
                         setForgotBusy(true); setForgotErr('');
                         const r = await api.forgotPin(currentUser).catch(() => ({ ok: false }));
                         setForgotBusy(false);
                         if (r.ok) {
                           setForgotMsg(r.data?.message || 'OTP sent!');
                           setForgotOtpDemo(r.data?.otp_demo || '');
                           setForgotStep('otp');
                         }
                         else setForgotErr(r.data?.detail || 'Failed to send OTP. Check server.');
                       }}
                    >{forgotBusy ? 'Sending…' : 'Send OTP'}</button>
                    <button style={appGateStyles.cancelBtn} onClick={() => {
                       if (forgotPinCameFromSettings) {
                         setAppLocked(false);
                         setShowForgotPin(false);
                         setForgotPinCameFromSettings(false);
                       } else {
                         setShowForgotPin(false);
                       }
                     }}>← Back to PIN</button>
                  </>
                )}

                {forgotStep === 'otp' && (
                  <>
                    <p style={appGateStyles.subtitle}>Enter the 6-digit OTP sent to your mobile.</p>
                     {forgotOtpDemo ? (
                       <p style={{ color: '#22e67b', fontSize: 12, margin: '4px 0 12px 0', textAlign: 'center', fontWeight: 'bold' }}>Demo OTP: {forgotOtpDemo} (real app: SMS only)</p>
                     ) : (
                       <p style={appGateStyles.subtitle}>(Check server logs for demo.)</p>
                     )}
                    <input
                      type="text" maxLength={6} value={forgotOtp}
                      onChange={e => setForgotOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                      placeholder="------"
                      style={appGateStyles.otpInput}
                      autoFocus
                    />
                    {forgotErr && <p style={appGateStyles.errText}>{forgotErr}</p>}
                    <button
                      disabled={forgotOtp.length < 6 || forgotBusy}
                      style={{ ...appGateStyles.primaryBtn, marginTop: 8, opacity: forgotOtp.length < 6 ? 0.5 : 1 }}
                      onClick={() => { if (forgotOtp.length === 6) { setForgotStep('newpin'); setForgotErr(''); } }}
                    >Verify OTP</button>
                    <button style={appGateStyles.cancelBtn} onClick={() => setForgotStep('send')}>← Resend OTP</button>
                  </>
                )}

                {(forgotStep === 'newpin' || forgotStep === 'confirm') && (() => {
                  const isConfirm = forgotStep === 'confirm';
                  const currentForgotPin = isConfirm ? forgotConfirmPin : forgotNewPin;
                  const forgotSetter = isConfirm ? setForgotConfirmPin : setForgotNewPin;
                  return (
                    <>
                      <p style={appGateStyles.subtitle}>{isConfirm ? 'Confirm your new UPI PIN' : 'Enter your new 4-digit UPI PIN'}</p>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '16px 0' }}>
                        {[0,1,2,3].map(i => (
                          <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < currentForgotPin.length ? 'var(--accent-neon)' : '#333' }} />
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, idx) => (
                          <button key={idx} disabled={k === '' || forgotBusy}
                            style={{ padding: '12px 0', fontSize: 20, borderRadius: 10, background: k === '' ? 'transparent' : '#222', color: '#fff', border: 'none', cursor: k === '' ? 'default' : 'pointer' }}
                            onClick={() => {
                              if (k === '⌫') { forgotSetter(p => p.slice(0,-1)); return; }
                              if (!k) return;
                              const next = currentForgotPin + k;
                              if (next.length > 4) return;
                              forgotSetter(next);
                              if (next.length === 4) {
                                if (!isConfirm) {
                                  setTimeout(() => { setForgotStep('confirm'); setForgotConfirmPin(''); }, 200);
                                } else {
                                  // Submit reset
                                  if (forgotNewPin !== next) {
                                    setForgotErr("PINs don't match. Try again.");
                                    setForgotStep('newpin'); setForgotNewPin(''); setForgotConfirmPin('');
                                    return;
                                  }
                                  setForgotBusy(true); setForgotErr('');
                                  api.resetPin(currentUser, forgotOtp, forgotNewPin)
                                    .then(r => {
                                      setForgotBusy(false);
                                      if (r.ok) {
                                        setForgotMsg('PIN reset! You can now login.');
                                        setShowForgotPin(false);
                                        setAppLocked(false);
                                        setForgotPinCameFromSettings(false);
                                      } else {
                                        setForgotErr(r.data?.detail || 'Reset failed.');
                                        setForgotStep('newpin'); setForgotNewPin(''); setForgotConfirmPin('');
                                      }
                                    })
                                    .catch(() => { setForgotBusy(false); setForgotErr('Server error.'); });
                                }
                              }
                            }}
                          >{k}</button>
                        ))}
                      </div>
                      {forgotErr && <p style={appGateStyles.errText}>{forgotErr}</p>}
                      {forgotBusy && <p style={{ color: 'var(--accent-neon)', fontSize: 12, textAlign: 'center' }}>Saving…</p>}
                    </>
                  );
                })()}
              </>
            ) : (
              /* ── Normal PIN gate ── */
              <>
                <div style={appGateStyles.logoRow}>
                  <div style={appGateStyles.logoBadge}><Shield size={20} color="#fff" /></div>
                  <span style={appGateStyles.logoText}>payit</span>
                </div>
                <h3 style={appGateStyles.title}>Welcome back</h3>
                <p style={appGateStyles.subtitle}>{currentUserName || currentUser}</p>

                {/* Fingerprint / passkey button */}
                {hasPasskey(currentUser) && (
                  <button
                    style={appGateStyles.fingerprintBtn}
                    disabled={appPinBusy}
                    onClick={async () => {
                      setAppPinBusy(true); setAppPinError('');
                      const r = await loginWithPasskey(currentUser);
                      setAppPinBusy(false);
                      if (r.ok) setAppLocked(false);
                      else setAppPinError(r.error || 'Biometric failed. Use PIN.');
                    }}
                  >
                    <Fingerprint size={28} color="var(--accent-neon)" />
                    <span>Use Fingerprint / Face ID</span>
                  </button>
                )}

                {/* PIN dots */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '16px 0 8px' }}>
                  {[0,1,2,3].map(i => (
                    <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < appPinInput.length ? 'var(--accent-neon)' : '#333', transition: 'background 0.15s' }} />
                  ))}
                </div>

                {/* Keypad */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                  {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, idx) => (
                    <button key={idx} disabled={k === '' || appPinBusy}
                      style={{ padding: '13px 0', fontSize: 20, borderRadius: 10, background: k === '' ? 'transparent' : '#1a1a1d', color: '#fff', border: 'none', cursor: k === '' ? 'default' : 'pointer', transition: 'background 0.1s' }}
                      onClick={() => {
                        if (k === '⌫') { setAppPinInput(p => p.slice(0,-1)); return; }
                        if (!k) return;
                        const next = (appPinInput + k).slice(0,4);
                        setAppPinInput(next);
                        if (next.length === 4) {
                          setAppPinBusy(true); setAppPinError('');
                          api.login(currentUser, next)
                            .then(r => {
                              setAppPinBusy(false);
                              if (r.ok) {
                                if (r.data?.balance != null) setBalance(r.data.balance);
                                setAppLocked(false);
                              } else {
                                setAppPinError('Incorrect PIN. Try again.');
                                setAppPinInput('');
                              }
                            })
                            .catch(() => {
                              setAppPinBusy(false);
                              setAppPinError('Server unreachable — check backend.');
                              setAppPinInput('');
                            });
                        }
                      }}
                    >{k}</button>
                  ))}
                </div>

                {appPinError && <p style={appGateStyles.errText}>{appPinError}</p>}
                {appPinBusy && <p style={{ color: 'var(--accent-neon)', fontSize: 12, textAlign: 'center' }}>Verifying…</p>}

                <button
                  style={appGateStyles.forgotBtn}
                  onClick={() => { setShowForgotPin(true); setForgotStep('send'); setForgotErr(''); setForgotMsg(''); }}
                >
                  Forgot PIN?
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Styling for App PIN gate overlay
const appGateStyles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 999999,
    backdropFilter: 'blur(12px)',
  },
  card: {
    background: '#0f0f12',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 28,
    padding: '28px 24px',
    width: 300,
    maxWidth: '90vw',
    boxShadow: '0 24px 64px rgba(0,0,0,0.9)',
  },
  logoRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginBottom: 16,
  },
  logoBadge: {
    width: 40, height: 40, borderRadius: 12,
    background: 'linear-gradient(135deg,#eb3b88,#aa33ff)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' },
  title: { color: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center', margin: '0 0 4px' },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', margin: '0 0 8px' },
  vpaText: { color: 'var(--accent-neon)', fontSize: 13, fontWeight: 600, textAlign: 'center', margin: '0 0 12px' },
  fingerprintBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: '14px 0', borderRadius: 14,
    background: 'rgba(34,230,123,0.06)', border: '1px solid rgba(34,230,123,0.2)',
    color: 'var(--accent-neon)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    marginBottom: 8,
  },
  errText: { color: '#ff5470', fontSize: 11, fontWeight: 600, textAlign: 'center', margin: '4px 0' },
  successText: { color: 'var(--accent-neon)', fontSize: 11, fontWeight: 600, textAlign: 'center', margin: '4px 0' },
  forgotBtn: {
    width: '100%', background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', padding: '8px 0', textAlign: 'center',
  },
  primaryBtn: {
    width: '100%', padding: '13px 0', borderRadius: 14,
    background: 'linear-gradient(135deg,#eb3b88,#aa33ff)',
    color: '#fff', fontSize: 14, fontWeight: 700,
    border: 'none', cursor: 'pointer',
  },
  cancelBtn: {
    width: '100%', padding: '10px 0', background: 'none', border: 'none',
    color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', marginTop: 6,
  },
  otpInput: {
    width: '100%', backgroundColor: '#0c0c0e',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
    padding: '12px', fontSize: '20px', textAlign: 'center',
    color: '#fff', letterSpacing: '6px', fontWeight: '700',
    marginBottom: 8, outline: 'none', boxSizing: 'border-box',
  },
};

// Styling for all new overlay features inside App.jsx
const styles = {
  pushNotification: {
    position: 'absolute',
    left: '12px',
    right: '12px',
    backgroundColor: '#ffffff',
    borderRadius: '14px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    zIndex: 99999,
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
  },
  pushIconBox: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-neon)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pushTexts: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px'
  },
  pushTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#000000'
  },
  pushMessage: {
    fontSize: '11px',
    color: '#3a3a3c',
    fontWeight: '500'
  },
  aiOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 5, 6, 0.9)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10002
  },
  aiCard: {
    backgroundColor: '#121214',
    border: '1px solid rgba(34, 230, 123, 0.15)',
    borderRadius: '24px',
    padding: '24px',
    width: '280px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center'
  },
  aiScannerContainer: {
    position: 'relative',
    width: '74px',
    height: '74px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,230,123,0.05)',
    borderRadius: '50%',
    border: '1.5px solid rgba(34,230,123,0.2)',
    overflow: 'hidden',
    marginBottom: '16px'
  },
  aiScannerBar: {
    position: 'absolute',
    left: 0,
    width: '100%',
    height: '3px',
    backgroundColor: 'var(--accent-neon)',
    boxShadow: '0 0 10px var(--accent-neon)',
    animation: 'sweepingScan 1.6s infinite linear'
  },
  aiTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '4px'
  },
  aiDetails: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginBottom: '18px'
  },
  progressContainer: {
    height: '30px',
    display: 'flex',
    alignItems: 'center'
  },
  progressText: {
    fontSize: '10px',
    fontWeight: '600',
    color: 'var(--accent-neon)',
    animation: 'fadeIn 0.2s ease-in-out'
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001
  },
  biometricCard: {
    backgroundColor: '#111113',
    border: '1.5px solid rgba(255,255,255,0.06)',
    borderRadius: '28px',
    padding: '20px',
    width: '300px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  biometricCloseBtnRow: {
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: '4px'
  },
  circleCloseBtn: {
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  fingerprintLogoWrapper: {
    position: 'relative',
    width: '80px',
    height: '80px',
    backgroundColor: 'rgba(34, 230, 123, 0.08)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    overflow: 'hidden',
    border: '1px solid rgba(34,230,123,0.15)'
  },
  fingerprintIcon: {
    display: 'block'
  },
  fingerprintScannerLaser: {
    position: 'absolute',
    left: 0,
    width: '100%',
    height: '2px',
    backgroundColor: 'var(--accent-neon)',
    boxShadow: '0 0 10px var(--accent-neon)',
    animation: 'sweepingScan 1.6s infinite linear'
  },
  biometricTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '6px'
  },
  biometricDesc: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    marginBottom: '20px',
    padding: '0 10px'
  },
  biometricSimulateBtn: {
    backgroundColor: 'var(--accent-neon)',
    color: '#000000',
    border: 'none',
    borderRadius: '20px',
    height: '40px',
    width: '100%',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(34, 230, 123, 0.2)'
  },
  guardianSimCard: {
    backgroundColor: '#0c0c0e',
    border: '2px dashed var(--accent-blue)',
    borderRadius: '32px',
    padding: '18px',
    width: '320px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)'
  },
  guardianSimHeader: {
    marginBottom: '12px'
  },
  simBadge: {
    backgroundColor: 'rgba(0, 136, 255, 0.15)',
    color: 'var(--accent-blue)',
    fontSize: '9px',
    fontWeight: '800',
    letterSpacing: '1px',
    padding: '3px 8px',
    borderRadius: '6px',
    display: 'inline-block',
    marginBottom: '6px'
  },
  simDesc: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    lineHeight: '1.3'
  },
  guardianMobileNotification: {
    backgroundColor: '#ffffff',
    color: '#000000',
    borderRadius: '20px',
    padding: '14px',
    width: '100%',
    textAlign: 'left',
    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    marginBottom: '12px'
  },
  gNotifHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '9px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    marginBottom: '6px'
  },
  gNotifLogo: {
    color: '#3a3a3c',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  gNotifTime: {
    color: '#8c8c8e'
  },
  gNotifTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#000000',
    marginBottom: '2px'
  },
  gNotifBody: {
    fontSize: '11px',
    color: '#1c1c1f',
    lineHeight: '1.4',
    marginBottom: '8px'
  },
  gNotifRiskBlock: {
    backgroundColor: '#f5f5f7',
    borderRadius: '12px',
    padding: '8px 10px',
    marginBottom: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  riskRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '10px'
  },
  riskLabel: {
    color: '#575759',
    fontWeight: '600'
  },
  riskBadge: {
    fontSize: '9px',
    fontWeight: '800',
    padding: '1px 5px',
    borderRadius: '4px'
  },
  detailsRow: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '9px',
    color: '#575759'
  },
  timerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--accent-pink)',
    marginBottom: '12px'
  },
  guardianActionGrid: {
    display: 'flex',
    gap: '6px'
  },
  gApproveBtn: {
    flex: 1.2,
    backgroundColor: '#22e67b',
    border: 'none',
    color: '#000000',
    height: '32px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  gRejectBtn: {
    flex: 1.2,
    backgroundColor: '#eb3b88',
    border: 'none',
    color: '#ffffff',
    height: '32px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  gCallBtn: {
    flex: 0.8,
    backgroundColor: '#e5e5ea',
    border: 'none',
    color: '#1c1c1f',
    height: '32px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  simTimeoutBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '10px',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline'
  },
  globalFreezeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 5, 6, 0.95)',
    backdropFilter: 'blur(16px)',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '24px'
  },
  globalLockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(235, 59, 136, 0.05)',
    background: 'radial-gradient(circle at center, #1b0c15 0%, #050506 80%)',
    backdropFilter: 'blur(16px)',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '24px',
    border: '1.5px solid rgba(235, 59, 136, 0.2)'
  },
  freezeTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#ffffff',
    marginTop: '18px',
    marginBottom: '8px',
    fontFamily: 'var(--font-display)'
  },
  freezeDesc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    marginBottom: '28px',
    padding: '0 12px'
  },
  unfreezeActBtn: {
    backgroundColor: 'var(--accent-pink)',
    border: 'none',
    color: '#ffffff',
    borderRadius: '24px',
    height: '46px',
    padding: '0 24px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(235, 59, 136, 0.3)',
    marginBottom: '12px'
  },
  gotoShieldBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline'
  }
};

export default App;
