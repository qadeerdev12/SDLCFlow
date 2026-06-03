import {createContext, useContext, useState, useEffect} from 'react';
import { authApi } from '../lib/api';

//1.create the context object - the "chanel" componenets will turn into to talk to each other through.
const AuthContext = createContext(null);

//2. The Provider: wraps the app and holds the auth state.
export function AuthProvider({children}) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('token')); // lazy init from localStorage
    const [loading, setLoading] = useState(true); // true until we have checked an existing token

    //3. On mount, if we have a token, let's validate it and get the user data.
    useEffect(() => {
        async function loadUserFromToken() {
            if (token) {
                try {
                    const data = await authApi.getMe(token);
                    setUser(res.data.user ?? res.data); // Handle both {user} and direct user object responses  
                } catch (err) {
                    // Token is invalid or expired, clear it out.
                    console.error('Token validation failed:', err);
                    localStorage.removeItem('token');
                    setToken(null); // Invalid token, clear it
                }
            }
            setLoading(false); // Done checking token
        }
        loadUserFromToken();
    }, [token]);

    //4. The login function: call the API, set the user and token.
    async function login(email, password) {
        const res = await authApi.login(email, password);
        const { token: newToken, user: newUser } = res.data;
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(newUser);
    }

    //5. The register function: call the API, set the user and token.
    async function register(name, email, password) {
        const res = await authApi.register(name, email, password);
        const { token: newToken, user: newUser } = res.data;
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setUser(newUser);
    }
    
    //6. The logout function: clear the user and token.
    function logout() {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    }

    //7. Broadcast these values to any component that tunes in.
    const value = {user, token, loading, login, register, logout};
    
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

}

//8. A custom hook so components can read the context cleanly: useAuth()
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return ctx;
}
