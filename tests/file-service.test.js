import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileDAO } from '../src/server/repositories/file-dao.js';
import { removeFileDocument } from '../src/server/services/file-service.js';
import { repairMisclassifiedLists } from '../src/server/services/document-parser.js';
import { handleRoute, jsonResponse } from '../src/server/http/route-handler.js';

test('eliminar un archivo es atómico y protege contenido compartido', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-delete-'));
    try {
        const dao = new FileDAO(directory);
        await dao.init();
        await dao.insertSource({
            id: 'source',
            pages: [],
        });
        const program = {
            id: 'program',
            revision: 1,
            sourceIds: ['source', 'other'],
            sections: [],
        };
        await dao.insertProgram(program);
        const context = {
            dao,
            mutate: (operation) => operation(),
        };
        await assert.rejects(removeFileDocument('source', { confirm: true }, context), { status: 409 });
        assert.equal((await dao.getProgram('program')).revision, 1);
        assert.equal((await dao.getSource('source')).id, 'source');
        const exclusive = await dao.updateProgram('program', 1, {
            ...program,
            sourceIds: ['source'],
        });
        await assert.rejects(dao.deleteFileDocument('source', [program]), { status: 409 });
        assert.equal((await dao.getProgram('program')).revision, exclusive.revision);
        await assert.rejects(removeFileDocument('source', { confirm: false }, context));
        await removeFileDocument('source', { confirm: true }, context);
        const restarted = new FileDAO(directory);
        await restarted.init();
        await assert.rejects(restarted.getSource('source'), { status: 404 });
        await assert.rejects(restarted.getProgram('program'), { status: 404 });
        assert.equal(Object.keys(restarted.state.history).length, 0);
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});

test('las tablas con geometría y celdas vacías no se convierten en texto al abrirlas', () => {
    const block = {
        id: 'table',
        type: 'table',
        columns: ['A', 'B'],
        rows: [['Contenido', '']],
        cellSpans: [{
            row: 0,
            column: 0,
            rowSpan: 1,
            colSpan: 2,
        }],
    };
    const program = { sections: [{ blocks: [block] }] };
    assert.deepEqual(repairMisclassifiedLists(program), program);
    const legacy = {
        sections: [{
            blocks: [{
                ...block,
                cellSpans: undefined,
                rows: [['•', 'Texto']],
            }],
        }],
    };
    assert.equal(repairMisclassifiedLists(legacy).sections[0].blocks[0].type, 'list');
});

test('la API rechaza orígenes inválidos y admite el mismo origen sin cabecera Host', async () => {
    const handler = handleRoute(() => jsonResponse({ ok: true }));
    for (const origin of ['null', 'malformed', 'https://other.example', 'ftp://school.example']) {
        const response = await handler(new Request('https://school.example/api/files', {
            method: 'POST',
            headers: { origin },
        }));
        assert.equal(response.status, 403);
    }
    const response = await handler(new Request('https://school.example/api/files', {
        method: 'POST',
        headers: { origin: 'https://school.example' },
    }));
    assert.equal(response.status, 200);
});
