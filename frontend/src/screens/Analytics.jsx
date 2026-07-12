import React, { useMemo } from 'react';
import { ChevronDown, ArrowRight } from 'lucide-react';

// Classify a receiver VPA into a spend category
function classifyVpa(receiverVpa = '') {
  const local = (receiverVpa.split('@')[0] || '').toLowerCase();
  const handle = (receiverVpa.split('@')[1] || '').toLowerCase();

  if (/zomato|swiggy|food|restaurant|cafe|biryani|pizza|burger|eat|taste|kitchen|dhaba/.test(local))
    return 'Food & dining';
  if (/amazon|flipkart|myntra|ajio|bigbazaar|dmart|reliance|shop|store|mall|meesho/.test(local))
    return 'Shopping';
  if (/grocer|bigmart|fresh|supermarket|kirana|vegetables|fruits/.test(local))
    return 'Groceries';
  if (/airtel|jio|bsnl|vi|vodafone|idea|mobile|recharge|dth|broadband|electricity|bill|gas|water|utility/.test(local))
    return 'Bills & recharges';
  if (/ola|uber|rapido|irctc|airlines|makemytrip|goibibo|yatra|travel|bus|cab|metro/.test(local))
    return 'Travel';
  if (/hospital|pharmacy|medical|health|clinic|doctor|med|apollo|fortis/.test(local))
    return 'Medical';
  // merchant handles
  if (/okhdfc|oksbi|okicici|okaxis|okkotak|okpnb|okybl|okpaytm/.test(handle))
    return 'Transfers';
  return 'Transfers';
}

const CATEGORY_META = {
  'Transfers':       { color: '#22e67b', emoji: '📲' },
  'Bills & recharges':{ color: '#aa33ff', emoji: '⚡' },
  'Food & dining':   { color: '#eb3b88', emoji: '🍔' },
  'Shopping':        { color: '#0088ff', emoji: '🛍️' },
  'Groceries':       { color: '#ffaa00', emoji: '🛒' },
  'Travel':          { color: '#00cccc', emoji: '✈️' },
  'Medical':         { color: '#ff3333', emoji: '💊' },
  'Miscellaneous':   { color: '#8c8c8e', emoji: '📦' },
};

