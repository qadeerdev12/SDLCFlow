import { useTheme } from '../context/useTheme'

export default function Logo({ size = 'md' }) {
  const { dark } = useTheme()

  const sizes = {
    sm: { icon: 24, text: 'text-base', gap: 'gap-2' },
    md: { icon: 32, text: 'text-xl', gap: 'gap-2.5' },
    lg: { icon: 44, text: 'text-3xl', gap: 'gap-3' },
  }
  const s = sizes[size]

  return (
    <div className={`flex items-center ${s.gap}`}>
      <svg width={s.icon} height={s.icon} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2.5" y="2.5" width="35" height="35" rx="8" fill={dark ? '#09090b' : '#ffffff'} stroke={dark ? '#3f3f46' : '#d4d4d8'} />
        <path d="M12 14h11" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" />
        <path d="m20 10.5 3.5 3.5-3.5 3.5" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M28 15.5V24H17" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" />
        <path d="m20 20.5-3.5 3.5 3.5 3.5" stroke="#0d9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="14" r="3.25" fill="#f59e0b" />
        <circle cx="28" cy="14" r="3.25" fill="#0f766e" />
        <circle cx="16" cy="24" r="3.25" fill="#0d9488" />
      </svg>
      <span className={`${s.text} font-semibold tracking-tight`}>
        <span className={dark ? 'text-white' : 'text-zinc-950'}>SDLC</span>
        <span className="text-teal-700 dark:text-teal-400">Flow</span>
      </span>
    </div>
  )
}
