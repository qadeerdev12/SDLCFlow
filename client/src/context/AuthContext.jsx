import { useState, useEffect, useRef, useCallback } from 'react';
import { authApi } from '../lib/api';
import { AuthContext } from './authContextValue';
import { isSessionError, onSessionFailure, reportSessionFailure } from '../lib/sessionEvents';

// The Provider wraps the app and owns login/session state.
export function AuthProvider({children}) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('token')); // lazy init from localStorage
    const [loading, setLoading] = useState(true); // true until we have checked an existing token
    const [sessionMessage, setSessionMessage] = useState('');
    const [authError, setAuthError] = useState('');
    const [validationAttempt, setValidationAttempt] = useState(0);
    const tokenRef = useRef(token);

    const clearSession = useCallback((expectedToken, message = '') => {
        if (tokenRef.current !== expectedToken) return;
        // Another tab may already have saved a new login. Never erase its token.
        if (localStorage.getItem('token') === expectedToken) localStorage.removeItem('token');
        tokenRef.current = null;
        setToken(null);
        setUser(null);
        setLoading(false);
        setAuthError('');
        setSessionMessage(message);
    }, []);

    useEffect(() => onSessionFailure(({ token: failedToken }) => {
        clearSession(failedToken, 'Your session ended. Please sign in again.');
    }), [clearSession]);

    useEffect(() => {
        const syncStorage = (event) => {
            if (event.storageArea !== localStorage || (event.key !== 'token' && event.key !== null)) return;
            const nextToken = localStorage.getItem('token');
            if (nextToken === tokenRef.current) return;
            tokenRef.current = nextToken;
            setToken(nextToken);
            setUser(null);
            setLoading(Boolean(nextToken));
            setAuthError('');
            setSessionMessage(nextToken ? '' : 'Your session ended. Please sign in again.');
        };
        window.addEventListener('storage', syncStorage);
        return () => window.removeEventListener('storage', syncStorage);
    }, []);

    //3. On mount, if we have a token, let's validate it and get the user data.
    useEffect(() => {
        let cancelled = false;
        async function loadUserFromToken() {
            if (token) {
                try {
                    const data = await authApi.getMe(token);
                    if (cancelled || tokenRef.current !== token) return;
                    setUser(data.data?.user ?? data.data ?? data); // Handle both {user} and direct user object responses
                    setAuthError('');
                } catch (err) {
                    if (cancelled || tokenRef.current !== token) return;
                    if (isSessionError(err.code)) reportSessionFailure(token, err.code);
                    else setAuthError('Could not check your session. Please try again.');
                }
            }
            if (!cancelled && tokenRef.current === token) setLoading(false);
        }
        loadUserFromToken();
        // A late /me response must not restore a user after logout or account switch.
        return () => { cancelled = true; };
    }, [token, validationAttempt]);

    //4. The login function: call the API, set the user and token.
    async function login(email, password) {
        const res = await authApi.login(email, password);
        const { token: newToken, user: newUser } = res.data;
        localStorage.setItem('token', newToken);
        tokenRef.current = newToken;
        setSessionMessage('');
        setAuthError('');
        setToken(newToken);
        setUser(newUser);
    }

    //5. The register function: call the API, set the user and token.
    async function register(name, email, password) {
        const res = await authApi.register(name, email, password);
        const { token: newToken, user: newUser } = res.data;
        localStorage.setItem('token', newToken);
        tokenRef.current = newToken;
        setSessionMessage('');
        setAuthError('');
        setToken(newToken);
        setUser(newUser);
    }
    
    //6. The logout function: clear the user and token.
    function logout(expectedToken = tokenRef.current) {
        clearSession(expectedToken);
    }

    function updateUser(nextUser) {
        setUser((current) => ({ ...current, ...nextUser }));
    }

    //7. Broadcast these values to any component that tunes in.
    function retrySession() {
        setAuthError('');
        setLoading(true);
        setValidationAttempt((attempt) => attempt + 1);
    }

    const value = {user, token, loading, login, register, logout, updateUser, sessionMessage, authError, retrySession};
    
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
