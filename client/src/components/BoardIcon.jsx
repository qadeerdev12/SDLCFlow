const ICONS = {
  code: (
    <>
      <path d="m9 8-4 4 4 4" />
      <path d="m15 8 4 4-4 4" />
      <path d="m13 5-2 14" />
    </>
  ),
  api: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M8 10h.01" />
      <path d="M12 10h4" />
      <path d="M8 14h8" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  bug: (
    <>
      <path d="M8 8a4 4 0 0 1 8 0" />
      <rect x="7" y="8" width="10" height="11" rx="5" />
      <path d="M3 13h4" />
      <path d="M17 13h4" />
      <path d="M4 19l3-2" />
      <path d="M20 19l-3-2" />
      <path d="M12 8v11" />
    </>
  ),
  deploy: (
    <>
      <path d="M12 3 5 21l7-4 7 4-7-18Z" />
      <path d="M12 17v-6" />
    </>
  ),
  security: (
    <>
      <path d="M12 3 20 7v5c0 5-3.4 8.1-8 9-4.6-.9-8-4-8-9V7l8-4Z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  cloud: (
    <>
      <path d="M17.5 18H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20 11.5 3.5 3.5 0 0 1 17.5 18Z" />
      <path d="M12 12v6" />
      <path d="m9.5 15.5 2.5 2.5 2.5-2.5" />
    </>
  ),
  mobile: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M10 6h4" />
      <path d="M12 17h.01" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <rect x="7" y="11" width="3" height="5" rx="1" />
      <rect x="12" y="7" width="3" height="9" rx="1" />
      <rect x="17" y="9" width="3" height="7" rx="1" />
    </>
  ),
  experiment: (
    <>
      <path d="M10 3v5l-4.5 8A3.3 3.3 0 0 0 8.4 21h7.2a3.3 3.3 0 0 0 2.9-5L14 8V3" />
      <path d="M8 3h8" />
      <path d="M8 16h8" />
    </>
  ),
}

export default function BoardIcon({ value, className = 'h-5 w-5' }) {
  if (!ICONS[value]) {
    return <span className="text-base leading-none">{value}</span>
  }

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[value]}
    </svg>
  )
}
