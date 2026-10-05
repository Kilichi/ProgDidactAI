import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, validateProgram } from '../domain/schemas.js';
export const revisionSchema = z.object({ revision: z.number().int().positive() });
export async function validateSourceReferences(program, dao) {
    const sources = new Map();
    for (const sourceId of program.sourceIds) {
        sources.set(sourceId, await dao.getSource(sourceId));
    }
    for (const section of program.sections) {
        const references = [...section.headingRefs, ...section.blocks.flatMap((block) => block.sourceRefs)];
        if (!section.sourceId) {
            if (references.length) {
                throw new AppError('Una sección nueva no puede referenciar un documento inexistente.');
            }
            continue;
        }
        const source = sources.get(section.sourceId);
        if (!source) {
            throw new AppError('La sección debe estar asociada a un documento original del módulo.');
        }
        const validReferences = new Set(source.pages.flatMap((page) => page.lines.map((line) => line.id)));
        if (references.some((reference) => !validReferences.has(reference))) {
            throw new AppError('La sección contiene referencias de origen inválidas.');
        }
        if (section.pageStart < 1 || section.pageEnd < section.pageStart || section.pageEnd > source.pages.length) {
            throw new AppError('Las páginas de procedencia son inválidas.');
        }
    }
}
export async function createProgram(input, context) {
    const program = validateProgram(input);
    await validateSourceReferences(program, context.dao);
    const now = new Date().toISOString();
    return context.mutate(() => context.dao.insertProgram({
        ...program,
        id: randomUUID(),
        revision: 1,
        createdAt: now,
        updatedAt: now,
    }));
}
export async function saveProgram(programId, input, context) {
    const { revision } = revisionSchema.parse(input);
    const program = validateProgram(input);
    await validateSourceReferences(program, context.dao);
    return context.mutate(() => context.dao.updateProgram(programId, revision, program));
}
export async function restoreProgram(programId, input, context) {
    const { revision, targetRevision } = revisionSchema.extend({ targetRevision: z.number().int().positive() }).parse(input);
    return context.mutate(async () => {
        const snapshot = (await context.dao.history(programId))
            .find((version) => version.revision === targetRevision);
        if (!snapshot) {
            throw new AppError('Versión no encontrada.', 404);
        }
        return context.dao.updateProgram(programId, revision, validateProgram(snapshot));
    });
}
export async function moveSection(programId, input, context) {
    const { revision, targetRevision, targetId, sectionId } = revisionSchema.extend({
        targetId: z.string().min(1),
        sectionId: z.string().min(1),
        targetRevision: z.number().int().positive(),
    }).parse(input);
    if (programId === targetId) {
        throw new AppError('Selecciona otro módulo.');
    }
    return context.mutate(async () => {
        const origin = await context.dao.getProgram(programId);
        const destination = await context.dao.getProgram(targetId);
        if (origin.revision !== revision || destination.revision !== targetRevision) {
            throw new AppError('Uno de los módulos ha cambiado. Recarga antes de mover la sección.', 409);
        }
        const section = origin.sections.find((candidate) => candidate.id === sectionId);
        if (!section) {
            throw new AppError('Sección no encontrada.', 404);
        }
        const updatedDestination = validateProgram({
            ...destination,
            status: 'draft',
            sections: [...destination.sections, {
                ...section,
                reviewed: false,
            }],
            sourceIds: [...new Set([...destination.sourceIds, ...origin.sourceIds])],
        });
        const savedDestination = await context.dao.updateProgram(destination.id, destination.revision, updatedDestination);
        try {
            const savedOrigin = await context.dao.updateProgram(origin.id, origin.revision, validateProgram({
                ...origin,
                status: 'draft',
                sections: origin.sections.filter((candidate) => candidate.id !== sectionId),
            }));
            return {
                from: savedOrigin,
                to: savedDestination,
            };
        } catch (error) {
            await context.dao.updateProgram(destination.id, savedDestination.revision, validateProgram(destination));
            throw error;
        }
    });
}
