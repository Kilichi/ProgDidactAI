'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { editFieldId } from '@/lib/edit-location';
import { useResource } from '@/hooks/use-resource';
import { apiRequest, createEmptyBlock, getBlockText } from '@/lib/api';
import { useWorkspace } from '@/components/layout/workspace-shell';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice, LoadingState, StatusBadge } from '@/components/ui/feedback';
import { BlockEditor } from './block-editor';
import { SourceDialog } from './source-dialog';
import { HistoryDialog } from './history-dialog';
import { DocumentDialog, OriginalDocuments } from '@/components/documents/original-documents';
import { DocumentEditor, ReferencePreview } from './document-editor';
export function ProgramEditor({ programId }) {
    const { data: program, setData: setProgram, loading, error, reload } = useResource(`/api/programs/${programId}`);
    const { data: programs, reload: reloadPrograms } = useResource('/api/programs');
    const [selectedId, setSelectedId] = useState('');
    const [search, setSearch] = useState('');
    const [actionError, setActionError] = useState('');
    const [saving, setSaving] = useState(false);
    const [showSource, setShowSource] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [documentPreview, setDocumentPreview] = useState('');
    const [editorMode, setEditorMode] = useState('document');
    const [compareOriginal, setCompareOriginal] = useState(false);
    const undoHistory = useRef([]);
    const redoHistory = useRef([]);
    const lastSnapshotTime = useRef(0);
    const saveShortcut = useRef(null);
    const [targetId, setTargetId] = useState('');
    const { dirty, setDirty, notify, guardNavigation } = useWorkspace();
    useEffect(() => () => setDirty(false), [setDirty]);
    useEffect(() => {
        undoHistory.current = [];
        redoHistory.current = [];
        lastSnapshotTime.current = 0;
        setSelectedId('');
    }, [programId]);
    useEffect(() => {
        const handleShortcut = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                saveShortcut.current?.();
            }
        };
        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, []);
    const openedLocation = useRef('');
    const queryString = useSearchParams().toString();
    useEffect(() => {
        if (!program) {
            return;
        }
        const query = new URLSearchParams(queryString);
        const sectionId = query.get('sectionId');
        if (!sectionId || openedLocation.current === queryString ||
            !program.sections.some((candidate) => candidate.id === sectionId)) {
            return;
        }
        openedLocation.current = queryString;
        setSelectedId(sectionId);
        setSearch('');
        setEditorMode('document');
        const location = Object.fromEntries(query);
        const timer = setTimeout(() => {
            const field = document.getElementById(editFieldId(location));
            const target = field || document.getElementById(`document-section-${sectionId}`);
            target?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
            field?.focus({ preventScroll: true });
        }, 150);
        return () => clearTimeout(timer);
    }, [program, queryString]);
    if (loading) {
        return <LoadingState label="Abriendo tu programación…" />;
    }
    if (error || !program) {
        return (
            <ErrorNotice
                message={error}
                onRetry={reload}
            />
        );
    }
    const section = program.sections.find((candidate) => candidate.id === selectedId) || program.sections[0];
    const reviewedCount = program.sections.filter((candidate) => candidate.reviewed).length;
    const allReviewed = program.sections.length > 0 && reviewedCount === program.sections.length;
    const visibleSections = program.sections.filter((candidate) => `${candidate.code} ${candidate.title} ${candidate.blocks.map(getBlockText).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
    function updateProgram(changes) {
        if (Date.now() - lastSnapshotTime.current > 700) {
            undoHistory.current = [...undoHistory.current, program].slice(-40);
        }
        lastSnapshotTime.current = Date.now();
        redoHistory.current = [];
        setProgram((previous) => ({
            ...previous,
            ...changes,
            status: 'draft',
        }));
        setDirty(true);
    }
    function restoreEdit(direction) {
        const history = direction === 'undo' ? undoHistory : redoHistory;
        const opposite = direction === 'undo' ? redoHistory : undoHistory;
        const snapshot = history.current.pop();
        if (!snapshot) {
            return;
        }
        opposite.current.push(program);
        setProgram({
            ...snapshot,
            revision: program.revision,
            status: 'draft',
        });
        lastSnapshotTime.current = 0;
        setDirty(true);
    }
    function updateSection(changes, preserveReview = false) {
        updateProgram({
            sections: program.sections.map((candidate) => candidate.id === section.id ? {
                ...candidate,
                ...changes,
                reviewed: preserveReview ? changes.reviewed : false,
            } : candidate),
        });
    }
    async function saveChanges(review = false) {
        setSaving(true);
        setActionError('');
        try {
            const saved = await apiRequest(`/api/programs/${program.id}`, {
                method: 'PUT',
                body: {
                    ...program,
                    status: review ? 'reviewed' : 'draft',
                },
            });
            setProgram(saved);
            setDirty(false);
            notify(review ? 'Programación revisada y lista para exportar.' : `Cambios guardados · versión ${saved.revision}.`);
            await reloadPrograms();
        } catch (failure) {
            setActionError(failure.message);
        } finally {
            setSaving(false);
        }
    }
    saveShortcut.current = () => {
        if (dirty && !saving) {
            saveChanges();
        }
    };
    function addSection() {
        const newSection = {
            id: crypto.randomUUID(),
            code: '',
            originalCode: '',
            title: 'Nuevo apartado',
            blocks: [createEmptyBlock()],
            sourceId: '',
            pageStart: 0,
            pageEnd: 0,
            headingRefs: [],
            warnings: [],
            reviewed: false,
        };
        updateProgram({ sections: [...program.sections, newSection] });
        setSelectedId(newSection.id);
    }
    function reorderSection(direction) {
        const index = program.sections.findIndex((candidate) => candidate.id === section.id);
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= program.sections.length) {
            return;
        }
        const sections = [...program.sections];
        [sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]];
        updateProgram({ sections });
    }
    function reorderBlock(index, direction) {
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= section.blocks.length) {
            return;
        }
        const blocks = [...section.blocks];
        [blocks[index], blocks[nextIndex]] = [blocks[nextIndex], blocks[index]];
        updateSection({ blocks });
    }
    async function reassignSection() {
        if (dirty) {
            setActionError('Guarda los cambios antes de reasignar el apartado.');
            return;
        }
        const target = programs.find((candidate) => candidate.id === targetId);
        if (!target) {
            return;
        }
        setSaving(true);
        setActionError('');
        try {
            const result = await apiRequest(`/api/programs/${program.id}/move-section`, {
                method: 'POST',
                body: {
                    revision: program.revision,
                    targetId,
                    targetRevision: target.revision,
                    sectionId: section.id,
                },
            });
            setProgram(result.from);
            setSelectedId('');
            setTargetId('');
            await reloadPrograms();
            notify('Apartado reasignado. El origen y el histórico se conservan.');
        } catch (failure) {
            setActionError(failure.message);
        } finally {
            setSaving(false);
        }
    }
    return (
        <>
            <Link
                href="/"
                className="back-link"
                onClick={guardNavigation}
            >
                <Icon
                    name="back"
                    size={16}
                />
                Mis programaciones
            </Link>
            <section className="page-heading editor-heading">
                <div>
                    <p className="eyebrow">
                        REVISA. ACTUALIZA. HAZLO TUYO.
                    </p>
                    <h1>
                        {program.module}
                    </h1>
                    <p>
                        <StatusBadge reviewed={program.status === 'reviewed'} />
                        {' '}
                        <span className="version-label">
                            Versión
                            {' '}
                            {program.revision}
                            {' '}
                            ·
                            {reviewedCount}
                            /
                            {program.sections.length}
                            {' '}
                            apartados revisados
                        </span>
                    </p>
                </div>
                <div className="heading-actions">
                    <button
                        className="button button-secondary"
                        disabled={!program.sourceIds.length && !program.sections.some((candidate) => candidate.sourceId)}
                        onClick={() => setDocumentPreview('original')}
                    >
                        <Icon
                            name="file"
                            size={17} />
                        Ver documento original
                    </button>
                    <button
                        className="button button-secondary"
                        onClick={() => setDocumentPreview('json')}>
                        <Icon
                            name="eye"
                            size={17} />
                        Ver JSON
                    </button>
                    <button
                        className="button button-secondary"
                        onClick={() => {
                            if (dirty) {
                                setActionError('Guarda los cambios antes de consultar o recuperar versiones.');
                                return;
                            }
                            setShowHistory(true);
                        }}
                    >
                        <Icon
                            name="clock"
                            size={17}
                        />
                        Histórico
                    </button>
                    <button
                        className="button button-primary"
                        disabled={saving || !dirty}
                        onClick={() => saveChanges()}
                    >
                        <Icon
                            name="save"
                            size={17}
                        />
                        {saving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </div>
            </section>
            <ErrorNotice message={actionError} />
            <details
                className="card metadata-card editor-metadata"
                aria-label="Identificación del módulo"
            >
                <summary>
                    Datos del módulo
                    <span>
                        {program.code || 'Sin código'}
                        {' '}
                        ·
                        {' '}
                        {program.course || 'Sin curso'}
                    </span>
                </summary>
                <div className="metadata-fields">
                    {[['module', 'Nombre del módulo'], ['code', 'Código'], ['course', 'Curso'], ['teacher', 'Profesorado']].map(([field, label]) => <label key={field}>
                        {label}
                        <input
                            value={program[field]}
                            onChange={(event) => updateProgram({ [field]: event.target.value })}
                        />
                    </label>)}
                </div>
                {program.warnings.length > 0 && <details className="program-warnings">
                    <summary>
                        <Icon
                            name="warning"
                            size={15}
                        />
                        {program.warnings.length}
                        {' '}
                        observaciones sobre la importación
                    </summary>
                    <ul>
                        {program.warnings.map((warning, index) => <li key={index}>
                            {warning}
                        </li>)}
                    </ul>
                </details>}
            </details>
            <div className="document-edit-toolbar">
                <div
                    className="filter-tabs"
                    role="group"
                    aria-label="Modo de edición">
                    <button
                        className={editorMode === 'document' ? 'selected' : ''}
                        onClick={() => setEditorMode('document')}>
                        Editar documento
                    </button>
                    <button
                        className={editorMode === 'structure' ? 'selected' : ''}
                        onClick={() => setEditorMode('structure')}>
                        Organizar estructura
                    </button>
                </div>
                <div className="document-edit-actions">
                    <button
                        className="icon-button"
                        aria-label="Deshacer última edición"
                        disabled={!undoHistory.current.length}
                        onClick={() => restoreEdit('undo')}>
                        ↶
                    </button>
                    <button
                        className="icon-button"
                        aria-label="Rehacer edición"
                        disabled={!redoHistory.current.length}
                        onClick={() => restoreEdit('redo')}>
                        ↷
                    </button>
                    <button
                        className={`button button-secondary button-small ${compareOriginal ? 'is-active' : ''}`}
                        aria-pressed={compareOriginal}
                        disabled={!section?.sourceId}
                        onClick={() => setCompareOriginal(!compareOriginal)}>
                        <Icon
                            name="file"
                            size={16} />
                        Comparar con original
                    </button>
                    <span
                        className={`editor-save-status ${dirty ? 'is-dirty' : ''}`}
                        role="status">
                        {saving ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Todo guardado'}
                    </span>
                    <button
                        className="button button-primary button-small"
                        disabled={!dirty || saving}
                        onClick={() => saveChanges()}>
                        <Icon
                            name="save"
                            size={16} />
                        Guardar · Ctrl+S
                    </button>
                </div>
            </div>
            <div className={`editor-layout ${editorMode === 'document' ? 'document-editor-layout' : ''} ${compareOriginal ? 'with-reference' : ''}`}>
                <aside className="card section-sidebar">
                    <div className="section-sidebar-heading">
                        <h2>
                            Apartados
                            <span>
                                {program.sections.length}
                            </span>
                        </h2>
                        <button
                            className="icon-button"
                            aria-label="Añadir apartado"
                            onClick={addSection}
                        >
                            <Icon
                                name="plus"
                                size={18}
                            />
                        </button>
                    </div>
                    <label className="search-field">
                        <Icon
                            name="search"
                            size={15}
                        />
                        <input
                            aria-label="Buscar apartados"
                            placeholder="Buscar apartado…"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </label>
                    <nav aria-label="Apartados del módulo">
                        {visibleSections.map((candidate) => <button
                            key={candidate.id}
                            onClick={() => {
                                setSelectedId(candidate.id);
                                setTargetId('');
                                if (editorMode === 'document') {
                                    document.getElementById(`document-section-${candidate.id}`)?.scrollIntoView({
                                        behavior: 'smooth',
                                        block: 'start',
                                    });
                                }
                            }}
                            className={`section-link ${section?.id === candidate.id ? 'selected' : ''}`}
                        >
                            <span className={`section-status ${candidate.reviewed ? 'done' : ''}`}>
                                <Icon
                                    name={candidate.reviewed ? 'check' : candidate.warnings.length ? 'warning' : 'file'}
                                    size={14}
                                />
                            </span>
                            <span>
                                <small>
                                    {candidate.code || 'Sin numeración'}
                                </small>
                                {candidate.title}
                            </span>
                        </button>)}
                    </nav>
                    <button
                        className="button button-secondary button-small add-section-button"
                        onClick={addSection}
                    >
                        <Icon
                            name="plus"
                            size={15}
                        />
                        Añadir apartado
                    </button>
                </aside>
                {editorMode === 'document' ? <DocumentEditor
                    program={program}
                    sections={visibleSections}
                    selectedId={section?.id}
                    onSelect={setSelectedId}
                    onChange={updateProgram}
                /> : <section className="card section-content">
                    {section ? <>
                        <div className="section-content-heading">
                            <div>
                                <p className="eyebrow">
                                    APARTADO EDITABLE
                                </p>
                                <h2>
                                    {section.title}
                                </h2>
                                {section.sourceId && <p>
                                    Páginas
                                    {section.pageStart}
                                    –
                                    {section.pageEnd}
                                    {section.originalCode && ` · Numeración original ${section.originalCode}`}
                                </p>}
                            </div>
                            {section.sourceId && <button
                                className="button button-secondary button-small"
                                onClick={() => setShowSource(true)}
                            >
                                <Icon
                                    name="eye"
                                    size={16}
                                />
                                Ver original
                            </button>}
                        </div>
                        <div className="section-title-fields">
                            <label>
                                Numeración
                                <input
                                    value={section.code}
                                    placeholder="Ej. 10.2.3.1"
                                    onChange={(event) => updateSection({ code: event.target.value })}
                                />
                            </label>
                            <label>
                                Título del apartado
                                <input
                                    value={section.title}
                                    onChange={(event) => updateSection({ title: event.target.value })}
                                />
                            </label>
                        </div>
                        {section.warnings.length > 0 && <div className={`notice ${section.reviewed ? 'reviewed-notice' : 'review-notice'}`}>
                            <Icon
                                name={section.reviewed ? 'check' : 'warning'}
                                size={18}
                            />
                            <div>
                                <strong>
                                    {section.reviewed ? 'Observaciones revisadas' : 'Este apartado necesita tu revisión'}
                                </strong>
                                <ul>
                                    {section.warnings.map((warning, index) => <li key={index}>
                                        {warning}
                                    </li>)}
                                </ul>
                            </div>
                        </div>}
                        <div className="blocks-container">
                            {section.blocks.map((block, index) => <BlockEditor
                                key={block.id}
                                block={block}
                                index={index}
                                onChange={(updated) => updateSection({ blocks: section.blocks.map((candidate) => candidate.id === block.id ? updated : candidate) })}
                                onRemove={() => updateSection({ blocks: section.blocks.filter((candidate) => candidate.id !== block.id) })}
                                onMove={(direction) => reorderBlock(index, direction)}
                                canMerge={!block.cellSpans && !section.blocks[index + 1]?.cellSpans && block.type === 'table' && section.blocks[index + 1]?.type === 'table' && block.columns.length === section.blocks[index + 1].columns.length}
                                onMerge={() => {
                                    const following = section.blocks[index + 1];
                                    const merged = {
                                        ...block,
                                        rows: [...block.rows, ...following.rows],
                                        sourceRefs: [...block.sourceRefs, ...following.sourceRefs],
                                    };
                                    updateSection({ blocks: section.blocks.flatMap((candidate, position) => position === index ? [merged] : position === index + 1 ? [] : [candidate]) });
                                }}
                            />)}
                        </div>
                        <div className="add-block-actions">
                            {[['text', 'Texto'], ['list', 'Lista'], ['table', 'Tabla']].map(([type, label]) => <button
                                key={type}
                                className="button button-secondary button-small"
                                onClick={() => updateSection({ blocks: [...section.blocks, createEmptyBlock(type)] })}
                            >
                                <Icon
                                    name="plus"
                                    size={15}
                                />
                                {label}
                            </button>)}
                        </div>
                        <div className="section-review-bar">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={section.reviewed}
                                    onChange={(event) => updateSection({ reviewed: event.target.checked }, true)}
                                />
                                <span>
                                    He revisado el contenido y la estructura de este apartado
                                </span>
                            </label>
                            <div>
                                <button
                                    className="icon-button"
                                    aria-label="Subir apartado"
                                    onClick={() => reorderSection(-1)}
                                >
                                    ↑
                                </button>
                                <button
                                    className="icon-button"
                                    aria-label="Bajar apartado"
                                    onClick={() => reorderSection(1)}
                                >
                                    ↓
                                </button>
                                <button
                                    className="icon-button danger"
                                    aria-label="Eliminar apartado"
                                    onClick={() => {
                                        if (window.confirm('¿Eliminar este apartado y sus bloques? Se conservará el histórico de las versiones guardadas.')) {
                                            updateProgram({ sections: program.sections.filter((candidate) => candidate.id !== section.id) });
                                            setSelectedId('');
                                        }
                                    }}
                                >
                                    <Icon
                                        name="trash"
                                        size={16}
                                    />
                                </button>
                            </div>
                        </div>
                        <details className="reassign-panel">
                            <summary>
                                ¿Este apartado pertenece a otro módulo?
                            </summary>
                            <div>
                                <select
                                    aria-label="Módulo de destino"
                                    value={targetId}
                                    onChange={(event) => setTargetId(event.target.value)}
                                >
                                    <option value="">
                                        Selecciona un módulo
                                    </option>
                                    {programs?.filter((candidate) => candidate.id !== program.id).map((candidate) => <option
                                        key={candidate.id}
                                        value={candidate.id}
                                    >
                                        {candidate.module}
                                    </option>)}
                                </select>
                                <button
                                    className="button button-secondary button-small"
                                    disabled={!targetId || saving}
                                    onClick={reassignSection}
                                >
                                    Reasignar apartado
                                    <Icon
                                        name="arrow"
                                        size={15}
                                    />
                                </button>
                            </div>
                        </details>
                    </> : <div className="empty-state">
                        <Icon
                            name="file"
                            size={32}
                        />
                        <h3>
                            Prepara tu primer apartado
                        </h3>
                        <p>
                            Añade una sección para empezar a escribir la programación.
                        </p>
                        <button
                            className="button button-primary"
                            onClick={addSection}
                        >
                            <Icon
                                name="plus"
                                size={16}
                            />
                            Añadir apartado
                        </button>
                    </div>}
                </section>}
                {compareOriginal && section?.sourceId && <ReferencePreview
                    sourceId={section.sourceId}
                    pageNumber={section.pageStart}
                />}
            </div>
            <div className="editor-save-bar">
                <div>
                    <span className={`status-dot ${dirty ? 'unsaved-dot' : ''}`} />
                    <strong>
                        {dirty ? 'Tienes cambios sin guardar' : 'Cambios guardados'}
                    </strong>
                    <small>
                        {reviewedCount}
                        {' '}
                        de
                        {' '}
                        {program.sections.length}
                        {' '}
                        apartados revisados
                    </small>
                </div>
                <button
                    className="button button-primary"
                    disabled={!allReviewed || saving}
                    onClick={() => saveChanges(true)}
                >
                    <Icon
                        name="check"
                        size={17}
                    />
                    Marcar módulo como revisado
                </button>
            </div>
            {showSource && section?.sourceId && <SourceDialog
                section={section}
                onClose={() => setShowSource(false)}
            />}
            {documentPreview && <DocumentDialog
                title={documentPreview === 'json' ? 'Vista previa del JSON' : 'Documento original'}
                onClose={() => setDocumentPreview('')}
            >
                {documentPreview === 'json' ? <>
                    <p className="document-preview-description">
                        Datos actuales del editor
                        {dirty ? ', incluidos los cambios sin guardar' : ''}
                        .
                    </p>
                    <pre className="json-preview">
                        <code>
                            {JSON.stringify(program, null, 4)}
                        </code>
                    </pre>
                </> : <OriginalDocuments sourceIds={[...program.sourceIds, ...program.sections.map((candidate) => candidate.sourceId)]} />}
            </DocumentDialog>}
            {showHistory && <HistoryDialog
                program={program}
                onClose={() => setShowHistory(false)}
                onRestore={(restored) => {
                    setProgram(restored);
                    setDirty(false);
                    setShowHistory(false);
                    setSelectedId('');
                    notify(`Versión recuperada · ahora es la versión ${restored.revision}.`);
                }}
            />}
        </>);
}
