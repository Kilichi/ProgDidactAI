import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoDAO } from '../src/server/repositories/mongo-dao.js';

test('MongoDB conserva versiones y aplica el control de concurrencia', { skip: !process.env.TEST_MONGODB_URI && 'Configura TEST_MONGODB_URI para probar una base MongoDB real.' }, async () => {
    const databaseName = `progdidactai_test_${randomUUID().replaceAll('-', '')}`;
    const dao = new MongoDAO(process.env.TEST_MONGODB_URI, databaseName);
    await dao.init();
    try {
        const program = {
            id: 'program',
            module: 'Servidor',
            code: '0613',
            course: '2º',
            teacher: 'Original',
            status: 'draft',
            sections: [],
            sourceIds: [],
            warnings: [],
            revision: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await dao.insertProgram(program);
        const results = await Promise.allSettled([
            dao.updateProgram(program.id, 1, {
                ...program,
                teacher: 'A',
            }),
            dao.updateProgram(program.id, 1, {
                ...program,
                teacher: 'B',
            }),
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
        const versions = await dao.history(program.id);
        assert.equal(versions.length, 2);
        assert.equal(versions[1].teacher, 'Original');
        assert.equal(versions[0].revision, 2);
        await dao.insertSource({
            id: 'source',
            pages: [],
        });
        await dao.insertProgram({
            ...program,
            id: 'second',
        });
        await assert.rejects(dao.deleteFileDocument('source', [
            {
                id: 'second',
                revision: 1,
            },
            {
                id: program.id,
                revision: 1,
            },
        ]), { status: 409 });
        assert.equal((await dao.getProgram('second')).revision, 1, 'La transacción revierte el primer borrado si falla el segundo');
        assert.equal((await dao.getSource('source')).id, 'source');
        await dao.deleteFileDocument('source', [
            {
                id: 'second',
                revision: 1,
            },
            {
                id: program.id,
                revision: 2,
            },
        ]);
        await assert.rejects(dao.getProgram(program.id), { status: 404 });
        await assert.rejects(dao.getSource('source'), { status: 404 });
        assert.equal(await dao.versions.countDocuments(), 0);
    } finally {
        await dao.db.dropDatabase();
        await dao.close();
    }
});
