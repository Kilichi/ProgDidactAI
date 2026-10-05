'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { ThemeToggle } from '@/components/layout/theme-toggle';
const WorkspaceContext = createContext(null);
export const useWorkspace = () => useContext(WorkspaceContext);
const navigation = [
    {
        href: '/',
        label: 'Mis programaciones',
        icon: 'grid',
    },
    {
        href: '/importar',
        label: 'Importar documentos',
        icon: 'upload',
    },
    {
        href: '/exportar',
        label: 'Consolidar y exportar',
        icon: 'download',
    },
    {
        href: '/configuracion',
        label: 'Plantilla del centro',
        icon: 'settings',
    },
];
export function WorkspaceShell({ children }) {
    const pathname = usePathname();
    const [toast, setToast] = useState('');
    const [dirty, setDirty] = useState(false);
    const toastTimer = useRef(null);
    useEffect(() => {
        const warnBeforeUnload = (event) => {
            if (dirty) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }, [dirty]);
    useEffect(() => () => clearTimeout(toastTimer.current), []);
    function notify(message) {
        clearTimeout(toastTimer.current);
        setToast(message);
        toastTimer.current = setTimeout(() => setToast(''), 4500);
    }
    function guardNavigation(event) {
        if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?')) {
            event.preventDefault();
        } else {
            setDirty(false);
        }
    }
    const current = navigation.find((item) => item.href === pathname);
    return (
        <WorkspaceContext.Provider value={{
            notify,
            dirty,
            setDirty,
            guardNavigation,
        }}
        >
            <a
                className="skip-link"
                href="#main-content"
            >
                Saltar al contenido
            </a>
            <div className="workspace">
                <aside className="sidebar">
                    <div className="workspace-label">
                        <span className="workspace-label-dot" />
                        ESPACIO DOCENTE
                    </div>
                    <Link
                        href="/"
                        className="brand"
                        onClick={guardNavigation}
                    >
                        <span className="brand-mark">
                            <Icon
                                name="file"
                                size={23}
                            />
                        </span>
                        <span>
                            ProgDidact
                            <span className="brand-ai">
                                AI
                            </span>
                            <small>
                                Documentos que evolucionan.
                            </small>
                        </span>
                    </Link>
                    <p className="nav-caption">
                        ESPACIO DE TRABAJO
                    </p>
                    <nav aria-label="Navegación principal">
                        {navigation.map((item) => {
                            const active = item.href === '/' ? pathname === '/' || pathname.startsWith('/programaciones') : pathname === item.href;
                            return <Link
                                key={item.href}
                                href={item.href}
                                onClick={guardNavigation}
                                className={`nav-link ${active ? 'active' : ''}`}
                                aria-current={active ? 'page' : undefined}
                            >
                                <Icon name={item.icon} />
                                <span>
                                    {item.label}
                                </span>
                                {active && <span className="nav-active-dot" />}
                            </Link>;
                        })}
                    </nav>
                    <Link
                        href="/importar"
                        className="sidebar-create"
                        onClick={guardNavigation}>
                        <Icon
                            name="plus"
                            size={18} />
                        Nueva programación
                        <span>
                            +
                        </span>
                    </Link>
                    <div className="sidebar-tip">
                        <span className="tip-icon">
                            <Icon name="sparkles" />
                        </span>
                        <strong>
                            Todo empieza con
                            <br />
                            tu documento.
                        </strong>
                        <p>
                            Recupera lo que ya tienes. Actualiza solo lo que necesitas.
                        </p>
                        <Link
                            href="/importar"
                            onClick={guardNavigation}
                        >
                            Comenzar asistente
                            <Icon
                                name="arrow"
                                size={16}
                            />
                        </Link>
                    </div>
                    <div className="sidebar-footer">
                        <span className="avatar">
                            DA
                        </span>
                        <div>
                            <strong>
                                Departamento de Informática
                            </strong>
                            <small>
                                Gestión de programaciones
                            </small>
                        </div>
                    </div>
                </aside>
                <div className="workspace-body">
                    <header className="topbar">
                        <div className="breadcrumb">
                            Espacio de trabajo
                            <Icon
                                name="chevron"
                                size={14}
                            />
                            <strong>
                                {current?.label || 'Editor de programación'}
                            </strong>
                        </div>
                        <div className="topbar-actions">
                            <ThemeToggle />
                            <span className="topbar-label">
                                <span className="status-dot" />
                                {' '}
                                Curso 2026 / 2027
                            </span>
                        </div>
                    </header>
                    <main
                        id="main-content"
                        className="main-content"
                    >
                        {children}
                    </main>
                    <footer className="page-footer">
                        <span>
                            ProgDidactAI
                        </span>
                        <span>
                            Hecho para preparar el próximo curso con calma.
                        </span>
                    </footer>
                </div>
            </div>
            {toast && <div
                className="toast"
                role="status"
            >
                <Icon name="check" />
                <span>
                    {toast}
                </span>
                <button
                    aria-label="Cerrar aviso"
                    onClick={() => setToast('')}
                >
                    <Icon
                        name="close"
                        size={16}
                    />
                </button>
            </div>}
        </WorkspaceContext.Provider>);
}
