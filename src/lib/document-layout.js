import { tableCellSpan } from './table-layout.js';
import { editFieldId } from './edit-location.js';

export function escapeHTML(value) {
    const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };
    return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

// This markup is used by both the editable canvas and Chromium's PDF renderer.
// Plain text is intentional: pasted HTML cannot introduce invisible formatting.
function field(value, location, label, editable, className = '') {
    const attributes = editable ? ` contenteditable="plaintext-only" role="textbox" aria-multiline="true" aria-label="${escapeHTML(label)}" spellcheck="true" data-location="${escapeHTML(JSON.stringify(location))}" id="${escapeHTML(editFieldId(location))}"` : '';
    return `<div class="doc-text ${className}"${attributes}>${escapeHTML(value)}</div>`;
}

export function renderDocumentBlock(block, { editable = false, sectionId = '', title = '' } = {}) {
    const location = {
        sectionId,
        blockId: block.id,
    };
    if (block.type === 'text') {
        return field(block.text, {
            ...location,
            field: 'text',
        }, `Texto de ${title}`, editable, 'doc-paragraph');
    }
    if (block.type === 'list') {
        return `<ul class="doc-list">${block.items.map((item, index) => `<li>${field(item, {
            ...location,
            field: 'item',
            index,
        }, `Elemento ${index + 1} de ${title}`, editable)}</li>`).join('')}</ul>`;
    }
    const columns = block.columnWidths ? `<colgroup>${block.columnWidths.map((width) => `<col style="width:${width}%">`).join('')}</colgroup>` : '';
    const realHeaders = !block.cellSpans && block.columns.some((column) => !/^Columna \d+$/.test(column));
    const header = realHeaders ? `<thead><tr>${block.columns.map((column, index) => `<th scope="col">${field(column, {
        ...location,
        field: 'column',
        index,
    }, `Cabecera ${index + 1}`, editable)}</th>`).join('')}</tr></thead>` : '';
    const rows = block.rows.map((row, rowIndex) => `<tr>${row.map((cell, columnIndex) => {
        const span = tableCellSpan(block, rowIndex, columnIndex);
        if (!span) {
            return '';
        }
        // Normalize imported colours into a single, readable document palette.
        const shaded = span.background && span.background.toLowerCase() !== '#ffffff';
        return `<td rowspan="${span.rowSpan}" colspan="${span.colSpan}"${shaded ? ' class="doc-shaded"' : ''}>${field(cell, {
            ...location,
            field: 'cell',
            row: rowIndex,
            column: columnIndex,
        }, `${title}, fila ${rowIndex + 1}, columna ${columnIndex + 1}`, editable)}</td>`;
    }).join('')}</tr>`);
    const repeatFirstRow = rows.length > 0 && block.cellSpans?.filter((cell) => cell.row === 0).every((cell) => cell.rowSpan === 1 && cell.background && cell.background.toLowerCase() !== '#ffffff');
    const removeRows = block.rows.map((_, row) => `<button type="button" data-table-action="remove-row" data-location="${escapeHTML(JSON.stringify({
        ...location,
        row,
    }))}">Eliminar fila ${row + 1}</button>`).join('');
    const actions = editable ? `<div class="doc-table-actions"><button type="button" data-table-action="row" data-location="${escapeHTML(JSON.stringify(location))}">+ Añadir fila</button><button type="button" data-table-action="column" data-location="${escapeHTML(JSON.stringify(location))}">+ Añadir columna</button><details class="doc-remove-rows"><summary>Eliminar una fila</summary>${removeRows}</details></div>` : '';
    return `<table class="doc-table">${columns}${header || (repeatFirstRow ? `<thead>${rows.shift()}</thead>` : '')}<tbody>${rows.join('')}</tbody></table>${actions}`;
}

export function hasPageHeading({ section, headingOnPage }) {
    return headingOnPage || (!section.headingRefs?.length && section.title && section.title !== 'Contenido sin epígrafe');
}

export function isWidePage(projections) {
    return projections.some(({ display }) => display.blocks.some((block) => block.type === 'table' && block.columns.length >= 8));
}

export function renderPageContent(projections, { editable = false, fallback = '' } = {}) {
    const content = projections.map((projection) => {
        const { section, display } = projection;
        const heading = hasPageHeading(projection) ? `<div class="doc-heading">${section.originalCode ? field(section.code, {
            sectionId: section.id,
            field: 'code',
        }, 'Numeración del apartado', editable, 'doc-code') : ''}${field(section.title, {
            sectionId: section.id,
            field: 'title',
        }, 'Título del apartado', editable)}</div>` : '';
        return `<section class="doc-section" id="document-section-${escapeHTML(section.id)}">${heading}${display.blocks.map((block) => renderDocumentBlock(block, {
            editable,
            sectionId: section.id,
            title: section.title,
        })).join('')}</section>`;
    }).join('');
    return content || `<div class="doc-text">${escapeHTML(fallback)}</div>`;
}
