import CoveMark from './CoveMark.jsx';

/**
 * Reusable Cove wordmark: oversized teal C (mark) + geometric OVE.
 * OVE color follows theme via CSS var --cove-ove.
 */
export default function CoveWordmark({ markSize = 36, className = '', linkTo }) {
  const content = (
    <span className={`cove-wordmark ${className}`.trim()} aria-label="Cove">
      <CoveMark size={markSize} title="" />
      <span className="cove-wordmark-ove" aria-hidden="true">OVE</span>
    </span>
  );

  if (linkTo) {
    return (
      <a href={linkTo} className="cove-wordmark-link" aria-label="Cove home">
        {content}
      </a>
    );
  }
  return content;
}
