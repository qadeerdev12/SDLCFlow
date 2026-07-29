import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { boardApi } from '../lib/api'
import { BOARD_COLOR_KEYS, DEFAULT_COLOR, DEFAULT_EMOJI, colorClasses } from '../lib/boardColors'
import Logo from '../components/Logo'

const EMOJI_CHOICES = ['📋', '🧵', '⏱️', '📊', '🗂️', '🚀', '🐛', '💡', '🎨', '🔧']

export default function DashboardPage() {
  const { user, token, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()

  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [newBoardName, setNewBoardName] = useState('')
  const [newEmoji, setNewEmoji] = useState(DEFAULT_EMOJI)
  const [newColor, setNewColor] = useState(DEFAULT_COLOR)
  const [error, setError] = useState('')

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
      const res = await boardApi.create(newBoardName, token, { emoji: newEmoji, color: newColor })
      setBoards([res.data.board, ...boards])
      setNewBoardName('')
      setNewEmoji(DEFAULT_EMOJI)
      setNewColor(DEFAULT_COLOR)
    } catch (err) {
      setError(err.message)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className={`min-h-screen p-8 ${dark ? 'bg-slate-900 text-slate-100' : 'bg-gray-50 text-gray-900'}`}>
      <header className="flex items-center justify-between mb-8">
        <Logo size="md" />
        <div className="flex items-center gap-3 text-sm">
          <span className={dark ? 'text-slate-400' : 'text-gray-500'}>{user?.name}</span>
          <button onClick={toggle} className={`p-2 rounded-full ${dark ? 'bg-slate-700 text-yellow-300 hover:bg-slate-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
            {dark ? '☀️' : '🌙'}
          </button>
          <button onClick={handleLogout} className={`px-3 py-1.5 rounded ${dark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
            Log out
          </button>
        </div>
      </header>

      <form onSubmit={handleCreate} className="mb-8 max-w-md">
        <div className="flex gap-2">
          <input
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
            placeholder="New board name..."
            className={`flex-1 px-3 py-2 rounded border outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'}`}
          />
          <button type="submit" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 font-medium text-white">
            Create
          </button>
        </div>

        {/* Emoji + color pickers so each project board is distinguishable. */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setNewEmoji(emoji)}
                className={`h-8 w-8 rounded-md text-base leading-none transition ${newEmoji === emoji ? (dark ? 'bg-slate-700 ring-2 ring-indigo-500' : 'bg-gray-200 ring-2 ring-indigo-500') : (dark ? 'hover:bg-slate-800' : 'hover:bg-gray-100')}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className={`h-5 w-px ${dark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          <div className="flex gap-1.5">
            {BOARD_COLOR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setNewColor(key)}
                aria-label={`${key} color`}
                className={`h-6 w-6 rounded-full transition ${colorClasses(key).swatch} ${newColor === key ? (dark ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white' : 'ring-2 ring-offset-2 ring-offset-gray-50 ring-gray-800') : 'opacity-70 hover:opacity-100'}`}
              />
            ))}
          </div>
        </div>
      </form>

      {error && <p className={`mb-4 ${dark ? 'text-red-400' : 'text-red-600'}`}>{error}</p>}

      {loading ? (
        <p className={dark ? 'text-slate-400' : 'text-gray-500'}>Loading boards...</p>
      ) : boards.length === 0 ? (
        <p className={dark ? 'text-slate-400' : 'text-gray-500'}>No boards yet. Create one above to get started.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {boards.map((board) => (
            <button
              key={board._id}
              onClick={() => navigate(`/boards/${board._id}`)}
              className={`text-left p-5 rounded-xl border border-l-4 transition ${colorClasses(board.color).accent} ${dark ? 'bg-slate-800 border-slate-700 hover:bg-slate-700' : 'bg-white border-gray-200 hover:bg-gray-50 shadow-sm'}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg leading-none">{board.emoji || DEFAULT_EMOJI}</span>
                <h2 className={`font-semibold ${dark ? 'text-indigo-300' : 'text-indigo-600'}`}>{board.name}</h2>
              </div>
              <p className={`text-xs mt-1 ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{board.members.length} member(s)</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
