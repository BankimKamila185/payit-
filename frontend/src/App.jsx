import { useState, useEffect } from 'react';
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

import { Shield, Lock, ShieldCheck, AlertTriangle, Fingerprint, Phone, X, Check, Bell } from 'lucide-react';

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
  const [lastTx, setLastTx] = useState({
    id: 'TX-98127',
    recipient: 'Gopichand Javanajad',
    amount: 20,
    date: '25 Jun, 11:54 AM',
    upiRef: '617871427501',
    transId: 'PAY27867B1E91953D47D9315D39D8361280',
    status: 'success'
  });

  // --- NEW SECURITY STATES ---
  const [isFrozen, setIsFrozen] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  
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
    { name: "Bankim's Father", phone: "98102-39210", relation: "Father", upi: "father@upi" }
  ]);

  // Demo Simulation Parameters
  const [deviceStatus, setDeviceStatus] = useState('registered'); // 'registered' or 'new'
  const [locationStatus, setLocationStatus] = useState('normal'); // 'normal' or 'unusual'

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

  // Log Kill Switch changes
  useEffect(() => {
    if (isFrozen) {
      triggerNotification("Kill Switch Activated: All banking frozen", "alert");
    } else {
      triggerNotification("Kill Switch Deactivated: Services unlocked", "info");
    }
  }, [isFrozen]);

  // Log Account Lock changes
  useEffect(() => {
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
  const handlePaymentProcess = (amount, isInvest = false) => {
    if (isFrozen) {
      triggerNotification("Blocked: Kill Switch is currently active", "alert");
      return;
    }
    if (isAccountLocked) {
      triggerNotification("Blocked: Account is locked", "alert");
      return;
    }

    setTempPayDetails({ amount, isInvest, recipientName: recipient });
    
    // Step 1: Run AI Real-Time Fraud Scan loader
    setAiScanningTx({ amount, recipientName: recipient });
    setAiScanProgress("Analyzing transaction anomalies...");

    setTimeout(() => {
      setAiScanProgress("Checking recipient UPI database...");
    }, 600);

    setTimeout(() => {
      setAiScanProgress("Evaluating location coordinates & device footprint...");
    }, 1200);

    setTimeout(() => {
      setAiScanningTx(null); // Scan completed
      
      // Determine AI Risk Score based on recipient name & simulated footprint
      const isScam = recipient.toLowerCase().includes("prize") || recipient.toLowerCase().includes("scam");
      const isUnusualLoc = locationStatus === 'unusual';
      const isNewDevice = deviceStatus === 'new';
      
      let riskScore = "Low";
      if (isScam || (isUnusualLoc && isNewDevice)) {
        riskScore = "High";
      } else if (isUnusualLoc || isNewDevice) {
        riskScore = "Medium";
      }

      // Step 2: Risk-Based Authentication Check
      const requiresExtraAuth = isHighValueAuthActive && (amount >= highValueThreshold || riskScore === "Medium" || riskScore === "High");
      
      if (requiresExtraAuth) {
        triggerNotification(`Risk authentication triggered (AI Risk: ${riskScore})`, "alert");
        setPinPurpose("pay");
        setShowBiometricModal(true);
      } else {
        proceedToVerificationPipeline(amount, isInvest, riskScore);
      }
    }, 1800);
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
  const handleRecallTransaction = (txId) => {
    setPendingTransactions(prev => prev.filter(tx => tx.id !== txId));
    triggerNotification("Transaction Cancelled: Funds recalled safely", "info");
    
    // Update lastTx state to show recalled
    setLastTx(prev => ({
      ...prev,
      status: 'recalled',
      timeLeft: 0
    }));
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
            onAddMoney={(name, amount) => {
              setRecipient(name && typeof name === 'string' ? name : "Add money");
              setPayAmount(amount || "");
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
              else if (id === 'autopay') pushScreen('upi-settings');
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
            onClose={popScreen}
            onScanSuccess={(name) => {
              setRecipient(name);
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
          />
        );
      case 'activity':
        return (
          <Activity 
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
            onCategoryClick={(name) => {
              setRecipient(name);
              pushScreen('transfer');
            }}
          />
        );
      case 'check-balance':
        return (
          <CheckBalance 
            upiId="bankimkamila23@payit"
            onBack={popScreen}
          />
        );
      case 'upi-settings':
        return (
          <UpiSettings 
            upiId="bankimkamila23@payit"
            onAddAccount={() => {
              setRecipient("SBI Bank Link");
              pushScreen('transfer');
            }}
          />
        );
      case 'transfer':
        return (
          <TransferKeypad 
            recipientName={recipient}
            prefilledAmount={payAmount}
            onTransferSuccess={(amt) => handlePaymentProcess(amt, false)}
            onInvestSuccess={(amt) => handlePaymentProcess(amt, true)}
            onOpenScanner={() => pushScreen('qr-scanner')}
            onCheckBalance={() => pushScreen('check-balance')}
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
      'fraud-report': ''
    };
    return titles[activeScreen] || '';
  };

  const showBackButton = () => {
    return ['recharge-bills', 'analytics', 'check-balance', 'upi-settings', 'transfer', 'qr-scanner', 'paid-success', 'fraud-report'].includes(activeScreen);
  };

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
                  <strong>Bankim's Father</strong> wants to transfer <strong>₹{guardianRequest.amount}</strong> to <strong>{guardianRequest.recipient}</strong>.
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
                    onClick={() => triggerNotification("Calling Bankim's Father...", "info")} 
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
    </div>
  );
}

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
