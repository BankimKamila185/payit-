import React from 'react';
import { 
  Home, 
  Compass, 
  QrCode, 
  CreditCard, 
  Clock, 
  Settings, 
  ChevronLeft,
  Eye,
  EyeOff,
  MessageSquare,
  Sun,
  Moon
} from 'lucide-react';
import avatarImg from '../assets/avatar.png';

const PhoneFrame = ({ 
  children, 
  currentScreen, 
  onScreenChange, 
  title, 
  showBackButton = false, 
  onBackClick,
  theme = 'dark',
  onToggleTheme
}) => {
  const [isEyeClosed, setIsEyeClosed] = React.useState(false);
  const lastScanClickRef = React.useRef(0);

  const handleScanClick = () => {
    const now = Date.now();
    const diff = now - lastScanClickRef.current;
    if (diff < 300) {
      onScreenChange('qr-scanner');
      lastScanClickRef.current = 0;
    } else {
      lastScanClickRef.current = now;
      onScreenChange('transfer');
    }
  };

  const touchStartXRef = React.useRef(0);
  const touchStartYRef = React.useRef(0);

  const navigatePage = (direction) => {
    const screens = ['banking', 'explore', 'transfer', 'slice-shield', 'activity'];
    let currentIndex = 0;
    if (['banking', 'check-balance', 'upi-settings'].includes(currentScreen)) currentIndex = 0;
    else if (['explore', 'recharge-bills'].includes(currentScreen)) currentIndex = 1;
    else if (['transfer', 'qr-scanner'].includes(currentScreen)) currentIndex = 2;
    else if (currentScreen === 'slice-shield') currentIndex = 3;
    else if (['activity', 'paid-success'].includes(currentScreen)) currentIndex = 4;
    else return;

    let targetIndex = currentIndex;
    if (direction === 'prev') {
      targetIndex = Math.max(0, currentIndex - 1);
    } else if (direction === 'next') {
      targetIndex = Math.min(screens.length - 1, currentIndex + 1);
    }

    if (targetIndex !== currentIndex) {
      onScreenChange(screens[targetIndex]);
    }
  };

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
    const diffY = e.changedTouches[0].clientY - touchStartYRef.current;
    if (Math.abs(diffX) > 70 && Math.abs(diffY) < 45) {
      if (diffX > 0) {
        navigatePage('prev');
      } else {
        navigatePage('next');
      }
    }
  };

  return (
    <div className={`phone-container ${theme}-theme`}>


      {/* Screen Header (Dynamic Layout matching screenshots) */}
      {currentScreen !== 'login' && currentScreen !== 'qr-scanner' && (
        <div style={styles.header} className="phone-header">
          {showBackButton ? (
            // Sub-screen header with Back button
            <div style={styles.headerLeft}>
              <button onClick={onBackClick} style={styles.backButton} aria-label="Go back">
                <ChevronLeft size={24} color={theme === 'light' ? '#1c1c1e' : '#ffffff'} />
              </button>
              <span style={styles.headerTitleLeftSub} className="phone-header-title-sub">{title}</span>
            </div>
          ) : currentScreen === 'banking' ? (
            // Banking screen header matching Image 1
            <div style={styles.headerLeft}>
              <span style={styles.headerTitleLeft} className="phone-header-title">Banking</span>
              <button 
                onClick={() => setIsEyeClosed(!isEyeClosed)}
                style={styles.headerIconButton}
                aria-label="Toggle balance visibility"
              >
                {isEyeClosed ? <EyeOff size={18} color="#8c8c8e" /> : <Eye size={18} color="#8c8c8e" />}
              </button>
            </div>
          ) : (
            // Default main-screen header matching Image 2 (Explore, Activity, etc.)
            <div style={styles.headerLeft}>
              <button 
                onClick={() => onScreenChange('check-balance')}
                style={styles.checkBalancePill}
              >
                Check balance
              </button>
              <button 
                onClick={() => onScreenChange('upi-settings')}
                style={styles.headerIconButton}
                aria-label="Help & Chat"
              >
                <MessageSquare size={18} color="#8c8c8e" />
              </button>
            </div>
          )}

          {/* Right side: Theme Toggle & Circular Profile Picture on all main screens */}
          <div style={styles.headerRight}>
            {onToggleTheme && (
              <button 
                onClick={onToggleTheme} 
                style={{
                  ...styles.headerIconButton,
                  marginRight: '4px',
                  opacity: 0.8,
                  transition: 'opacity 0.2s',
                }}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                aria-label="Toggle Theme"
              >
                {theme === 'light' ? <Moon size={18} color="var(--text-secondary)" /> : <Sun size={18} color="var(--text-secondary)" />}
              </button>
            )}
            <button 
              onClick={() => onScreenChange('upi-settings')} 
              style={styles.profileButton}
              aria-label="User Profile"
            >
              <img 
                src={avatarImg} 
                alt="Profile" 
                style={styles.profileImage} 
              />
            </button>
          </div>
        </div>
      )}

      {/* Viewport for Active Screen Content */}
      <div 
        style={styles.screenContent}
        className="phone-screen-content"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>

      {/* Bottom Navigation Bar - Scrolling Wheel / Carousel Style */}
      {currentScreen !== 'login' && currentScreen !== 'qr-scanner' && (
        <div className="payit-navbar-container">
          <div 
            className="payit-navbar-track"
            style={{ transform: `translate3d(${(2 - (() => {
              switch (currentScreen) {
                case 'banking':
                case 'check-balance':
                case 'upi-settings':
                  return 0;
                case 'explore':
                case 'recharge-bills':
                  return 1;
                case 'qr-scanner':
                case 'transfer':
                  return 2;
                case 'slice-shield':
                  return 3;
                case 'activity':
                case 'paid-success':
                  return 4;
                default:
                  return 0;
              }
            })()) * 64}px, 0, 0)` }}
          >
            {/* 1. Banking */}
            <div className="nav-item-wrapper">
              <button 
                onClick={() => onScreenChange('banking')} 
                className={`nav-circle-btn ${['banking', 'check-balance', 'upi-settings'].includes(currentScreen) ? 'active' : ''}`}
                aria-label="Banking"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path className="anim-pillar-roof" d="M4 11 L12 4 L20 11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <line className="anim-pillar-bar1" x1="8" y1="12" x2="8" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <line className="anim-pillar-bar2" x1="12" y1="12" x2="12" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <line className="anim-pillar-bar3" x1="16" y1="12" x2="16" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* 2. Explore */}
            <div className="nav-item-wrapper">
              <button 
                onClick={() => onScreenChange('explore')} 
                className={`nav-circle-btn ${['explore', 'recharge-bills'].includes(currentScreen) ? 'active' : ''}`}
                aria-label="Explore"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path className="anim-bracket-left" d="M8 6 H7 C5.34 6 4 7.34 4 9 V15 C4 16.66 5.34 18 7 18 H8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  <path className="anim-bracket-right" d="M16 6 H17 C18.66 6 20 7.34 20 9 V15 C20 16.66 18.66 18 17 18 H16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  <rect className="anim-bracket-center" x="10.5" y="10.5" width="3" height="3" rx="0.5" fill="currentColor" />
                </svg>
              </button>
            </div>

            {/* 3. Scan & Pay */}
            <div className="nav-item-wrapper">
              <div className="qrScannerNavWrapper">
                <button 
                  onClick={handleScanClick} 
                  className={`nav-circle-btn ${currentScreen === 'qr-scanner' ? 'active' : ''}`}
                  aria-label="Scan QR Code"
                  title="Double click to scan QR"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <rect className="anim-qr-border" x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2.5" />
                    <line className="anim-qr-line" x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 4. SliceShield */}
            <div className="nav-item-wrapper">
              <button 
                onClick={() => onScreenChange('slice-shield')} 
                className={`nav-circle-btn ${currentScreen === 'slice-shield' ? 'active' : ''}`}
                aria-label="SliceShield"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path className="anim-shield-body" d="M12 22 C12 22 20 18 20 12 V5 L12 2 L4 5 V12 C4 12 4 22 12 22 Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <polyline className="anim-shield-check" points="9 11 11 13 15 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {/* 5. Activity */}
            <div className="nav-item-wrapper">
              <button 
                onClick={() => onScreenChange('activity')} 
                className={`nav-circle-btn ${['activity', 'paid-success'].includes(currentScreen) ? 'active' : ''}`}
                aria-label="Activity"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <line className="anim-list-line1" x1="6" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <line className="anim-list-line2" x1="6" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  <line className="anim-list-line3" x1="6" y1="16" x2="10" y2="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Home Gesture Bar */}
      <div className="phone-home-indicator"></div>
    </div>
  );
};

