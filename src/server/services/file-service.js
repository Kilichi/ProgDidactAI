import { unlink } from 'node:fs/promises';
import { z } from 'zod';
import { AppError } from '../domain/schemas.js';
import { repairMisclassifiedLists } from './document-parser.js';

export async function readFileDocument(id, dao, allPrograms, repair = false) {
    const source = await dao.getSource(id);
    const programs = (allPrograms || await dao.listPrograms()).filter((program) => program.sourceIds.includes(id) || program.sections.some((section) => section.sourceId === id));
    const { storedPath: _storedPath, ...publicSource } = source;
    return {
        source,
        publicSource: {
            ...publicSource,
            url: `/api/sources/${id}/original`,
        },
        programs: repair ? programs.map(repairMisclassifiedLists) : programs,
    };
}

export async function removeFileDocument(id, input, context) {
    z.object({ confirm: z.literal(true) }).parse(input);
    return context.mutate(async () => {
        const { source, programs } = await readFileDocument(id, context.dao);
        // A moved section can link several source documents to one program.
        // Reject before any write so deleting one file never erases another.
        if (programs.some((program) => program.sourceIds.some((sourceId) => sourceId !== id) ||
            program.sections.some((section) => section.sourceId !== id))) {
            throw new AppError('Este archivo comparte una programación con otro documento o con apartados manuales. Separa esos apartados antes de eliminarlo para conservar su contenido.', 409);
        }
        await context.dao.deleteFileDocument(id, programs);
        if (source.storedPath) {
            await unlink(source.storedPath).catch((error) => {
                if (error.code !== 'ENOENT') {
                    console.error('No se pudo retirar el original eliminado:', error.code);
                }
            });
        }
        return { ok: true };
    });
}
