import { useTheme } from '../context/ThemeContext'

export default function Logo({ size = 'md' }) {
  const { dark } = useTheme()

  const sizes = {
    sm: { icon: 24, text: 'text-lg', gap: 'gap-2' },
    md: { icon: 32, text: 'text-xl', gap: 'gap-2.5' },
    lg: { icon: 44, text: 'text-3xl', gap: 'gap-3' },
  }
  const s = sizes[size]

  return (
    <div className={`flex items-center ${s.gap}`}>
      <svg width={s.icon} height={s.icon} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Rounded board background */}
        <rect x="2" y="2" width="36" height="36" rx="8" fill="url(#brandGrad)" />
        {/* Three columns representing lists */}
        <rect x="8" y="9" width="6" height="22" rx="2" fill="white" opacity="0.95" />
        <rect x="17" y="9" width="6" height="16" rx="2" fill="white" opacity="0.75" />
        <rect x="26" y="9" width="6" height="19" rx="2" fill="white" opacity="0.85" />
        <defs>
          <linearGradient id="brandGrad" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <span className={`${s.text} font-bold tracking-tight`}>
        <span className={dark ? 'text-white' : 'text-gray-900'}>Collab</span>
        <span className="text-indigo-500">Board</span>
      </span>
    </div>
  )
}