const styles = {

  header: {
    height: '56px',
    padding: '0 18px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#000000',
    zIndex: 99,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
  },
  backButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 4px 4px 0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleLeft: {
    color: '#ffffff',
    fontSize: '22px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
  },
  headerTitleLeftSub: {
    color: '#ffffff',
    fontSize: '17px',
    fontWeight: '600',
    fontFamily: 'var(--font-display)',
  },
  headerIconButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBalancePill: {
    backgroundColor: '#000000',
    color: '#ffffff',
    border: '1.2px solid #232326',
    borderRadius: '20px',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'var(--font-display)',
    letterSpacing: '0.2px',
  },
  profileButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImage: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1.5px solid #232326',
  },
  screenContent: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    backgroundColor: '#0b0b0c',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  navBar: {
    height: '62px',
    backgroundColor: '#0d0d0e',
    borderTop: '1px solid #1a1a1c',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: '8px',
    zIndex: 999,
  },
  navItem: {
    background: 'none',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#8c8c8e',
    cursor: 'pointer',
    width: '60px',
    gap: '2px',
  },
  navItemActive: {
    background: 'none',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#22e67b',
    cursor: 'pointer',
    width: '60px',
    gap: '2px',
  },
  navLabel: {
    fontSize: '9px',
    fontWeight: '500',
  },
  qrScannerNavWrapper: {
    position: 'relative',
    top: '-6px',
  },
  qrNavItem: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(255, 255, 255, 0.15)',
    transition: 'transform 0.1s ease',
  },
  qrNavItemActive: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    backgroundColor: '#22e67b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(34, 230, 123, 0.3)',
    transform: 'scale(1.05)',
  }
};

export default PhoneFrame;
