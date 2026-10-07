'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useResource } from '@/hooks/use-resource';
import { downloadExport, saveDownload } from '@/lib/api';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice, LoadingState, StatusBadge } from '@/components/ui/feedback';
import { useWorkspace } from '@/components/layout/workspace-shell';
import { OriginalDocuments } from '@/components/documents/original-documents';
export function ExportWorkspace() {
    const { data: programs, loading, error } = useResource('/api/programs');
    const { data: settings } = useResource('/api/settings');
    const [selectedIds, setSelectedIds] = useState([]);
    const [draft, setDraft] = useState(false);
    const [renumber, setRenumber] = useState(true);
    const [preview, setPreview] = useState('');
    const [pdfPreview, setPdfPreview] = useState('');
    const [jsonPreview, setJsonPreview] = useState('');
    const [previewView, setPreviewView] = useState('');
    const [pageCount, setPageCount] = useState(0);
    const [layout, setLayout] = useState('original');
    const [busy, setBusy] = useState('');
    const [actionError, setActionError] = useState('');
    const [errorDetails, setErrorDetails] = useState(null);
    const { notify } = useWorkspace();
    useEffect(() => {
        setPreview('');
        setPdfPreview('');
        setJsonPreview('');
        setPreviewView('');
        setPageCount(0);
    }, [selectedIds, draft, renumber, layout]);
    useEffect(() => () => {
        if (pdfPreview) {
            URL.revokeObjectURL(pdfPreview);
        }
    }, [pdfPreview]);
    const sourceIds = [...new Set((programs || []).filter((program) => selectedIds.includes(program.id)).flatMap((program) => [...program.sourceIds, ...program.sections.map((section) => section.sourceId)]).filter(Boolean))];
    useEffect(() => {
        if (sourceIds.length) {
            setLayout('original');
        }
    }, [sourceIds.length]);
    function toggleProgram(programId) {
        setSelectedIds((previous) => previous.includes(programId) ? previous.filter((id) => id !== programId) : [...previous, programId]);
    }
    function reorderProgram(index, direction) {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= selectedIds.length) {
            return;
        }
        const reordered = [...selectedIds];
        [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
        setSelectedIds(reordered);
    }
    async function exportDocument(format, previewOnly = false) {
        setBusy(previewOnly ? 'json-preview' : format);
        setActionError('');
        setErrorDetails(null);
        try {
            if (format === 'pdf' && pdfPreview) {
                saveDownload(await (await fetch(pdfPreview)).blob(), 'Programacion_Didactica.pdf');
                return;
            }
            const response = await downloadExport(format, {
                ids: selectedIds,
                draft,
                renumber,
                layout,
            });
            if (format === 'preview') {
                if (response.headers.get('Content-Type')?.includes('application/pdf')) {
                    setPdfPreview(URL.createObjectURL(await response.blob()));
                    setPreview('');
                } else {
                    setPreview(await response.text());
                    setPdfPreview('');
                }
                setPageCount(Number(response.headers.get('X-Page-Count')) || 0);
                setPreviewView('document');
            } else if (previewOnly) {
                setJsonPreview(JSON.stringify(await response.json(), null, 4));
                setPreviewView('json');
            } else {
                saveDownload(await response.blob(), format === 'pdf' ? 'Programacion_Didactica.pdf' : 'Programaciones.json');
                notify('Documento generado y listo para descargar.');
            }
        } catch (failure) {
            setActionError(failure.message);
            setErrorDetails(failure.details);
        } finally {
            setBusy('');
        }
    }
    return (
        <>
            <section className="page-heading">
                <div>
                    <p className="eyebrow">
                        TODOS LOS MÓDULOS. UNA MISMA PROGRAMACIÓN.
                    </p>
                    <h1>
                        Consolidar y exportar
                        <span className="heading-dot">
                            .
                        </span>
                    </h1>
                    <p>
                        Elige los módulos, decide el orden y prepara el documento del curso.
                    </p>
                </div>
                <Link
                    className="button button-secondary"
                    href="/configuracion"
                >
                    <Icon
                        name="settings"
                        size={17}
                    />
                    Ajustar plantilla
                </Link>
            </section>
            <ErrorNotice
                message={error || actionError}
                details={errorDetails} />
            {loading ? <LoadingState /> : <div className="export-grid">
                <section className="card export-selection">
                    <div className="panel-heading">
                        <div>
                            <h2>
                                Módulos del documento
                            </h2>
                            <p>
                                {selectedIds.length}
                                {' '}
                                seleccionados · en el orden de selección
                            </p>
                        </div>
                        <button
                            className="text-button"
                            onClick={() => setSelectedIds(selectedIds.length === programs?.length ? [] : programs.map((program) => program.id))}
                        >
                            {selectedIds.length === programs?.length ? 'Quitar todos' : 'Seleccionar todos'}
                        </button>
                    </div>
                    {programs?.length ? <div className="export-module-list">
                        {programs.map((program) => <label
                            key={program.id}
                            className={`export-module ${selectedIds.includes(program.id) ? 'selected' : ''}`}
                        >
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(program.id)}
                                onChange={() => toggleProgram(program.id)}
                            />
                            <span className="module-icon">
                                <Icon name="file" />
                            </span>
                            <span>
                                <strong>
                                    {program.module}
                                </strong>
                                <small>
                                    {program.code || 'Sin código'}
                                    {' '}
                                    ·
                                    {' '}
                                    {program.sections.length}
                                    {' '}
                                    apartados
                                </small>
                            </span>
                            <StatusBadge reviewed={program.status === 'reviewed'} />
                        </label>)}
                    </div> : <div className="empty-state">
                        <Icon
                            name="file"
                            size={30}
                        />
                        <h3>
                            Importa tus primeros módulos
                        </h3>
                        <p>
                            Después podrás reunirlos en una programación del ciclo.
                        </p>
                        <Link
                            href="/importar"
                            className="button button-primary"
                        >
                            Importar documentos
                        </Link>
                    </div>}
                    {!!selectedIds.length && <div className="export-order">
                        <h3>
                            Orden del documento
                        </h3>
                        {selectedIds.map((id, index) => <div key={id}>
                            <span className="order-number">
                                {index + 1}
                            </span>
                            <span>
                                {programs.find((program) => program.id === id)?.module}
                            </span>
                            <button
                                className="icon-button"
                                aria-label={`Subir módulo ${index + 1}`}
                                disabled={index === 0}
                                onClick={() => reorderProgram(index, -1)}
                            >
                                ↑
                            </button>
                            <button
                                className="icon-button"
                                aria-label={`Bajar módulo ${index + 1}`}
                                disabled={index === selectedIds.length - 1}
                                onClick={() => reorderProgram(index, 1)}
                            >
                                ↓
                            </button>
                        </div>)}
                    </div>}
                </section>
                <aside className="card export-options">
                    <span className="stat-icon blue">
                        <Icon name="download" />
                    </span>
                    <h2>
                        Tu documento final
                    </h2>
                    <label className="export-layout-selector">
                        Formato del PDF
                        <select
                            value={layout}
                            onChange={(event) => setLayout(event.target.value)}>
                            <option value="original">
                                Diseño original · mismas páginas
                            </option>
                            <option
                                value="institutional"
                                disabled={sourceIds.length > 0}>
                                Plantilla institucional · documento nuevo
                            </option>
                        </select>
                    </label>
                    {layout === 'original' && <p className="notice notice-warning">
                        Conserva las páginas completas, su numeración y el diseño de cada archivo importado. No se añaden páginas. Si una edición no cabe, se indica el apartado que debes ajustar.
                    </p>}
                    {layout === 'institutional' && <>
                        <p>
                            {settings?.institution || 'Plantilla institucional'}
                        </p>
                        <div className="template-summary">
                            <strong>
                                {settings?.title}
                            </strong>
                            <span>
                                {settings?.cycle}
                            </span>
                            <small>
                                Curso
                                {settings?.academicYear}
                            </small>
                        </div>
                        <ul className="check-list">
                            <li>
                                <Icon
                                    name="check"
                                    size={16}
                                />
                                Portada del centro
                            </li>
                            <li>
                                <Icon
                                    name="check"
                                    size={16}
                                />
                                Índice con páginas calculadas
                            </li>
                            <li>
                                <Icon
                                    name="check"
                                    size={16}
                                />
                                Tablas y encabezados de página
                            </li>
                            <li>
                                <Icon
                                    name="check"
                                    size={16}
                                />
                                Paginación automática
                            </li>
                        </ul>
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={renumber}
                                onChange={(event) => setRenumber(event.target.checked)}
                            />
                            <span>
                                Unificar la numeración de apartados
                            </span>
                        </label>
                        <p className="field-hint">
                            Ordena los epígrafes del documento final. Revisa manualmente las referencias numéricas escritas dentro de los textos.
                        </p>
                    </>}
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={draft}
                            onChange={(event) => setDraft(event.target.checked)}
                        />
                        <span>
                            Exportar como borrador
                        </span>
                    </label>
                    <p className="field-hint">
                        Permite incluir módulos pendientes y los identifica como borrador. El documento definitivo requiere todos los apartados revisados.
                    </p>
                    <button
                        className="button button-primary"
                        disabled={!selectedIds.length || !!busy}
                        onClick={() => exportDocument('pdf')}
                    >
                        {busy === 'pdf' ? <span className="spinner small" /> : <Icon
                            name="download"
                            size={17}
                        />}
                        {busy === 'pdf' ? 'Generando documento…' : 'Descargar PDF'}
                    </button>
                    <button
                        className="button button-secondary"
                        disabled={!selectedIds.length || !!busy}
                        onClick={() => exportDocument('json', true)}
                    >
                        <Icon
                            name="eye"
                            size={17} />
                        {busy === 'json-preview' ? 'Preparando JSON…' : 'Previsualizar JSON'}
                    </button>
                    <button
                        className="button button-secondary"
                        disabled={!selectedIds.length || !!busy}
                        onClick={() => setPreviewView('original')}
                    >
                        <Icon
                            name="file"
                            size={17} />
                        Ver documento original
                    </button>
                    <button
                        className="button button-secondary"
                        disabled={!selectedIds.length || !!busy}
                        onClick={() => exportDocument('preview')}
                    >
                        <Icon
                            name="eye"
                            size={17}
                        />
                        {busy === 'preview' ? 'Preparando…' : 'Previsualizar documento'}
                    </button>
                    <button
                        className="text-button"
                        disabled={!selectedIds.length || !!busy}
                        onClick={() => exportDocument('json')}
                    >
                        Descargar datos en JSON
                    </button>
                </aside>
            </div>}
            {previewView && <section className="card preview-panel">
                <div className="panel-heading">
                    <div>
                        <h2>
                            {previewView === 'json' ? 'Vista previa del JSON' : previewView === 'original' ? 'Documento original' : 'Previsualización del documento'}
                        </h2>
                        <p>
                            {previewView === 'json' ? 'Los mismos datos que contiene la descarga JSON.' : previewView === 'original' ? 'El archivo importado, conservado sin modificaciones.' : pageCount ? `${pageCount} páginas · PDF final.` : 'PDF final con la misma paginación que la descarga.'}
                        </p>
                    </div>
                    <button
                        className="icon-button"
                        aria-label="Cerrar previsualización"
                        onClick={() => setPreviewView('')}
                    >
                        <Icon name="close" />
                    </button>
                </div>
                <div
                    className="document-preview-tabs filter-tabs"
                    aria-label="Vista previa">
                    <button
                        className={previewView === 'document' ? 'selected' : ''}
                        disabled={!preview && !pdfPreview}
                        onClick={() => setPreviewView('document')}>
                        Documento editado
                    </button>
                    <button
                        className={previewView === 'json' ? 'selected' : ''}
                        disabled={!jsonPreview}
                        onClick={() => setPreviewView('json')}>
                        JSON
                    </button>
                    <button
                        className={previewView === 'original' ? 'selected' : ''}
                        onClick={() => setPreviewView('original')}>
                        Original
                    </button>
                </div>
                {previewView === 'document' ? <iframe
                    title="Previsualización de la programación unificada"
                    srcDoc={pdfPreview ? undefined : preview}
                    src={pdfPreview || undefined}
                    sandbox={pdfPreview ? undefined : ''}
                /> : previewView === 'json' ? <pre className="json-preview">
                    <code>
                        {jsonPreview}
                    </code>
                </pre> : <OriginalDocuments sourceIds={sourceIds} />}
            </section>}
        </>);
}
