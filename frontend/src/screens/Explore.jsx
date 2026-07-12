import React from 'react';
import { 
  Smartphone, 
  Car, 
  CreditCard, 
  Grid, 
  Gift, 
  PieChart, 
  CircleDollarSign, 
  RefreshCcw, 
  ChevronRight,
  TrendingUp
} from 'lucide-react';

const Explore = ({ onRechargeClick, onPromoClick, theme = 'dark', liveTxns = [] }) => {
  const totalSpend = React.useMemo(() => {
    // Only count debit transactions (me is sender) where status is success
    const myDebits = (liveTxns || []).filter(
      t => t.status === 'success' && Number(t.amount) > 0
    );
    return myDebits.reduce((s, t) => s + Number(t.amount), 0);
  }, [liveTxns]);

  const spendText = totalSpend > 0 ? `₹${totalSpend.toLocaleString('en-IN')}` : '₹2,605';

  const quickServices = [
    { name: "Mobile", icon: <Smartphone size={18} color="var(--accent-purple)" /> },
    { name: "FASTag", icon: <Car size={18} color="var(--accent-blue)" /> },
    { name: "Credit card", icon: <CreditCard size={18} color="var(--accent-neon)" /> },
    { name: "More", icon: <Grid size={18} color="var(--text-secondary)" />, isMore: true }
  ];

  const promos = [
    { 
      id: "rewards", 
      title: "Rewards", 
      value: "Earn ₹500", 
      desc: "Get rewards on all payments",
      color: "rgba(235, 59, 136, 0.08)", 
      border: "rgba(235, 59, 136, 0.15)",
      icon: <Gift size={24} color="var(--accent-pink)" />
    },
    { 
      id: "spends", 
      title: "Pure spends", 
      value: "₹3,993", 
      desc: "Analyze your expenditures",
      color: "rgba(170, 51, 255, 0.08)", 
      border: "rgba(170, 51, 255, 0.15)",
      icon: <PieChart size={24} color="var(--accent-purple)" />
    },
    { 
      id: "referral", 
      title: "Earn ₹500", 
      value: "Refer friends", 
      desc: "Get cash directly in bank",
      color: "rgba(34, 230, 123, 0.08)", 
      border: "rgba(34, 230, 123, 0.15)",
      icon: <CircleDollarSign size={24} color="var(--accent-neon)" />
    },
    { 
      id: "autopay", 
      title: "Autopay", 
      value: "0 Active", 
      desc: "Manage auto bill payments",
      color: "rgba(0, 136, 255, 0.08)", 
      border: "rgba(0, 136, 255, 0.15)",
      icon: <RefreshCcw size={24} color="var(--accent-blue)" />
    }
  ];

  if (theme === 'light') {
    return (
      <div style={lightStyles.container} className="animate-slide-up">
        {/* Recharge & bills Card */}
        <div style={lightStyles.card}>
          <div style={lightStyles.cardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={lightStyles.cardTitle}>Recharge & bills</span>
              <span style={lightStyles.badgeBlue}>₹0 FEE</span>
            </div>
            <button onClick={onRechargeClick} style={lightStyles.viewAllBtn}>View all</button>
          </div>
          
          <div style={lightStyles.servicesGrid}>
            {quickServices.map((ser, idx) => (
              <button 
                key={idx} 
                onClick={ser.isMore ? onRechargeClick : () => onRechargeClick(ser.name)}
                style={lightStyles.serviceBtn}
              >
                <div style={lightStyles.iconWrapper}>
                  {React.cloneElement(ser.icon, { color: '#111111' })}
                </div>
                <span style={lightStyles.serviceName}>{ser.name}</span>
              </button>
            ))}
          </div>

          {/* Airtel Mobile Postpaid row */}
          <div 
            style={lightStyles.airtelRow}
            onClick={() => onRechargeClick("Airtel Mobile")}
          >
            <div style={lightStyles.airtelLeft}>
              <div style={lightStyles.airtelLogo}>
                <span style={{ color: '#ffffff', fontWeight: '800', fontSize: '15px' }}>a</span>
              </div>
              <div style={lightStyles.airtelInfo}>
                <span style={lightStyles.airtelTitle}>Mobile postpaid xx6772</span>
                <span style={lightStyles.airtelDue}>₹824.82 due in 1 day</span>
              </div>
            </div>
            <span style={{ color: '#8e8e93', fontSize: '16px', fontWeight: '600' }}>&gt;</span>
          </div>
        </div>

        {/* Promos Grid */}
        <div style={lightStyles.promoGrid}>
          {/* Rewards */}
          <div 
            onClick={() => onPromoClick && onPromoClick('rewards')}
            style={lightStyles.promoCard}
          >
            <div style={lightStyles.promoTexts}>
              <span style={lightStyles.promoLabel}>PLAY & WIN</span>
              <span style={lightStyles.promoVal}>Rewards</span>
            </div>
            <div style={lightStyles.starIcon}></div>
          </div>

          {/* July Spends */}
          <div 
            onClick={() => onPromoClick && onPromoClick('spends')}
            style={lightStyles.promoCard}
          >
            <div style={lightStyles.promoTexts}>
              <span style={lightStyles.promoLabel}>JULY SPENDS</span>
              <span style={lightStyles.promoVal}>{spendText}</span>
            </div>
            <div style={lightStyles.pieChartIcon}></div>
          </div>

          {/* Invite */}
          <div 
            onClick={() => onPromoClick && onPromoClick('referral')}
            style={lightStyles.promoCard}
          >
            <div style={lightStyles.promoTexts}>
              <span style={lightStyles.promoLabel}>INVITE</span>
              <span style={lightStyles.promoVal}>Earn ₹500</span>
            </div>
            <div style={lightStyles.magnetIcon}></div>
          </div>

          {/* Autopay */}
          <div 
            onClick={() => onPromoClick && onPromoClick('autopay')}
            style={lightStyles.promoCard}
          >
            <div style={lightStyles.promoTexts}>
              <span style={lightStyles.promoLabel}>AUTOPAY</span>
              <span style={lightStyles.promoVal}>0 Active</span>
            </div>
            <div style={lightStyles.autopayIcon}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Recharge & Bills quick access */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <span style={styles.cardTitle}>Recharge & bills</span>
          <button onClick={onRechargeClick} style={styles.viewAllBtn}>View all</button>
        </div>
        
        <div style={styles.servicesGrid}>
          {quickServices.map((ser, idx) => (
            <button 
              key={idx} 
              onClick={ser.isMore ? onRechargeClick : () => onRechargeClick(ser.name)}
              style={styles.serviceBtn}
            >
              <div style={styles.iconWrapper}>
                {ser.icon}
              </div>
              <span style={styles.serviceName}>{ser.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Promos/Utilities */}
      <div style={styles.promoGrid}>
        {promos.map((pr) => (
          <div 
            key={pr.id} 
            onClick={() => onPromoClick && onPromoClick(pr.id)}
            style={{ 
              ...styles.promoCard, 
              backgroundColor: pr.color, 
              borderColor: pr.border 
            }}
          >
            <div style={styles.promoIconRow}>
              {pr.icon}
              <ChevronRight size={14} color="var(--text-secondary)" />
            </div>
            <div style={styles.promoTexts}>
              <span style={styles.promoLabel}>{pr.title}</span>
              <span style={styles.promoVal}>{pr.value}</span>
              <span style={styles.promoDesc}>{pr.desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Additional Sparx / Rewards Banner */}
      <div style={styles.bannerCard}>
        <div style={styles.bannerLeft}>
          <TrendingUp size={20} color="var(--accent-neon)" style={{ marginRight: 12 }} />
          <div>
            <h4 style={styles.bannerTitle}>Invest in Fixed Deposits</h4>
            <p style={styles.bannerSub}>Earn up to 7.75% interest annually</p>
          </div>
        </div>
        <ChevronRight size={16} color="var(--text-secondary)" />
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '40px',
  },
  card: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '20px',
    padding: '16px',
    border: '1px solid var(--border-color)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  viewAllBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent-neon)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  servicesGrid: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  serviceBtn: {
    background: 'none',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    cursor: 'pointer',
    width: '68px',
  },
  iconWrapper: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'var(--surface-hover)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border-color)',
  },
  serviceName: {
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },
  promoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  promoCard: {
    borderRadius: '20px',
    padding: '16px',
    border: '1px solid',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '130px',
    transition: 'all 0.2s',
    '&:hover': {
      transform: 'translateY(-2px)',
    }
  },
  promoIconRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promoTexts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginTop: '12px',
  },
  promoLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    fontWeight: '600',
  },
  promoVal: {
    fontSize: '17px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-primary)',
  },
  promoDesc: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    lineHeight: '1.3',
  },
  bannerCard: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    padding: '16px',
    border: '1px solid var(--border-color)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
  },
  bannerLeft: {
    display: 'flex',
    alignItems: 'center',
  },
  bannerTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  bannerSub: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  }
};

const lightStyles = {
  container: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '40px',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    padding: '20px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#111111',
  },
  badgeBlue: {
    backgroundColor: '#0088ff',
    color: '#ffffff',
    padding: '2px 8px',
    borderRadius: '20px',
    fontSize: '10px',
    fontWeight: '700',
  },
  viewAllBtn: {
    background: 'none',
    border: 'none',
    color: '#0088ff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  servicesGrid: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingBottom: '4px',
  },
  serviceBtn: {
    background: 'none',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    width: '68px',
  },
  iconWrapper: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#f4f5f8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceName: {
    fontSize: '11px',
    fontWeight: '500',
    color: '#6e6e73',
    textAlign: 'center',
  },
  airtelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: '#f4f5f8',
    borderRadius: '16px',
    cursor: 'pointer',
    marginTop: '4px',
  },
  airtelLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  airtelLogo: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#e60000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  airtelInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  airtelTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#111111',
  },
  airtelDue: {
    fontSize: '11px',
    color: '#ff8c00',
    fontWeight: '500',
  },
  promoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  promoCard: {
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    padding: '16px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '140px',
    position: 'relative',
    overflow: 'hidden',
  },
  promoTexts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  promoLabel: {
    fontSize: '9px',
    color: '#8e8e93',
    fontWeight: '700',
    letterSpacing: '0.8px',
  },
  promoVal: {
    fontSize: '20px',
    fontWeight: '800',
    color: '#111111',
    fontFamily: 'var(--font-display)',
    marginTop: '2px',
  },
  starIcon: {
    position: 'absolute',
    bottom: '12px',
    right: '12px',
    width: '32px',
    height: '32px',
    background: 'radial-gradient(circle, #ff5e62 0%, #ff9966 100%)',
    clipPath: 'polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)',
  },
  pieChartIcon: {
    position: 'absolute',
    bottom: '12px',
    right: '12px',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'conic-gradient(#eb3b88 0% 75%, #f4f5f8 75% 100%)',
  },
  magnetIcon: {
    position: 'absolute',
    bottom: '12px',
    right: '12px',
    width: '32px',
    height: '32px',
    border: '6px solid #aa33ff',
    borderTop: 'none',
    borderBottomLeftRadius: '16px',
    borderBottomRightRadius: '16px',
  },
  autopayIcon: {
    position: 'absolute',
    bottom: '12px',
    right: '12px',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '4px solid #f4f5f8',
    borderTopColor: '#22e67b',
    borderRightColor: '#22e67b',
  }
};

export default Explore;
