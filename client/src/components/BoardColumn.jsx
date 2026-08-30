import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import SortableCard from './SortableCard'

const noLayoutAnimation = () => false

export default function BoardColumn({ list, cards, draft, onDraftChange, onAddCard }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list._id, data: { type: 'list' }, animateLayoutChanges: noLayoutAnimation })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  }

  const cardIds = cards.map((c) => c._id)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex max-h-[calc(100vh-136px)] w-[310px] shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-100/70 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex cursor-grab touch-none items-center justify-between gap-3 border-b border-zinc-200 px-3 py-3 active:cursor-grabbing dark:border-zinc-800"
      >
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">
            {list.title}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {cards.length} {cards.length === 1 ? 'card' : 'cards'}
          </p>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-white hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </span>
      </div>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto p-2">
          {cards.map((card) => (
            <SortableCard key={card._id} card={card} />
          ))}

          {cards.length === 0 && (
            <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-zinc-300 bg-white/60 px-3 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-500">
              Drop work here
            </div>
          )}
        </div>
      </SortableContext>

      <form onSubmit={(e) => onAddCard(e, list._id)} className="border-t border-zinc-200 p-2 dark:border-zinc-800">
        <input
          value={draft || ''}
          onChange={(e) => onDraftChange(list._id, e.target.value)}
          placeholder="Add a task"
          className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:bg-zinc-950 dark:placeholder:text-zinc-500"
        />
      </form>
    </div>
  )
}
