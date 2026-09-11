/** Inline Cove mark: teal C arc + centered gold dot */
export default function CoveMark({ size = 28, className = '', title = 'Cove' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <circle cx="50" cy="50" r="12" fill="#B88848" />
      <path
        d="M78.5 28.5 A36 36 0 1 0 78.5 71.5"
        fill="none"
        stroke="#487878"
        strokeWidth="18"
        strokeLinecap="butt"
      />
    </svg>
  );
}
