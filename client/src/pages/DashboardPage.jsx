import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { boardApi } from '../lib/api'

export default function DashboardPage() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [newBoardName, setNewBoardName] = useState('')
  const [error, setError] = useState('')

  // Fetch the user's boards when the page loads.
  useEffect(() => {
    async function loadBoards() {
      try {
        const res = await boardApi.list(token)
        setBoards(res.data.boards)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadBoards()
  }, [token])

  async function handleCreate(e) {
    e.preventDefault()
    if (!newBoardName.trim()) return
    try {
      const res = await boardApi.create(newBoardName, token)
      setBoards([res.data.board, ...boards])   // add the new board to the top of the list
      setNewBoardName('')
    } catch (err) {
      setError(err.message)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-indigo-400">CollabBoard</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">{user?.name}</span>
          <button onClick={handleLogout} className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600">
            Log out
          </button>
        </div>
      </header>

      {/* Create-board form */}
      <form onSubmit={handleCreate} className="flex gap-2 mb-8 max-w-md">
        <input
          value={newBoardName}
          onChange={(e) => setNewBoardName(e.target.value)}
          placeholder="New board name..."
          className="flex-1 px-3 py-2 rounded bg-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button type="submit" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium">
          Create
        </button>
      </form>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {/* Boards grid */}
      {loading ? (
        <p className="text-slate-400">Loading boards...</p>
      ) : boards.length === 0 ? (
        <p className="text-slate-400">No boards yet. Create one above to get started.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {boards.map((board) => (
            <button
              key={board._id}
              onClick={() => navigate(`/boards/${board._id}`)}
              className="text-left p-5 rounded-xl bg-slate-800 hover:bg-slate-700 transition"
            >
              <h2 className="font-semibold text-indigo-300">{board.name}</h2>
              <p className="text-xs text-slate-500 mt-1">{board.members.length} member(s)</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}