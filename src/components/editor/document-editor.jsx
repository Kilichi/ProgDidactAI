'use client';

import { memo, useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/icon';
import { useResource } from '@/hooks/use-resource';
import { ErrorNotice, LoadingState } from '@/components/ui/feedback';

function GrowingField({ value, onChange, label, className = '' }) {
    const field = useRef(null);
    useEffect(() => {
        const element = field.current;
        if (element && !CSS.supports('field-sizing', 'content')) {
            element.style.height = 'auto';
            element.style.height = `${element.scrollHeight + 2}px`;
        }
    }, [value]);
    return <textarea
        ref={field}
        className={`document-field ${className}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        rows={1}
        spellCheck
    />;
}

const DocumentBlock = memo(function DocumentBlock({ block, onChange, title }) {
    if (block.type === 'text') {
        return <GrowingField
            value={block.text}
            label={`Texto de ${title}`}
            onChange={(text) => onChange({
                ...block,
                text,
            })}
        />;
    }
    if (block.type === 'list') {
        return <ul className="document-list">
            {block.items.map((item, index) => <li key={index}>
                <GrowingField
                    value={item}
                    label={`Elemento ${index + 1} de ${title}`}
                    onChange={(value) => onChange({
                        ...block,
                        items: block.items.map((candidate, position) => position === index ? value : candidate),
                    })}
                />
            </li>)}
        </ul>;
    }
    const hasRealHeaders = block.columns.some((column) => !/^Columna \d+$/.test(column));
    return <div className="document-table-scroll">
        <table className="document-table">
            {hasRealHeaders && <thead>
                <tr>
                    {block.columns.map((column, index) => <th key={index}>
                        {column}
                    </th>)}
                </tr>
            </thead>}
            <tbody>
                {block.rows.map((row, rowIndex) => <tr key={rowIndex}>
                    {row.map((cell, columnIndex) => <td key={columnIndex}>
                        <GrowingField
                            value={cell}
                            label={`${title}, fila ${rowIndex + 1}, columna ${columnIndex + 1}`}
                            onChange={(value) => onChange({
                                ...block,
                                rows: block.rows.map((candidate, position) => position === rowIndex ? candidate.map((text, column) => column === columnIndex ? value : text) : candidate),
                            })}
                        />
                    </td>)}
                </tr>)}
            </tbody>
        </table>
    </div>;
});

export function ReferencePreview({ sourceId, pageNumber }) {
    const { data: source, loading, error } = useResource(`/api/sources/${sourceId}`);
    if (loading) {
        return <LoadingState label="Abriendo el original…" />;
    }
    if (error || !source) {
        return <ErrorNotice message={error} />;
    }
    return <aside className="document-reference card">
        <header>
            <div>
                <strong>
                    Original · página
                    {' '}
                    {pageNumber || 1}
                </strong>
                <small>
                    {source.filename}
                </small>
            </div>
            <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="icon-button"
                aria-label="Abrir documento original">
                <Icon name="eye" />
            </a>
        </header>
        {source.extension === '.pdf' ? <iframe
            key={pageNumber}
            src={`${source.url}#page=${pageNumber || 1}&view=FitH`}
            title={`Original: ${source.filename}`}
        /> : <pre className="source-text">
            {source.pages.find((page) => page.number === pageNumber)?.rawText || source.pages[0]?.rawText}
        </pre>}
    </aside>;
}

export function DocumentEditor({ program, sections, onChange, onSelect, selectedId }) {
    function updateSection(section, changes) {
        onChange({
            sections: program.sections.map((candidate) => candidate.id === section.id ? {
                ...candidate,
                ...changes,
                reviewed: false,
            } : candidate),
        });
    }
    return <div className="document-paper">
        <div className="document-paper-heading">
            <p className="eyebrow">
                DOCUMENTO EDITABLE
            </p>
            <h2>
                {program.module}
            </h2>
            <p>
                Haz clic en el texto o en una celda para editar. Usa el índice para ir directamente a un apartado.
            </p>
        </div>
        {sections.map((section) => <section
            key={section.id}
            id={`document-section-${section.id}`}
            className={`document-section ${selectedId === section.id ? 'is-current' : ''}`}
            onFocusCapture={() => onSelect(section.id)}
        >
            <header className="document-section-toolbar">
                <span>
                    {section.sourceId ? `Original: páginas ${section.pageStart}–${section.pageEnd}` : 'Apartado nuevo'}
                </span>
                <label className="checkbox-label">
                    <input
                        type="checkbox"
                        checked={section.reviewed}
                        onChange={(event) => onChange({
                            sections: program.sections.map((candidate) => candidate.id === section.id ? {
                                ...candidate,
                                reviewed: event.target.checked,
                            } : candidate),
                        })}
                    />
                    Revisado
                </label>
            </header>
            <div className="document-section-title">
                <input
                    aria-label={`Numeración de ${section.title}`}
                    value={section.code}
                    onChange={(event) => updateSection(section, { code: event.target.value })}
                />
                <GrowingField
                    value={section.title}
                    label="Título del apartado"
                    onChange={(title) => updateSection(section, { title })}
                />
            </div>
            {section.warnings.length > 0 && <details className="document-section-notes">
                <summary>
                    <Icon
                        name="warning"
                        size={14} />
                    {section.warnings.length}
                    {' '}
                    observaciones de importación
                </summary>
                <ul>
                    {section.warnings.map((warning, index) => <li key={index}>
                        {warning}
                    </li>)}
                </ul>
            </details>}
            <div className="document-section-body">
                {section.blocks.map((block) => <DocumentBlock
                    key={block.id}
                    block={block}
                    title={section.title}
                    onChange={(updated) => updateSection(section, { blocks: section.blocks.map((candidate) => candidate.id === block.id ? updated : candidate) })}
                />)}
            </div>
        </section>)}
        {!sections.length && <p className="empty-state">
            No hay apartados que coincidan con la búsqueda.
        </p>}
    </div>;
}
