import test from 'node:test';
import assert from 'node:assert/strict';
import { blockSchema } from '../src/server/domain/schemas.js';
import { tableCellSpan, appendTableRow, appendTableColumn, removeTableRow } from '../src/lib/table-layout.js';
import { renderDocumentBlock } from '../src/lib/document-layout.js';

test('una fila añadida se puede eliminar y el control solo aparece al editar', () => {
    const block = {
        id: 'table',
        type: 'table',
        columns: ['A'],
        rows: [['Original']],
    };
    assert.deepEqual(removeTableRow(appendTableRow(block), 1).rows, block.rows);
    assert.equal(removeTableRow(block, -1), block);
    assert.match(renderDocumentBlock(appendTableRow(block), { editable: true }), /Eliminar fila 2/);
    assert.doesNotMatch(renderDocumentBlock(block), /Eliminar fila/);
    assert.doesNotMatch(renderDocumentBlock({
        ...removeTableRow(block, 0),
        cellSpans: [],
    }), /undefined/);
});

test('editar filas y columnas conserva las celdas combinadas y su contenido', () => {
    const block = {
        id: 'merged',
        type: 'table',
        columns: ['Columna 1', 'Columna 2'],
        rows: [['Identificación', 'Código'], ['', 'Curso']],
        columnWidths: [30, 70],
        cellSpans: [
            {
                row: 0,
                column: 0,
                rowSpan: 2,
                colSpan: 1,
            },
            {
                row: 0,
                column: 1,
                rowSpan: 1,
                colSpan: 1,
            },
            {
                row: 1,
                column: 1,
                rowSpan: 1,
                colSpan: 1,
            },
        ],
    };
    assert.equal(tableCellSpan(block, 1, 0), null);
    assert.equal(tableCellSpan(block, 0, 0).rowSpan, 2);
    const removed = removeTableRow(block, 0);
    assert.deepEqual(removed.rows, [['Identificación', 'Curso']]);
    assert.equal(removed.cellSpans[0].rowSpan, 1);
    for (const changed of [removed, appendTableRow(block), appendTableColumn(block)]) {
        blockSchema.parse(changed);
    }
    assert.deepEqual(block.rows, [['Identificación', 'Código'], ['', 'Curso']]);
    assert.throws(() => blockSchema.parse({
        ...block,
        cellSpans: [{
            row: 0,
            column: 0,
            rowSpan: 3,
            colSpan: 1,
        }],
    }));
});
