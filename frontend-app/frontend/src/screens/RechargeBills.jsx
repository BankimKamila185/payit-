import React from 'react';
import { 
  Smartphone, 
  Car, 
  Zap, 
  CreditCard, 
  Wifi, 
  ShieldCheck, 
  CircleDollarSign, 
  TrendingUp, 
  Droplet, 
  Flame, 
  Container, 
  Gauge, 
  Tv, 
  Tv2, 
  Phone, 
  Home, 
  Users, 
  HeartHandshake, 
  GraduationCap,
  Key, 
  Bus, 
  Building2,
  Search,
  Gift
} from 'lucide-react';

const RechargeBills = ({ onItemClick }) => {
  const sections = [
    {
      title: "Popular",
      items: [
        { name: "Mobile recharge", icon: <Smartphone size={20} color="#aa33ff" /> },
        { name: "FASTag", icon: <Car size={20} color="#0088ff" /> },
        { name: "Electricity", icon: <Zap size={20} color="#ffaa00" /> },
        { name: "Credit card", icon: <CreditCard size={20} color="#22e67b" /> },
        { name: "Broadband", icon: <Wifi size={20} color="#00cccc" /> },
        { name: "Mobile postpaid", icon: <Smartphone size={20} color="#eb3b88" /> }
      ]
    },
    {
      title: "Finances",
      items: [
        { name: "Insurance", icon: <ShieldCheck size={20} color="#22e67b" /> },
        { name: "Loans", icon: <CircleDollarSign size={20} color="#0088ff" /> },
        { name: "NPS", icon: <TrendingUp size={20} color="#aa33ff" /> }
      ]
    },
    {
      title: "Utilities",
      items: [
        { name: "Water", icon: <Droplet size={20} color="#0088ff" /> },
        { name: "Piped gas", icon: <Flame size={20} color="#ff5500" /> },
        { name: "Cylinder", icon: <Container size={20} color="#ff3333" /> },
        { name: "Prepaid Meter", icon: <Gauge size={20} color="#ffaa00" /> },
        { name: "DTH", icon: <Tv size={20} color="#00cccc" /> },
        { name: "Cable TV", icon: <Tv2 size={20} color="#eb3b88" /> },
        { name: "Landline postpaid", icon: <Phone size={20} color="#aa33ff" /> },
        { name: "Housing societies", icon: <Home size={20} color="#22e67b" /> }
      ]
    },
    {
      title: "More Services",
      items: [
        { name: "Clubs and associations", icon: <Users size={20} color="#00cccc" /> },
        { name: "Donation", icon: <HeartHandshake size={20} color="#ff3333" /> },
        { name: "Education fees", icon: <GraduationCap size={20} color="#0088ff" /> },
        { name: "Subscription", icon: <Tv size={20} color="#eb3b88" /> },
        { name: "Rental", icon: <Key size={20} color="#ffaa00" /> },
        { name: "NCMC recharge", icon: <Bus size={20} color="#22e67b" /> },
        { name: "Municipal taxes", icon: <Building2 size={20} color="#aa33ff" /> }
      ]
    }
  ];

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Search Input Bar */}
      <div style={styles.searchBar}>
        <Search size={16} color="var(--text-secondary)" style={{ marginRight: 10 }} />
        <input 
          type="text" 
          placeholder="Search billers (e.g. BESCOM)" 
          style={styles.searchInput} 
        />
      </div>

      {/* Promo Banner Card */}
      <div style={styles.promoCard}>
        <div style={styles.promoLeft}>
          <div style={styles.promoIconBox}>
            <Gift size={20} color="var(--accent-pink)" />
          </div>
          <div style={styles.promoTexts}>
            <span style={styles.promoTitle}>Min upto ₹50 cashback</span>
            <span style={styles.promoSub}>On all bills & recharges</span>
          </div>
        </div>
        <div style={styles.dotIndicator}>
          <div style={{ ...styles.indicatorDot, backgroundColor: '#ffffff' }}></div>
          <div style={styles.indicatorDot}></div>
          <div style={styles.indicatorDot}></div>
        </div>
      </div>

      {/* Recharge grids */}
      {sections.map((sect, idx) => (
        <div key={idx} style={styles.section}>
          <h2 style={styles.sectionHeader}>{sect.title}</h2>
          <div style={styles.grid}>
            {sect.items.map((item, itemIdx) => (
              <button 
                key={itemIdx} 
                onClick={() => onItemClick && onItemClick(item.name)}
                style={styles.gridItem}
              >
                <div style={styles.iconWrapper}>
                  {item.icon}
                </div>
                <span style={styles.itemName}>{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
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
  searchBar: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    padding: '10px 16px',
    border: '1px solid var(--border-color)',
  },
  searchInput: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: '14px',
  },
  promoCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1b1216', // Subtle pinkish dark background
    borderRadius: '16px',
    padding: '14px 16px',
    border: '1px solid rgba(235, 59, 136, 0.15)',
  },
  promoLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  promoIconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'rgba(235, 59, 136, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoTexts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  promoTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#ffffff',
  },
  promoSub: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  dotIndicator: {
    display: 'flex',
    gap: '4px',
  },
  indicatorDot: {
    width: '4px',
    height: '4px',
    borderRadius: '50%',
    backgroundColor: 'var(--text-muted)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionHeader: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
  },
  gridItem: {
    background: 'none',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '8px 0',
  },
  iconWrapper: {
    width: '44px',
    height: '44px',
    borderRadius: '14px',
    backgroundColor: 'var(--surface-color)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    '&:hover': {
      backgroundColor: 'var(--surface-hover)',
      transform: 'translateY(-2px)',
    }
  },
  itemName: {
    fontSize: '10px',
    fontWeight: '500',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    lineHeight: '1.2',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    height: '24px',
  }
};

export default RechargeBills;
