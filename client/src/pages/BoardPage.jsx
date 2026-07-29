import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { boardApi } from '../lib/api'
import Logo from '../components/Logo'
import BoardSwitcher from '../components/BoardSwitcher'

export default function BoardPage() {
    const { boardId } = useParams()
    const { token } = useAuth()
    const { dark, toggle } = useTheme()
    const navigate = useNavigate()

    const [board, setBoard] = useState(null)
    const [lists, setLists] = useState([])
    const [cards, setCards] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [newListTitle, setNewListTitle] = useState('')
    const [cardDrafts, setCardDrafts] = useState({})

    useEffect(() => {
        async function loadBoard() {
            try {
                const res = await boardApi.getOne(boardId, token)
                setBoard(res.data.board)
                setLists(res.data.lists)
                setCards(res.data.cards)
            } catch (err) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        loadBoard()
    }, [boardId, token])

    function cardsForList(listId) {
        return cards
            .filter((c) => c.list === listId)
            .sort((a, b) => a.position - b.position)
    }

    function setDraftForList(listId, value) {
        setCardDrafts((prev) => ({ ...prev, [listId]: value }))
    }

    async function handleAddCard(e, listId) {
        e.preventDefault()
        const title = (cardDrafts[listId] || '').trim()
        if (!title) return
        try {
            const listCards = cards.filter((c) => c.list === listId)
            const position = (listCards.length + 1) * 1000
            const res = await boardApi.createCard(boardId, title, listId, position, token)
            setCards([...cards, res.data.card])
            setDraftForList(listId, '')
        } catch (err) {
            setError(err.message)
        }
    }

    async function handleAddList(e) {
        e.preventDefault()
        if (!newListTitle.trim()) return
        try {
            const position = (lists.length + 1) * 1000
            const res = await boardApi.createList(boardId, newListTitle, position, token)
            setLists([...lists, res.data.list])
            setNewListTitle('')
        } catch (err) {
            setError(err.message)
        }
    }

    if (loading) {
        return <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-900 text-slate-400' : 'bg-gray-50 text-gray-500'}`}>Loading board...</div>
    }
    if (error) {
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

            <div className="flex flex-wrap gap-4 pb-4">
                {lists.map((list) => (
                    <div key={list._id} className={`w-72 rounded-xl p-3 border ${dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                        <h2 className={`font-semibold mb-3 px-1 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{list.title}</h2>

                        <div className="flex flex-col gap-2">
                            {cardsForList(list._id).map((card) => (
                                <div key={card._id} className={`rounded-lg p-3 text-sm ${dark ? 'bg-slate-700' : 'bg-gray-50 border border-gray-100'}`}>
                                    {card.title}
                                </div>
                            ))}
                        </div>

                        {cardsForList(list._id).length === 0 && (
                            <p className={`text-xs px-1 ${dark ? 'text-slate-500' : 'text-gray-400'}`}>No cards yet.</p>
                        )}

                        <form onSubmit={(e) => handleAddCard(e, list._id)} className="mt-2">
                            <input
                                value={cardDrafts[list._id] || ''}
                                onChange={(e) => setDraftForList(list._id, e.target.value)}
                                placeholder="+ Add a card"
                                className={`w-full px-2 py-1.5 rounded text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? 'bg-slate-700/50 placeholder:text-slate-500' : 'bg-gray-100 placeholder:text-gray-400'}`}
                            />
                        </form>
                    </div>
                ))}

                {lists.length === 0 && (
                    <p className={dark ? 'text-slate-400' : 'text-gray-500'}>This board has no lists yet.</p>
                )}
            </div>
        </div>
    )
}
