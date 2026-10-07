import { z } from 'zod';
import { getContext } from '../context.js';
import { AppError, validateProgram } from '../domain/schemas.js';
import { validateSourceReferences } from '../services/program-service.js';
import { jsonResponse, readJson } from '../http/route-handler.js';
import { prepareOriginalDocument, exportOriginalPDF } from '../services/original-layout.js';
import { pageIsReviewed } from '../../lib/file-pages.js';
import { readFileDocument as fileData, removeFileDocument } from '../services/file-service.js';

export async function listFiles() {
    const { dao } = await getContext();
    const programs = await dao.listPrograms();
    const ids = [...new Set(programs.flatMap((program) => [...program.sourceIds, ...program.sections.map((section) => section.sourceId)]).filter(Boolean))];
    const files = await Promise.all(ids.map(async (id) => {
        const { source, programs: linked } = await fileData(id, dao, programs);
        const reviewedPages = source.pages.filter((page) => pageIsReviewed(linked, id, page.number)).length;
        return {
            id,
            filename: source.filename,
            extension: source.extension,
            pageCount: source.pages.length,
            reviewedPages,
            status: reviewedPages === source.pages.length ? 'reviewed' : 'draft',
            updatedAt: linked.reduce((latest, program) => program.updatedAt > latest ? program.updatedAt : latest, source.createdAt),
            createdAt: source.createdAt,
        };
    }));
    return jsonResponse(files);
}

export async function getFile(_request, { id }) {
    const { dao } = await getContext();
    const { publicSource, programs } = await fileData(id, dao, undefined, true);
    return jsonResponse({
        source: publicSource,
        programs,
    });
}

export async function deleteFile(request, { id }) {
    return jsonResponse(await removeFileDocument(id, await readJson(request), await getContext()));
}

export async function previewFile(request, { id }) {
    const { dao, config } = await getContext();
    const { source, programs: stored } = await fileData(id, dao);
    const input = z.object({
        layout: z.enum(['readable', 'original']).default('original'),
        programs: z.array(z.object({
            id: z.string(),
            revision: z.number().int().positive(),
        }).passthrough()).min(1).max(100),
    }).parse(await readJson(request));
    if (input.programs.length !== stored.length || new Set(input.programs.map((program) => program.id)).size !== stored.length) {
        throw new AppError('La vista previa debe incluir todo el contenido del archivo. Recarga el editor.');
    }
    const programs = [];
    for (const candidate of input.programs) {
        const original = stored.find((program) => program.id === candidate.id);
        if (!original || candidate.revision !== original.revision) {
            throw new AppError('El archivo ha cambiado en otra ventana. Guarda o recarga antes de previsualizar.', 409);
        }
        const normalized = validateProgram(candidate);
        await validateSourceReferences(normalized, dao);
        programs.push({
            ...original,
            ...normalized,
        });
    }
    // Legacy clients may still send "readable". Every file download now
    // preserves the original pages, including requests from an older tab.
    const prepared = await prepareOriginalDocument(programs, [source], config);
    const pdf = await exportOriginalPDF(prepared, config);
    if (!pdf?.byteLength) {
        throw new AppError('La generación del documento no devolvió un PDF válido.', 500);
    }
    return new Response(new Uint8Array(pdf), {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="Vista_Previa.pdf"',
            'Cache-Control': 'no-store',
            'X-Page-Count': String(prepared.pageCount),
            'X-Page-Map': JSON.stringify(Object.fromEntries(source.pages.map((candidate) => [candidate.number, candidate.number]))),
        },
    });
}
