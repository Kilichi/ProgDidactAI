import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileDAO } from '../src/server/repositories/file-dao.js';
import { restoreProgram, moveSection } from '../src/server/services/program-service.js';
import { validateProgram } from '../src/server/domain/schemas.js';

function createProgram(id) {
    return {
        id,
        module: id,
        revision: 1,
        code: '',
        course: '2º',
        teacher: 'Docente',
        status: 'draft',
        sections: [],
        sourceIds: [],
        warnings: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

test('el DAO persiste, conserva versiones y rechaza escrituras concurrentes obsoletas', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-test-'));
    try {
        const dao = new FileDAO(directory);
        await dao.init();
        const program = createProgram('server');
        await dao.insertProgram(program);
        const changes = await Promise.allSettled([
            dao.updateProgram('server', 1, {
                ...program,
                teacher: 'Docente A',
            }),
            dao.updateProgram('server', 1, {
                ...program,
                teacher: 'Docente B',
            }),
        ]);
        assert.equal(changes.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(changes.find((result) => result.status === 'rejected').reason.status, 409);
        const restartedDAO = new FileDAO(directory);
        await restartedDAO.init();
        assert.equal((await restartedDAO.getProgram('server')).revision, 2);
        const history = await restartedDAO.history('server');
        assert.equal(history.length, 2);
        assert.equal(history[1].teacher, 'Docente');
        const context = {
            dao: restartedDAO,
            mutate: (operation) => operation(),
        };
        const restored = await restoreProgram('server', {
            revision: 2,
            targetRevision: 1,
        }, context);
        assert.equal(restored.revision, 3);
        assert.equal(restored.teacher, 'Docente');
        assert.equal((await restartedDAO.history('server')).length, 3);
        await assert.rejects(() => restartedDAO.deleteProgram('server', 2), { status: 409 });
        await restartedDAO.deleteProgram('server', 3);
        await assert.rejects(() => restartedDAO.getProgram('server'), { status: 404 });
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});

test('reasignar conserva la sección, el origen y el histórico de ambos módulos', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-move-'));
    try {
        const dao = new FileDAO(directory);
        await dao.init();
        const section = {
            id: 'section',
            code: '10.3.4',
            originalCode: '10.3.4',
            title: 'Metodología',
            blocks: [],
            sourceId: '',
            pageStart: 0,
            pageEnd: 0,
            headingRefs: [],
            warnings: ['Numeración dudosa'],
            reviewed: true,
        };
        const origin = {
            ...createProgram('origin'),
            sourceIds: ['source'],
            sections: [section],
        };
        const target = createProgram('destination');
        await dao.insertProgram(origin);
        await dao.insertProgram(target);
        const context = {
            dao,
            mutate: (operation) => operation(),
        };
        const result = await moveSection('origin', {
            revision: 1,
            targetRevision: 1,
            targetId: 'destination',
            sectionId: 'section',
        }, context);
        assert.equal(result.from.sections.length, 0);
        assert.equal(result.to.sections.length, 1);
        assert.equal(result.to.sections[0].originalCode, '10.3.4');
        assert.equal(result.to.sections[0].reviewed, false);
        assert.deepEqual(result.to.sourceIds, ['source']);
        assert.equal((await dao.history('origin'))[1].sections.length, 1);
        assert.equal((await dao.history('destination'))[1].sections.length, 0);
        await assert.rejects(() => moveSection('origin', {
            revision: 1,
            targetRevision: 2,
            targetId: 'destination',
            sectionId: 'section',
        }, context), { status: 409 });
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});

test('un módulo solo puede validarse cuando todos sus apartados están revisados', () => {
    const program = createProgram('module');
    assert.throws(() => validateProgram({
        ...program,
        status: 'reviewed',
    }), /Revisa/);
    const section = {
        id: 'section',
        code: '1.1',
        originalCode: '',
        title: 'Apartado',
        blocks: [],
        sourceId: '',
        pageStart: 0,
        pageEnd: 0,
        headingRefs: [],
        warnings: [],
        reviewed: false,
    };
    assert.throws(() => validateProgram({
        ...program,
        status: 'reviewed',
        sections: [section],
    }), /Revisa/);
    assert.equal(validateProgram({
        ...program,
        status: 'reviewed',
        sections: [{
            ...section,
            reviewed: true,
        }],
    }).status, 'reviewed');
});
