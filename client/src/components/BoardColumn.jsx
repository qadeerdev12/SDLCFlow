import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTheme } from '../context/ThemeContext'
import SortableCard from './SortableCard'

// See SortableCard: disabling the layout-shift animation avoids dnd-kit's
// post-drop measuring loop when state updates land mid-transition.
const noLayoutAnimation = () => false

// A column = one List. The whole column is itself sortable (drag it by the
// header to reorder lists), and its body is a vertical SortableContext of the
// list's cards. An empty column still accepts card drops because useSortable
// registers the list's id as a droppable target.
export default function BoardColumn({ list, cards, draft, onDraftChange, onAddCard }) {
  const { dark } = useTheme()
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
    opacity: isDragging ? 0.5 : 1,
  }

  const cardIds = cards.map((c) => c._id)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-72 shrink-0 rounded-xl p-3 border ${dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}
    >
      {/* Drag handle for reordering lists: the header. */}
      <h2
        {...attributes}
        {...listeners}
        className={`mb-3 px-1 cursor-grab touch-none font-semibold active:cursor-grabbing ${dark ? 'text-slate-200' : 'text-gray-800'}`}
      >
        {list.title}
      </h2>

      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[8px] flex-col gap-2">
          {cards.map((card) => (
            <SortableCard key={card._id} card={card} />
          ))}
        </div>
      </SortableContext>

      {cards.length === 0 && (
        <p className={`px-1 text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>No cards yet.</p>
      )}

      <form onSubmit={(e) => onAddCard(e, list._id)} className="mt-2">
        <input
          value={draft || ''}
          onChange={(e) => onDraftChange(list._id, e.target.value)}
          placeholder="+ Add a card"
          className={`w-full rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? 'bg-slate-700/50 placeholder:text-slate-500' : 'bg-gray-100 placeholder:text-gray-400'}`}
        />
      </form>
    </div>
  )
}
