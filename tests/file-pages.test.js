import test from 'node:test';
import assert from 'node:assert/strict';
import { projectBlock, projectPage, pageIsReviewed } from '../src/lib/file-pages.js';
import { blockSchema } from '../src/server/domain/schemas.js';

test('editar un párrafo por páginas mantiene los cambios y el contenido de las otras páginas', () => {
    const original = {
        id: 'text',
        type: 'text',
        text: 'Primera\nSegunda\nTercera',
        sourceRefs: ['p1-l1', 'p2-l1', 'p2-l2'],
    };
    const first = projectBlock(original, 1);
    assert.equal(first.block.text, 'Primera');
    let changed = first.merge({
        ...first.block,
        text: 'Primera editada\nLínea añadida',
    });
    const second = projectBlock(changed, 2);
    assert.equal(second.block.text, 'Segunda\nTercera');
    changed = second.merge({
        ...second.block,
        text: 'Segunda editada\nTercera',
    });
    assert.equal(projectBlock(changed, 1).block.text, 'Primera editada\nLínea añadida');
    assert.equal(changed.text, 'Primera editada\nLínea añadida\nSegunda editada\nTercera');
    assert.deepEqual(changed.sourceRefs, original.sourceRefs);
    blockSchema.parse(changed);
});

test('una lista que continúa en otra página conserva los elementos y sus continuaciones', () => {
    const block = {
        id: 'list',
        type: 'list',
        items: ['Uno\nContinuación', 'Dos'],
        sourceRefs: ['p1-l1', 'p2-l1', 'p2-l2'],
    };
    const second = projectBlock(block, 2);
    assert.deepEqual(second.block.items, ['Continuación', 'Dos']);
    const updated = second.merge({
        ...second.block,
        items: ['Nueva continuación\nExtra', 'Dos editado'],
    });
    assert.deepEqual(updated.items, ['Uno\nNueva continuación\nExtra', 'Dos editado']);
    assert.deepEqual(projectBlock(updated, 1).block.items, ['Uno']);
    blockSchema.parse(updated);
});

test('la página agrupa el contenido de todos los módulos del mismo archivo y respeta la revisión', () => {
    const section = {
        id: 'section',
        sourceId: 'file',
        title: 'Título',
        headingRefs: ['p1-l1'],
        pageStart: 1,
        pageEnd: 2,
        reviewed: false,
        reviewedPages: [1],
        blocks: [{
            id: 'block',
            type: 'text',
            text: 'Uno\nDos',
            sourceRefs: ['p1-l2', 'p2-l1'],
        }],
    };
    const programs = [{
        id: 'a',
        sections: [section],
    }, {
        id: 'b',
        sections: [{
            ...section,
            id: 'other',
            sourceId: 'different',
        }],
    }];
    assert.equal(projectPage(programs, 'file', 1).length, 1);
    assert.equal(projectPage(programs, 'file', 1)[0].headingOnPage, true);
    assert.equal(projectPage(programs, 'file', 2)[0].headingOnPage, false);
    assert.equal(pageIsReviewed(programs, 'file', 1), true);
    assert.equal(pageIsReviewed(programs, 'file', 2), false);
});
