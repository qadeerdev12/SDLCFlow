import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { statusDotStyle, tagStyle } from '../lib/cardMeta'

const noLayoutAnimation = () => false

export default function SortableCard({ card, onOpen }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card._id, data: { type: 'card', listId: card.list }, animateLayoutChanges: noLayoutAnimation })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card)}
      className="w-full cursor-grab touch-none rounded-lg border border-zinc-200 bg-white p-3 text-left text-sm shadow-sm transition hover:border-teal-200 hover:shadow-md active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-teal-500/30"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${tagStyle(card.tag)}`}>
          {card.tag || 'Task'}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          <span className={`h-2 w-2 rounded-full ${statusDotStyle(card.status)}`} />
          {card.status || 'Todo'}
        </span>
      </div>
      <p className="leading-5 text-zinc-900 dark:text-zinc-100">{card.title}</p>
    </button>
  )
}
