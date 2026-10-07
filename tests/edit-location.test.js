import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/server/domain/schemas.js';
import { handleRoute } from '../src/server/http/route-handler.js';
import { downloadExport } from '../src/lib/api.js';
import { editFieldId, editLocationURL } from '../src/lib/edit-location.js';

test('el error de exportación conserva su ubicación y enlaza a la celda editable', async () => {
    const location = {
        programId: 'program',
        sectionId: 'section',
        blockId: 'table',
        field: 'cell',
        row: 2,
        column: 0,
        page: 11,
    };
    const details = {
        location,
        solution: 'Reduce el texto de esta celda.',
    };
    const response = await handleRoute(async () => {
        throw new AppError('Esta celda supera su espacio.', 400, details);
    })(new Request('http://localhost/api/export/pdf', { method: 'POST' }));
    assert.equal(response.status, 400);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => response;
    try {
        await assert.rejects(() => downloadExport('pdf', { ids: ['program'] }), (error) => {
            assert.deepEqual(error.details, details);
            assert.equal(editFieldId(error.details.location), 'edit-table-2-0');
            const url = new URL(editLocationURL(error.details.location), 'http://localhost');
            assert.equal(url.pathname, '/programaciones/program');
            assert.equal(url.searchParams.get('column'), '0');
            assert.equal(url.searchParams.get('sectionId'), 'section');
            return true;
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});
