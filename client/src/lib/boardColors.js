// Board color palette. Keep the keys in sync with the Board schema's color enum
// (server/src/models/Board.js) and the controller's BOARD_COLORS list.
//
// Tailwind v4 scans source for literal class strings, so the full class names
// must appear here verbatim — never build them dynamically (`bg-${c}-500`),
// or they'll be purged from the build.
export const BOARD_COLORS = {
  slate:   { dot: 'bg-slate-500',   swatch: 'bg-slate-500',   accent: 'border-l-slate-500' },
  indigo:  { dot: 'bg-indigo-500',  swatch: 'bg-indigo-500',  accent: 'border-l-indigo-500' },
  emerald: { dot: 'bg-emerald-500', swatch: 'bg-emerald-500', accent: 'border-l-emerald-500' },
  amber:   { dot: 'bg-amber-500',   swatch: 'bg-amber-500',   accent: 'border-l-amber-500' },
  rose:    { dot: 'bg-rose-500',    swatch: 'bg-rose-500',    accent: 'border-l-rose-500' },
  sky:     { dot: 'bg-sky-500',     swatch: 'bg-sky-500',     accent: 'border-l-sky-500' },
  violet:  { dot: 'bg-violet-500',  swatch: 'bg-violet-500',  accent: 'border-l-violet-500' },
}

export const BOARD_COLOR_KEYS = Object.keys(BOARD_COLORS)
export const DEFAULT_COLOR = 'indigo'
export const DEFAULT_EMOJI = '📋'

// Resolve a board's color to its class set, tolerating missing/legacy values.
export function colorClasses(color) {
  return BOARD_COLORS[color] || BOARD_COLORS[DEFAULT_COLOR]
}
