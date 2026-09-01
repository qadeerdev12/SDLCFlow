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
  workflow: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="9" y="14" width="6" height="6" rx="1.5" />
      <path d="M10 7h4" />
      <path d="M17 10v2a2 2 0 0 1-2 2h-3" />
      <path d="M7 10v2a2 2 0 0 0 2 2h3" />
    </>
  ),
  'terminal-square': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m8 9 3 3-3 3" />
      <path d="M13 15h4" />
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
  rocket: (
    <>
      <path d="M4.5 16.5c-1 1-1.5 2.5-1.5 4.5 2 0 3.5-.5 4.5-1.5" />
      <path d="M9 15 5 11l4-4c3.5-3.5 7.2-4.2 11-4-0.2 3.8-.5 7.5-4 11l-4 4-4-4Z" />
      <path d="M14 6h4v4" />
      <path d="M9 15 7.5 20.5 13 19" />
    </>
  ),
  'git-branch': (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M6 9v4a5 5 0 0 0 5 5h4" />
      <path d="M6 9v12" />
    </>
  ),
  'git-pull-request': (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M6 9v12" />
      <path d="M18 15V9a3 3 0 0 0-3-3h-3" />
      <path d="m14 4-2 2 2 2" />
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
  map: (
    <>
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="m5 16 .8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16Z" />
      <path d="m19 13 .8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8L19 13Z" />
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
