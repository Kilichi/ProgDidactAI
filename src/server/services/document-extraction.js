import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mammoth from 'mammoth';
import { AppError } from '../domain/schemas.js';
const run = promisify(execFile);
export function pagesFromText(text) {
    const rawPages = text.replace(/\r/g, '').split('\f');
    if (!rawPages.at(-1)?.trim()) {
        rawPages.pop();
    }
    return rawPages.map((rawText, index) => {
        const rows = rawText.split('\n');
        let last = rows.length - 1;
        while (last >= 0 && !rows[last].trim()) {
            last--;
        }
        const printedPage = /^\s*\d+\s*$/.test(rows[last] || '')
            ? rows[last].trim()
            : '';
        const lines = rows
            .map((text, line) => ({
                id: `p${index + 1}-l${line + 1}`,
                page: index + 1,
                text,
                footer: line === last && !!printedPage,
            }))
            .filter((l) => l.text.trim());
        return {
            number: index + 1,
            printedPage,
            rawText,
            lines,
        };
    });
}
export async function extractDocument(filePath, extension, config) {
    let temp;
    try {
        let pdfPath = filePath;
        if (extension !== '.pdf') {
            temp = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-word-'));
            try {
                await run(config.libreoffice, [
                    `-env:UserInstallation=file://${temp}/profile`,
                    '--headless',
                    '--convert-to',
                    'pdf',
                    '--outdir',
                    temp,
                    filePath,
                ], {
                    timeout: 90000,
                    maxBuffer: 1024 * 1024,
                });
                pdfPath = path.join(temp, path.basename(filePath, extension) + '.pdf');
                await readFile(pdfPath);
            } catch {
                if (extension !== '.docx') {
                    throw new AppError('Para importar archivos .doc es necesario instalar LibreOffice. También puedes convertir el documento a PDF o DOCX.');
                }
                const result = await mammoth.extractRawText({ path: filePath });
                const pages = pagesFromText(result.value);
                if (!pages.length || !pages.some((p) => p.lines.length)) {
                    throw new AppError('El documento Word no contiene texto extraíble.');
                }
                return {
                    pages,
                    warnings: [
                        'Word importado sin paginación mediante Mammoth. Revisa las tablas y su formato.',
                    ],
                    extraction: 'mammoth',
                };
            }
        }
        const { stdout } = await run(config.pdfToText, ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
            timeout: 90000,
            maxBuffer: 12 * 1024 * 1024,
        });
        const pages = pagesFromText(stdout);
        if (!pages.length || !pages.some((p) => p.lines.some((l) => !l.footer))) {
            throw new AppError('No se ha encontrado texto. Si el PDF está escaneado, aplica OCR antes de importarlo.');
        }
        if (pages.length > 400) {
            throw new AppError('El límite es de 400 páginas por archivo. Divide el documento en varios archivos.');
        }
        const tableWarnings = [];
        try {
            temp ||= await mkdtemp(path.join(os.tmpdir(), 'progdidactai-tables-'));
            const bboxPath = path.join(temp, 'words.html');
            const pagesPath = path.join(temp, 'pages.json');
            await run(config.pdfToText, ['-bbox-layout', '-enc', 'UTF-8', pdfPath, bboxPath], { timeout: 90000 });
            await writeFile(pagesPath, JSON.stringify(pages));
            const { stdout: tableJSON } = await run(config.python || 'python3', [
                path.join(process.cwd(), 'scripts/extract_tables.py'), pdfPath, bboxPath, pagesPath,
            ], {
                timeout: 90000,
                maxBuffer: 30 * 1024 * 1024,
            });
            for (const table of JSON.parse(tableJSON)) {
                const page = pages[table.page - 1];
                page.tables ||= [];
                page.tables.push(table);
                for (const line of page.lines) {
                    if (table.sourceRefs.includes(line.id)) {
                        line.tableId = table.id;
                    }
                }
            }
        } catch {
            tableWarnings.push('No se pudo leer la geometría de las tablas. Se conserva el texto; instala Python y pikepdf para conservar las celdas combinadas.');
        }
        const empty = pages
            .filter((p) => !p.lines.some((l) => !l.footer))
            .map((p) => p.number);
        return {
            pages,
            warnings: [...tableWarnings, ...(empty.length
                ? [
                    `Páginas sin texto extraíble: ${empty.join(', ')}. Comprueba si necesitan OCR.`,
                ]
                : [])],
            extraction: extension === '.pdf' ? 'poppler' : 'libreoffice-poppler',
        };
    } catch (e) {
        if (e instanceof AppError) {
            throw e;
        }
        if (e.code === 'ENOENT') {
            throw new AppError('No se encuentra pdftotext. Instala Poppler o utiliza el contenedor Docker.');
        }
        throw new AppError('No se pudo leer el documento. Comprueba que no esté dañado ni protegido con contraseña.');
    } finally {
        if (temp) {
            await rm(temp, {
                recursive: true,
                force: true,
            });
        }
    }
}
