import {Navigate} from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Wraps any page that requires login.
// - While the context is still checking for a token: show nothing (or a loader).
// - If no logged-in user: redirect to /login.
// - Otherwise: render the protected page (passed in as `children`).
 export default function ProtectedRoute({children}) {

    const {user, loading} = useAuth();

    //1. Still checking for token? Show nothing (or a loader).
    //    wrongly bounce a logged-in user on every refresh.
    if (loading) { 
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
                Loading...
            </div>
        )
    }

     // 2. Done checking, and nobody's logged in → send them to login.
        if (!user) {
            return <Navigate to="/login" replace />
        }

    // 3. Logged in → render the protected page.
        return children
}


