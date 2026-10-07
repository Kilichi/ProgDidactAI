import { z } from 'zod';
import { getContext } from '../context.js';
import { AppError, settingsSchema } from '../domain/schemas.js';
import { jsonResponse, readJson } from '../http/route-handler.js';
import { exportPDF } from '../services/pdf-export.js';
import { exportOriginalPDF, prepareOriginalDocument } from '../services/original-layout.js';
const exportSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(100),
    draft: z.boolean().default(false),
    renumber: z.boolean().default(true),
    layout: z.enum(['original', 'institutional']).default('original'),
});
async function getExportInput(request) {
    const options = exportSchema.parse(await readJson(request));
    if (new Set(options.ids).size !== options.ids.length) {
        throw new AppError('No repitas módulos en la exportación.');
    }
    const context = await getContext();
    const programs = await Promise.all(options.ids.map((id) => context.dao.getProgram(id)));
    if (programs.some((program) => program.sourceIds.length || program.sections.some((section) => section.sourceId))) {
        options.layout = 'original';
    }
    const settings = await context.dao.getSettings();
    if (!options.draft && programs.some((program) => program.status !== 'reviewed' || !program.sections.length || program.sections.some((section) => !section.reviewed))) {
        throw new AppError('Revisa todos los módulos seleccionados o activa «Exportar como borrador».');
    }
    return {
        programs,
        settings,
        options,
        config: context.config,
        dao: context.dao,
    };
}
async function getOriginalExport(programs, dao, config) {
    if (programs.some((program) => program.sections.some((section) => !section.sourceId))) {
        throw new AppError('Los apartados nuevos no tienen una posición en el original. Utiliza la plantilla institucional para incluirlos.');
    }
    const sourceIds = [...new Set(programs.flatMap((program) => [...program.sourceIds, ...program.sections.map((section) => section.sourceId)]).filter(Boolean))];
    const sources = await Promise.all(sourceIds.map((id) => dao.getSource(id)));
    return prepareOriginalDocument(programs, sources, config);
}
export async function getSettings() {
    const { dao } = await getContext();
    return jsonResponse(await dao.getSettings());
}
export async function saveSettings(request) {
    const settings = settingsSchema.parse(await readJson(request));
    const context = await getContext();
    return jsonResponse(await context.mutate(() => context.dao.setSettings(settings)));
}
export async function downloadPDF(request) {
    const { programs, settings, options, config, dao } = await getExportInput(request);
    const original = options.layout === 'original' ? await getOriginalExport(programs, dao, config) : null;
    const pdf = original ? await exportOriginalPDF(original, config) : await exportPDF(programs, settings, options, config);
    return new Response(new Uint8Array(pdf), {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="Programacion_Didactica.pdf"',
            'Cache-Control': 'no-store',
            ...(original ? { 'X-Page-Count': String(original.pageCount) } : {}),
        },
    });
}
export async function previewDocument(request) {
    const { programs, settings, options, config, dao } = await getExportInput(request);
    const original = options.layout === 'original' ? await getOriginalExport(programs, dao, config) : null;
    return new Response(new Uint8Array(original ? await exportOriginalPDF(original, config) : await exportPDF(programs, settings, options, config)), {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="Vista_Previa.pdf"',
            'Cache-Control': 'no-store',
            ...(original ? { 'X-Page-Count': String(original.pageCount) } : {}),
        },
    });
}
export async function downloadJSON(request) {
    const { programs, settings } = await getExportInput(request);
    return new Response(JSON.stringify({
        format: 'ProgDidactAI',
        version: 1,
        settings,
        programs,
    }, null, 4), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': 'attachment; filename="Programaciones.json"',
            'Cache-Control': 'no-store',
        },
    });
}
