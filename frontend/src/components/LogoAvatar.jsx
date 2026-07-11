import React, { useState, useMemo } from 'react';

/**
 * LogoAvatar – Fetches a real company logo via img.logo.dev.
 * Falls back to a coloured circle with initials if the logo fails to load.
 *
 * Usage:
 *   <LogoAvatar name="Swiggy" domain="swiggy.com" size={40} />
 *   <LogoAvatar name="Gopichand Javanajad" size={36} />   // person → always initials
 */

const LOGO_TOKEN = 'pk_fx-md6duQVWzDDwHSuZjWA';

// Map of company name keywords → canonical domains
const DOMAIN_MAP = {
  // Streaming & Telecom
  hotstar: 'hotstar.com',
  'jio hotstar': 'hotstar.com',
  jio: 'jio.com',
  airtel: 'airtel.in',
  vi: 'myvi.in',
  bsnl: 'bsnl.co.in',

  // Payments & Finance
  'slice': 'sliceit.in',
  'slice credit': 'sliceit.in',
  razorpay: 'razorpay.com',
  paytm: 'paytm.com',
  phonepe: 'phonepe.com',
  gpay: 'google.com',
  googlepay: 'google.com',

  // Food & Delivery
  swiggy: 'swiggy.com',
  zomato: 'zomato.com',
  blinkit: 'blinkit.com',

  // Shopping
  amazon: 'amazon.in',
  flipkart: 'flipkart.com',
  myntra: 'myntra.com',

  // Entertainment
  netflix: 'netflix.com',
  spotify: 'spotify.com',
  youtube: 'youtube.com',

  // Tech
  playstore: 'google.com',
  'google play': 'google.com',
  google: 'google.com',
  apple: 'apple.com',
  microsoft: 'microsoft.com',

  // Services
  uber: 'uber.com',
  ola: 'olacabs.com',
  rapido: 'rapido.bike',
  irctc: 'irctc.co.in',
  makemytrip: 'makemytrip.com',
};

// Deterministic colour palette for initials fallback
const PALETTE = [
  '#5c6bc0', '#ab47bc', '#26a69a', '#ef5350',
  '#42a5f5', '#66bb6a', '#ffa726', '#8d6e63',
  '#78909c', '#ec407a', '#7e57c2', '#26c6da',
];

function colorForName(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function resolveDomain(name = '', explicitDomain = '') {
  if (explicitDomain) return explicitDomain;
  const lower = name.toLowerCase();
  for (const [key, domain] of Object.entries(DOMAIN_MAP)) {
    if (lower.includes(key)) return domain;
  }
  return null;
}

// Is this a company / merchant name rather than a personal name?
function looksLikeBusiness(name = '', domain = '') {
  if (domain) return true;
  return resolveDomain(name) !== null;
}

export default function LogoAvatar({
  name = '',
  domain = '',          // Optional: pass explicit domain for logo.dev lookup
  size = 40,
  style = {},           // Extra container styles
  className = '',
}) {
  const resolvedDomain = useMemo(() => resolveDomain(name, domain), [name, domain]);
  const isBusiness = looksLikeBusiness(name, domain);
  const logoUrl = resolvedDomain
    ? `https://img.logo.dev/${resolvedDomain}?token=${LOGO_TOKEN}&retina=true`
    : null;

  const [logoFailed, setLogoFailed] = useState(false);

  const bgColor = colorForName(name);
  const initials = getInitials(name);
  const fontSize = Math.max(10, Math.round(size * 0.36));

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: (!isBusiness || logoFailed) ? bgColor : '#ffffff',
    ...style,
  };

  if (logoUrl && isBusiness && !logoFailed) {
    return (
      <div style={containerStyle} className={className}>
        <img
          src={logoUrl}
          alt={name}
          width={size}
          height={size}
          style={{ objectFit: 'contain', borderRadius: '50%' }}
          onError={() => setLogoFailed(true)}
        />
      </div>
    );
  }

  return (
    <div style={containerStyle} className={className}>
      <span style={{
        color: '#ffffff',
        fontSize,
        fontWeight: 700,
        fontFamily: 'var(--font-display, system-ui)',
        letterSpacing: '-0.5px',
        lineHeight: 1,
      }}>
        {initials}
      </span>
    </div>
  );
}
