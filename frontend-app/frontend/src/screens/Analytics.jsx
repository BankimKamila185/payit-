import React from 'react';
import { ChevronDown, ArrowRight } from 'lucide-react';

const Analytics = ({ onCategoryClick }) => {
  const totalSpend = 3993;
  const categories = [
    { name: "Transfers", amount: 2135, percent: 62, color: "#22e67b", emoji: "📲" },
    { name: "Bills & recharges", amount: 825, percent: 21, color: "#aa33ff", emoji: "⚡" },
    { name: "Food & dining", amount: 580, percent: 15, color: "#eb3b88", emoji: "🍔" },
    { name: "Shopping", amount: 190, percent: 5, color: "#0088ff", emoji: "🛍️" },
    { name: "Groceries", amount: 190, percent: 5, color: "#ffaa00", emoji: "🛒" },
    { name: "Miscellaneous", amount: 53, percent: 1, color: "#8c8c8e", emoji: "📦" },
    { name: "Travel", amount: 30, percent: 1, color: "#00cccc", emoji: "✈️" },
    { name: "Medical", amount: 10, percent: 1, color: "#ff3333", emoji: "💊" }
  ];

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Account Selector & Amount */}
      <div style={styles.topSelector}>
        <button style={styles.accountSelectorBtn}>
          All accounts <ChevronDown size={14} style={{ marginLeft: 4 }} />
        </button>
        <h2 style={styles.totalSpendText}>₹{totalSpend.toLocaleString('en-IN')}</h2>
        <span style={styles.spendPeriodText}>Jun 13 - Jul 12</span>
      </div>

      {/* SVG Line Chart (Spent Trend) */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <span style={styles.chartTitle}>Spending Trend</span>
          <span style={styles.chartChangeText}>-12% vs last month</span>
        </div>
        <div style={styles.chartWrapper}>
          <svg viewBox="0 0 300 120" style={{ width: '100%', height: '120px' }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#aa33ff" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="#aa33ff" stopOpacity="0.0"/>
              </linearGradient>
            </defs>
            {/* Grid Lines */}
            <line x1="0" y1="90" x2="300" y2="90" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
            <line x1="0" y1="50" x2="300" y2="50" stroke="rgba(255,255,255,0.05)" strokeDasharray="3,3" />
            
            {/* Filled Area */}
            <path 
              d="M 10 90 L 60 70 L 110 85 L 160 25 L 210 50 L 260 90 L 290 85 L 290 110 L 10 110 Z" 
              fill="url(#chartGradient)" 
            />
            {/* Trend Line */}
            <path 
              d="M 10 90 L 60 70 L 110 85 L 160 25 L 210 50 L 260 90 L 290 85" 
              fill="none" 
              stroke="#aa33ff" 
              strokeWidth="2.5" 
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Data point glow highlights */}
            <circle cx="160" cy="25" r="4" fill="#aa33ff" />
            <circle cx="160" cy="25" r="8" fill="none" stroke="#aa33ff" strokeWidth="1.5" opacity="0.5" />
          </svg>
        </div>
        <div style={styles.chartLabels}>
          <span>Apr</span>
          <span>May</span>
          <span style={styles.activeLabel}>Jun</span>
          <span>Jul</span>
          <span>Aug</span>
          <span>Sep</span>
        </div>
      </div>

      {/* Categories header */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>Categories</span>
        <button style={styles.viewSpendsBtn}>Top spends</button>
      </div>

      {/* Category List */}
      <div style={styles.categoryList}>
        {categories.map((cat, idx) => (
          <div 
            key={idx} 
            onClick={() => onCategoryClick && onCategoryClick(cat.name)}
            style={styles.categoryRow}
          >
            <div style={styles.categoryIconBox}>
              <span style={{ fontSize: '18px' }}>{cat.emoji}</span>
            </div>
            <div style={styles.categoryDetails}>
              <div style={styles.catNameRow}>
                <span style={styles.catName}>{cat.name}</span>
                <span style={styles.catAmount}>₹{cat.amount}</span>
              </div>
              <div style={styles.progressBarWrapper}>
                <div style={styles.progressTrack}>
                  <div 
                    style={{ 
                      ...styles.progressFill, 
                      backgroundColor: cat.color, 
                      width: `${cat.percent}%` 
                    }}
                  ></div>
                </div>
                <span style={styles.catPercent}>{cat.percent}%</span>
              </div>
            </div>
            <ArrowRight size={14} color="#575759" style={styles.chevronRight} />
          </div>
        ))}
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
  topSelector: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    margin: '10px 0',
  },
  accountSelectorBtn: {
    backgroundColor: '#1c1c1f',
    border: '1px solid #232326',
    borderRadius: '16px',
    color: '#ffffff',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    marginBottom: '8px',
  },
  totalSpendText: {
    fontSize: '36px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
    color: '#ffffff',
  },
  spendPeriodText: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '2px',
  },
  chartCard: {
    backgroundColor: 'var(--surface-color)',
    borderRadius: '20px',
    padding: '16px',
    border: '1px solid var(--border-color)',
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  chartTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
  },
  chartChangeText: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--accent-neon)',
  },
  chartWrapper: {
    margin: '8px 0',
  },
  chartLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0 8px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontWeight: '500',
  },
  activeLabel: {
    color: '#ffffff',
    fontWeight: '700',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '4px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: '#ffffff',
  },
  viewSpendsBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  categoryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  categoryRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: 'var(--surface-color)',
    borderRadius: '16px',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  categoryIconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    backgroundColor: '#1c1c1f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '12px',
  },
  categoryDetails: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  catNameRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#ffffff',
  },
  catAmount: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#ffffff',
    fontFamily: 'var(--font-display)',
  },
  progressBarWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  progressTrack: {
    flex: 1,
    height: '4px',
    backgroundColor: '#1c1c1f',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '2px',
  },
  catPercent: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    width: '24px',
    textAlign: 'right',
  },
  chevronRight: {
    marginLeft: '8px',
  }
};

export default Analytics;
