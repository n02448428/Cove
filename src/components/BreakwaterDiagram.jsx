/**
 * BreakwaterDiagram — the Cove visual language in one image.
 * Storm on the left, rock breakwater in the middle, calm cove on the right.
 * Three call paths: trusted (green, straight through the channel),
 * blocked (red, breaks on the rocks), screened (gold, held gently in the cove).
 * Theme-aware via CSS variables.
 */
export default function BreakwaterDiagram() {
  return (
    <svg
      viewBox="0 0 1200 440"
      role="img"
      aria-label="Diagram: trusted calls flow through the breakwater channel, blocked calls break on the rocks, unknown callers are held in the calm cove"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <defs>
        <linearGradient id="bw-storm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--cove-deepsea)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--cove-deepsea)" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id="bw-calm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.12" />
          <stop offset="0.6" stopColor="var(--color-accent)" stopOpacity="0.05" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0.14" />
        </linearGradient>
        <radialGradient id="bw-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>
        <marker id="bw-arrow-g" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-success)" />
        </marker>
        <marker id="bw-arrow-r" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-danger)" />
        </marker>
        <marker id="bw-arrow-y" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--color-warning)" />
        </marker>
      </defs>

      {/* ——— storm water (left) ——— */}
      <rect x="0" y="0" width="430" height="440" fill="url(#bw-storm)" />
      <g stroke="var(--cove-seamist)" strokeWidth="2" fill="none" opacity="0.5">
        <path d="M-20,120 l40,-26 40,26 40,-26 40,26 40,-26 40,26 40,-26 40,26 40,-26" />
        <path d="M-20,180 l40,-30 40,30 40,-30 40,30 40,-30 40,30 40,-30 40,30 40,-30" opacity="0.7" />
        <path d="M-20,300 l40,28 40,-28 40,28 40,-28 40,28 40,-28 40,28 40,-28 40,28" opacity="0.7" />
        <path d="M-20,360 l40,24 40,-24 40,24 40,-24 40,24 40,-24 40,24 40,-24 40,24" opacity="0.5" />
      </g>
      {/* whitecaps */}
      <g stroke="var(--color-text)" strokeWidth="2.5" strokeLinecap="round" opacity="0.35">
        <path d="M60,96 l18,-12 18,12" fill="none" />
        <path d="M220,150 l18,-12 18,12" fill="none" />
        <path d="M140,328 l18,12 18,-12" fill="none" />
        <path d="M300,384 l18,12 18,-12" fill="none" />
      </g>
      <text x="200" y="52" textAnchor="middle" fill="var(--color-text-muted)" fontSize="15" letterSpacing="4" opacity="0.8">THE STORM</text>

      {/* ——— calm water (right) ——— */}
      <rect x="600" y="0" width="600" height="440" fill="url(#bw-calm)" />
      <ellipse cx="900" cy="220" rx="280" ry="150" fill="url(#bw-glow)" />
      <g stroke="var(--color-accent)" strokeWidth="2" fill="none" opacity="0.45">
        <path d="M620,140 Q900,110 1180,140" />
        <path d="M620,200 Q900,172 1180,200" opacity="0.8" />
        <path d="M620,260 Q900,290 1180,260" opacity="0.8" />
        <path d="M620,320 Q900,348 1180,320" opacity="0.6" />
        <path d="M620,380 Q900,404 1180,380" opacity="0.4" />
      </g>
      {/* gentle holding spiral for screened calls */}
      <g stroke="var(--color-warning)" strokeWidth="2.5" fill="none" opacity="0.55">
        <path d="M880,220 a34,34 0 1,1 34,34 a24,24 0 1,0 24,-24 a15,15 0 1,1 -15,15" />
      </g>
      <text x="920" y="52" textAnchor="middle" fill="var(--color-text-muted)" fontSize="15" letterSpacing="4" opacity="0.8">THE COVE</text>

      {/* ——— the breakwater rocks ——— */}
      <g>
        <polygon points="430,440 430,180 470,120 520,170 540,440" fill="var(--cove-charcoal)" />
        <polygon points="520,440 540,140 590,110 620,180 620,440" fill="var(--cove-charcoal)" />
        <polygon points="470,120 520,170 500,200 455,160" fill="var(--color-text-muted)" opacity="0.35" />
        <polygon points="540,140 590,110 600,150 555,175" fill="var(--color-text-muted)" opacity="0.35" />
        {/* rock texture */}
        <g stroke="var(--color-text-muted)" strokeWidth="1.5" opacity="0.3">
          <path d="M445,250 l30,18 M445,300 l26,14 M560,240 l28,-12 M560,300 l30,-10" />
        </g>
      </g>
      {/* channel glow */}
      <rect x="505" y="180" width="70" height="90" fill="var(--color-accent)" opacity="0.12" />

      {/* ——— paths ——— */}
      {/* GREEN: trusted — straight through the channel */}
      <path
        d="M-10,225 C180,225 320,225 505,225 L575,225 C750,225 950,225 1210,225"
        stroke="var(--color-success)" strokeWidth="4" fill="none"
        markerEnd="url(#bw-arrow-g)" opacity="0.95"
      />
      {/* RED: blocked — breaks on the rocks */}
      <path
        d="M-10,320 L120,300 L200,330 L300,305 L395,325"
        stroke="var(--color-danger)" strokeWidth="4" fill="none"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.95"
      />
      {/* impact burst */}
      <g stroke="var(--color-danger)" strokeWidth="3" strokeLinecap="round" opacity="0.9">
        <path d="M405,295 l-14,-20 M415,305 l4,-24 M410,345 l-12,20 M420,340 l6,22" />
      </g>
      {/* YELLOW: screened — through the channel, held in the cove */}
      <path
        d="M-10,130 C200,130 340,150 505,190 C600,215 700,220 800,220"
        stroke="var(--color-warning)" strokeWidth="4" fill="none"
        markerEnd="url(#bw-arrow-y)" opacity="0.95"
      />

      {/* ——— labels ——— */}
      <g fontSize="16" fontWeight="600">
        <text x="1010" y="208" fill="var(--color-success)">Trusted — straight through</text>
        <text x="60" y="278" fill="var(--color-danger)">Blocked — breaks on the rock</text>
        <text x="60" y="108" fill="var(--color-warning)">Unknown — held gently in the cove</text>
      </g>
    </svg>
  );
}
