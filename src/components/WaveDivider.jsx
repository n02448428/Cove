/**
 * WaveDivider — a quiet cove-world section divider.
 * Two smooth wave lines in the gold rule color.
 */
export default function WaveDivider() {
  return (
    <svg
      viewBox="0 0 1200 40"
      aria-hidden="true"
      style={{ width: '100%', height: 'auto', display: 'block', margin: '3.5rem 0 0' }}
    >
      <g stroke="var(--color-rule)" strokeWidth="2" fill="none" opacity="0.8">
        <path d="M0,20 Q150,4 300,20 T600,20 T900,20 T1200,20" />
        <path d="M0,30 Q150,16 300,30 T600,30 T900,30 T1200,30" opacity="0.5" />
      </g>
      <circle cx="600" cy="25" r="4" fill="var(--color-warning)" opacity="0.9" />
    </svg>
  );
}
