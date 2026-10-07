import test from 'node:test';
import assert from 'node:assert/strict';
import * as files from '../src/server/controllers/file-controller.js';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('flujo de API: importar, consultar originales, editar, recuperar y exportar la vista', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-api-'));
    process.env.DATA_DRIVER = 'file';
    process.env.DATA_DIR = directory;
    const { getContext } = await import('../src/server/context.js');
    const { handleRoute } = await import('../src/server/http/route-handler.js');
    const documents = await import('../src/server/controllers/document-controller.js');
    const programs = await import('../src/server/controllers/program-controller.js');
    const exports = await import('../src/server/controllers/export-controller.js');

    async function call(handler, method = 'GET', body, params = {}, additionalHeaders = {}) {
        const request = new Request('http://localhost:3000/api/test', {
            method,
            headers: {
                host: 'localhost:3000',
                'Content-Type': 'application/json',
                ...additionalHeaders,
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        return handleRoute(handler)(request, { params: Promise.resolve(params) });
    }

    try {
        const imported = await call(documents.uploadExample, 'POST', { provider: 'local' });
        assert.equal(imported.status, 202);
        const job = await imported.json();
        const context = await getContext();
        await context.importQueue;
        for (const [filename, bytes] of [
            ['Programación ejemplo.pdf', await readFile(new URL('../ejemplo_pdf.pdf', import.meta.url))],
            ['Programación.docx', await readFile(new URL('./fixtures/programacion.docx', import.meta.url))],
        ]) {
            const form = new FormData();
            form.append('file', new File([bytes], filename));
            form.append('provider', 'local');
            const response = await handleRoute(documents.uploadDocument)(new Request('http://localhost:3000/api/import', {
                method: 'POST',
                body: form,
            }));
            assert.equal(response.status, 202);
            const uploaded = await response.json();
            assert.equal(uploaded.filename, filename);
            await context.importQueue;
            assert.equal(context.jobs.get(uploaded.id).status, 'done');
            for (const id of context.jobs.get(uploaded.id).programIds) {
                const temporary = await context.dao.getProgram(id);
                await context.dao.deleteProgram(id, temporary.revision);
            }
        }
        const missingFile = new FormData();
        missingFile.append('provider', 'local');
        const missingResponse = await handleRoute(documents.uploadDocument)(new Request('http://localhost:3000/api/import', {
            method: 'POST',
            body: missingFile,
        }));
        assert.equal(missingResponse.status, 400);
        const complete = await (await call(documents.getImportJob, 'GET', undefined, { id: job.id })).json();
        assert.equal(complete.status, 'done');
        assert.equal(complete.coverage.missing, 0);
        const list = await (await call(programs.listPrograms)).json();
        assert.equal(list.length, 3);
        const program = list.find((candidate) => candidate.code === '0613');
        const fileList = await (await call(files.listFiles)).json();
        assert.equal(fileList.length, 1);
        assert.equal(fileList[0].pageCount, 38);
        const file = await (await call(files.getFile, 'GET', undefined, { id: complete.sourceId })).json();
        assert.equal(file.programs.length, 3);
        assert.ok(!('storedPath' in file.source));
        const filePreview = await call(files.previewFile, 'POST', {
            programs: file.programs,
            layout: 'original',
        }, { id: complete.sourceId });
        assert.equal(filePreview.status, 200, filePreview.ok ? '' : await filePreview.clone().text());
        assert.deepEqual(Buffer.from(await filePreview.arrayBuffer()), await readFile(new URL('../ejemplo_pdf.pdf', import.meta.url)));
        const invalidLayout = await call(files.previewFile, 'POST', {
            programs: file.programs,
            layout: 'unknown',
        }, { id: complete.sourceId });
        assert.equal(invalidLayout.status, 400);
        const partialPreview = await call(files.previewFile, 'POST', { programs: [file.programs[0]] }, { id: complete.sourceId });
        assert.equal(partialPreview.status, 400);
        const source = await (await call(documents.getSource, 'GET', undefined, { id: complete.sourceId })).json();
        assert.equal(source.pages.length, 38);
        assert.ok(!('storedPath' in source));
        const original = await call(documents.getOriginalDocument, 'GET', undefined, { id: complete.sourceId });
        assert.deepEqual(Buffer.from(await original.arrayBuffer()), await readFile(new URL('../ejemplo_pdf.pdf', import.meta.url)));
        const originalPreview = await call(exports.previewDocument, 'POST', {
            layout: 'original',
            ids: [program.id],
            draft: true,
        });
        assert.equal(originalPreview.status, 200);
        assert.equal(originalPreview.headers.get('Content-Type'), 'application/pdf');
        assert.equal(originalPreview.headers.get('X-Page-Count'), '38');
        assert.deepEqual(Buffer.from(await originalPreview.arrayBuffer()), await readFile(new URL('../ejemplo_pdf.pdf', import.meta.url)));
        const jsonPreview = await call(exports.downloadJSON, 'POST', {
            ids: [program.id],
            draft: true,
        });
        const jsonDocument = await jsonPreview.json();
        assert.equal(jsonDocument.format, 'ProgDidactAI');
        assert.equal(jsonDocument.programs[0].id, program.id);
        const saved = await call(programs.saveProgramHandler, 'PUT', {
            ...program,
            teacher: 'Profesor de prueba',
            sections: program.sections.map((section, index) => index === 0 ? {
                ...section,
                title: '',
            } : section),
        }, { id: program.id });
        assert.equal(saved.status, 200);
        const updated = await saved.json();
        assert.equal(updated.revision, 2);
        assert.equal(updated.sections[0].title, '');
        const stale = await call(programs.saveProgramHandler, 'PUT', program, { id: program.id });
        assert.equal(stale.status, 409);
        const recovered = await call(programs.restoreProgramHandler, 'POST', {
            revision: 2,
            targetRevision: 1,
        }, { id: program.id });
        assert.equal((await recovered.json()).revision, 3);
        const blockedExport = await call(exports.previewDocument, 'POST', { ids: [program.id] });
        assert.equal(blockedExport.status, 400);
        const preview = await call(exports.previewDocument, 'POST', {
            ids: [program.id],
            draft: true,
            renumber: true,
            layout: 'institutional',
        });
        assert.equal(preview.status, 200);
        assert.equal(preview.headers.get('X-Page-Count'), '38', 'Una exportación importada no puede aumentar sus páginas aunque se solicite la plantilla anterior');
        assert.equal(preview.headers.get('Content-Type'), 'application/pdf');
        assert.equal(Buffer.from(await preview.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
        const duplicateExport = await call(exports.downloadJSON, 'POST', {
            ids: [program.id, program.id],
            draft: true,
        });
        assert.equal(duplicateExport.status, 400);
        const crossOrigin = await call(programs.saveProgramHandler, 'PUT', updated, { id: program.id }, { origin: 'https://otro-sitio.example' });
        assert.equal(crossOrigin.status, 403);
        const unknown = await call(programs.getProgram, 'GET', undefined, { id: 'missing' });
        assert.equal(unknown.status, 404);
    } finally {
        const context = await getContext();
        await context.importQueue;
        await context.dao.close();
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});
