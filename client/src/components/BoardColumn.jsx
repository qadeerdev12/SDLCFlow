import { useState } from 'react'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import SortableCard from './SortableCard'

const noLayoutAnimation = () => false

export default function BoardColumn({
  list,
  cards,
  totalCards = cards.length,
  filtersActive = false,
  draft,
  onDraftChange,
  onAddCard,
  onCardOpen,
  onListRename,
  onListDelete,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(list.title)
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
  const cardCountLabel = filtersActive ? `${cards.length} of ${totalCards}` : cards.length
  const emptyMessage = filtersActive && totalCards > 0 ? 'No matching cards' : 'Drop work here'

  async function submitRename(e) {
    e.preventDefault()
    const nextTitle = titleDraft.trim()
    if (!nextTitle) return
    try {
      await onListRename(list, nextTitle)
      setEditingTitle(false)
    } catch {
      setTitleDraft(list.title)
      setEditingTitle(false)
    }
  }

  function startRename() {
    setTitleDraft(list.title)
    setEditingTitle(true)
    setMenuOpen(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex max-h-[calc(100dvh-246px)] w-[min(84vw,320px)] shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-100/70 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:w-[310px] md:max-h-[calc(100dvh-216px)] lg:max-h-[calc(100dvh-176px)]"
    >
      <div className="relative flex items-start justify-between gap-3 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <div className="min-w-0">
          {editingTitle ? (
            <form onSubmit={submitRename}>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={submitRename}
                autoFocus
                className="w-full rounded-md border border-teal-500 bg-white px-2 py-1 text-sm font-bold text-zinc-950 outline-none ring-2 ring-teal-500/20 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </form>
          ) : (
            <h2
              {...attributes}
              {...listeners}
              className="cursor-grab touch-none truncate text-sm font-bold uppercase tracking-[0.08em] text-zinc-700 active:cursor-grabbing dark:text-zinc-200"
            >
              {list.title}
            </h2>
          )}
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {cardCountLabel} {totalCards === 1 ? 'card' : 'cards'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={`Open ${list.title} list menu`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-white hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-3 top-11 z-20 w-40 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl shadow-zinc-300/30 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-black/30">
            <button
              type="button"
              onClick={startRename}
              className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Rename list
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onListDelete(list)
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              Delete list
            </button>
          </div>
        )}
      </div>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto p-2">
          {cards.map((card) => (
            <SortableCard key={card._id} card={card} onOpen={onCardOpen} />
          ))}

          {cards.length === 0 && (
            <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-zinc-300 bg-white/60 px-3 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-500">
              {emptyMessage}
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
