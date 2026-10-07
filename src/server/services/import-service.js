import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getProviderAvailability } from '../context.js';
import { AppError, validateProgram } from '../domain/schemas.js';
import { extractDocument } from './document-extraction.js';
import { parseSource, sourceCoverage } from './document-parser.js';
import { refinePrograms } from './ai-analysis.js';
export const providerSchema = z.enum(['local', 'gemini', 'groq']);
const uploadExtensions = new Set(['.pdf', '.docx', '.doc']);
function validateUpload(buffer, filename) {
    if (!buffer.length) {
        throw new AppError('Selecciona un archivo con contenido.');
    }
    if (buffer.length > 15 * 1024 * 1024) {
        throw new AppError('El archivo supera el límite de 15 MB.', 413);
    }
    const extension = path.extname(filename).toLowerCase();
    if (!uploadExtensions.has(extension)) {
        throw new AppError('Solo se admiten archivos PDF, DOCX y DOC.');
    }
    const signature = buffer.subarray(0, 8);
    if (extension === '.pdf' && !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
        throw new AppError('El archivo no es un PDF válido.');
    }
    if (extension === '.docx' && !signature.subarray(0, 2).equals(Buffer.from('PK'))) {
        throw new AppError('El archivo no es un DOCX válido.');
    }
    if (extension === '.doc' && !signature.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
        throw new AppError('El archivo no es un DOC válido. Convierte el documento a DOCX o PDF.');
    }
    return extension;
}
async function processImport(job, buffer, storedPath, sourceId, extension, provider, context) {
    let sourceSaved = false;
    try {
        job.status = 'processing';
        job.message = 'Extrayendo texto y tablas';
        job.progress = 10;
        const extracted = await extractDocument(storedPath, extension, context.config);
        const source = {
            id: sourceId,
            filename: job.filename,
            storedPath,
            extension,
            size: buffer.length,
            sha256: createHash('sha256').update(buffer).digest('hex'),
            provider,
            createdAt: job.createdAt,
            ...extracted,
        };
        job.message = 'Reconstruyendo secciones y módulos';
        job.progress = 35;
        const programs = parseSource(source);
        if (sourceCoverage(programs, source).missing.length) {
            throw new AppError('La extracción no ha conservado todas las líneas. No se guardará una importación incompleta.', 500);
        }
        await refinePrograms(programs, provider, (message, progress) => {
            job.message = message;
            job.progress = progress;
        });
        if (sourceCoverage(programs, source).missing.length) {
            throw new AppError('La interpretación no ha conservado todas las líneas.', 500);
        }
        const normalizedPrograms = programs.map((program) => ({
            ...program,
            ...validateProgram(program),
        }));
        await context.mutate(async () => {
            await context.dao.insertSource(source);
            sourceSaved = true;
            for (const program of normalizedPrograms) {
                await context.dao.insertProgram(program);
                job.programIds.push(program.id);
            }
        });
        job.status = 'done';
        job.progress = 100;
        job.message = `${source.pages.length} páginas listas para editar`;
        job.sourceId = source.id;
        job.coverage = {
            total: sourceCoverage(programs, source).total,
            missing: 0,
        };
    } catch (error) {
        job.status = 'error';
        job.message = error instanceof AppError ? error.message : 'No se pudo completar la importación. El documento original no se ha modificado.';
        if (!sourceSaved) {
            await rm(storedPath, { force: true });
        }
        console.error('Importación fallida:', error.message);
    }
}
export async function queueImport(buffer, filename, provider, context) {
    const extension = validateUpload(buffer, filename);
    if (!getProviderAvailability()[provider]) {
        throw new AppError(`El proveedor ${provider} no tiene una clave configurada en el servidor.`);
    }
    const activeJobs = [...context.jobs.values()].filter((job) => !['done', 'error'].includes(job.status));
    if (activeJobs.length >= 20) {
        throw new AppError('Hay demasiados documentos en proceso. Espera a que terminen.', 429);
    }
    const sourceId = randomUUID();
    const storedPath = path.join(context.config.dataDir, 'uploads', sourceId + extension);
    await writeFile(storedPath, buffer);
    const job = {
        id: randomUUID(),
        filename,
        status: 'queued',
        message: 'Documento en cola',
        progress: 0,
        programIds: [],
        createdAt: new Date().toISOString(),
    };
    context.jobs.set(job.id, job);
    const operation = () => processImport(job, buffer, storedPath, sourceId, extension, provider, context);
    context.importQueue = context.importQueue.then(operation, operation);
    return structuredClone(job);
}
export async function importExample(provider, context) {
    const buffer = await readFile(path.join(process.cwd(), 'ejemplo_pdf.pdf'));
    return queueImport(buffer, 'ejemplo_pdf.pdf', provider, context);
}
