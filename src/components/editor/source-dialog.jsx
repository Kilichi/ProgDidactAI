'use client';
import { useEffect, useRef, useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice, LoadingState } from '@/components/ui/feedback';
export function SourceDialog({ section, onClose }) {
    const { data: source, loading, error } = useResource(`/api/sources/${section.sourceId}`);
    const [pageNumber, setPageNumber] = useState(section.pageStart || 1);
    const [view, setView] = useState('pdf');
    const dialog = useRef(null);
    useEffect(() => {
        dialog.current?.showModal();
    }, []);
    const page = source?.pages.find((candidate) => candidate.number === pageNumber);
    return <dialog
        ref={dialog}
        className="source-dialog"
        onCancel={onClose}
    >
        <header>
            <div>
                <p className="eyebrow">
                    DOCUMENTO ORIGINAL
                </p>
                <h2>
                    {source?.filename || 'Cargando documento…'}
                </h2>
            </div>
            <button
                className="icon-button"
                aria-label="Cerrar documento original"
                onClick={onClose}
            >
                <Icon name="close" />
            </button>
        </header>
        {loading ? <LoadingState /> : error ? <ErrorNotice message={error} /> : <>
            <div className="source-toolbar">
                <label>
                    Página
                    <select
                        value={pageNumber}
                        onChange={(event) => setPageNumber(Number(event.target.value))}
                    >
                        {source.pages.map((candidate) => <option
                            key={candidate.number}
                            value={candidate.number}
                        >
                            {candidate.number}
                            {candidate.printedPage ? ` · original ${candidate.printedPage}` : ''}
                        </option>)}
                    </select>
                </label>
                <div className="filter-tabs">
                    <button
                        className={view === 'text' ? 'selected' : ''}
                        onClick={() => setView('text')}
                    >
                        Texto extraído
                    </button>
                    {source.extension === '.pdf' && <button
                        className={view === 'pdf' ? 'selected' : ''}
                        onClick={() => setView('pdf')}
                    >
                        Vista PDF
                    </button>}
                </div>
                <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-button"
                >
                    Abrir original
                    <Icon
                        name="arrow"
                        size={15}
                    />
                </a>
            </div>
            {view === 'text' || source.extension !== '.pdf' ? <pre className="source-text">
                {page?.rawText || 'Esta página no contiene texto extraíble.'}
            </pre> : <iframe
                key={pageNumber}
                title="Vista del documento PDF original"
                src={`${source.url}#page=${pageNumber}`}
                className="source-frame"
            />}
            <p className="field-hint">
                Procedencia del apartado: páginas
                {section.pageStart}
                –
                {section.pageEnd}
                . El archivo original se conserva sin modificaciones.
            </p>
        </>}
    </dialog>;
}