const Analytics = ({ onCategoryClick, liveTxns = [], me = '', theme = 'dark' }) => {
  // ── Derive all spend stats from real transactions ──────────────────────────
  const { totalSpend, categories, dateRange, monthlyTotals, chartChange } = useMemo(() => {
    // Only count debit transactions (me is sender)
    const myDebits = (liveTxns || []).filter(
      t => t.sender === me && t.status === 'success' && Number(t.amount) > 0
    );

    // Total spend
    const totalSpend = myDebits.reduce((s, t) => s + Number(t.amount), 0);

    // Date range
    let dateRange = 'Last 30 days';
    if (myDebits.length > 0) {
      const dates = myDebits.map(t => new Date(t.created_at)).filter(d => !isNaN(d));
      if (dates.length) {
        const oldest = new Date(Math.min(...dates));
        const newest = new Date(Math.max(...dates));
        const fmt = d => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        dateRange = `${fmt(oldest)} – ${fmt(newest)}`;
      }
    }

    // Category breakdown
    const catMap = {};
    for (const t of myDebits) {
      const cat = classifyVpa(t.receiver);
      catMap[cat] = (catMap[cat] || 0) + Number(t.amount);
    }

    const sorted = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount),
        percent: totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0,
        color: CATEGORY_META[name]?.color || '#8c8c8e',
        emoji: CATEGORY_META[name]?.emoji || '📦',
      }));

    // Monthly spend for chart (last 6 months)
    const monthlyTotals = Array(6).fill(0);
    const now = new Date();
    for (const t of myDebits) {
      const d = new Date(t.created_at);
      if (isNaN(d)) continue;
      const mDiff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (mDiff >= 0 && mDiff < 6) {
        monthlyTotals[5 - mDiff] += Number(t.amount);
      }
    }

    // % change vs previous month
    const thisMonth = monthlyTotals[5] || 0;
    const lastMonth = monthlyTotals[4] || 0;
    let chartChange = null;
    if (lastMonth > 0) {
      chartChange = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);
    }

    return { totalSpend: Math.round(totalSpend), categories: sorted, dateRange, monthlyTotals, chartChange };
  }, [liveTxns, me]);

  // ── SVG chart path from monthly totals ─────────────────────────────────────
  const chartPath = useMemo(() => {
    const vals = monthlyTotals;
    const max = Math.max(...vals, 1);
    const W = 300, H = 100, PAD = 10;
    const points = vals.map((v, i) => {
      const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v / max) * (H - PAD * 2));
      return [x, y];
    });
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    const area = line + ` L ${points[points.length - 1][0]} ${H + PAD} L ${points[0][0]} ${H + PAD} Z`;
    return { line, area, points };
  }, [monthlyTotals]);

  const monthLabels = useMemo(() => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    return Array(6).fill(0).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return months[d.getMonth()];
    });
  }, []);

  const changeColor = chartChange !== null && chartChange > 0 
    ? 'var(--accent-pink)' 
    : theme === 'light' 
    ? 'var(--accent-green-contrast)' 
    : 'var(--accent-neon)';

  const isLight = theme === 'light';

  const chartCardStyle = isLight ? {
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    padding: '20px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)',
    border: 'none',
  } : styles.chartCard;

  const categoryRowStyle = isLight ? {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 4px',
    backgroundColor: 'transparent',
    borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
    borderRadius: '0',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } : styles.categoryRow;

  const activeLabelStyle = isLight ? {
    backgroundColor: '#aa33ff',
    color: '#ffffff',
    padding: '4px 10px',
    borderRadius: '20px',
    fontWeight: '700',
    fontSize: '11px',
    lineHeight: '1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } : styles.activeLabel;

  const progressTrackStyle = isLight ? {
    flex: 1,
    height: '6px',
    backgroundColor: '#e8e8ec',
    borderRadius: '3px',
    overflow: 'hidden',
    position: 'relative',
  } : styles.progressTrack;

  return (
    <div style={styles.container} className="animate-slide-up">
      {/* Account Selector & Amount */}
      <div style={styles.topSelector}>
        <button style={styles.accountSelectorBtn}>
          All accounts <ChevronDown size={14} style={{ marginLeft: 4 }} />
        </button>
        <h2 style={styles.totalSpendText}>
          {totalSpend > 0 ? `₹${totalSpend.toLocaleString('en-IN')}` : '₹0'}
        </h2>
        <span style={styles.spendPeriodText}>{dateRange}</span>
      </div>

      {/* SVG Line Chart (Spent Trend — real) */}
      <div style={chartCardStyle}>
        <div style={styles.chartHeader}>
          <span style={styles.chartTitle}>Spending Trend</span>
          {changeLabel && (
            <span style={{ ...styles.chartChangeText, color: changeColor }}>{changeLabel}</span>
          )}
        </div>
        <div style={styles.chartWrapper}>
          <svg viewBox="0 0 300 110" style={{ width: '100%', height: '110px' }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#aa33ff" stopOpacity="0.35"/>
                <stop offset="100%" stopColor="#aa33ff" stopOpacity="0.0"/>
              </linearGradient>
            </defs>
            <line x1="0" y1="80" stroke="var(--border-color)" strokeDasharray="3,3" />
            <line x1="0" y1="45" stroke="var(--border-color)" strokeDasharray="3,3" />
            <path d={chartPath.area} fill="url(#chartGradient)" />
            <path d={chartPath.line} fill="none" stroke="#aa33ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {/* Highlight current month */}
            {chartPath.points.length > 0 && (() => {
              const [cx, cy] = chartPath.points[chartPath.points.length - 1];
              return (
                <>
                  <circle cx={cx} cy={cy} r="4" fill="#aa33ff" />
                  <circle cx={cx} cy={cy} r="8" fill="none" stroke="#aa33ff" strokeWidth="1.5" opacity="0.4" />
                </>
              );
            })()}
          </svg>
        </div>
        <div style={styles.chartLabels}>
          {monthLabels.map((m, i) => (
            <span key={i} style={i === 5 ? activeLabelStyle : {}}>{m}</span>
          ))}
        </div>
      </div>

      {/* Categories header */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>Categories</span>
        <button style={styles.viewSpendsBtn}>Top spends</button>
      </div>

      {/* Category List — real data */}
      {categories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          No transactions yet this period
        </div>
      ) : (
        <div style={styles.categoryList}>
          {categories.map((cat, idx) => (
            <div
              key={idx}
              onClick={() => onCategoryClick && onCategoryClick(cat.name)}
              style={categoryRowStyle}
            >
              <div style={styles.categoryIconBox}>
                <span style={{ fontSize: '18px' }}>{cat.emoji}</span>
              </div>
              <div style={styles.categoryDetails}>
                <div style={styles.catNameRow}>
                  <span style={styles.catName}>{cat.name}</span>
                  <span style={styles.catAmount}>₹{cat.amount.toLocaleString('en-IN')}</span>
                </div>
                <div style={styles.progressBarWrapper}>
                  <div style={progressTrackStyle}>
                    <div style={{ ...styles.progressFill, backgroundColor: cat.color, width: `${cat.percent}%` }} />
                  </div>
                  <span style={styles.catPercent}>{cat.percent}%</span>
                </div>
              </div>
              <ArrowRight size={14} color="var(--text-muted)" style={styles.chevronRight} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '40px' },
  topSelector: { display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0' },
  accountSelectorBtn: {
    backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border-color)', borderRadius: '16px',
    color: 'var(--text-primary)', padding: '6px 12px', fontSize: '13px', fontWeight: '600',
    display: 'flex', alignItems: 'center', cursor: 'pointer', marginBottom: '8px',
  },
  totalSpendText: { fontSize: '36px', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' },
  spendPeriodText: { fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' },
  chartCard: { backgroundColor: 'var(--surface-color)', borderRadius: '20px', padding: '16px', border: '1px solid var(--border-color)' },
  chartHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '16px' },
  chartTitle: { fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' },
  chartChangeText: { fontSize: '12px', fontWeight: '600' },
  chartWrapper: { margin: '8px 0' },
  chartLabels: { display: 'flex', justifyContent: 'space-between', padding: '0 8px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' },
  activeLabel: { color: 'var(--text-primary)', fontWeight: '700' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' },
  sectionTitle: { fontSize: '16px', fontWeight: '700', fontFamily: 'var(--font-display)', color: 'var(--text-primary)' },
  viewSpendsBtn: { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  categoryList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  categoryRow: {
    display: 'flex', alignItems: 'center', padding: '12px',
    backgroundColor: 'var(--surface-color)', borderRadius: '16px',
    border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background-color 0.2s',
  },
  categoryIconBox: { width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '12px' },
  categoryDetails: { flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' },
  catNameRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  catName: { fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' },
  catAmount: { fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' },
  progressBarWrapper: { display: 'flex', alignItems: 'center', gap: '8px' },
  progressTrack: { flex: 1, height: '4px', backgroundColor: 'var(--surface-hover)', borderRadius: '2px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '2px' },
  catPercent: { fontSize: '10px', color: 'var(--text-secondary)', width: '24px', textAlign: 'right' },
  chevronRight: { marginLeft: '8px' },
};

export default Analytics;
