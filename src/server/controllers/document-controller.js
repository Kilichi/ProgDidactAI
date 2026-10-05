import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getContext, getProviderAvailability } from '../context.js';
import { AppError } from '../domain/schemas.js';
import { jsonResponse, readRequestBody, readJson } from '../http/route-handler.js';
import { queueImport, importExample, providerSchema } from '../services/import-service.js';
export async function getHealth() {
    const { config } = await getContext();
    return jsonResponse({
        status: 'ok',
        storage: config.driver,
        providers: getProviderAvailability(),
    });
}
export async function uploadDocument(request) {
    const context = await getContext();
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
        const body = await readRequestBody(request, 16 * 1024 * 1024);
        let form;
        try {
            form = await new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') } }).formData();
        } catch {
            throw new AppError('No se pudo leer la subida. Selecciona el archivo de nuevo.');
        }
        const file = form.get('file');
        if (!file || typeof file.arrayBuffer !== 'function') {
            throw new AppError('Selecciona un documento para importar.');
        }
        const filename = path.basename(file.name).replace(/[\r\n\x00]/g, '').slice(0, 250);
        const provider = providerSchema.parse(form.get('provider') || context.config.provider);
        return jsonResponse(await queueImport(Buffer.from(await file.arrayBuffer()), filename, provider, context), 202);
    }
    let filename;
    try {
        filename = decodeURIComponent(request.headers.get('x-filename') || '');
    } catch {
        throw new AppError('Nombre de archivo inválido.');
    }
    filename = path.basename(filename).replace(/[\r\n\x00]/g, '').slice(0, 250);
    const provider = providerSchema.parse(request.headers.get('x-ai-provider') || context.config.provider);
    const buffer = await readRequestBody(request, 15 * 1024 * 1024);
    return jsonResponse(await queueImport(buffer, filename, provider, context), 202);
}
export async function uploadExample(request) {
    const { provider = 'local' } = await readJson(request);
    return jsonResponse(await importExample(providerSchema.parse(provider), await getContext()), 202);
}
export async function getImportJob(_request, { id }) {
    const { jobs } = await getContext();
    const job = jobs.get(id);
    if (!job) {
        throw new AppError('La tarea ya no está disponible. Revisa los módulos guardados.', 404);
    }
    return jsonResponse(job);
}
export async function getSource(_request, { id }) {
    const { dao } = await getContext();
    const { storedPath: _storedPath, ...source } = await dao.getSource(id);
    return jsonResponse({
        ...source,
        url: `/api/sources/${id}/original`,
    });
}
export async function getOriginalDocument(_request, { id }) {
    const { dao } = await getContext();
    const source = await dao.getSource(id);
    const mimeTypes = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
    };
    return new Response(new Uint8Array(await readFile(source.storedPath)), {
        headers: {
            'Content-Type': mimeTypes[source.extension],
            'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(source.filename)}`,
            'Cache-Control': 'no-store',
        },
    });
}
