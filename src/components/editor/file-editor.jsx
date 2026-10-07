'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useResource } from '@/hooks/use-resource';
import { useFileDraft } from '@/hooks/use-file-draft';
import { saveDownload } from '@/lib/api';
import { projectPage, pageIsReviewed, sectionPages } from '@/lib/file-pages';
import { isWidePage } from '@/lib/document-layout';
import { editFieldId } from '@/lib/edit-location';
import { appendTableColumn, appendTableRow, removeTableRow } from '@/lib/table-layout';
import { useWorkspace } from '@/components/layout/workspace-shell';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice, LoadingState } from '@/components/ui/feedback';
import { DocumentCanvas } from './document-canvas';
import { ReferencePreview } from './document-editor';

export function FileEditor({ fileId }) {
    const { data, setData, loading, error, reload } = useResource(`/api/files/${fileId}`);
    const query = useSearchParams();
    const [page, setPage] = useState(Number(query.get('page')) || 1);
    const [view, setView] = useState('edit');
    const [pdfLayout, setPdfLayout] = useState('original');
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState(null);
    const [preview, setPreview] = useState(null);
    const [search, setSearch] = useState('');
    const [zoom, setZoom] = useState('fit');
    const [scale, setScale] = useState(1);
    useEffect(() => {
        if (window.innerWidth < 700) {
            setZoom('0.75');
        }
    }, []);
    const stage = useRef(null);
    const previewCache = useRef(null);
    const locked = useRef(false);
    const { setDirty, guardNavigation } = useWorkspace();
    const draft = useFileDraft(data, setData, setDirty);
    const currentPage = Math.max(1, Math.min(data?.source.pages.length || 1, page));
    const projections = useMemo(() => data ? projectPage(data.programs, fileId, currentPage) : [], [data, fileId, currentPage]);
    const pageDocuments = useMemo(() => data ? data.source.pages.map((sourcePage) => ({
        ...sourcePage,
        projections: projectPage(data.programs, fileId, sourcePage.number),
    })) : [], [data, fileId]);
    const wide = isWidePage(projections);
    const queryString = query.toString();
    const sourceId = data?.source.id;
    const pageIndex = useMemo(() => data ? data.source.pages.map((candidate) => {
        const parts = projectPage(data.programs, fileId, candidate.number);
        const title = parts.find((part) => part.headingOnPage)?.section.title || parts[0]?.section.title;
        return {
            ...candidate,
            label: title && title !== 'Contenido sin epígrafe' ? title : 'Contenido del documento',
            reviewed: pageIsReviewed(data.programs, fileId, candidate.number),
        };
    }) : [], [data, fileId]);
    useEffect(() => () => {
        if (previewCache.current) {
            URL.revokeObjectURL(previewCache.current.url);
        }
    }, []);
    useEffect(() => {
        if (!sourceId) {
            return;
        }
        const location = Object.fromEntries(new URLSearchParams(queryString));
        setPage(Number(location.page) || 1);
        if (!location.sectionId) {
            return;
        }
        setView('edit');
        const timer = setTimeout(() => {
            const field = document.getElementById(editFieldId(location));
            field?.scrollIntoView({ block: 'center' });
            field?.focus({ preventScroll: true });
        }, 100);
        return () => clearTimeout(timer);
    }, [queryString, sourceId]);
    useEffect(() => {
        const element = stage.current;
        if (!element) {
            return;
        }
        const resize = () => setScale(zoom === 'fit' ? Math.min(1, Math.max(.2, (element.clientWidth - 32) / ((wide ? 297 : 210) * 96 / 25.4))) : Number(zoom));
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        return () => observer.disconnect();
    }, [zoom, wide, view, loading]);
    const saveRef = useRef(draft.save);
    saveRef.current = draft.save;
    useEffect(() => {
        const keydown = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                saveRef.current().catch(() => {});
            }
        };
        window.addEventListener('keydown', keydown);
        return () => window.removeEventListener('keydown', keydown);
    }, []);
    if (loading) {
        return <LoadingState label="Abriendo el documento…" />;
    }
    if (error || !data) {
        return <ErrorNotice
            message={error}
            onRetry={reload} />;
    }

    function changePage(next) {
        setPage(next);
        if (stage.current) {
            document.getElementById(`studio-page-${next}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }
    }
    function edit(location, value, pageNumber = currentPage) {
        value = String(value ?? '')
            .replace(/\u00a0/g, ' ')
            .split('\n')
            .map((line) => line.replace(/[ \t]+/g, ' ').trim())
            .join('\n')
            .trim();
        const pageProjection = pageDocuments.find((candidate) => candidate.number === pageNumber);
        const projection = pageProjection?.projections.find((part) => part.section.id === location.sectionId);
        if (!projection) {
            return;
        }
        const section = projection.section;
        let updated;
        if (location.field === 'title' || location.field === 'code') {
            if (section[location.field] === value) {
                return;
            }
            updated = {
                ...section,
                [location.field]: value,
            };
        } else {
            const part = projection.projections.find((candidate) => candidate.block.id === location.blockId);
            if (!part) {
                return;
            }
            const block = part.block;
            let changed;
            if (location.field === 'text') {
                changed = {
                    ...block,
                    text: value,
                };
            }
            if (location.field === 'item') {
                changed = {
                    ...block,
                    items: block.items.map((item, index) => index === location.index ? value : item),
                };
            }
            if (location.field === 'column') {
                changed = {
                    ...block,
                    columns: block.columns.map((item, index) => index === location.index ? value : item),
                };
            }
            if (location.field === 'cell') {
                changed = {
                    ...block,
                    rows: block.rows.map((row, index) => index === location.row ? row.map((cell, column) => column === location.column ? value : cell) : row),
                };
            }
            if (!changed || JSON.stringify(changed) === JSON.stringify(block)) {
                return;
            }
            updated = {
                ...section,
                blocks: section.blocks.map((candidate) => candidate.id === block.id ? part.merge(changed) : candidate),
            };
        }
        updated.reviewed = false;
        updated.reviewedPages = (section.reviewed ? sectionPages(section) : section.reviewedPages || []).filter((number) => number !== currentPage);
        draft.update(draft.latest.current.programs.map((program) => program.id === projection.programId ? {
            ...program,
            status: 'draft',
            sections: program.sections.map((candidate) => candidate.id === section.id ? updated : candidate),
        } : program), JSON.stringify(location));
    }
    function tableAction(location, action, pageNumber) {
        const pageProjection = pageDocuments.find((candidate) => candidate.number === pageNumber);
        const projection = pageProjection?.projections.find((part) => part.section.id === location.sectionId);
        const part = projection?.projections.find((candidate) => candidate.block.id === location.blockId);
        if (!projection || !part || part.block.type !== 'table') {
            return;
        }
        if (!['row', 'column', 'remove-row'].includes(action)) {
            return;
        }
        if (action === 'remove-row' && part.block.rows[location.row]?.some((cell) => cell.trim()) &&
            !window.confirm('¿Eliminar esta fila y su contenido? Puedes recuperarla con Deshacer.')) {
            return;
        }
        const changed = action === 'remove-row' ? removeTableRow(part.block, location.row)
            : action === 'row' ? appendTableRow(part.block) : appendTableColumn(part.block);
        const section = projection.section;
        const updated = {
            ...section,
            reviewed: false,
            blocks: section.blocks.map((candidate) => candidate.id === part.block.id ? part.merge(changed) : candidate),
        };
        draft.update(draft.latest.current.programs.map((program) => program.id === projection.programId ? {
            ...program,
            status: 'draft',
            sections: program.sections.map((candidate) => candidate.id === section.id ? updated : candidate),
        } : program));
    }
    function markPage() {
        const reviewed = pageIsReviewed(data.programs, fileId, currentPage);
        draft.update(data.programs.map((program) => {
            if (!projections.some((part) => part.programId === program.id)) {
                return program;
            }
            const sections = program.sections.map((section) => {
                if (section.sourceId !== fileId || !sectionPages(section).includes(currentPage)) {
                    return section;
                }
                const pages = new Set(section.reviewed ? sectionPages(section) : section.reviewedPages || []);
                if (reviewed) {
                    pages.delete(currentPage);
                } else {
                    pages.add(currentPage);
                }
                return {
                    ...section,
                    reviewedPages: [...pages],
                    reviewed: sectionPages(section).every((number) => pages.has(number)),
                };
            });
            return {
                ...program,
                sections,
                status: sections.length && sections.every((section) => section.reviewed) ? 'reviewed' : 'draft',
            };
        }));
    }
    async function createPreview(download = false) {
        if (locked.current) {
            return;
        }
        locked.current = true;
        setBusy(true);
        setFailure(null);
        try {
            let result = previewCache.current;
            if (!result || result.version !== draft.version || result.layout !== pdfLayout) {
                // Finish any autosave before validating preview revisions.
                await draft.save();
                const response = await fetch(`/api/files/${fileId}/preview`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        programs: draft.latest.current.programs,
                        layout: pdfLayout,
                    }),
                });
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    throw Object.assign(new Error(payload.error || 'No se ha podido generar el PDF.'), { details: payload.details });
                }
                const blob = await response.blob();
                if (blob.size < 5 || !blob.type.includes('application/pdf')) {
                    throw new Error('El servidor no ha devuelto un PDF válido.');
                }
                if (result) {
                    URL.revokeObjectURL(result.url);
                }
                result = {
                    blob,
                    url: URL.createObjectURL(blob),
                    pageMap: JSON.parse(response.headers.get('X-Page-Map') || '{}'),
                    count: Number(response.headers.get('X-Page-Count')),
                    version: draft.version,
                    layout: pdfLayout,
                };
                previewCache.current = result;
                setPreview(result);
            }
            if (download) {
                saveDownload(result.blob, data.source.filename.replace(/\.[^.]+$/, '') + '-editado.pdf');
            } else {
                setView('pdf');
            }
        } catch (err) {
            setFailure(err);
        } finally {
            setBusy(false); locked.current = false;
        }
    }
    const reviewed = pageIsReviewed(data.programs, fileId, currentPage);
    const reviewedCount = pageIndex.filter((candidate) => candidate.reviewed).length;
    const filtered = pageIndex.filter((candidate) => `${candidate.number} ${candidate.label} ${candidate.rawText || ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
    return <div className="document-studio">
        <Link
            href="/"
            className="back-link"
            onClick={guardNavigation}>
            <Icon
                name="back"
                size={16} />
Todos los documentos
        </Link>
        <header className="studio-heading">
            <div>
                <p className="eyebrow">
EDITOR DE DOCUMENTOS
                </p>
                <h1>
                    {data.source.filename}
                </h1>
                <p>
Edita directamente sobre el documento. Los cambios se guardan automáticamente.
                </p>
            </div>
            <button
                className="button button-primary"
                disabled={busy}
                onClick={() => createPreview(true)}>
                <Icon
                    name="download"
                    size={17} />
                {busy ? 'Preparando PDF…' : 'Descargar PDF'}
            </button>
        </header>
        <div className="studio-export-options">
            <label htmlFor="pdf-layout">
Formato de descarga
            </label>
            <select
                id="pdf-layout"
                value={pdfLayout}
                disabled={busy}
                onChange={(event) => {
                    setPdfLayout(event.target.value);
                    setView('edit');
                }}>
                <option value="original">
Conservar el diseño original
                </option>
            </select>
            <span>
                Mantiene las páginas originales. Si una edición no cabe, se indicará dónde corregirla.
            </span>
        </div>
        <ErrorNotice
            message={(failure || draft.failure)?.message}
            details={(failure || draft.failure)?.details}
            onRetry={draft.failure ? () => draft.save().catch(() => {}) : () => createPreview()} />
        <div className="studio-toolbar">
            <div
                className="studio-tabs"
                role="group"
                aria-label="Vista del documento">
                <button
                    aria-pressed={view === 'edit'}
                    onClick={() => setView('edit')}
                    disabled={busy}>
                    <Icon
                        name="file"
                        size={16} />
Editar
                </button>
                <button
                    aria-pressed={view === 'pdf'}
                    onClick={() => createPreview()}
                    disabled={busy}>
                    <Icon
                        name="eye"
                        size={16} />
                    {busy ? 'Generando…' : 'Vista previa PDF'}
                </button>
                <button
                    aria-pressed={view === 'original'}
                    onClick={() => setView('original')}
                    disabled={busy}>
Original
                </button>
            </div>
            <div className="studio-tools">
                <button
                    className="icon-button"
                    aria-label="Deshacer cambio"
                    title="Deshacer cambio"
                    disabled={!draft.canUndo || busy}
                    onClick={() => {
                        draft.travel('undo'); setView('edit');
                    }}>
↶
                </button>
                <button
                    className="icon-button"
                    aria-label="Rehacer cambio"
                    title="Rehacer cambio"
                    disabled={!draft.canRedo || busy}
                    onClick={() => {
                        draft.travel('redo'); setView('edit');
                    }}>
↷
                </button>
                <span
                    className={`studio-save-state ${draft.failure ? 'has-error' : ''}`}
                    role="status">
                    {draft.saving ? 'Guardando…' : draft.failure ? 'No se ha guardado' : draft.dirty ? 'Cambios pendientes' : 'Todos los cambios guardados'}
                </span>
                <button
                    className="icon-button"
                    aria-label="Guardar cambios"
                    title="Guardar cambios (Ctrl+S)"
                    disabled={!draft.dirty || draft.saving || busy}
                    onClick={() => draft.save().catch(() => {})}>
                    <Icon
                        name="save"
                        size={17} />
                </button>
            </div>
        </div>
        <div className="studio-layout">
            <aside
                className="studio-outline"
                aria-label="Páginas del documento">
                <div className="studio-outline-heading">
                    <strong>
Contenido
                    </strong>
                    <span>
                        {data.source.pages.length}
                        {' '}
páginas
                    </span>
                </div>
                <label className="search-field">
                    <Icon
                        name="search"
                        size={16} />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar en el documento…"
                        aria-label="Buscar páginas" />
                </label>
                <div className="studio-progress">
                    <progress
                        value={reviewedCount}
                        max={pageIndex.length} />
                    <span>
                        {reviewedCount}
                        {' '}
de
                        {' '}
                        {' '}
                        {pageIndex.length}
                        {' '}
páginas revisadas
                    </span>
                </div>
                <nav>
                    {filtered.map((candidate) => <button
                        key={candidate.number}
                        className={`studio-page-link ${candidate.number === currentPage ? 'selected' : ''}`}
                        aria-current={candidate.number === currentPage ? 'page' : undefined}
                        disabled={busy}
                        onClick={() => changePage(candidate.number)}>
                        <span className="studio-page-number">
                            {candidate.number}
                        </span>
                        <span>
                            {candidate.label}
                        </span>
                        {candidate.reviewed && <Icon
                            name="check"
                            size={14} />}
                    </button>)}
                    {!filtered.length && <p className="studio-no-results">
No hay páginas que coincidan.
                    </p>}
                </nav>
            </aside>
            <section
                className="studio-workspace"
                aria-label="Documento editable">
                <div className="studio-page-controls">
                    <div className="file-page-navigation">
                        <button
                            className="icon-button"
                            aria-label="Página anterior"
                            disabled={currentPage === 1 || busy}
                            onClick={() => changePage(currentPage - 1)}>
                            <Icon
                                name="back"
                                size={16} />
                        </button>
                        <label>
Página
                            {' '}
                            <select
                                aria-label="Página del archivo"
                                value={currentPage}
                                disabled={busy}
                                onChange={(event) => changePage(Number(event.target.value))}>
                                {pageIndex.map((candidate) => <option
                                    key={candidate.number}
                                    value={candidate.number}>
                                    {candidate.number}
                                </option>)}
                            </select>
                            <span>
de
                                {' '}
                                {pageIndex.length}
                            </span>
                        </label>
                        <button
                            className="icon-button"
                            aria-label="Página siguiente"
                            disabled={currentPage === pageIndex.length || busy}
                            onClick={() => changePage(currentPage + 1)}>
                            <Icon
                                name="arrow"
                                size={16} />
                        </button>
                    </div>
                    {view === 'edit' && <select
                        aria-label="Zoom del documento"
                        value={zoom}
                        onChange={(event) => setZoom(event.target.value)}>
                        <option value="fit">
Ajustar al ancho
                        </option>
                        <option value="0.75">
75 %
                        </option>
                        <option value="1">
100 %
                        </option>
                        <option value="1.25">
125 %
                        </option>
                    </select>}
                    <button
                        className={`studio-review ${reviewed ? 'is-reviewed' : ''}`}
                        disabled={busy || !projections.length}
                        onClick={markPage}>
                        <Icon
                            name="check"
                            size={15} />
                        {reviewed ? 'Revisada' : 'Marcar revisada'}
                    </button>
                </div>
                {view === 'edit' && <div
                    className="studio-canvas"
                    ref={stage}>
                    <div
                        className="studio-document-stack"
                        inert={busy ? true : undefined}>
                        {pageDocuments.map((sourcePage) => {
                            const pageWide = isWidePage(sourcePage.projections);
                            return <article
                                className={`studio-paper ${pageWide ? 'is-landscape' : ''} ${sourcePage.number === currentPage ? 'is-current-page' : ''}`}
                                id={`studio-page-${sourcePage.number}`}
                                style={{ zoom: scale }}
                                key={`${sourcePage.number}-${draft.historyVersion}`}>
                                <DocumentCanvas
                                    projections={sourcePage.projections}
                                    fallback={sourcePage.rawText || ''}
                                    onEdit={(location, value) => edit(location, value, sourcePage.number)}
                                    onTableAction={(location, action) => tableAction(location, action, sourcePage.number)} />
                                <span className="studio-paper-number">
Página
                                    {sourcePage.number}
                                </span>
                            </article>;
                        })}
                    </div>
                    <p className="studio-canvas-note">
Vista completa · cada hoja corresponde a una página del documento original.
                    </p>
                </div>}
                {view === 'pdf' && preview && <div className="studio-pdf">
                    <div className="studio-pdf-caption">
                        <span>
                            {preview.count}
                            {' '}
páginas · PDF listo para descargar
                        </span>
                        <button
                            className="text-button"
                            onClick={() => createPreview(true)}>
Descargar este PDF
                        </button>
                    </div>
                    <iframe
                        key={`${preview.url}-${currentPage}`}
                        src={`${preview.url}#page=${preview.pageMap[currentPage] || 1}&view=FitH`}
                        title="Vista previa del PDF final" />
                </div>}
                {view === 'original' && <ReferencePreview
                    sourceId={fileId}
                    pageNumber={currentPage} />}
            </section>
        </div>
    </div>;
}
