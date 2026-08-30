// Board color palette. Keep the keys in sync with the Board schema's color enum
// (server/src/models/Board.js) and the controller's BOARD_COLORS list.
//
// Tailwind v4 scans source for literal class strings, so the full class names
// must appear here verbatim — never build them dynamically (`bg-${c}-500`),
// or they'll be purged from the build.
//
//   dot / swatch — solid fill for pickers and indicators
//   accent       — left border on a board card
//   gradient     — the emoji tile on a board card
//   glow         — hover border + shadow tint, so a card lights up in its own color
export const BOARD_COLORS = {
  slate: {
    dot: 'bg-slate-500',
    swatch: 'bg-slate-500',
    accent: 'border-l-slate-500',
    gradient: 'from-slate-400 to-slate-600',
    glow: 'hover:border-slate-400/60 hover:shadow-slate-500/10 dark:hover:border-slate-400/40',
  },
  indigo: {
    dot: 'bg-indigo-500',
    swatch: 'bg-indigo-500',
    accent: 'border-l-indigo-500',
    gradient: 'from-indigo-400 to-indigo-600',
    glow: 'hover:border-indigo-400/60 hover:shadow-indigo-500/10 dark:hover:border-indigo-400/40',
  },
  emerald: {
    dot: 'bg-emerald-500',
    swatch: 'bg-emerald-500',
    accent: 'border-l-emerald-500',
    gradient: 'from-emerald-400 to-emerald-600',
    glow: 'hover:border-emerald-400/60 hover:shadow-emerald-500/10 dark:hover:border-emerald-400/40',
  },
  amber: {
    dot: 'bg-amber-500',
    swatch: 'bg-amber-500',
    accent: 'border-l-amber-500',
    gradient: 'from-amber-400 to-amber-600',
    glow: 'hover:border-amber-400/60 hover:shadow-amber-500/10 dark:hover:border-amber-400/40',
  },
  rose: {
    dot: 'bg-rose-500',
    swatch: 'bg-rose-500',
    accent: 'border-l-rose-500',
    gradient: 'from-rose-400 to-rose-600',
    glow: 'hover:border-rose-400/60 hover:shadow-rose-500/10 dark:hover:border-rose-400/40',
  },
  sky: {
    dot: 'bg-sky-500',
    swatch: 'bg-sky-500',
    accent: 'border-l-sky-500',
    gradient: 'from-sky-400 to-sky-600',
    glow: 'hover:border-sky-400/60 hover:shadow-sky-500/10 dark:hover:border-sky-400/40',
  },
  violet: {
    dot: 'bg-violet-500',
    swatch: 'bg-violet-500',
    accent: 'border-l-violet-500',
    gradient: 'from-violet-400 to-violet-600',
    glow: 'hover:border-violet-400/60 hover:shadow-violet-500/10 dark:hover:border-violet-400/40',
  },
}

export const BOARD_COLOR_KEYS = Object.keys(BOARD_COLORS)
export const DEFAULT_COLOR = 'indigo'
export const DEFAULT_EMOJI = '📋'

// The emoji options offered when creating a board.
export const EMOJI_CHOICES = ['📋', '🧵', '⏱️', '📊', '🗂️', '🚀', '🐛', '💡', '🎨', '🔧']

// Resolve a board's color to its class set, tolerating missing/legacy values.
export function colorClasses(color) {
  return BOARD_COLORS[color] || BOARD_COLORS[DEFAULT_COLOR]
}
