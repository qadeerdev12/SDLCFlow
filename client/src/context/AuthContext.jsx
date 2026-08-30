import { useState, useEffect } from 'react';
import { authApi } from '../lib/api';
import { AuthContext } from './authContextValue';

// The Provider wraps the app and owns login/session state.
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
                    setUser(data.data?.user ?? data.data ?? data); // Handle both {user} and direct user object responses
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
        console.log('register response:', res);  
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
