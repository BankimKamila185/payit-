import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  HelpCircle, 
  Lock, 
  Unlock, 
  Flame, 
  Clock, 
  User, 
  Plus, 
  Phone, 
  Trash2, 
  Smartphone, 
  MapPin, 
  AlertTriangle,
  ChevronRight,
  Sliders,
  Settings,
  X
} from 'lucide-react';
import { api } from '../api';

const SliceShield = ({
  isFrozen = false,
  setIsFrozen,
  isAccountLocked = false,
  setIsAccountLocked,
  isApprovalWindowActive = true,
  setIsApprovalWindowActive,
  approvalWindowDelay = 15,
  setApprovalWindowDelay,
  isHighValueAuthActive = true,
  setIsHighValueAuthActive,
  highValueThreshold = 5000,
  setHighValueThreshold,
  isGuardianModeActive = false,
  setIsGuardianModeActive,
  guardianLimit = 10000,
  setGuardianLimit,
  guardians = [],
  onAddGuardian,
  onRemoveGuardian,
  pendingTransactions = [],
  onRecallTransaction,
  securityLog = [],
  deviceStatus = 'registered',
  setDeviceStatus,
  locationStatus = 'normal',
  setLocationStatus,
  isDeviceRooted = false,
  setIsDeviceRooted,
  isActiveScreenShare = false,
  setIsActiveScreenShare
}) => {
  // Navigation states for bottom configuration drawers
  const [activeDrawer, setActiveDrawer] = useState(null); // 'delay' | 'highvalue' | 'guardian' | 'logs' | null

  // Local state for live stats from backend
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let active = true;
    const loadStats = async () => {
      try {
        const { ok, data } = await api.getStats();
        if (ok && active) {
          setStats(data);
        }
      } catch (e) {
        console.error("Failed to load dashboard stats:", e);
      }
    };
    loadStats();
    const interval = setInterval(loadStats, 4000); // refresh every 4s
    return () => { active = false; clearInterval(interval); };
  }, []);

  const recentScans = stats?.recent || [];



  // Local state for adding a guardian
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGName, setNewGName] = useState('');
  const [newGPhone, setNewGPhone] = useState('');
  const [newGRelation, setNewGRelation] = useState('Child');
  const [newGUpi, setNewGUpi] = useState('');



  const handleAddGuardianSubmit = (e) => {
    e.preventDefault();
    if (!newGName || !newGPhone || !newGUpi) return;
    if (onAddGuardian) {
      onAddGuardian({
        name: newGName,
        phone: newGPhone,
        relation: newGRelation,
        upi: newGUpi
      });
    }
    setNewGName('');
    setNewGPhone('');
    setNewGUpi('');
    setNewGRelation('Child');
    setShowAddForm(false);
  };

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* 1. Shield Pulse Header Card */}
      <div style={styles.shieldHeaderCard}>
        <div style={styles.shieldLogoWrapper}>
          <div style={styles.shieldPulseRing}></div>
          <Shield size={34} color="var(--accent-neon)" fill="rgba(34,230,123,0.1)" />
        </div>
        <div style={styles.headerTexts}>
          <h2 style={styles.shieldTitle}>payit shield</h2>
          <p style={styles.shieldSub}>
            {isFrozen || isAccountLocked 
              ? "Emergency Lockdown Protocols Active" 
              : "AI-powered fraud & scam prevention active"}
          </p>
        </div>
        <div style={styles.safetyScorePill}>
          <span style={{ 
            ...styles.scoreNumber,
            color: isFrozen || isAccountLocked ? 'var(--accent-pink)' : 'var(--accent-neon)'
          }}>
            {isFrozen || isAccountLocked ? "0%" : "98%"}
          </span>
          <span style={{ 
            ...styles.scoreLabel,
            color: isFrozen || isAccountLocked ? 'var(--accent-pink)' : 'var(--accent-neon)'
          }}>
            {isFrozen || isAccountLocked ? "LOCKED" : "SECURE"}
          </span>
        </div>
      </div>

      {/* 2. Emergency Bento Grid (Side-by-Side Controls) */}
      <div style={styles.bentoGrid}>
        {/* Kill Switch Bento Card */}
        <button 
          onClick={() => setIsFrozen(!isFrozen)}
          style={{
            ...styles.bentoCard,
            backgroundColor: isFrozen ? 'rgba(235, 59, 136, 0.1)' : 'rgba(255, 255, 255, 0.02)',
            borderColor: isFrozen ? 'var(--accent-pink)' : 'rgba(255, 255, 255, 0.06)'
          }}
          aria-label="Toggle Kill Switch"
        >
          <div style={styles.bentoIconWrapper}>
            <Flame size={20} color={isFrozen ? 'var(--accent-pink)' : 'var(--text-secondary)'} />
          </div>
          <div style={styles.bentoTexts}>
            <span style={styles.bentoTitle}>Kill Switch</span>
            <span style={styles.bentoStatus}>
              {isFrozen ? "FROZEN" : "TAP TO FREEZE"}
            </span>
          </div>
        </button>

        {/* Emergency Lock Bento Card */}
        <button 
          onClick={() => setIsAccountLocked(!isAccountLocked)}
          style={{
            ...styles.bentoCard,
            backgroundColor: isAccountLocked ? 'rgba(255, 140, 0, 0.1)' : 'rgba(255, 255, 255, 0.02)',
            borderColor: isAccountLocked ? '#ff8c00' : 'rgba(255, 255, 255, 0.06)'
          }}
          aria-label="Toggle Account Lock"
        >
          <div style={styles.bentoIconWrapper}>
            {isAccountLocked ? (
              <Lock size={20} color="#ff8c00" />
            ) : (
              <Unlock size={20} color="var(--text-secondary)" />
            )}
          </div>
          <div style={styles.bentoTexts}>
            <span style={styles.bentoTitle}>Lock Profile</span>
            <span style={styles.bentoStatus}>
              {isAccountLocked ? "LOCKED" : "TAP TO LOCK"}
            </span>
          </div>
        </button>
      </div>

      {/* 2.5 Live Shield Metrics Bento Grid */}
      <div style={styles.metricsHeader}>
        <span style={styles.sectionTitle}>Live Shield Analytics</span>
      </div>
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <span style={styles.metricVal}>{stats ? stats.total : '0'}</span>
          <span style={styles.metricLbl}>Total Scans</span>
        </div>
        <div style={styles.metricCard}>
          <span style={{ ...styles.metricVal, color: 'var(--accent-pink)' }}>
            {stats ? stats.blocked : '0'}
          </span>
          <span style={styles.metricLbl}>Blocks</span>
        </div>
        <div style={styles.metricCard}>
          <span style={{ ...styles.metricVal, color: '#ff8c00' }}>
            {stats ? stats.review : '0'}
          </span>
          <span style={styles.metricLbl}>OTP Steps</span>
        </div>
        <div style={styles.metricCard}>
          <span style={{ ...styles.metricVal, color: 'var(--accent-purple)' }}>
            {stats ? stats.open_alerts : '0'}
          </span>
          <span style={styles.metricLbl}>Open Alerts</span>
        </div>
      </div>

      {/* 3. Advanced Configurations Bento Menu */}
      <div style={styles.sectionHeader}>
        <Settings size={16} color="var(--accent-purple)" />
        <span style={styles.sectionTitle}>Shield Configurations</span>
      </div>
      <div style={styles.controlsList}>
        {/* Delay Window Configuration */}
        <button 
          onClick={() => setActiveDrawer('delay')}
          style={styles.controlItemRow}
          aria-label="Configure Transaction Delay Window"
        >
          <div style={styles.controlRowLeft}>
            <div style={{ ...styles.menuIconBox, backgroundColor: 'rgba(34, 230, 123, 0.08)' }}>
              <Clock size={16} color="var(--accent-neon)" />
            </div>
            <div style={styles.menuTexts}>
              <span style={styles.menuTitle}>Approval Delay Window</span>
              <span style={styles.menuDesc}>
                {isApprovalWindowActive ? `Active • ${approvalWindowDelay}s cooling-off` : "Disabled"}
              </span>
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-muted)" />
        </button>

        {/* High Value Limit Configuration */}
        <button 
          onClick={() => setActiveDrawer('highvalue')}
          style={styles.controlItemRow}
          aria-label="Configure High Value Authentication Limits"
        >
          <div style={styles.controlRowLeft}>
            <div style={{ ...styles.menuIconBox, backgroundColor: 'rgba(170, 51, 255, 0.08)' }}>
              <ShieldCheck size={16} color="var(--accent-purple)" />
            </div>
            <div style={styles.menuTexts}>
              <span style={styles.menuTitle}>High-Value Protection</span>
              <span style={styles.menuDesc}>
                {isHighValueAuthActive ? `Active above ₹${highValueThreshold.toLocaleString()}` : "Disabled"}
              </span>
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-muted)" />
        </button>

        {/* Guardian Mode Configuration */}
        <button 
          onClick={() => setActiveDrawer('guardian')}
          style={styles.controlItemRow}
          aria-label="Configure Trusted Guardian Approval"
        >
          <div style={styles.controlRowLeft}>
            <div style={{ ...styles.menuIconBox, backgroundColor: 'rgba(0, 136, 255, 0.08)' }}>
              <User size={16} color="var(--accent-blue)" />
            </div>
            <div style={styles.menuTexts}>
              <span style={styles.menuTitle}>Trusted Guardian Approval</span>
              <span style={styles.menuDesc}>
                {isGuardianModeActive 
                  ? `Enabled above ₹${guardianLimit.toLocaleString()} (${guardians.length} Guardian)` 
                  : "Disabled • Senior Citizen protection"}
              </span>
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-muted)" />
        </button>

        {/* Security Logs Feed Trigger */}
        <button 
          onClick={() => setActiveDrawer('logs')}
          style={{ ...styles.controlItemRow, borderBottom: 'none' }}
          aria-label="View Security Activity Feed"
        >
          <div style={styles.controlRowLeft}>
            <div style={{ ...styles.menuIconBox, backgroundColor: 'rgba(235, 59, 136, 0.08)' }}>
              <AlertTriangle size={16} color="var(--accent-pink)" />
            </div>
            <div style={styles.menuTexts}>
              <span style={styles.menuTitle}>Security Activity Feed</span>
              <span style={styles.menuDesc}>
                View audits, login warnings, and transaction logs
              </span>
            </div>
          </div>
          <ChevronRight size={16} color="var(--text-muted)" />
        </button>
      </div>

      {/* 4. Pending Recallable Transactions List (Placed on dashboard if any exist) */}
      {pendingTransactions.length > 0 && (
        <div style={styles.pendingTransactionsList}>
          <div style={styles.sectionHeader}>
            <Clock size={16} color="var(--accent-pink)" />
            <span style={styles.sectionTitle}>Escrow Holds (Eligible for Recall)</span>
          </div>
          <div style={styles.pendingContainer}>
            {pendingTransactions.map(tx => (
              <div key={tx.id} style={styles.pendingTxCard}>
                <div style={styles.pendingTxInfo}>
                  <span style={styles.pendingTxRecipient}>{tx.recipient}</span>
                  <span style={styles.pendingTxAmount}>₹{tx.amount.toLocaleString()}</span>
                  <span style={styles.pendingTxTime}>timer: {tx.timeLeft}s left</span>
                </div>
                <button 
                  onClick={() => onRecallTransaction && onRecallTransaction(tx.id)}
                  style={styles.recallBtn}
                >
                  Recall Payment
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Real-time AI Shield Scans */}
      <div style={styles.sectionHeader}>
        <Smartphone size={16} color="var(--accent-neon)" />
        <span style={styles.sectionTitle}>Real-time AI Shield Scans</span>
      </div>
      <div style={styles.scansList}>
        {recentScans.length === 0 ? (
          <p style={styles.emptyText}>No recent scans logged. Try sending money to generate activity.</p>
        ) : (
          recentScans.map((scan, idx) => {
            const isBlock = scan.label === 'BLOCK';
            const isReview = scan.label === 'REVIEW';
            let reasonsList = [];
            try {
              reasonsList = typeof scan.reasons === 'string' ? JSON.parse(scan.reasons) : scan.reasons;
            } catch (err) {}
            if (!Array.isArray(reasonsList)) reasonsList = reasonsList ? [reasonsList] : [];
            
            return (
              <div key={idx} style={styles.scanCard}>
                <div style={
                  isBlock ? styles.scanStatusIndicatorRed : 
                  isReview ? styles.scanStatusIndicatorOrange : 
                  styles.scanStatusIndicatorGreen
                }></div>
                <div style={styles.scanDetails}>
                  <div style={styles.scanRow}>
                    <span style={styles.scanMerchant}>{scan.receiver}</span>
                    <span style={
                      isBlock ? styles.scanTagAlert : 
                      isReview ? styles.scanTagOrange : 
                      styles.scanTagSafe
                    }>
                      {isBlock ? 'BLOCKED FRAUD' : isReview ? 'OTP REQUIRED' : 'VERIFIED SAFE'}
                    </span>
                  </div>
                  <span style={styles.scanTime}>
                    {isBlock ? 'Attempted' : 'Paid'} ₹{scan.amount.toLocaleString()} • Score: {scan.score}
                  </span>
                  {reasonsList.length > 0 && (
                    <p style={styles.scanAlertText}>
                      Reason: {reasonsList.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>



      {/* ========================================================= */}
      {/* 🚀 INTERACTIVE GLASSMORPHIC BOTTOM DRAWERS (SHEETS)       */}
      {/* ========================================================= */}

      {/* A. Delay Window Drawer */}
      {activeDrawer === 'delay' && (
        <div style={styles.drawerOverlay} onClick={() => setActiveDrawer(null)}>
          <div style={styles.drawerContent} onClick={(e) => e.stopPropagation()} className="animate-slide-up">
            <div style={styles.drawerDragHandle}></div>
            
            <div style={styles.drawerHeader}>
              <h3 style={styles.drawerTitle}>Approval Delay Window</h3>
              <button onClick={() => setActiveDrawer(null)} style={styles.drawerCloseBtn} aria-label="Close configuration">
                <X size={16} color="var(--text-primary)" />
              </button>
            </div>

            <p style={styles.drawerDesc}>
              Holding payments briefly allows you to recall the transaction if it was accidental, a scam, or a mistyped amount.
            </p>

            <div style={styles.drawerRowBetween}>
              <span style={styles.drawerLabel}>Enable Delay Window</span>
              <button 
                onClick={() => setIsApprovalWindowActive(!isApprovalWindowActive)} 
                style={isApprovalWindowActive ? styles.toggleOn : styles.toggleOff}
              >
                <div style={isApprovalWindowActive ? styles.toggleKnobOn : styles.toggleKnobOff}></div>
              </button>
            </div>

            {isApprovalWindowActive && (
              <div style={styles.drawerSliderBlock}>
                <div style={styles.sliderHeader}>
                  <span style={styles.drawerLabel}>Delay duration</span>
                  <span style={styles.sliderValueText}>{approvalWindowDelay} seconds</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="60" 
                  step="5" 
                  value={approvalWindowDelay} 
                  onChange={(e) => setApprovalWindowDelay(Number(e.target.value))}
                  style={styles.sliderInput}
                  aria-label="Delay duration slider"
                />
                <div style={styles.sliderBounds}>
                  <span>5s</span>
                  <span>30s</span>
                  <span>60s</span>
                </div>
              </div>
            )}

            <button onClick={() => setActiveDrawer(null)} style={styles.drawerSaveBtn}>
              Apply Settings
            </button>
          </div>
        </div>
      )}

      {/* B. High Value Protection Drawer */}
      {activeDrawer === 'highvalue' && (
        <div style={styles.drawerOverlay} onClick={() => setActiveDrawer(null)}>
          <div style={styles.drawerContent} onClick={(e) => e.stopPropagation()} className="animate-slide-up">
            <div style={styles.drawerDragHandle}></div>
            
            <div style={styles.drawerHeader}>
              <h3 style={styles.drawerTitle}>High-Value Protection</h3>
              <button onClick={() => setActiveDrawer(null)} style={styles.drawerCloseBtn} aria-label="Close configuration">
                <X size={16} color="var(--text-primary)" />
              </button>
            </div>

            <p style={styles.drawerDesc}>
              Requires an additional biometric scan or verification PIN when transactions exceed your specified limit.
            </p>

            <div style={styles.drawerRowBetween}>
              <span style={styles.drawerLabel}>Require Extra Auth</span>
              <button 
                onClick={() => setIsHighValueAuthActive(!isHighValueAuthActive)} 
                style={isHighValueAuthActive ? styles.toggleOn : styles.toggleOff}
              >
                <div style={isHighValueAuthActive ? styles.toggleKnobOn : styles.toggleKnobOff}></div>
              </button>
            </div>

            {isHighValueAuthActive && (
              <div style={styles.drawerSliderBlock}>
                <div style={styles.sliderHeader}>
                  <span style={styles.drawerLabel}>Auth Threshold</span>
                  <span style={styles.sliderValueText}>₹{highValueThreshold.toLocaleString()}</span>
                </div>
                <input 
                  type="range" 
                  min="1000" 
                  max="25000" 
                  step="1000" 
                  value={highValueThreshold} 
                  onChange={(e) => setHighValueThreshold(Number(e.target.value))}
                  style={styles.sliderInput}
                  aria-label="Auth threshold slider"
                />
                <div style={styles.sliderBounds}>
                  <span>₹1,000</span>
                  <span>₹12,000</span>
                  <span>₹25,000</span>
                </div>
              </div>
            )}

            <button onClick={() => setActiveDrawer(null)} style={styles.drawerSaveBtn}>
              Save Config
            </button>
          </div>
        </div>
      )}

      {/* C. Guardian Mode Drawer */}
      {activeDrawer === 'guardian' && (
        <div style={styles.drawerOverlay} onClick={() => setActiveDrawer(null)}>
          <div style={styles.drawerContent} onClick={(e) => e.stopPropagation()} className="animate-slide-up">
            <div style={styles.drawerDragHandle}></div>
            
            <div style={styles.drawerHeader}>
              <h3 style={styles.drawerTitle}>Trusted Guardian Approval</h3>
              <button onClick={() => setActiveDrawer(null)} style={styles.drawerCloseBtn} aria-label="Close configuration">
                <X size={16} color="var(--text-primary)" />
              </button>
            </div>

            <p style={styles.drawerDesc}>
              Perfect for Senior Citizen safety. Payments above the limit are held, and a request is sent to trusted guardians to approve or reject.
            </p>

            <div style={styles.drawerRowBetween}>
              <span style={styles.drawerLabel}>Protected Mode</span>
              <button 
                onClick={() => setIsGuardianModeActive(!isGuardianModeActive)} 
                style={isGuardianModeActive ? styles.toggleOn : styles.toggleOff}
              >
                <div style={isGuardianModeActive ? styles.toggleKnobOn : styles.toggleKnobOff}></div>
              </button>
            </div>

            {isGuardianModeActive && (
              <div style={styles.drawerScrollableArea}>
                {/* Limit Slider */}
                <div style={styles.drawerSliderBlock}>
                  <div style={styles.sliderHeader}>
                    <span style={styles.drawerLabel}>Guardian Limit Threshold</span>
                    <span style={styles.sliderValueText}>₹{guardianLimit.toLocaleString()}</span>
                  </div>
                  <input 
                    type="range" 
                    min="2000" 
                    max="50000" 
                    step="2000" 
                    value={guardianLimit} 
                    onChange={(e) => setGuardianLimit(Number(e.target.value))}
                    style={styles.sliderInput}
                    aria-label="Guardian limit slider"
                  />
                  <div style={styles.sliderBounds}>
                    <span>₹2k</span>
                    <span>₹25k</span>
                    <span>₹50k</span>
                  </div>
                </div>

                {/* Guardians List */}
                <div style={styles.guardiansDrawerList}>
                  <div style={styles.guardianListHeader}>
                    <span style={styles.drawerSubTitle}>Trusted Guardians</span>
                    <button 
                      onClick={() => setShowAddForm(!showAddForm)}
                      style={styles.addGuardianBtn}
                    >
                      <Plus size={12} style={{ marginRight: 4 }} /> Add New
                    </button>
                  </div>

                  {showAddForm && (
                    <form onSubmit={handleAddGuardianSubmit} style={styles.addGuardianForm}>
                      <input 
                        type="text" 
                        placeholder="Guardian Name" 
                        value={newGName}
                        onChange={(e) => setNewGName(e.target.value)}
                        style={styles.formInput}
                        required
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="tel" 
                          placeholder="Phone" 
                          value={newGPhone}
                          onChange={(e) => setNewGPhone(e.target.value)}
                          style={{ ...styles.formInput, flex: 1.2 }}
                          required
                        />
                        <select
                          value={newGRelation}
                          onChange={(e) => setNewGRelation(e.target.value)}
                          style={{ ...styles.formInput, flex: 1 }}
                          aria-label="Relation to guardian"
                        >
                          <option value="Child">Child</option>
                          <option value="Spouse">Spouse</option>
                          <option value="Sibling">Sibling</option>
                          <option value="Advisor">Advisor</option>
                        </select>
                      </div>
                      <input 
                        type="text" 
                        placeholder="UPI ID (e.g. father@upi)" 
                        value={newGUpi}
                        onChange={(e) => setNewGUpi(e.target.value)}
                        style={styles.formInput}
                        required
                      />
                      <div style={styles.formActions}>
                        <button 
                          type="button" 
                          onClick={() => setShowAddForm(false)} 
                          style={styles.formCancelBtn}
                        >
                          Cancel
                        </button>
                        <button type="submit" style={styles.formSubmitBtn}>Save</button>
                      </div>
                    </form>
                  )}

                  <div style={styles.guardiansContainer}>
                    {guardians.length === 0 ? (
                      <p style={styles.emptyText}>No trusted guardians configured. Add one to secure transfers.</p>
                    ) : (
                      guardians.map((g, idx) => (
                        <div key={idx} style={styles.guardianRow}>
                          <div style={styles.guardianLeft}>
                            <div style={styles.guardianAvatar}>
                              {g.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div style={styles.guardianInfo}>
                              <span style={styles.gName}>{g.name} ({g.relation})</span>
                              <span style={styles.gDetails}>{g.upi} • {g.phone}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => onRemoveGuardian && onRemoveGuardian(idx)}
                            style={styles.removeGBtn}
                            aria-label={`Remove ${g.name} as guardian`}
                          >
                            <Trash2 size={14} color="var(--accent-pink)" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Simulation Setup */}
                <div style={styles.demoSimulatorBlock}>
                  <span style={styles.drawerSubTitle}>Simulator Control footers</span>
                  <p style={styles.demoDesc}>Test the Guardian Interceptor by forcing different AI Scans alerts:</p>
                  
                  <div style={styles.simTogglesRow}>
                    <div style={styles.simToggleCell}>
                      <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Device Footprint</span>
                      <div style={styles.pillGroup}>
                        <button 
                          onClick={() => setDeviceStatus('registered')}
                          style={deviceStatus === 'registered' ? styles.pillActive : styles.pillInactive}
                        >
                          Registered
                        </button>
                        <button 
                          onClick={() => setDeviceStatus('new')}
                          style={deviceStatus === 'new' ? styles.pillActiveRed : styles.pillInactive}
                        >
                          New Device
                        </button>
                      </div>
                    </div>

                    <div style={styles.simToggleCell}>
                      <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Merchant Location</span>
                      <div style={styles.pillGroup}>
                        <button 
                          onClick={() => setLocationStatus('normal')}
                          style={locationStatus === 'normal' ? styles.pillActive : styles.pillInactive}
                        >
                          Normal
                        </button>
                        <button 
                          onClick={() => setLocationStatus('unusual')}
                          style={locationStatus === 'unusual' ? styles.pillActiveRed : styles.pillInactive}
                        >
                          Unusual (43km)
                        </button>
                      </div>
                    </div>

                    <div style={styles.simToggleCell}>
                      <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Device Security (RASP)</span>
                      <div style={styles.pillGroup}>
                        <button 
                          onClick={() => setIsDeviceRooted(false)}
                          style={!isDeviceRooted ? styles.pillActive : styles.pillInactive}
                        >
                          Safe
                        </button>
                        <button 
                          onClick={() => setIsDeviceRooted(true)}
                          style={isDeviceRooted ? styles.pillActiveRed : styles.pillInactive}
                        >
                          Rooted (RASP)
                        </button>
                      </div>
                    </div>

                    <div style={styles.simToggleCell}>
                      <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>App Security (RASP)</span>
                      <div style={styles.pillGroup}>
                        <button 
                          onClick={() => setIsActiveScreenShare(false)}
                          style={!isActiveScreenShare ? styles.pillActive : styles.pillInactive}
                        >
                          No Share
                        </button>
                        <button 
                          onClick={() => setIsActiveScreenShare(true)}
                          style={isActiveScreenShare ? styles.pillActiveRed : styles.pillInactive}
                        >
                          Screen Share
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button onClick={() => setActiveDrawer(null)} style={styles.drawerSaveBtn}>
              Done Setup
            </button>
          </div>
        </div>
      )}

      {/* D. Security Logs Drawer */}
      {activeDrawer === 'logs' && (
        <div style={styles.drawerOverlay} onClick={() => setActiveDrawer(null)}>
          <div style={styles.drawerContent} onClick={(e) => e.stopPropagation()} className="animate-slide-up">
            <div style={styles.drawerDragHandle}></div>
            
            <div style={styles.drawerHeader}>
              <h3 style={styles.drawerTitle}>Security Activity Feed</h3>
              <button onClick={() => setActiveDrawer(null)} style={styles.drawerCloseBtn} aria-label="Close configuration">
                <X size={16} color="var(--text-primary)" />
              </button>
            </div>

            <p style={styles.drawerDesc}>
              Real-time audit log of security configurations, suspicious attempts, and system states.
            </p>

            <div style={styles.logsDrawerList}>
              {securityLog.length === 0 ? (
                <p style={styles.emptyText}>No events logged today.</p>
              ) : (
                securityLog.map((log, i) => (
                  <div key={i} style={styles.logItem}>
                    <AlertTriangle 
                      size={14} 
                      color={log.type === 'alert' ? 'var(--accent-pink)' : 'var(--accent-neon)'} 
                      style={{ marginRight: 10, marginTop: 2 }} 
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '500' }}>{log.message}</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{log.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button onClick={() => setActiveDrawer(null)} style={styles.drawerSaveBtn}>
              Dismiss Logs
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '16px',
    backgroundColor: 'var(--bg-color)',
    height: '100%',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '40px',
    position: 'relative'
  },
  shieldHeaderCard: {
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    position: 'relative',
  },
  shieldLogoWrapper: {
    position: 'relative',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: 'rgba(34, 230, 123, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldPulseRing: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    border: '2px solid var(--accent-neon)',
    opacity: 0.15,
  },
  headerTexts: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  shieldTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    margin: 0,
    fontFamily: 'var(--font-display)',
  },
  shieldSub: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    margin: 0,
  },
  safetyScorePill: {
    backgroundColor: 'rgba(34, 230, 123, 0.08)',
    border: '1px solid rgba(34, 230, 123, 0.15)',
    padding: '6px 10px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  scoreNumber: {
    fontSize: '14px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
  },
  scoreLabel: {
    fontSize: '8px',
    textTransform: 'uppercase',
    fontWeight: '600'
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '6px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  bentoGrid: {
    display: 'flex',
    gap: '12px',
    width: '100%'
  },
  bentoCard: {
    flex: 1,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '20px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    alignItems: 'flex-start',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
  },
  bentoIconWrapper: {
    width: '36px',
    height: '36px',
    borderRadius: '12px',
    backgroundColor: 'var(--surface-hover)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoTexts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  bentoTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  bentoStatus: {
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)'
  },
  controlsList: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    padding: '0 14px',
  },
  controlItemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 0',
    borderBottom: '1px solid var(--border-color)',
    background: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderTop: 'none',
    width: '100%',
    cursor: 'pointer',
    textAlign: 'left'
  },
  controlRowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  menuIconBox: {
    width: '34px',
    height: '34px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTexts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  menuTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  menuDesc: {
    fontSize: '10px',
    color: 'var(--text-secondary)'
  },
  pendingTransactionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  pendingContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  pendingTxCard: {
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '10px 12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingTxInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  pendingTxRecipient: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  pendingTxAmount: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-display)',
  },
  pendingTxTime: {
    fontSize: '10px',
    color: 'var(--accent-pink)',
  },
  recallBtn: {
    backgroundColor: 'rgba(235, 59, 136, 0.1)',
    border: '1px solid rgba(235, 59, 136, 0.3)',
    borderRadius: '8px',
    color: 'var(--accent-pink)',
    padding: '6px 12px',
    fontSize: '10px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  scansList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  scanCard: {
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '12px 14px',
    display: 'flex',
    gap: '12px',
  },
  scanStatusIndicatorGreen: {
    width: '4px',
    borderRadius: '2px',
    backgroundColor: 'var(--accent-neon)',
  },
  scanStatusIndicatorRed: {
    width: '4px',
    borderRadius: '2px',
    backgroundColor: 'var(--accent-pink)',
  },
  scanStatusIndicatorOrange: {
    width: '4px',
    borderRadius: '2px',
    backgroundColor: '#ff8c00',
  },
  scanTagOrange: {
    fontSize: '9px',
    fontWeight: '700',
    color: '#ff8c00',
    backgroundColor: 'rgba(255, 140, 0, 0.08)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  scanDetails: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  scanRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scanMerchant: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  scanTagSafe: {
    fontSize: '9px',
    fontWeight: '700',
    color: 'var(--accent-neon)',
    backgroundColor: 'rgba(34, 230, 123, 0.08)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  scanTagAlert: {
    fontSize: '9px',
    fontWeight: '700',
    color: 'var(--accent-pink)',
    backgroundColor: 'rgba(235, 59, 136, 0.08)',
    padding: '2px 6px',
    borderRadius: '6px',
  },
  scanTime: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
  },
  scanAlertText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    margin: '4px 0 0 0',
    lineHeight: '1.4',
  },
  metricsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '18px',
    marginBottom: '8px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    width: '100%',
    marginBottom: '16px',
  },
  metricCard: {
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '10px 6px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  metricVal: {
    fontSize: '18px',
    fontWeight: '800',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-display)',
  },
  metricLbl: {
    fontSize: '8px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    marginTop: '2px',
    letterSpacing: '0.2px',
  },
  quizCard: {
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '20px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  quizHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quizLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  quizScoreBadge: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--accent-neon)',
    backgroundColor: 'rgba(34, 230, 123, 0.1)',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  smsFrame: {
    backgroundColor: 'var(--surface-hover)',
    borderRadius: '16px',
    padding: '12px 14px',
    borderLeft: '4px solid var(--border-color)',
  },
  smsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  smsSender: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  smsTime: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
  },
  smsBody: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    margin: 0,
    lineHeight: '1.4',
  },
  quizActions: {
    display: 'flex',
    gap: '10px',
  },
  quizBtnScam: {
    flex: 1,
    backgroundColor: 'rgba(235, 59, 136, 0.08)',
    border: '1px solid rgba(235, 59, 136, 0.18)',
    borderRadius: '12px',
    color: 'var(--accent-pink)',
    padding: '10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  quizBtnSafe: {
    flex: 1,
    backgroundColor: 'var(--surface-hover)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    color: 'var(--text-primary)',
    padding: '10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  feedbackWrapper: {
    backgroundColor: 'var(--surface-color)',
    padding: '10px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  feedbackTitle: {
    fontSize: '13px',
    fontWeight: '800',
  },
  feedbackExplanation: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    margin: 0,
  },
  nextQuizBtn: {
    backgroundColor: 'var(--accent-neon)',
    color: '#000000',
    border: 'none',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '6px',
    alignSelf: 'flex-end',
  },

  /* ========================================================= */
  /* 🚀 BOTTOM DRAWERS DESIGN STYLES                           */
  /* ========================================================= */
  drawerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    backdropFilter: 'blur(6px)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'flex-end'
  },
  drawerContent: {
    backgroundColor: 'var(--surface-color)',
    borderTopLeftRadius: '28px',
    borderTopRightRadius: '28px',
    borderTop: '1px solid var(--border-color)',
    padding: '20px',
    width: '100%',
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    boxShadow: '0 -15px 35px rgba(0,0,0,0.6)'
  },
  drawerDragHandle: {
    width: '40px',
    height: '4px',
    backgroundColor: 'var(--border-color)',
    borderRadius: '2px',
    margin: '0 auto'
  },
  drawerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '4px'
  },
  drawerTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-display)'
  },
  drawerSubTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'block',
    marginBottom: '8px'
  },
  drawerCloseBtn: {
    background: 'none',
    border: 'none',
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    backgroundColor: 'var(--surface-hover)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  drawerDesc: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    margin: 0
  },
  drawerRowBetween: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '12px 14px'
  },
  drawerLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  drawerSliderBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '16px',
    padding: '14px'
  },
  sliderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sliderValueText: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--accent-neon)'
  },
  sliderInput: {
    width: '100%',
    accentColor: 'var(--accent-neon)',
    height: '4px',
    cursor: 'pointer'
  },
  sliderBounds: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: 'var(--text-muted)'
  },
  drawerSaveBtn: {
    backgroundColor: 'var(--text-primary)',
    color: 'var(--bg-color)',
    border: 'none',
    borderRadius: '24px',
    height: '46px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '6px'
  },
  drawerScrollableArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxHeight: '320px',
    overflowY: 'auto',
    paddingRight: '4px'
  },
  guardiansDrawerList: {
    display: 'flex',
    flexDirection: 'column'
  },
  guardianListHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px'
  },
  addGuardianBtn: {
    backgroundColor: 'var(--surface-hover)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer'
  },
  addGuardianForm: {
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px'
  },
  formInput: {
    backgroundColor: 'var(--bg-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    padding: '8px 10px',
    fontSize: '12px',
    outline: 'none'
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '4px'
  },
  formCancelBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '6px 10px'
  },
  formSubmitBtn: {
    backgroundColor: 'var(--accent-neon)',
    color: '#000000',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer'
  },
  guardiansContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  guardianRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '8px 10px'
  },
  guardianLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  guardianAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0, 136, 255, 0.08)',
    border: '1px solid rgba(0, 136, 255, 0.15)',
    color: 'var(--accent-blue)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '700'
  },
  guardianInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px'
  },
  gName: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  gDetails: {
    fontSize: '9px',
    color: 'var(--text-secondary)'
  },
  removeGBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px'
  },
  emptyText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    padding: '8px 0'
  },
  demoSimulatorBlock: {
    marginTop: '12px',
    borderTop: '1.5px dashed var(--border-color)',
    paddingTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  demoDesc: {
    fontSize: '9px',
    color: 'var(--text-secondary)',
    lineHeight: '1.3'
  },
  simTogglesRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '4px'
  },
  simToggleCell: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  pillGroup: {
    display: 'flex',
    backgroundColor: 'var(--bg-color)',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    padding: '2px'
  },
  pillInactive: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  pillActive: {
    backgroundColor: 'rgba(34, 230, 123, 0.1)',
    border: 'none',
    color: 'var(--accent-neon)',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: '700',
    cursor: 'default'
  },
  pillActiveRed: {
    backgroundColor: 'rgba(235, 59, 136, 0.1)',
    border: 'none',
    color: 'var(--accent-pink)',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: '700',
    cursor: 'default'
  },
  logsDrawerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '260px',
    overflowY: 'auto'
  },
  logItem: {
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'flex-start'
  },
  toggleOn: {
    width: '42px',
    height: '22px',
    borderRadius: '11px',
    backgroundColor: 'var(--accent-neon)',
    border: 'none',
    position: 'relative',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  toggleOff: {
    width: '42px',
    height: '22px',
    borderRadius: '11px',
    backgroundColor: 'var(--surface-hover)',
    border: 'none',
    position: 'relative',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  toggleKnobOn: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: '#000000',
    position: 'absolute',
    top: '2px',
    right: '2px',
    transition: 'all 0.2s',
  },
  toggleKnobOff: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    position: 'absolute',
    top: '2px',
    left: '2px',
    transition: 'all 0.2s',
  }
};

export default SliceShield;
