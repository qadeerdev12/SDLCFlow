import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import PageLoading from './PageLoading'

export default function ProtectedRoute({ children }) {
    const { user, loading, authError, retrySession } = useAuth()

    if (loading) {
        return <PageLoading />
    }

    if (!user && authError) {
        return <main className="mx-auto max-w-lg p-8 text-zinc-700 dark:text-zinc-200" role="alert">
            <p>{authError}</p>
            <button type="button" onClick={retrySession} className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-white">Try again</button>
        </main>
    }

    if (!user) {
        return <Navigate to="/login" replace />
    }

    return children
}
