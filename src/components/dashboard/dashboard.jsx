'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useResource } from '@/hooks/use-resource';
import { apiRequest, formatDate } from '@/lib/api';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice, LoadingState, StatusBadge } from '@/components/ui/feedback';
import { useWorkspace } from '@/components/layout/workspace-shell';
export function Dashboard() {
    const { data: programs, loading, error, reload } = useResource('/api/programs');
    const { data: health } = useResource('/api/health');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [actionError, setActionError] = useState('');
    const [creating, setCreating] = useState(false);
    const { notify } = useWorkspace();
    const router = useRouter();
    const recentProgram = [...(programs || [])].sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt))[0];
    const reviewedCount = programs?.filter((program) => program.status === 'reviewed').length || 0;
    const sectionCount = programs?.reduce((count, program) => count + program.sections.length, 0) || 0;
    const filteredPrograms = programs?.filter((program) => program.module.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || program.status === filter)) || [];
    async function createBlankProgram() {
        const name = window.prompt('Nombre del nuevo módulo:');
        if (!name?.trim()) {
            return;
        }
        setCreating(true);
        setActionError('');
        try {
            const program = await apiRequest('/api/programs', {
                method: 'POST',
                body: {
                    module: name.trim(),
                    code: '',
                    course: '',
                    teacher: '',
                    status: 'draft',
                    sections: [],
                    sourceIds: [],
                    warnings: [],
                },
            });
            router.push(`/programaciones/${program.id}`);
        } catch (failure) {
            setActionError(failure.message);
        } finally {
            setCreating(false);
        }
    }
    async function deleteProgram(program) {
        if (!window.confirm(`¿Eliminar «${program.module}» y su histórico? El documento original se conservará.`)) {
            return;
        }
        setActionError('');
        try {
            await apiRequest(`/api/programs/${program.id}`, {
                method: 'DELETE',
                body: { revision: program.revision },
            });
            await reload();
            notify('Programación eliminada.');
        } catch (failure) {
            setActionError(failure.message);
        }
    }
    return (
        <>
            <section className="page-heading">
                <div>
                    <p className="eyebrow">
                        UN NUEVO CURSO, TODO EN ORDEN
                    </p>
                    <h1>
                        Mis programaciones
                        <span className="heading-dot">
                            .
                        </span>
                    </h1>
                    <p>
                        Un espacio para actualizar, revisar y unificar los módulos de tu ciclo.
                    </p>
                </div>
                <Link
                    className="button button-primary"
                    href="/importar"
                >
                    <Icon
                        name="plus"
                        size={18}
                    />
                    Nueva importación
                </Link>
            </section>
            <section
                className="welcome-card"
                aria-labelledby="welcome-title"
            >
                <div>
                    <span className="badge badge-blue">
                        <Icon
                            name="sparkles"
                            size={13}
                        />
                        TU ESPACIO DOCENTE
                    </span>
                    <h2 id="welcome-title">
                        Menos papeleo.
                        <br />
                        Más tiempo para enseñar.
                    </h2>
                    <p>
                        Tus documentos, tus cambios, tu próximo curso. Importa, edita y prepara tus programaciones desde un mismo lugar.
                    </p>
                    <Link
                        className="button button-dark"
                        href="/importar"
                    >
                        Comenzar asistente
                        <Icon
                            name="arrow"
                            size={18}
                        />
                    </Link>
                    {recentProgram && <Link
                        className="welcome-continue"
                        href={`/programaciones/${recentProgram.id}`}
                    >
                        Continuar editando
                        <Icon
                            name="arrow"
                            size={16} />
                    </Link>}
                    <span className="welcome-note">
                        PDF y Word · Revisión a tu ritmo
                    </span>
                </div>
                <div
                    className="dashboard-preview"
                    aria-hidden="true">
                    <div className="preview-orbit" />
                    <div className="preview-window">
                        <div className="preview-window-toolbar">
                            <span className="preview-window-dots">
                                <i />
                                <i />
                                <i />
                            </span>
                            <span>
                                Tu programación
                            </span>
                            <Icon
                                name="file"
                                size={15} />
                        </div>
                        <div className="preview-window-body">
                            <div className="preview-mini-sidebar">
                                <Icon
                                    name="grid"
                                    size={16} />
                                <Icon
                                    name="file"
                                    size={16} />
                                <Icon
                                    name="check"
                                    size={16} />
                            </div>
                            <div className="preview-document">
                                <span className="preview-document-label">
                                    PROGRAMACIÓN DIDÁCTICA
                                </span>
                                <h3>
                                    {recentProgram?.module || 'Un nuevo curso, bien organizado.'}
                                </h3>
                                <div className="preview-document-meta">
                                    <span>
                                        {recentProgram?.code || 'DAW'}
                                    </span>
                                    <span>
                                        Curso 2026 / 2027
                                    </span>
                                </div>
                                <div className="preview-document-heading">
                                    <span>
                                        01
                                    </span>
                                    {recentProgram?.sections[0]?.title || 'Tu contenido, listo para editar'}
                                </div>
                                <div className="preview-document-lines">
                                    <i />
                                    <i />
                                    <i />
                                </div>
                                <div className="preview-document-table">
                                    <span>
                                        Contenido
                                    </span>
                                    <span>
                                        Revisión
                                    </span>
                                    <span>
                                        Textos y apartados
                                    </span>
                                    <span>
                                        <Icon
                                            name="check"
                                            size={13} />
                                    </span>
                                    <span>
                                        Listas y tablas
                                    </span>
                                    <span>
                                        <Icon
                                            name="check"
                                            size={13} />
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="preview-floating-badge">
                        <span>
                            <Icon
                                name="check"
                                size={18} />
                        </span>
                        <div>
                            <strong>
                                El original, siempre contigo
                            </strong>
                            <small>
                                Edita sin perder la referencia
                            </small>
                        </div>
                    </div>
                    <div className="preview-file-badge">
                        <Icon
                            name="file"
                            size={17} />
                        <span>
                            PDF + Word
                        </span>
                    </div>
                </div>
            </section>
            <section
                className="stats-grid"
                aria-label="Resumen de programaciones"
            >
                <article className="stat-card">
                    <span className="stat-icon blue">
                        <Icon name="file" />
                    </span>
                    <div>
                        <strong>
                            {programs?.length || 0}
                        </strong>
                        <p>
                            Módulos importados
                        </p>
                    </div>
                </article>
                <article className="stat-card">
                    <span className="stat-icon green">
                        <Icon name="check" />
                    </span>
                    <div>
                        <strong>
                            {reviewedCount}
                        </strong>
                        <p>
                            Listos para exportar
                        </p>
                    </div>
                </article>
                <article className="stat-card">
                    <span className="stat-icon purple">
                        <Icon name="grid" />
                    </span>
                    <div>
                        <strong>
                            {sectionCount}
                        </strong>
                        <p>
                            Secciones organizadas
                        </p>
                    </div>
                </article>
            </section>
            <section
                className="programs-panel"
                aria-labelledby="programs-title"
            >
                <div className="panel-heading">
                    <div>
                        <h2 id="programs-title">
                            Tus módulos
                            <span className="count-pill">
                                {programs?.length || 0}
                            </span>
                        </h2>
                        <p>
                            Continúa donde lo dejaste.
                        </p>
                    </div>
                    <button
                        className="button button-secondary button-small"
                        onClick={createBlankProgram}
                        disabled={creating}
                    >
                        <Icon
                            name="plus"
                            size={16}
                        />
                        Crear módulo
                    </button>
                </div>
                <div className="panel-toolbar">
                    <div
                        className="filter-tabs"
                        role="group"
                        aria-label="Filtrar por estado"
                    >
                        {[['all', 'Todos'], ['draft', 'En revisión'], ['reviewed', 'Revisados']].map(([value, label]) => <button
                            key={value}
                            className={filter === value ? 'selected' : ''}
                            onClick={() => setFilter(value)}
                        >
                            {label}
                        </button>)}
                    </div>
                    <label className="search-field">
                        <Icon
                            name="search"
                            size={17}
                        />
                        <input
                            placeholder="Buscar un módulo…"
                            aria-label="Buscar módulo"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </label>
                </div>
                <ErrorNotice
                    message={error || actionError}
                    onRetry={error ? reload : undefined}
                />
                {loading ? <LoadingState /> : filteredPrograms.length ? <div className="module-list">
                    {filteredPrograms.map((program) => <article
                        className="module-row"
                        key={program.id}
                    >
                        <span className="module-icon">
                            <Icon
                                name="file"
                                size={22}
                            />
                        </span>
                        <div className="module-info">
                            <Link href={`/programaciones/${program.id}`}>
                                {program.module}
                            </Link>
                            <p>
                                {program.code || 'Código pendiente'}
                                <span>
                                    ·
                                </span>
                                {program.sections.length}
                                {' '}
                                secciones
                                <span>
                                    ·
                                </span>
                                Actualizado
                                {' '}
                                {formatDate(program.updatedAt)}
                            </p>
                        </div>
                        <StatusBadge reviewed={program.status === 'reviewed'} />
                        <Link
                            className="button button-secondary button-small"
                            href={`/programaciones/${program.id}`}
                        >
                            Abrir
                            <Icon
                                name="arrow"
                                size={15}
                            />
                        </Link>
                        <button
                            className="icon-button subtle"
                            aria-label={`Eliminar ${program.module}`}
                            onClick={() => deleteProgram(program)}
                        >
                            <Icon
                                name="trash"
                                size={17}
                            />
                        </button>
                    </article>)}
                </div> : <div className="empty-state">
                    <span className="empty-icon">
                        <Icon
                            name="file"
                            size={30}
                        />
                    </span>
                    <h3>
                        {search || filter !== 'all' ? 'No hay módulos con ese filtro' : 'Tu próximo curso empieza aquí'}
                    </h3>
                    <p>
                        {search || filter !== 'all' ? 'Prueba otra búsqueda o cambia el estado seleccionado.' : 'Importa tu primera programación o prueba el documento de ejemplo.'}
                    </p>
                    {!search && filter === 'all' && <Link
                        className="button button-secondary"
                        href="/importar"
                    >
                        Importar documentos
                        <Icon
                            name="arrow"
                            size={16}
                        />
                    </Link>}
                </div>}
            </section>
            <div className="workspace-note">
                <Icon
                    name="check"
                    size={15}
                />
                <p>
                    Los cambios se guardan al pulsar «Guardar cambios».
                    {health?.storage === 'file' ? 'Demostración local: datos persistidos en archivos.' : health?.storage === 'mongodb' ? 'Datos e histórico conectados a MongoDB.' : ''}
                </p>
            </div>
        </>);
}
