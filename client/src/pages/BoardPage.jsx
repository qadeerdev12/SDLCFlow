import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
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
import { useAuth } from '../context/useAuth'
import { useTheme } from '../context/useTheme'
import { useToast } from '../context/useToast'
import { boardApi } from '../lib/api'
import { useSocket } from '../hooks/useSocket'
import { positionBetween, positionForIndex } from '../lib/position'
import { CARD_STATUSES, CARD_TAGS } from '../lib/cardMeta'
import Logo from '../components/Logo'
import BoardSwitcher from '../components/BoardSwitcher'
import BoardColumn from '../components/BoardColumn'
import CardDetailModal from '../components/CardDetailModal'
import NewBoardModal from '../components/NewBoardModal'
import MembersPanel from '../components/MembersPanel'
import ActivityPanel from '../components/ActivityPanel'
import ChatPanel from '../components/ChatPanel'

function memberUserId(member) {
  return member.user?.id || member.user?._id || member.user
}

function BoardLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-stone-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-stone-50/90 dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div className="space-y-2">
              <div className="h-4 w-44 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-28 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/70" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-10 w-44 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      </header>

      <div className="mx-4 mt-4 h-[66px] animate-pulse rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />

      <div className="flex gap-4 overflow-hidden px-4 py-4">
        {Array.from({ length: 4 }).map((_, columnIndex) => (
          <div key={columnIndex} className="flex h-[480px] w-[min(84vw,320px)] shrink-0 flex-col rounded-lg border border-zinc-200 bg-zinc-100/70 p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:w-[310px]">
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800/70" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: columnIndex === 1 ? 2 : 3 }).map((_, cardIndex) => (
                <div key={cardIndex} className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex justify-between">
                    <div className="h-5 w-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
                    <div className="h-3 w-20 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                  </div>
                  <div className="mt-4 h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/70" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BoardLoadError({ message, onRetry, onBack }) {
  return (
    <div className="grid min-h-screen place-items-center bg-stone-50 px-4 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-xl shadow-red-900/5 dark:border-red-500/30 dark:bg-zinc-900 dark:shadow-black/20">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="mt-4 text-lg font-bold">Could not load this board</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" onClick={onRetry} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500">
            Try again
          </button>
          <button type="button" onClick={onBack} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800">
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

function BoardEmptyState({ boardName }) {
  return (
    <div className="grid min-h-[360px] w-full place-items-center rounded-lg border border-dashed border-zinc-300 bg-white px-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
      <div className="max-w-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16" />
            <path d="M4 12h10" />
            <path d="M4 18h7" />
          </svg>
        </div>
        <p className="mt-4 font-semibold text-zinc-900 dark:text-zinc-100">{boardName} is ready for its first workflow.</p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Create lists like Backlog, Next, In Progress, and Review from the top bar.</p>
      </div>
    </div>
  )
}

export default function BoardPage() {
  const { boardId } = useParams()
  const { user, token } = useAuth()
  const { dark, toggle } = useTheme()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [board, setBoard] = useState(null)
  const [lists, setLists] = useState([])              // ordered by position
  const [cardsByList, setCardsByList] = useState({})  // listId -> ordered cards
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newListTitle, setNewListTitle] = useState('')
  const [cardDrafts, setCardDrafts] = useState({})
  const [activeCard, setActiveCard] = useState(null)  // card being dragged (for overlay)
  const [selectedCard, setSelectedCard] = useState(null)
  const [editingBoard, setEditingBoard] = useState(false)
  const [managingMembers, setManagingMembers] = useState(false)
  const [presence, setPresence] = useState([])
  const [members, setMembers] = useState([])
  const [activities, setActivities] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [messages, setMessages] = useState([])
  const [messagesLoaded, setMessagesLoaded] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState('')
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [cardSearch, setCardSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const currentRole = members.find((m) => String(memberUserId(m)) === String(user?.id))?.role
  const canEditBoard = ['owner', 'admin'].includes(currentRole)
  const canDeleteBoard = currentRole === 'owner'
  const { connected, connectionError, emitWithAck, onSocketEvent } = useSocket(token)

  const totalCardCount = useMemo(
    () => Object.values(cardsByList).reduce((sum, cards) => sum + cards.length, 0),
    [cardsByList]
  )
  const filtersActive = Boolean(cardSearch.trim()) || tagFilter !== 'all' || statusFilter !== 'all'
  const activityPanelOpen = searchParams.get('panel') === 'activity'
  const chatPanelOpen = searchParams.get('panel') === 'chat'
  const visibleCardsByList = useMemo(() => {
    const query = cardSearch.trim().toLowerCase()
    const next = {}

    for (const listId in cardsByList) {
      next[listId] = cardsByList[listId].filter((card) => {
        const titleAndDescription = `${card.title || ''} ${card.description || ''}`.toLowerCase()
        const matchesSearch = !query || titleAndDescription.includes(query)
        const matchesTag = tagFilter === 'all' || (card.tag || 'Task') === tagFilter
        const matchesStatus = statusFilter === 'all' || (card.status || 'Todo') === statusFilter
        return matchesSearch && matchesTag && matchesStatus
      })
    }

    return next
  }, [cardsByList, cardSearch, tagFilter, statusFilter])
  const filteredCardCount = useMemo(
    () => Object.values(visibleCardsByList).reduce((sum, cards) => sum + cards.length, 0),
    [visibleCardsByList]
  )

  // Refs mirror state so drag handlers always read the freshest value even
  // across the re-renders that onDragOver triggers mid-drag.
  const listsRef = useRef(lists)
  const cardsRef = useRef(cardsByList)
  useEffect(() => { listsRef.current = lists }, [lists])
  useEffect(() => { cardsRef.current = cardsByList }, [cardsByList])

  // Snapshot taken at drag start so a failed persist (or a drop outside) can roll back.
  const snapshotRef = useRef(null)
  const dragOriginRef = useRef(null)
  const wasConnectedRef = useRef(false)
  const connectionInitializedRef = useRef(false)

  const sensors = useSensors(
    // A small distance threshold means a plain click won't start a drag —
    // leaves room for a future "open card" click handler.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const loadBoard = useCallback(async ({ keepLoading = false } = {}) => {
    try {
      if (!keepLoading) setLoading(true)
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
      setMembers(res.data.board.members || [])
      setLists(sortedLists)
      setCardsByList(byList)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [boardId, token])

  const loadActivities = useCallback(async () => {
    try {
      setActivityLoading(true)
      setActivityError('')
      const res = await boardApi.getActivities(boardId, token)
      setActivities(res.data.activities || [])
    } catch (err) {
      setActivityError(err.message)
    } finally {
      setActivityLoading(false)
    }
  }, [boardId, token])

  const loadMessages = useCallback(async () => {
    try {
      setMessagesLoading(true)
      setMessagesError('')
      const res = await boardApi.getMessages(boardId, token)
      setMessages(res.data.messages || [])
      setMessagesLoaded(true)
    } catch (err) {
      setMessagesError(err.message)
    } finally {
      setMessagesLoading(false)
    }
  }, [boardId, token])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadBoard()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadBoard])

  useEffect(() => {
    if (!board) return undefined
    const timer = setTimeout(() => {
      loadActivities()
    }, 0)
    return () => clearTimeout(timer)
  }, [board, loadActivities])

  useEffect(() => {
    if (!board || !chatPanelOpen || messagesLoaded) return undefined
    const timer = setTimeout(() => {
      loadMessages()
    }, 0)
    return () => clearTimeout(timer)
  }, [board, chatPanelOpen, loadMessages, messagesLoaded])

  useEffect(() => {
    const timer = setTimeout(() => {
      setMessages([])
      setMessagesLoaded(false)
      setMessagesLoading(false)
      setMessagesError('')
      setUnreadMessages(0)
    }, 0)
    return () => clearTimeout(timer)
  }, [boardId])

  useEffect(() => {
    if (!chatPanelOpen) return undefined
    const timer = setTimeout(() => {
      setUnreadMessages(0)
    }, 0)
    return () => clearTimeout(timer)
  }, [chatPanelOpen])

  useEffect(() => {
    if (!connected || !boardId) return undefined
    let cancelled = false

    // Connection auth proves the JWT is valid. Joining still checks membership
    // for this specific board before the server places the socket in its room.
    emitWithAck('board:join', { boardId })
      .then((data) => {
        if (!cancelled) setPresence(data.presence || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    // Reconnects can miss events while offline, so reload the full board
    // snapshot after joining. Incoming events keep the snapshot fresh after that.
    const timer = setTimeout(() => {
      loadBoard({ keepLoading: true })
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [boardId, connected, emitWithAck, loadBoard])

  useEffect(() => {
    if (!connectionInitializedRef.current) {
      connectionInitializedRef.current = true
      wasConnectedRef.current = connected
      return
    }

    if (connected) {
      if (wasConnectedRef.current === false) toast.success('Realtime reconnected', 'Live board updates are active again.')
      wasConnectedRef.current = true
      return
    }

    if (wasConnectedRef.current && connectionError) {
      toast.error('Realtime disconnected', 'Changes will still save through REST when possible.')
      wasConnectedRef.current = false
    }
  }, [connected, connectionError, toast])

  useEffect(() => {
    if (!connected) return undefined

    // Each handler guards on boardId. A socket can reconnect or the user can
    // navigate between boards, and stale events should never mutate this view.
    function onPresenceUpdate(payload) {
      if (payload.boardId === boardId) setPresence(payload.users || [])
    }

    function onCardCreated(payload) {
      if (payload.boardId !== boardId) return
      setCardsByList((prev) => ({
        ...prev,
        [payload.card.list]: [...(prev[payload.card.list] || []), payload.card].sort((a, b) => a.position - b.position),
      }))
    }

    function onCardChanged(payload) {
      if (payload.boardId !== boardId) return
      replaceCard(payload.card)
    }

    function onCardDeleted(payload) {
      if (payload.boardId !== boardId) return
      setCardsByList((prev) => {
        const next = {}
        for (const listId in prev) next[listId] = prev[listId].filter((card) => card._id !== payload.cardId)
        return next
      })
      setSelectedCard((current) => (current?._id === payload.cardId ? null : current))
    }

    function onListCreated(payload) {
      if (payload.boardId !== boardId) return
      setLists((prev) => [...prev, payload.list].sort((a, b) => a.position - b.position))
      setCardsByList((prev) => ({ ...prev, [payload.list._id]: prev[payload.list._id] || [] }))
    }

    function onListChanged(payload) {
      if (payload.boardId !== boardId) return
      setLists((prev) => prev.map((list) => (list._id === payload.list._id ? payload.list : list)).sort((a, b) => a.position - b.position))
    }

    function onListDeleted(payload) {
      if (payload.boardId !== boardId) return
      setLists((prev) => prev.filter((list) => list._id !== payload.listId))
      setCardsByList((prev) => {
        const next = { ...prev }
        delete next[payload.listId]
        return next
      })
      setSelectedCard((current) => (current?.list === payload.listId ? null : current))
    }

    function onMembersUpdated(payload) {
      if (payload.boardId !== boardId) return
      const stillMember = payload.members?.some((member) => String(memberUserId(member)) === String(user?.id))
      if (!stillMember) {
        navigate('/dashboard')
        return
      }

      setMembers(payload.members || [])
      setBoard((current) => current ? { ...current, members: payload.members || [] } : current)
    }

    function onActivityCreated(payload) {
      if (payload.boardId !== boardId) return
      prependActivity(payload.activity)
    }

    function onMessageCreated(payload) {
      if (payload.boardId !== boardId) return
      appendMessage(payload.message)
      if (!chatPanelOpen) setUnreadMessages((count) => Math.min(count + 1, 99))
    }

    const cleanups = [
      onSocketEvent('presence:update', onPresenceUpdate),
      onSocketEvent('card:created', onCardCreated),
      onSocketEvent('card:updated', onCardChanged),
      onSocketEvent('card:moved', onCardChanged),
      onSocketEvent('card:deleted', onCardDeleted),
      onSocketEvent('list:created', onListCreated),
      onSocketEvent('list:updated', onListChanged),
      onSocketEvent('list:moved', onListChanged),
      onSocketEvent('list:deleted', onListDeleted),
      onSocketEvent('members:updated', onMembersUpdated),
      onSocketEvent('activity:created', onActivityCreated),
      onSocketEvent('message:created', onMessageCreated),
    ]

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [boardId, chatPanelOpen, connected, navigate, onSocketEvent, user?.id])

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

  // Prefer Socket.IO writes so collaborators receive live updates. REST keeps
  // the board usable if the socket drops while the API is still reachable.
  async function realtimeOrRest(eventName, payload, restCall) {
    if (connected) return emitWithAck(eventName, payload)
    return restCall()
  }

  function replaceCard(updatedCard) {
    setCardsByList((prev) => {
      const next = {}
      for (const listId in prev) {
        next[listId] = prev[listId].filter((card) => card._id !== updatedCard._id)
      }
      next[updatedCard.list] = [...(next[updatedCard.list] || []), updatedCard].sort((a, b) => a.position - b.position)
      return next
    })
    setSelectedCard((current) => (current?._id === updatedCard._id ? updatedCard : current))
  }

  function removeCard(card) {
    setCardsByList((prev) => ({
      ...prev,
      [card.list]: (prev[card.list] || []).filter((c) => c._id !== card._id),
    }))
  }

  function prependActivity(activity) {
    if (!activity?._id) return
    setActivities((prev) => {
      if (prev.some((item) => item._id === activity._id)) return prev
      return [activity, ...prev].slice(0, 30)
    })
  }

  function appendMessage(message) {
    if (!message?._id) return
    setMessages((prev) => {
      if (prev.some((item) => item._id === message._id)) return prev
      return [...prev, message].slice(-100)
    })
  }

  function closeActivityPanel() {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.delete('panel')
      return next
    })
  }

  function openPanel(panel) {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.set('panel', panel)
      return next
    })
  }

  function openChatPanel() {
    setUnreadMessages(0)
    openPanel('chat')
  }

  function closeChatPanel() {
    setSearchParams((params) => {
      const next = new URLSearchParams(params)
      next.delete('panel')
      return next
    })
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
      const data = await realtimeOrRest(
        'card:create',
        { boardId, title, listId, position },
        async () => (await boardApi.createCard(boardId, title, listId, position, token)).data
      )
      setCardsByList((prev) => ({ ...prev, [listId]: [...(prev[listId] || []), data.card] }))
      prependActivity(data.activity)
      setDraftForList(listId, '')
      toast.success('Card created', title)
    } catch (err) {
      setError(err.message)
      toast.error('Could not create card', err.message)
    }
  }

  async function handleAddList(e) {
    e.preventDefault()
    if (!newListTitle.trim()) return
    try {
      const last = lists[lists.length - 1]
      const position = positionBetween(last?.position, undefined)
      const data = await realtimeOrRest(
        'list:create',
        { boardId, title: newListTitle, position },
        async () => (await boardApi.createList(boardId, newListTitle, position, token)).data
      )
      setLists([...lists, data.list])
      setCardsByList((prev) => ({ ...prev, [data.list._id]: [] }))
      prependActivity(data.activity)
      setNewListTitle('')
      toast.success('List created', data.list.title)
    } catch (err) {
      setError(err.message)
      toast.error('Could not create list', err.message)
    }
  }

  async function handleUpdateCard(card, updates) {
    const fromListId = card.list
    const toListId = updates.list || fromListId
    const payload = { ...updates }

    if (toListId !== fromListId) {
      const targetCards = (cardsRef.current[toListId] || []).filter((c) => c._id !== card._id)
      const last = targetCards[targetCards.length - 1]
      payload.position = positionBetween(last?.position, undefined)
    }

    const data = await realtimeOrRest(
      'card:update',
      { boardId, cardId: card._id, updates: payload },
      async () => (await boardApi.updateCard(boardId, card._id, payload, token)).data
    )
    replaceCard(data.card)
    prependActivity(data.activity)
    toast.success('Card saved', data.card.title)
  }

  async function handleDeleteCard(card) {
    const data = await realtimeOrRest(
      'card:delete',
      { boardId, cardId: card._id },
      async () => (await boardApi.deleteCard(boardId, card._id, token)).data
    )
    removeCard(card)
    prependActivity(data.activity)
    toast.success('Card deleted', card.title)
  }

  async function handleRenameList(list, title) {
    if (title === list.title) return
    try {
      const data = await realtimeOrRest(
        'list:update',
        { boardId, listId: list._id, updates: { title } },
        async () => (await boardApi.updateList(boardId, list._id, { title }, token)).data
      )
      setLists((prev) => prev.map((l) => (l._id === list._id ? data.list : l)))
      prependActivity(data.activity)
      toast.success('List renamed', data.list.title)
    } catch (err) {
      setError(err.message)
      toast.error('Could not rename list', err.message)
    }
  }

  async function handleDeleteList(list) {
    const count = cardsRef.current[list._id]?.length || 0
    const suffix = count ? ` and ${count} ${count === 1 ? 'card' : 'cards'}` : ''
    const confirmed = window.confirm(`Delete "${list.title}"${suffix}?`)
    if (!confirmed) return

    try {
      const data = await realtimeOrRest(
        'list:delete',
        { boardId, listId: list._id },
        async () => (await boardApi.deleteList(boardId, list._id, token)).data
      )
      setLists((prev) => prev.filter((l) => l._id !== list._id))
      setCardsByList((prev) => {
        const next = { ...prev }
        delete next[list._id]
        return next
      })
      prependActivity(data.activity)
      toast.success('List deleted', list.title)
    } catch (err) {
      setError(err.message)
      toast.error('Could not delete list', err.message)
    }
  }

  async function handleUpdateBoard(name, options) {
    const res = await boardApi.update(boardId, { name, ...options }, token)
    setBoard(res.data.board)
    prependActivity(res.data.activity)
    toast.success('Board updated', res.data.board.name)
  }

  async function handleDeleteBoard() {
    const confirmed = window.confirm(`Delete "${board.name}" and all of its lists and cards?`)
    if (!confirmed) return

    try {
      await boardApi.delete(boardId, token)
      toast.success('Board deleted', board.name)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
      toast.error('Could not delete board', err.message)
    }
  }

  async function handleAddMember(email, role) {
    const res = await boardApi.addMember(boardId, email, role, token)
    setMembers(res.data.members)
    setBoard((current) => current ? { ...current, members: res.data.members } : current)
    prependActivity(res.data.activity)
    toast.success('Member added', email)
  }

  async function handleChangeMemberRole(memberId, role) {
    const res = await boardApi.updateMemberRole(boardId, memberId, role, token)
    setMembers(res.data.members)
    setBoard((current) => current ? { ...current, members: res.data.members } : current)
    prependActivity(res.data.activity)
    toast.success('Member role updated', role)
  }

  async function handleRemoveMember(memberId) {
    const res = await boardApi.removeMember(boardId, memberId, token)
    setMembers(res.data.members)
    setBoard((current) => current ? { ...current, members: res.data.members } : current)
    prependActivity(res.data.activity)
    toast.success('Member removed')
  }

  async function handleSendMessage(body) {
    try {
      const data = await realtimeOrRest(
        'message:create',
        { boardId, body },
        async () => (await boardApi.createMessage(boardId, body, token)).data
      )
      appendMessage(data.message)
    } catch (err) {
      setMessagesError(err.message)
      toast.error('Could not send message', err.message)
      throw err
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

    realtimeOrRest(
      'list:move',
      { boardId, listId: active.id, position },
      async () => (await boardApi.updateList(boardId, active.id, { position }, token)).data
    )
      .then((data) => prependActivity(data.activity))
      .catch(() => {
        rollback('Could not save list order — reverted.')
        toast.error('Could not save list order', 'The list was moved back.')
      })
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

    realtimeOrRest(
      'card:move',
      { boardId, cardId: activeId, position, list: container },
      async () => (await boardApi.updateCard(boardId, activeId, { position, list: container }, token)).data
    )
      .then((data) => prependActivity(data.activity))
      .catch(() => {
        rollback('Could not save card move — reverted.')
        toast.error('Could not move card', 'The card was moved back.')
      })
  }

  // --- render --------------------------------------------------------------

  if (loading) {
    return <BoardLoadingSkeleton />
  }
  // Full-screen error only when the board never loaded. Transient errors (a
  // failed drag persist, etc.) show as an inline banner below so the board stays put.
  if (error && !board) {
    return (
      <BoardLoadError
        message={error}
        onRetry={() => loadBoard()}
        onBack={() => navigate('/dashboard')}
      />
    )
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
              <div className="mt-1 hidden items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:flex">
                <span>
                  {lists.length} lists · {filtersActive ? `${filteredCardCount} of ${totalCardCount}` : totalCardCount} cards
                </span>
                <span>·</span>
                <span className={`inline-flex items-center gap-1.5 ${connected ? 'text-teal-700 dark:text-teal-300' : 'text-zinc-500 dark:text-zinc-400'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-teal-500' : 'bg-zinc-400'}`} />
                  {connected ? `${presence.length || 1} online` : 'offline'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => setManagingMembers(true)}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <div className="flex -space-x-1">
                {members.slice(0, 3).map((member) => (
                  <span key={memberUserId(member)} className="grid h-5 w-5 place-items-center rounded-full border border-white bg-zinc-950 text-[9px] font-bold text-white dark:border-zinc-900 dark:bg-white dark:text-zinc-950">
                    {(member.user?.name || member.user?.email || '?')[0]?.toUpperCase()}
                  </span>
                ))}
              </div>
              Members
            </button>
            <Link
              to={`/boards/${boardId}/activity`}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 12h4l3 8 4-16 3 8h4" />
              </svg>
              Activity
            </Link>
            <button
              type="button"
              onClick={openChatPanel}
              className="relative inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
              </svg>
              Chat
              {unreadMessages > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
            </button>
            {(canEditBoard || canDeleteBoard) && (
              <div className="col-span-2 grid grid-cols-[1fr_auto] gap-2 sm:flex">
                {canEditBoard && (
                  <button
                    type="button"
                    onClick={() => setEditingBoard(true)}
                    className="inline-flex min-w-0 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    Edit
                  </button>
                )}
                {canDeleteBoard && (
                  <button
                    type="button"
                    onClick={handleDeleteBoard}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-500/10"
                    aria-label="Delete board"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <form onSubmit={handleAddList} className="col-span-2 flex min-w-0 gap-2 sm:w-auto">
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
              className="col-span-2 grid h-10 w-full place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:col-span-1 sm:w-10"
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

      <section className="mx-4 mt-4 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search cards</span>
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={cardSearch}
            onChange={(e) => setCardSearch(e.target.value)}
            placeholder="Search title or description"
            className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:placeholder:text-zinc-500 dark:focus:bg-zinc-950"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <label>
            <span className="sr-only">Filter by tag</span>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-700 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:bg-zinc-950 sm:w-36"
            >
              <option value="all">All tags</option>
              {CARD_TAGS.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium text-zinc-700 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:bg-zinc-950 sm:w-40"
            >
              <option value="all">All statuses</option>
              {CARD_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 md:justify-end">
          <span className="whitespace-nowrap text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {filtersActive ? `${filteredCardCount} of ${totalCardCount} shown` : `${totalCardCount} total cards`}
          </span>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setCardSearch('')
                setTagFilter('all')
                setStatusFilter('all')
              }}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {connectionError && !connected && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <span>Realtime is offline: {connectionError}. Changes will use REST where possible.</span>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="grid h-6 w-6 shrink-0 place-items-center rounded-md hover:bg-red-100 dark:hover:bg-red-500/10" aria-label="Dismiss error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex min-h-[calc(100dvh-238px)] gap-4 overflow-x-auto px-4 py-4 sm:min-h-[calc(100dvh-204px)] lg:min-h-[calc(100dvh-164px)]">
          <SortableContext items={lists.map((l) => l._id)} strategy={horizontalListSortingStrategy}>
            {lists.map((list) => (
              <BoardColumn
                key={list._id}
                list={list}
                cards={visibleCardsByList[list._id] || []}
                totalCards={(cardsByList[list._id] || []).length}
                filtersActive={filtersActive}
                draft={cardDrafts[list._id]}
                onDraftChange={setDraftForList}
                onAddCard={handleAddCard}
                onCardOpen={setSelectedCard}
                onListRename={handleRenameList}
                onListDelete={handleDeleteList}
              />
            ))}
          </SortableContext>

          {lists.length === 0 && (
            <BoardEmptyState boardName={board.name} />
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

      {selectedCard && (
        <CardDetailModal
          boardId={boardId}
          card={selectedCard}
          lists={lists}
          members={members}
          token={token}
          connected={connected}
          emitWithAck={emitWithAck}
          onSocketEvent={onSocketEvent}
          onActivity={prependActivity}
          onToast={toast}
          onClose={() => setSelectedCard(null)}
          onSave={handleUpdateCard}
          onDelete={handleDeleteCard}
        />
      )}

      {editingBoard && (
        <NewBoardModal
          board={board}
          onClose={() => setEditingBoard(false)}
          onCreate={handleUpdateBoard}
        />
      )}

      {managingMembers && (
        <MembersPanel
          board={board}
          members={members}
          presence={presence}
          currentUserId={user?.id}
          currentRole={currentRole}
          onClose={() => setManagingMembers(false)}
          onAddMember={handleAddMember}
          onChangeRole={handleChangeMemberRole}
          onRemoveMember={handleRemoveMember}
        />
      )}

      {activityPanelOpen && (
        <ActivityPanel
          board={board}
          activities={activities}
          loading={activityLoading}
          error={activityError}
          onRetry={loadActivities}
          onClose={closeActivityPanel}
        />
      )}

      {chatPanelOpen && (
        <ChatPanel
          board={board}
          messages={messages}
          loading={messagesLoading}
          error={messagesError}
          currentUserId={user?.id}
          connected={connected}
          onRetry={loadMessages}
          onClose={closeChatPanel}
          onSendMessage={handleSendMessage}
        />
      )}
    </div>
  )
}
