'use client';

import { useEffect, useRef, useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice, LoadingState } from '@/components/ui/feedback';

function OriginalDocument({ sourceId }) {
    const { data: source, loading, error } = useResource(`/api/sources/${sourceId}`);
    const [view, setView] = useState('original');
    if (loading) {
        return <LoadingState label="Abriendo el documento original…" />;
    }
    if (error || !source) {
        return <ErrorNotice message={error} />;
    }
    return <>
        <div className="document-preview-toolbar">
            <div>
                <strong>
                    {source.filename}
                </strong>
                <p className="field-hint">
                    {source.pages.length}
                    {' '}
                    páginas · archivo importado sin modificaciones
                </p>
            </div>
            <div
                className="filter-tabs"
                aria-label="Vista del original">
                <button
                    className={view === 'original' ? 'selected' : ''}
                    onClick={() => setView('original')}
                >
                    Documento original
                </button>
                <button
                    className={view === 'text' ? 'selected' : ''}
                    onClick={() => setView('text')}
                >
                    Texto extraído
                </button>
            </div>
            <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="button button-secondary button-small"
            >
                <Icon
                    name="file"
                    size={16} />
                Abrir archivo original
            </a>
        </div>
        {view === 'original' && source.extension === '.pdf' ? <iframe
            className="document-preview-frame"
            title={`Documento original: ${source.filename}`}
            src={source.url}
        /> : <>
            {view === 'original' && <p className="notice notice-warning">
                El navegador no muestra archivos Word directamente. Puedes abrir el archivo original o consultar aquí su texto extraído.
            </p>}
            <div className="original-pages">
                {source.pages.map((page) => <section key={page.number}>
                    <h3>
                        Página
                        {' '}
                        {page.number}
                    </h3>
                    <pre className="source-text">
                        {page.rawText || 'Página sin texto extraíble.'}
                    </pre>
                </section>)}
            </div>
        </>}
    </>;
}

export function OriginalDocuments({ sourceIds }) {
    const uniqueIds = [...new Set(sourceIds.filter(Boolean))];
    const [selectedId, setSelectedId] = useState('');
    const currentId = uniqueIds.includes(selectedId) ? selectedId : uniqueIds[0];
    if (!currentId) {
        return <p className="notice notice-warning">
            Estos módulos se crearon manualmente y no tienen un documento original asociado.
        </p>;
    }
    return <>
        {uniqueIds.length > 1 && <label className="original-document-selector">
            Documento importado
            <select
                value={currentId}
                onChange={(event) => setSelectedId(event.target.value)}
            >
                {uniqueIds.map((id, index) => <option
                    key={id}
                    value={id}>
                    Documento
                    {' '}
                    {index + 1}
                </option>)}
            </select>
        </label>}
        <OriginalDocument
            key={currentId}
            sourceId={currentId} />
    </>;
}

export function DocumentDialog({ title, onClose, children }) {
    const dialog = useRef(null);
    useEffect(() => {
        dialog.current?.showModal();
    }, []);
    return <dialog
        ref={dialog}
        className="source-dialog document-dialog"
        onCancel={onClose}>
        <header>
            <h2>
                {title}
            </h2>
            <button
                type="button"
                className="icon-button"
                aria-label="Cerrar vista previa"
                onClick={onClose}>
                <Icon name="close" />
            </button>
        </header>
        {children}
    </dialog>;
}
