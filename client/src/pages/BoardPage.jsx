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
    return <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-900 text-slate-400' : 'bg-gray-50 text-gray-500'}`}>Loading board...</div>
  }
  // Full-screen error only when the board never loaded. Transient errors (a
  // failed drag persist, etc.) show as an inline banner below so the board stays put.
  if (error && !board) {
    return <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-900 text-red-400' : 'bg-gray-50 text-red-600'}`}>{error}</div>
  }

  return (
    <div className={`min-h-screen p-6 ${dark ? 'bg-slate-900 text-slate-100' : 'bg-gray-50 text-gray-900'}`}>
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1">
            <Logo size="sm" />
          </button>
          <span className={`text-sm ${dark ? 'text-slate-600' : 'text-gray-300'}`}>/</span>
          <BoardSwitcher currentBoard={board} />
        </div>
        <div className="flex items-center gap-3">
          <form onSubmit={handleAddList} className="flex gap-2">
            <input
              value={newListTitle}
              onChange={(e) => setNewListTitle(e.target.value)}
              placeholder="+ Add a list"
              className={`px-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? 'bg-slate-800 border-slate-700 placeholder:text-slate-500' : 'bg-white border-gray-300 placeholder:text-gray-400'}`}
            />
            <button type="submit" className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white">
              Add
            </button>
          </form>
          <button onClick={toggle} className={`p-2 rounded-full ${dark ? 'bg-slate-700 text-yellow-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {error && <p className={`mb-3 text-sm ${dark ? 'text-red-400' : 'text-red-600'}`}>{error}</p>}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
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
            <p className={dark ? 'text-slate-400' : 'text-gray-500'}>This board has no lists yet.</p>
          )}
        </div>

        {/* No drop animation: its post-drop settling opens a window where a
            state change (e.g. a rollback) thrashes dnd-kit's rect measuring
            into an infinite update loop. */}
        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <div className={`rounded-lg p-3 text-sm shadow-lg ${dark ? 'bg-slate-700 text-slate-100' : 'bg-white border border-gray-200 text-gray-900'}`}>
              {activeCard.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
