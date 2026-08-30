import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { boardApi } from '../lib/api'
import { positionBetween, positionForIndex } from '../lib/position'
import Logo from '../components/Logo'
import BoardSwitcher from '../components/BoardSwitcher'
import BoardColumn from '../components/BoardColumn'

export default function BoardPage() {
  const { boardId } = useParams()
  const { token } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()

  const [board, setBoard] = useState(null)
  const [lists, setLists] = useState([])              // ordered by position
  const [cardsByList, setCardsByList] = useState({})  // listId -> ordered cards
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newListTitle, setNewListTitle] = useState('')
  const [cardDrafts, setCardDrafts] = useState({})
  const [activeCard, setActiveCard] = useState(null)  // card being dragged (for overlay)

  // Refs mirror state so drag handlers always read the freshest value even
  // across the re-renders that onDragOver triggers mid-drag.
  const listsRef = useRef(lists)
  const cardsRef = useRef(cardsByList)
  useEffect(() => { listsRef.current = lists }, [lists])
  useEffect(() => { cardsRef.current = cardsByList }, [cardsByList])

  // Snapshot taken at drag start so a failed persist (or a drop outside) can roll back.
  const snapshotRef = useRef(null)
  const dragOriginRef = useRef(null)

  const sensors = useSensors(
    // A small distance threshold means a plain click won't start a drag —
    // leaves room for a future "open card" click handler.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  useEffect(() => {
    async function loadBoard() {
      try {
        const res = await boardApi.getOne(boardId, token)
        const sortedLists = [...res.data.lists].sort((a, b) => a.position - b.position)
        const byList = {}
        for (const l of sortedLists) byList[l._id] = []
        for (const c of res.data.cards) {
          if (!byList[c.list]) byList[c.list] = []
          byList[c.list].push(c)
        }
        for (const id in byList) byList[id].sort((a, b) => a.position - b.position)
        setBoard(res.data.board)
        setLists(sortedLists)
        setCardsByList(byList)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadBoard()
  }, [boardId, token])

  // --- helpers -------------------------------------------------------------

  function findCardListId(cardId) {
    const map = cardsRef.current
    for (const listId in map) {
      if (map[listId].some((c) => c._id === cardId)) return listId
    }
    return null
  }

  function takeSnapshot() {
    const map = cardsRef.current
    const copy = {}
    for (const id in map) copy[id] = [...map[id]]
    snapshotRef.current = { lists: [...listsRef.current], cardsByList: copy }
  }

  function rollback(message) {
    if (snapshotRef.current) {
      setLists(snapshotRef.current.lists)
      setCardsByList(snapshotRef.current.cardsByList)
    }
    if (message) setError(message)
  }

  function setDraftForList(listId, value) {
    setCardDrafts((prev) => ({ ...prev, [listId]: value }))
  }

  // --- add list / card -----------------------------------------------------

  async function handleAddCard(e, listId) {
    e.preventDefault()
    const title = (cardDrafts[listId] || '').trim()
    if (!title) return
    try {
      const listCards = cardsByList[listId] || []
      const last = listCards[listCards.length - 1]
      const position = positionBetween(last?.position, undefined)
      const res = await boardApi.createCard(boardId, title, listId, position, token)
      setCardsByList((prev) => ({ ...prev, [listId]: [...(prev[listId] || []), res.data.card] }))
      setDraftForList(listId, '')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAddList(e) {
    e.preventDefault()
    if (!newListTitle.trim()) return
    try {
      const last = lists[lists.length - 1]
      const position = positionBetween(last?.position, undefined)
      const res = await boardApi.createList(boardId, newListTitle, position, token)
      setLists([...lists, res.data.list])
      setCardsByList((prev) => ({ ...prev, [res.data.list._id]: [] }))
      setNewListTitle('')
    } catch (err) {
      setError(err.message)
    }
  }

  // --- drag & drop ---------------------------------------------------------

  function handleDragStart(event) {
    const { active } = event
    setError('')
    takeSnapshot()
    if (active.data.current?.type === 'card') {
      const listId = findCardListId(active.id)
      const card = cardsRef.current[listId]?.find((c) => c._id === active.id)
      setActiveCard(card || null)
      dragOriginRef.current = { type: 'card', listId, index: cardsRef.current[listId]?.findIndex((c) => c._id === active.id) }
    } else {
      dragOriginRef.current = { type: 'list', index: listsRef.current.findIndex((l) => l._id === active.id) }
    }
  }

  // Live-move a card into another column as it's dragged over it.
  function handleDragOver(event) {
    const { active, over } = event
    if (!over || active.data.current?.type !== 'card') return

    const activeId = active.id
    const fromList = findCardListId(activeId)
    const overType = over.data.current?.type
    const toList = overType === 'card' ? (over.data.current.listId ?? findCardListId(over.id)) : over.id
    if (!fromList || !toList || fromList === toList) return

    setCardsByList((prev) => {
      const fromArr = [...(prev[fromList] || [])]
      const toArr = [...(prev[toList] || [])]
      const movingIdx = fromArr.findIndex((c) => c._id === activeId)
      if (movingIdx === -1) return prev
      const [moving] = fromArr.splice(movingIdx, 1)
      const moved = { ...moving, list: toList }
      let insertAt = toArr.length
      if (overType === 'card') {
        const overIdx = toArr.findIndex((c) => c._id === over.id)
        insertAt = overIdx === -1 ? toArr.length : overIdx
      }
      toArr.splice(insertAt, 0, moved)
      return { ...prev, [fromList]: fromArr, [toList]: toArr }
    })
  }

  function handleDragEnd(event) {
    const { active, over } = event
    setActiveCard(null)

    // Dropped outside any target — undo the live moves from onDragOver.
    if (!over) {
      rollback()
      return
    }

    if (active.data.current?.type === 'list') {
      finishListDrag(active, over)
    } else {
      finishCardDrag(active, over)
    }
  }

  function finishListDrag(active, over) {
    const current = listsRef.current
    const oldIndex = current.findIndex((l) => l._id === active.id)
    const newIndex = current.findIndex((l) => l._id === over.id)
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

    const reordered = arrayMove(current, oldIndex, newIndex)
    const position = positionForIndex(reordered, newIndex)
    const withPos = reordered.map((l) => (l._id === active.id ? { ...l, position } : l))
    setLists(withPos)

    boardApi
      .updateList(boardId, active.id, { position }, token)
      .catch(() => rollback('Could not save list order — reverted.'))
  }

  function finishCardDrag(active, over) {
    const activeId = active.id
    const container = findCardListId(activeId)
    if (!container) return

    const arr = [...cardsRef.current[container]]
    const oldIndex = arr.findIndex((c) => c._id === activeId)
    let newIndex = oldIndex
    if (over.data.current?.type === 'card') {
      const overIdx = arr.findIndex((c) => c._id === over.id)
      if (overIdx !== -1) newIndex = overIdx
    }

    const origin = dragOriginRef.current
    const unchanged = origin?.type === 'card' && origin.listId === container && origin.index === newIndex
    if (unchanged) return  // nothing actually moved — skip the write

    const finalArr = oldIndex === newIndex ? arr : arrayMove(arr, oldIndex, newIndex)
    const finalIndex = finalArr.findIndex((c) => c._id === activeId)
    const position = positionForIndex(finalArr, finalIndex)
    const withPos = finalArr.map((c) => (c._id === activeId ? { ...c, list: container, position } : c))
    setCardsByList((prev) => ({ ...prev, [container]: withPos }))

    boardApi
      .updateCard(boardId, activeId, { position, list: container }, token)
      .catch(() => rollback('Could not save card move — reverted.'))
  }

  // --- render --------------------------------------------------------------

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-stone-50 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">Loading board...</div>
  }
  // Full-screen error only when the board never loaded. Transient errors (a
  // failed drag persist, etc.) show as an inline banner below so the board stays put.
  if (error && !board) {
    return <div className="flex min-h-screen items-center justify-center bg-stone-50 text-red-600 dark:bg-zinc-950 dark:text-red-300">{error}</div>
  }

  return (
    <div className="min-h-screen bg-stone-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-stone-50/90 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
              <Logo size="sm" />
            </button>
            <span className="hidden text-zinc-300 dark:text-zinc-700 sm:block">/</span>
            <div className="min-w-0">
              <BoardSwitcher currentBoard={board} />
              <p className="mt-1 hidden text-xs text-zinc-500 dark:text-zinc-400 sm:block">
                {lists.length} lists · {Object.values(cardsByList).reduce((sum, cards) => sum + cards.length, 0)} cards · realtime workspace
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <form onSubmit={handleAddList} className="flex min-w-0 gap-2">
              <input
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder="Add a workflow list"
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 sm:w-56 dark:border-zinc-800 dark:bg-zinc-900 dark:placeholder:text-zinc-500"
              />
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-600/20 hover:bg-teal-500">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add
              </button>
            </form>
            <button
              onClick={toggle}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="grid h-10 w-10 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {dark ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <p className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-[calc(100vh-112px)] gap-4 overflow-x-auto px-4 py-4">
          <SortableContext items={lists.map((l) => l._id)} strategy={horizontalListSortingStrategy}>
            {lists.map((list) => (
              <BoardColumn
                key={list._id}
                list={list}
                cards={cardsByList[list._id] || []}
                draft={cardDrafts[list._id]}
                onDraftChange={setDraftForList}
                onAddCard={handleAddCard}
              />
            ))}
          </SortableContext>

          {lists.length === 0 && (
            <div className="grid min-h-[360px] w-full place-items-center rounded-lg border border-dashed border-zinc-300 bg-white text-center dark:border-zinc-800 dark:bg-zinc-900">
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">This board has no lists yet.</p>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Add Backlog, Next, In Progress, Review, or whatever matches your flow.</p>
              </div>
            </div>
          )}
        </div>

        {/* No drop animation: its post-drop settling opens a window where a
            state change (e.g. a rollback) thrashes dnd-kit's rect measuring
            into an infinite update loop. */}
        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <div className="rounded-lg border border-teal-200 bg-white p-3 text-sm text-zinc-950 shadow-xl shadow-teal-700/15 dark:border-teal-500/30 dark:bg-zinc-900 dark:text-zinc-100">
              {activeCard.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
