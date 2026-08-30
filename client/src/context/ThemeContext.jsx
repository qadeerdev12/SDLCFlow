import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

// Read the initial theme once: an explicit choice wins, otherwise follow the OS.
function initialDark() {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function ThemeProvider({ children }) {
    const [dark, setDark] = useState(initialDark)

    useEffect(() => {
        localStorage.setItem('theme', dark ? 'dark' : 'light')
        // Drive the `dark:` variant, and tell the browser which scheme to use
        // for native UI (scrollbars, date pickers, form controls).
        document.documentElement.classList.toggle('dark', dark)
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    }, [dark])

    function toggle() { setDark((d) => !d) }

    return (
        <ThemeContext.Provider value={{ dark, toggle }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
