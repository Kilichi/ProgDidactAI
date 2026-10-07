import path from 'node:path';
import { rm } from 'node:fs/promises';
import { getContext } from '../src/server/context.js';
import { pageIsReviewed } from '../src/lib/file-pages.js';

const { dao, config } = await getContext();
try {
    const programs = await dao.listPrograms();
    const ids = [...new Set(programs.flatMap((program) => [...program.sourceIds, ...program.sections.map((section) => section.sourceId)]).filter(Boolean))];
    const pending = [];
    for (const id of ids) {
        const source = await dao.getSource(id);
        if (source.pages.some((page) => !pageIsReviewed(programs, id, page.number))) {
            pending.push(source);
        }
    }
    const pendingIds = new Set(pending.map((source) => source.id));
    const toDelete = programs.filter((program) => program.sourceIds.some((id) => pendingIds.has(id)));
    if (toDelete.some((program) => program.sourceIds.some((id) => !pendingIds.has(id)))) {
        throw new Error('Hay contenido compartido con archivos revisados. No se ha eliminado ningún dato.');
    }
    const uploads = path.resolve(config.dataDir, 'uploads') + path.sep;
    if (pending.some((source) => !path.resolve(source.storedPath).startsWith(uploads))) {
        throw new Error('Un original está fuera de la carpeta de subidas. No se ha eliminado ningún dato.');
    }
    for (const program of toDelete) {
        await dao.deleteProgram(program.id, program.revision);
    }
    for (const source of pending) {
        await dao.deleteSource(source.id);
        await rm(source.storedPath, { force: true });
    }
    console.log(JSON.stringify({
        deletedFiles: pending.length,
        deletedProgramsAndHistory: toDelete.length,
        preservedFiles: ids.length - pending.length,
    }));
} finally {
    await dao.close?.();
}
