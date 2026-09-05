export function LiveIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" className={`shrink-0 ${className}`} aria-hidden="true">
      <circle cx="8" cy="8" r="6.75" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.4,5.1 L11,8 L6.4,10.9 Z" fill="currentColor" />
    </svg>
  );
}
