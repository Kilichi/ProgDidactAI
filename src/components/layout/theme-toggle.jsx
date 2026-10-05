'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';

export function ThemeToggle() {
    const [theme, setTheme] = useState('light');

    useEffect(() => {
        setTheme(document.documentElement.dataset.theme || 'light');
        const synchronize = (event) => {
            if (event.key === 'progdidactai-theme') {
                const next = event.newValue === 'dark' ? 'dark' : 'light';
                document.documentElement.dataset.theme = next;
                setTheme(next);
            }
        };
        window.addEventListener('storage', synchronize);
        return () => window.removeEventListener('storage', synchronize);
    }, []);

    function toggleTheme() {
        const next = theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        setTheme(next);
        try {
            localStorage.setItem('progdidactai-theme', next);
        } catch {
            // El selector funciona también si el navegador bloquea el almacenamiento.
        }
    }

    return <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label="Modo oscuro"
        aria-pressed={theme === 'dark'}
        title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        <span>
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </span>
    </button>;
}
