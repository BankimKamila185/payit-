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

const Explore = ({ onRechargeClick, onPromoClick }) => {
  const quickServices = [
    { name: "Mobile", icon: <Smartphone size={18} color="#aa33ff" /> },
    { name: "FASTag", icon: <Car size={18} color="#0088ff" /> },
    { name: "Credit card", icon: <CreditCard size={18} color="#22e67b" /> },
    { name: "More", icon: <Grid size={18} color="#8c8c8e" />, isMore: true }
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
    color: '#ffffff',
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
    backgroundColor: '#1c1c1f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(255,255,255,0.03)',
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
    color: '#ffffff',
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
    color: '#ffffff',
  },
  bannerSub: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  }
};

export default Explore;
