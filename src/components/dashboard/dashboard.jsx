'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useResource } from '@/hooks/use-resource';
import { apiRequest, formatDate } from '@/lib/api';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice, LoadingState } from '@/components/ui/feedback';

export function Dashboard() {
    const { data: files, loading, error, reload } = useResource('/api/files');
    const { data: programs } = useResource('/api/programs');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [sort, setSort] = useState('recent');
    const [deleting, setDeleting] = useState('');
    const [actionError, setActionError] = useState(null);
    const sorted = [...(files || [])].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const latest = sorted[0];
    const reviewed = sorted.filter((file) => file.status === 'reviewed').length;
    const filtered = sorted.filter((file) => file.filename.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')) && (filter === 'all' || (filter === 'reviewed' ? file.status === 'reviewed' : file.status !== 'reviewed')));
    if (sort === 'name') {
        filtered.sort((a, b) => a.filename.localeCompare(b.filename, 'es'));
    }
    const manual = (programs || []).filter((program) => !program.sourceIds.length);
    async function removeFile(file) {
        if (!window.confirm(`¿Eliminar «${file.filename}» y sus programaciones? Esta acción no se puede deshacer.`)) {
            return;
        }
        setDeleting(file.id);
        setActionError(null);
        try {
            await apiRequest(`/api/files/${file.id}`, {
                method: 'DELETE',
                body: { confirm: true },
            });
            await reload();
        } catch (error) {
            setActionError(error);
        } finally {
            setDeleting('');
        }
    }
    return <div className="document-library">
        <header className="library-heading">
            <div>
                <p className="library-kicker">
TU ESPACIO DOCENTE
                </p>
                <h1>
Mis documentos
                </h1>
                <p>
Importa, edita y revisa las programaciones de tu centro.
                </p>
            </div>
            <Link
                className="button library-primary"
                href="/importar">
                <Icon
                    name="plus"
                    size={18} />
Importar documento
            </Link>
        </header>
        {!loading && !error && <section
            className={`library-overview ${latest ? '' : 'is-empty'}`}
            aria-label={latest ? 'Continuar trabajando' : 'Empieza tu programación'}>
            <div className="library-resume">
                <div className="library-resume-content">
                    <span className="library-overline">
                        <span />
                        {latest ? 'TU ÚLTIMA PROGRAMACIÓN' : 'UN NUEVO PUNTO DE PARTIDA'}
                    </span>
                    <h2>
                        {latest ? 'Continúa tu última programación' : 'Prepara tu primera programación'}
                    </h2>
                    <p>
                        {latest ? latest.filename : 'Sube un PDF o Word, pulsa sobre el texto para editarlo y descarga el documento revisado.'}
                    </p>
                    {latest && <span className="library-resume-meta">
                        {latest.pageCount}
                        {' '}
páginas ·
                        {' '}
                        {latest.reviewedPages}
                        {' '}
revisadas
                    </span>}
                    <Link
                        href={latest ? `/archivos/${latest.id}` : '/importar'}
                        className="library-resume-link">
                        {latest ? 'Continuar editando' : 'Importar mi primer documento'}
                        <Icon
                            name="arrow"
                            size={17} />
                    </Link>
                </div>
                <div
                    className="library-document-art"
                    aria-hidden="true">
                    <div className="library-art-sheet sheet-back" />
                    <div className="library-art-sheet sheet-front">
                        <span className="art-paper-symbol">
                            <Icon
                                name="file"
                                size={22} />
                        </span>
                        <strong>
Programación
                            <br />
didáctica
                        </strong>
                        <span className="art-paper-line" />
                        <span className="art-paper-line short" />
                        <div className="art-paper-table">
                            <i />
                            <i />
                            <i />
                            <i />
                            <i />
                            <i />
                        </div>
                        <span className="art-paper-stamp">
                            <Icon
                                name="check"
                                size={13} />
Tu próximo curso
                        </span>
                    </div>
                </div>
            </div>
            <div className="library-summary">
                <span className="library-summary-icon">
                    <Icon
                        name="grid"
                        size={19} />
                </span>
                <h2>
Estado de la revisión
                </h2>
                <p>
Comprueba qué documentos quedan por revisar.
                </p>
                <div className="library-metrics">
                    <div>
                        <strong>
                            {sorted.length}
                        </strong>
                        <span>
Documentos
                        </span>
                    </div>
                    <div>
                        <strong>
                            {sorted.length - reviewed}
                        </strong>
                        <span>
En revisión
                        </span>
                    </div>
                    <div>
                        <strong>
                            {reviewed}
                        </strong>
                        <span>
Revisados
                        </span>
                    </div>
                </div>
            </div>
        </section>}
        <section
            className="library-collection"
            aria-labelledby="library-files-title">
            <div className="library-collection-title">
                <h2 id="library-files-title">
Tu biblioteca
                    <span>
                        {files?.length || 0}
                    </span>
                </h2>
                <label className="library-search">
                    <Icon
                        name="search"
                        size={18} />
                    <input
                        aria-label="Buscar archivos"
                        placeholder="Buscar un documento…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)} />
                    {search && <button
                        aria-label="Limpiar búsqueda"
                        onClick={() => setSearch('')}>
                        <Icon
                            name="close"
                            size={15} />
                    </button>}
                </label>
            </div>
            <div className="library-filterbar">
                <div
                    className="library-filters"
                    role="group"
                    aria-label="Estado de los documentos">
                    {[['all', 'Todos'], ['pending', 'En revisión'], ['reviewed', 'Revisados']].map(([value, label]) => <button
                        key={value}
                        aria-pressed={filter === value}
                        onClick={() => setFilter(value)}>
                        {label}
                    </button>)}
                </div>
                <label className="library-sort">
                    <Icon
                        name="clock"
                        size={14} />
                    <select
                        aria-label="Ordenar documentos"
                        value={sort}
                        onChange={(event) => setSort(event.target.value)}>
                        <option value="recent">
Más recientes
                        </option>
                        <option value="name">
Nombre A–Z
                        </option>
                    </select>
                </label>
            </div>
            <ErrorNotice
                message={actionError || error}
                onRetry={reload} />
            {loading ? <LoadingState label="Abriendo tu biblioteca…" /> : <>
                {!!filtered.length && <div className="library-grid">
                    {filtered.map((file) => <article
                        className="file-card library-file"
                        key={file.id}>
                        <div className="library-file-top">
                            <span className={`library-file-icon ${file.extension === '.pdf' ? 'is-pdf' : 'is-word'}`}>
                                <Icon
                                    name="file"
                                    size={25} />
                            </span>
                            <span className={`library-status ${file.status === 'reviewed' ? 'is-reviewed' : ''}`}>
                                <span />
                                {file.status === 'reviewed' ? 'Revisado' : 'En revisión'}
                            </span>
                        </div>
                        <div className="library-file-info">
                            <span className="library-file-type">
                                {file.extension === '.pdf' ? 'PDF' : 'WORD'}
                                {' '}
·
                                {' '}
                                {file.pageCount}
                                {' '}
PÁGINAS
                            </span>
                            <h3>
                                {file.filename.replace(/\.[^.]+$/, '')}
                            </h3>
                            <p>
Editado
                                {' '}
                                {formatDate(file.updatedAt)}
                            </p>
                        </div>
                        <div className="library-file-progress">
                            <div>
                                <span>
                                    {file.reviewedPages}
                                    {' '}
de
                                    {' '}
                                    {file.pageCount}
                                    {' '}
páginas revisadas
                                </span>
                                <strong>
                                    {Math.round(file.reviewedPages / (file.pageCount || 1) * 100)}
                                    {' '}
%
                                </strong>
                            </div>
                            <progress
                                value={file.reviewedPages}
                                max={file.pageCount || 1}
                                aria-label={`Revisión de ${file.filename}`} />
                        </div>
                        <div className="library-file-bottom">
                            <Link
                                href={`/archivos/${file.id}`}
                                className="library-open-link">
Abrir documento
                                <span className="library-open-arrow">
                                    <Icon
                                        name="arrow"
                                        size={17} />
                                </span>
                            </Link>
                            <button
                                type="button"
                                className="library-delete"
                                aria-label={`Eliminar ${file.filename}`}
                                disabled={deleting === file.id}
                                onClick={() => removeFile(file)}>
                                <Icon
                                    name="trash"
                                    size={15} />
                                {deleting === file.id ? 'Eliminando…' : 'Eliminar'}
                            </button>
                        </div>
                    </article>)}
                    <Link
                        href="/importar"
                        className="library-add-file">
                        <span>
                            <Icon
                                name="plus"
                                size={24} />
                        </span>
                        <strong>
Un nuevo documento
                        </strong>
                        <p>
Importa un PDF o Word
                        </p>
                    </Link>
                </div>}
                {!filtered.length && !error && <div className="library-empty">
                    <span>
                        <Icon
                            name={search ? 'search' : 'file'}
                            size={27} />
                    </span>
                    <h3>
                        {search ? 'No encontramos ese documento' : filter !== 'all' ? 'No hay documentos en este estado' : 'Todo listo para empezar'}
                    </h3>
                    <p>
                        {search ? 'Prueba con otro nombre o cambia los filtros.' : filter !== 'all' ? 'Tus demás programaciones están en «Todos».' : 'Importa tu primera programación y la encontrarás aquí.'}
                    </p>
                    {search || filter !== 'all' ? <button
                        className="text-button"
                        onClick={() => {
                            setSearch(''); setFilter('all');
                        }}>
Ver todos los documentos
                    </button> : <Link
                        className="button library-primary"
                        href="/importar">
                        <Icon
                            name="plus"
                            size={16} />
Importar documento
                    </Link>}
                </div>}
            </>}
        </section>
        {!!manual.length && <section className="library-manual">
            <h2>
Programaciones manuales
            </h2>
            {manual.map((program) => <Link
                key={program.id}
                href={`/programaciones/${program.id}`}>
                <Icon
                    name="file"
                    size={18} />
                <span>
                    {program.module}
                </span>
                <Icon
                    name="arrow"
                    size={16} />
            </Link>)}
        </section>}
        <p className="library-footnote">
            <Icon
                name="check"
                size={14} />
La edición conserva el original. Eliminar un documento también elimina su original.
        </p>
    </div>;
}
