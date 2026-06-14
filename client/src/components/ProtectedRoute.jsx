import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function ProtectedRoute({ children }) {
    const { user, loading } = useAuth()
    const { dark } = useTheme()

    if (loading) {
        return (
            <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-900 text-slate-400' : 'bg-gray-50 text-gray-500'}`}>
                Loading...
            </div>
        )
    }

    if (!user) {
        return <Navigate to="/login" replace />
    }

    return children
}
