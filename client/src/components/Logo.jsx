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
        <rect x="9" y="10" width="7" height="20" rx="2" fill="#0f766e" />
        <rect x="18" y="10" width="5" height="14" rx="2" fill="#0d9488" />
        <rect x="25" y="10" width="6" height="17" rx="2" fill="#f59e0b" />
        <path d="M10 31h20" stroke={dark ? '#71717a' : '#a1a1aa'} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className={`${s.text} font-semibold tracking-tight`}>
        <span className={dark ? 'text-white' : 'text-zinc-950'}>SDLC</span>
        <span className="text-teal-700 dark:text-teal-400">Flow</span>
      </span>
    </div>
  )
}
