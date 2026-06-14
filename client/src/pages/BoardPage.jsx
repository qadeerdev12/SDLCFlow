import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { boardApi } from '../lib/api'

export default function BoardPage() {
  const { boardId } = useParams()      // grabs :boardId from the URL
  const { token } = useAuth()
  const navigate = useNavigate()

  const [board, setBoard] = useState(null)
  const [lists, setLists] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  // Helper: get the cards belonging to a given list, in position order.
  function cardsForList(listId) {
    return cards
      .filter((c) => c.list === listId)
      .sort((a, b) => a.position - b.position)
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading board...</div>
  }
  if (error) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-red-400">{error}</div>
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6">
      <header className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-slate-200 text-sm">
          ← Boards
        </button>
        <h1 className="text-xl font-bold text-indigo-400">{board?.name}</h1>
      </header>

      {/* Columns: horizontal row of lists */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {lists.map((list) => (
          <div key={list._id} className="w-72 shrink-0 bg-slate-800 rounded-xl p-3">
            <h2 className="font-semibold text-slate-200 mb-3 px-1">{list.title}</h2>

            {/* Cards in this list */}
            <div className="flex flex-col gap-2">
              {cardsForList(list._id).map((card) => (
                <div key={card._id} className="bg-slate-700 rounded-lg p-3 text-sm">
                  {card.title}
                </div>
              ))}
            </div>

            {cardsForList(list._id).length === 0 && (
              <p className="text-xs text-slate-500 px-1">No cards yet.</p>
            )}
          </div>
        ))}

        {lists.length === 0 && (
          <p className="text-slate-400">This board has no lists yet.</p>
        )}
      </div>
    </div>
  )
}