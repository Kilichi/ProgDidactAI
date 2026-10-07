import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDocumentBlock, renderPageContent, isWidePage } from '../src/lib/document-layout.js';
import { editFieldId } from '../src/lib/edit-location.js';

const block = {
    id: 'table',
    type: 'table',
    columns: ['Criterio', 'Peso'],
    rows: [['Una línea\nOtra línea', '25 %']],
};
test('las cabeceras y los saltos de línea están presentes en edición y exportación', () => {
    for (const editable of [true, false]) {
        const html = renderDocumentBlock(block, { editable });
        assert.match(html, /<thead>/);
        assert.match(html, /Criterio/);
        assert.match(html, /Una línea\nOtra línea/);
        assert.equal(html.includes('contenteditable='), editable);
    }
});
test('el documento editable y el PDF comparten exactamente el contenido y los estilos', () => {
    const projections = [{
        section: {
            id: 's',
            title: 'Título',
            originalCode: '1',
            code: '1',
            headingRefs: [],
        },
        headingOnPage: true,
        display: { blocks: [block] },
    }];
    const editor = renderPageContent(projections, { editable: true });
    const exported = renderPageContent(projections);
    const withoutEditing = editor.replace(/ contenteditable="plaintext-only" role="textbox" aria-multiline="true" aria-label="[^"]*" spellcheck="true" data-location="[^"]*" id="[^"]*"/g, '').replace(/<div class="doc-table-actions">.*?<\/div>/g, '');
    assert.equal(withoutEditing, exported);
    assert.equal(isWidePage(projections), false);
});
test('texto pegado malicioso y atributos se escapan en ambas vistas', () => {
    const dangerous = {
        id: '\" onfocus=alert(1)',
        type: 'text',
        text: '<img src=x onerror=alert(1)>',
    };
    for (const editable of [true, false]) {
        const html = renderDocumentBlock(dangerous, {
            editable,
            title: '\" onfocus=alert(1)',
        });
        assert.ok(!html.includes('<img'));
        assert.ok(!html.includes('" onfocus='));
        assert.match(html, /&lt;img/);
    }
});
test('celdas combinadas mantienen su geometría sin duplicar cabeceras', () => {
    const html = renderDocumentBlock({
        ...block,
        rows: [['Cabecera', ''], ['Texto', '25 %']],
        cellSpans: [{
            row: 0,
            column: 0,
            rowSpan: 1,
            colSpan: 2,
            background: '#000000',
        }, {
            row: 1,
            column: 0,
            rowSpan: 1,
            colSpan: 1,
        }, {
            row: 1,
            column: 1,
            rowSpan: 1,
            colSpan: 1,
        }],
    });
    assert.match(html, /colspan="2"/);
    assert.match(html, /doc-shaded/);
    assert.ok(!html.includes('Criterio'));
    assert.equal((html.match(/Cabecera/g) || []).length, 1);
});
test('los campos de listas y cabeceras tienen identificadores distintos', () => {
    const ids = ['item', 'column'].flatMap((field) => [0, 1].map((index) => editFieldId({
        blockId: 'block',
        field,
        index,
    })));
    assert.equal(new Set(ids).size, 4);
});
