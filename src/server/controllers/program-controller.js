import { getContext } from '../context.js';
import { AppError } from '../domain/schemas.js';
import { jsonResponse, readJson } from '../http/route-handler.js';
import { createProgram, saveProgram, restoreProgram, moveSection, revisionSchema } from '../services/program-service.js';
export async function listPrograms() {
    const { dao } = await getContext();
    return jsonResponse(await dao.listPrograms());
}
export async function getProgram(_request, { id }) {
    const { dao } = await getContext();
    return jsonResponse(await dao.getProgram(id));
}
export async function createProgramHandler(request) {
    return jsonResponse(await createProgram(await readJson(request), await getContext()), 201);
}
export async function saveProgramHandler(request, { id }) {
    return jsonResponse(await saveProgram(id, await readJson(request), await getContext()));
}
export async function deleteProgramHandler(request, { id }) {
    const { revision } = revisionSchema.parse(await readJson(request));
    const context = await getContext();
    await context.mutate(() => context.dao.deleteProgram(id, revision));
    return jsonResponse({ ok: true });
}
export async function getHistory(_request, { id }) {
    const { dao } = await getContext();
    const versions = (await dao.history(id)).map(({ sections, ...version }) => ({
        ...version,
        sectionCount: sections.length,
    }));
    return jsonResponse(versions);
}
export async function getSnapshot(_request, { id, revision }) {
    const { dao } = await getContext();
    const snapshot = (await dao.history(id)).find((version) => version.revision === Number(revision));
    if (!snapshot) {
        throw new AppError('Versión no encontrada.', 404);
    }
    return jsonResponse(snapshot);
}
export async function restoreProgramHandler(request, { id }) {
    return jsonResponse(await restoreProgram(id, await readJson(request), await getContext()));
}
export async function moveSectionHandler(request, { id }) {
    return jsonResponse(await moveSection(id, await readJson(request), await getContext()));
}
