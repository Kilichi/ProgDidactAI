'use client';

import { tableCellSpan, appendTableRow, removeTableRow, appendTableColumn } from '@/lib/table-layout';
import { getBlockText } from '@/lib/api';
import { Icon } from '@/components/ui/icon';
export function BlockEditor({
    block, index, onChange, onRemove, onMove, canMerge, onMerge,
}) {
    function changeType(type) {
        const originalText = getBlockText(block);
        onChange({
            ...block,
            type,
            cellSpans: undefined,
            columnWidths: undefined,
            text: type === 'text' ? originalText : '',
            items: type === 'list' ? originalText.split('\n') : [],
            columns: type === 'table' ? ['Contenido'] : [],
            rows: type === 'table' ? originalText.split('\n').map((line) => [line]) : [],
        });
    }
    function changeRow(rowIndex, columnIndex, value) {
        onChange({
            ...block,
            rows: block.rows.map((row, position) => position === rowIndex ? row.map((cell, cellPosition) => cellPosition === columnIndex ? value : cell) : row),
        });
    }
    return (
        <article className="block-editor">
            <header className="block-toolbar">
                <span className="block-label">
                    BLOQUE
                    {index + 1}
                </span>
                <select
                    aria-label={`Tipo del bloque ${index + 1}`}
                    value={block.type}
                    onChange={(event) => changeType(event.target.value)}
                >
                    <option value="text">
                        Texto
                    </option>
                    <option value="list">
                        Lista
                    </option>
                    <option value="table">
                        Tabla
                    </option>
                </select>
                <div className="block-toolbar-actions">
                    <button
                        className="icon-button"
                        aria-label="Subir bloque"
                        disabled={index === 0}
                        onClick={() => onMove(-1)}
                    >
                        ↑
                    </button>
                    <button
                        className="icon-button"
                        aria-label="Bajar bloque"
                        onClick={() => onMove(1)}
                    >
                        ↓
                    </button>
                    <button
                        className="icon-button danger"
                        aria-label={`Eliminar bloque ${index + 1}`}
                        onClick={() => {
                            if (window.confirm('¿Eliminar este bloque? Puedes recuperar el contenido desde el histórico o el original.')) {
                                onRemove();
                            }
                        }}
                    >
                        <Icon
                            name="trash"
                            size={16}
                        />
                    </button>
                </div>
            </header>
            {block.type === 'text' && <>
                <textarea
                    className="text-editor"
                    aria-label={`Texto del bloque ${index + 1}`}
                    value={block.text}
                    onChange={(event) => onChange({
                        ...block,
                        text: event.target.value,
                    })}
                    rows={Math.min(18, Math.max(5, block.text.split('\n').length + 1))}
                />
                <p className="field-hint">
                    Puedes usar **negrita** y *cursiva*. Los saltos de línea se conservan.
                </p>
            </>}
            {block.type === 'list' && <div className="list-editor">
                {block.items.map((item, itemIndex) => <div
                    className="list-item"
                    key={itemIndex}
                >
                    <span>
                        {itemIndex + 1}
                        .
                    </span>
                    <textarea
                        aria-label={`Elemento ${itemIndex + 1} del bloque ${index + 1}`}
                        value={item}
                        rows={Math.max(1, Math.min(5, item.split('\n').length))}
                        onChange={(event) => onChange({
                            ...block,
                            items: block.items.map((value, position) => position === itemIndex ? event.target.value : value),
                        })}
                    />
                    <button
                        className="icon-button"
                        aria-label={`Quitar elemento ${itemIndex + 1}`}
                        onClick={() => onChange({
                            ...block,
                            items: block.items.filter((_, position) => position !== itemIndex),
                        })}
                    >
                        <Icon
                            name="close"
                            size={14}
                        />
                    </button>
                </div>)}
                <button
                    className="text-button"
                    onClick={() => onChange({
                        ...block,
                        items: [...block.items, ''],
                    })}
                >
                    <Icon
                        name="plus"
                        size={15}
                    />
                    Añadir elemento
                </button>
            </div>}
            {block.type === 'table' && <>
                <div className="table-scroll">
                    <table className="editable-table">
                        {block.columnWidths && <colgroup>
                            {block.columnWidths.map((width, index) => <col
                                key={index}
                                style={{ width: `${width}%` }} />)}
                            <col style={{ width: '30px' }} />
                        </colgroup>}
                        {!block.cellSpans && <thead>
                            <tr>
                                {block.columns.map((column, columnIndex) => <th key={columnIndex}>
                                    <input
                                        aria-label={`Nombre de columna ${columnIndex + 1}`}
                                        value={column}
                                        onChange={(event) => onChange({
                                            ...block,
                                            columns: block.columns.map((value, position) => position === columnIndex ? event.target.value : value),
                                        })}
                                    />
                                    <button
                                        className="icon-button"
                                        aria-label={`Eliminar columna ${columnIndex + 1}`}
                                        disabled={block.columns.length <= 1}
                                        onClick={() => {
                                            if (window.confirm('¿Eliminar esta columna y sus celdas?')) {
                                                onChange({
                                                    ...block,
                                                    columns: block.columns.filter((_, position) => position !== columnIndex),
                                                    rows: block.rows.map((row) => row.filter((_, position) => position !== columnIndex)),
                                                });
                                            }
                                        }}
                                    >
                                        <Icon
                                            name="close"
                                            size={12}
                                        />
                                    </button>
                                </th>)}
                                <th className="row-action-cell">
                                    <span className="sr-only">
                                        Acciones
                                    </span>
                                </th>
                            </tr>
                        </thead>}
                        <tbody>
                            {block.rows.map((row, rowIndex) => <tr key={rowIndex}>
                                {row.map((cell, columnIndex) => {
                                    const span = tableCellSpan(block, rowIndex, columnIndex);
                                    return span && <td
                                        key={columnIndex}
                                        rowSpan={span.rowSpan}
                                        colSpan={span.colSpan}>
                                        <textarea
                                            aria-label={`Fila ${rowIndex + 1}, columna ${columnIndex + 1}`}
                                            value={cell}
                                            rows={Math.min(7, Math.max(2, cell.split('\n').length))}
                                            onChange={(event) => changeRow(rowIndex, columnIndex, event.target.value)}
                                        />
                                    </td>;
                                })}
                                <td className="row-action-cell">
                                    <button
                                        className="icon-button"
                                        aria-label={`Eliminar fila ${rowIndex + 1}`}
                                        onClick={() => {
                                            if (window.confirm('¿Eliminar esta fila?')) {
                                                onChange(removeTableRow(block, rowIndex));
                                            }
                                        }}
                                    >
                                        <Icon
                                            name="trash"
                                            size={13}
                                        />
                                    </button>
                                    {rowIndex > 0 && !block.cellSpans && <button
                                        className="icon-button"
                                        aria-label={`Unir fila ${rowIndex + 1} con la anterior`}
                                        onClick={() => {
                                            const rows = block.rows.map((value) => [...value]);
                                            rows[rowIndex - 1] = rows[rowIndex - 1].map((value, columnIndex) => [value, row[columnIndex]].filter(Boolean).join('\n'));
                                            rows.splice(rowIndex, 1);
                                            onChange({
                                                ...block,
                                                rows,
                                                cellSpans: undefined,
                                                columnWidths: undefined,
                                            });
                                        }}
                                    >
                                        ↥
                                    </button>}
                                </td>
                            </tr>)}
                        </tbody>
                    </table>
                </div>
                <div className="table-actions">
                    <button
                        className="text-button"
                        onClick={() => onChange(appendTableRow(block))}
                    >
                        <Icon
                            name="plus"
                            size={15}
                        />
                        Añadir fila
                    </button>
                    <button
                        className="text-button"
                        disabled={block.columns.length >= 40}
                        onClick={() => onChange(appendTableColumn(block))}
                    >
                        <Icon
                            name="plus"
                            size={15}
                        />
                        Añadir columna
                    </button>
                    {canMerge && <button
                        className="text-button"
                        onClick={onMerge}
                    >
                        Unir con la siguiente tabla
                    </button>}
                </div>
            </>}
        </article>);
}
