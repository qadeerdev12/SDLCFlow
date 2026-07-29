import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTheme } from '../context/ThemeContext'

// Disable dnd-kit's layout-shift animation. Its post-drop measuring pass,
// if a state update (e.g. a rollback) lands during it, thrashes into an
// infinite update loop. We don't need the animation.
const noLayoutAnimation = () => false

// A single draggable card. `data.type` lets the board's drag handlers tell a
// card apart from a list, and `data.listId` tells them which column it's in.
export default function SortableCard({ card }) {
  const { dark } = useTheme()
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
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab touch-none rounded-lg p-3 text-sm active:cursor-grabbing ${dark ? 'bg-slate-700 text-slate-100' : 'bg-gray-50 border border-gray-100 text-gray-900'}`}
    >
      {card.title}
    </div>
  )
}
