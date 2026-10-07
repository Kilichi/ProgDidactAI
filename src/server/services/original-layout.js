import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { AppError } from '../domain/schemas.js';
import { parseSource, repairMisclassifiedLists } from './document-parser.js';

const execute = promisify(execFile);
const words = (value) => String(value).replace(/\*\*/g, '').trim().split(/\s+/u).filter(Boolean);
const normalized = (value) => words(value).join(' ');
const signature = (references) => [...references].sort().join('|');
const matchingWord = (value) => /^\d+(?:\.\d+)*\.$/.test(value) ? value.slice(0, -1) : value;

function blockText(block) {
    if (block.type === 'table') {
        return block.rows.map((row) => row.join(' ')).join('\n');
    }
    return block.type === 'list' ? block.items.join('\n') : block.text;
}

export async function originalPDFPath(source, config, directory) {
    if (source.extension === '.pdf') {
        return source.storedPath;
    }
    try {
        await execute(config.libreoffice, [
            `-env:UserInstallation=file://${directory}/office-profile`,
            '--headless', '--convert-to', 'pdf', '--outdir', directory, source.storedPath,
        ], { timeout: 90000 });
        const converted = path.join(directory, path.basename(source.storedPath, source.extension) + '.pdf');
        await readFile(converted);
        return converted;
    } catch {
        throw new AppError('Para previsualizar o exportar Word con su diseño original, instala LibreOffice o utiliza Docker.');
    }
}

export function parseOriginalLayout(xml) {
    const document = new DOMParser().parseFromString(xml, 'text/xml');
    const fonts = new Map();
    return Array.from(document.getElementsByTagName('page')).map((element) => {
        for (const font of Array.from(element.getElementsByTagName('fontspec'))) {
            fonts.set(font.getAttribute('id'), {
                size: Number(font.getAttribute('size')),
                color: /^#[a-f0-9]{6}$/i.test(font.getAttribute('color')) ? font.getAttribute('color') : '#000000',
                family: /times/i.test(font.getAttribute('family')) ? 'Times New Roman' : /courier/i.test(font.getAttribute('family')) ? 'Courier New' : 'Arial',
            });
        }
        const page = {
            number: Number(element.getAttribute('number')),
            width: Number(element.getAttribute('width')),
            height: Number(element.getAttribute('height')),
            texts: Array.from(element.getElementsByTagName('text')).map((text, index) => ({
                id: index,
                text: text.textContent,
                originalText: text.textContent,
                top: Number(text.getAttribute('top')),
                left: Number(text.getAttribute('left')),
                width: Number(text.getAttribute('width')),
                height: Number(text.getAttribute('height')),
                font: fonts.get(text.getAttribute('font')) || {
                    size: 9,
                    color: '#000000',
                    family: 'Arial',
                },
                bold: !!text.getElementsByTagName('b').length,
                italic: !!text.getElementsByTagName('i').length,
            })),
        };
        const contentRight = Math.max(...page.texts.filter((text) => text.text.trim()).map((text) => text.left + text.width));
        for (const text of page.texts) {
            const next = page.texts.filter((candidate) => candidate.text.trim() && candidate.left > text.left && Math.abs(candidate.top - text.top) <= 2).sort((a, b) => a.left - b.left)[0];
            text.maxWidth = Math.max(text.width, (next?.left || contentRight) - text.left - 2);
        }
        return page;
    });
}

function mapSourceLines(source, pages) {
    const references = new Map();
    for (const page of pages) {
        const groups = [];
        for (const text of [...page.texts].sort((a, b) => a.top - b.top || a.left - b.left)) {
            let group = groups.find((candidate) => Math.abs(candidate.top - text.top) <= 2);
            if (!group) {
                group = {
                    top: text.top,
                    texts: [],
                };
                groups.push(group);
            }
            group.texts.push(text);
        }
        const sourcePage = source.pages.find((candidate) => candidate.number === page.number);
        for (const line of sourcePage?.lines || []) {
            const match = groups.find((group) => normalized(group.texts.sort((a, b) => a.left - b.left).map((text) => text.text).join(' ')) === normalized(line.text));
            if (match) {
                references.set(line.id, {
                    page,
                    texts: match.texts,
                });
            }
        }
    }
    return references;
}

function replaceText(references, oldText, newText, mapping, label, location) {
    if (normalized(oldText) === normalized(newText)) {
        return;
    }
    const oldWords = words(oldText);
    const newWords = words(newText);
    let start = 0;
    while (start < oldWords.length && oldWords[start] === newWords[start]) {
        start++;
    }
    let end = oldWords.length;
    let newEnd = newWords.length;
    while (end > start && newEnd > start && oldWords[end - 1] === newWords[newEnd - 1]) {
        end--;
        newEnd--;
    }
    const texts = [...new Set(references.flatMap((reference) => mapping.get(reference)?.texts || []))];
    const positions = texts.flatMap((node) => words(node.text).map((word, index) => ({
        word,
        index,
        node,
    })));
    const aligned = [];
    let cursor = 0;
    for (const word of oldWords) {
        while (cursor < positions.length && matchingWord(positions[cursor].word) !== matchingWord(word)) {
            cursor++;
        }
        if (cursor >= positions.length) {
            throw new AppError(`No se puede situar la edición de «${label}» en el original. Conserva su estructura o utiliza la plantilla institucional.`);
        }
        aligned.push(positions[cursor++]);
    }
    const changed = aligned.slice(start, end);
    if (!changed.length) {
        const anchor = aligned[start - 1] || aligned[start];
        if (!anchor) {
            throw new AppError(`«${label}» no tiene un espacio de edición en el documento original.`);
        }
        const tokens = words(anchor.node.text);
        tokens.splice(start ? anchor.index + 1 : anchor.index, 0, ...newWords.slice(start, newEnd));
        anchor.node.text = tokens.join(' ');
        anchor.node.changed = true;
        anchor.node.location = location;
        return;
    }
    const byNode = new Map();
    for (const position of changed) {
        const indexes = byNode.get(position.node) || [];
        indexes.push(position.index);
        byNode.set(position.node, indexes);
    }
    const replacements = newWords.slice(start, newEnd);
    let consumed = 0;
    let offset = 0;
    for (const [node, indexes] of byNode) {
        consumed += indexes.length;
        const boundary = Math.round(replacements.length * consumed / changed.length);
        const tokens = words(node.text);
        tokens.splice(indexes[0], indexes.length, ...replacements.slice(offset, boundary));
        node.text = tokens.join(' ');
        node.changed = true;
        node.location = location;
        offset = boundary;
    }
}

export function applyOriginalEdits(source, pages, programs) {
    let location;
    try {
        const mapping = mapSourceLines(source, pages);
        const baseline = parseSource(source);
        const baselineSections = baseline.flatMap((program) => program.sections);
        const originalBlocks = baselineSections.flatMap((section) => section.blocks);
        const seen = new Set();
        for (const program of programs) {
            const baselineModule = baseline.find((candidate) => candidate.sections.some((section) => program.sections.some((current) => current.headingRefs.length && signature(current.headingRefs) === signature(section.headingRefs))));
            if (baselineModule) {
                const originalOrder = baselineModule.sections.map((section) => signature(section.headingRefs) || signature(section.blocks.flatMap((block) => block.sourceRefs)));
                const currentOrder = program.sections.filter((section) => section.sourceId === source.id).map((section) => signature(section.headingRefs) || signature(section.blocks.flatMap((block) => block.sourceRefs)));
                if (JSON.stringify(originalOrder) !== JSON.stringify(currentOrder)) {
                    throw new AppError('Se han añadido, eliminado o reordenado apartados. El modo original conserva sus posiciones; utiliza la plantilla institucional para cambiar la estructura.');
                }
            }
            for (const section of program.sections.filter((candidate) => candidate.sourceId === source.id)) {
                location = {
                    programId: program.id,
                    fileId: source.id,
                    sectionId: section.id,
                    sectionTitle: section.title,
                    page: section.pageStart,
                    field: 'title',
                };
                const originalSection = baselineSections.find((candidate) => signature(candidate.headingRefs) === signature(section.headingRefs) && candidate.pageStart === section.pageStart);
                if (!originalSection) {
                    throw new AppError('Un apartado nuevo o reasignado no tiene una posición en el original. Usa la plantilla institucional para cambiar la estructura.');
                }
                if (JSON.stringify(originalSection.blocks.map((block) => signature(block.sourceRefs))) !== JSON.stringify(section.blocks.map((block) => signature(block.sourceRefs)))) {
                    throw new AppError('Se ha modificado la estructura de los bloques. Utiliza la plantilla institucional para añadir, eliminar, unir o reordenar contenido.');
                }
                if (section.headingRefs.length) {
                    const oldHeading = `${originalSection.originalCode} ${originalSection.title}`.trim();
                    const newHeading = `${section.originalCode ? section.code : ''} ${section.title}`.trim();
                    replaceText(section.headingRefs, oldHeading, newHeading, mapping, section.title, location);
                    const moduleBaseline = baseline.find((candidate) => candidate.sections.includes(originalSection));
                    if (moduleBaseline?.module === originalSection.title && program.module !== moduleBaseline.module && section.title === originalSection.title) {
                        replaceText(section.headingRefs, oldHeading, `${section.code} ${program.module}`, mapping, program.module, location);
                    }
                }
                if (!section.headingRefs.length && section.title.trim() && section.title !== originalSection.title) {
                    const references = section.blocks.flatMap((block) => block.sourceRefs);
                    const first = references.map((reference) => mapping.get(reference)).find(Boolean);
                    if (first) {
                        const anchor = [...first.texts].sort((a, b) => a.top - b.top || a.left - b.left)[0];
                        const top = anchor.top - 22;
                        if (top < 12 || first.page.texts.some((text) => text.text.trim() &&
                        text.top < top + 16 && text.top + text.height > top)) {
                            throw new AppError('El título añadido no tiene espacio encima del contenido original. Usa la plantilla institucional para exportarlo con espacio nuevo.');
                        }
                        first.page.texts.push({
                            id: `title-${section.id}`,
                            page: first.page.number,
                            text: section.title.trim(),
                            originalText: '',
                            insert: true,
                            changed: true,
                            top,
                            left: anchor.left,
                            width: 0,
                            height: 16,
                            maxWidth: first.page.width - anchor.left - 36,
                            font: {
                                ...anchor.font,
                                size: 12,
                                color: '#000000',
                            },
                        });
                    }
                }
                for (const block of section.blocks) {
                    location = {
                        ...location,
                        blockId: block.id,
                        field: 'text',
                    };
                    let originalBlock = originalBlocks.find((candidate) => signature(candidate.sourceRefs) === signature(block.sourceRefs));
                    if (!originalBlock || seen.has(signature(block.sourceRefs))) {
                        throw new AppError('Hay bloques nuevos, unidos o sin posición única en el original. Usa la plantilla institucional para exportar esa estructura.');
                    }
                    seen.add(signature(block.sourceRefs));
                    if (originalBlock.type !== block.type) {
                        const repaired = repairMisclassifiedLists({ sections: [{ blocks: [originalBlock] }] }).sections[0].blocks[0];
                        if (repaired.type === block.type) {
                            originalBlock = repaired;
                        }
                    }
                    if (block.type === 'table' && originalBlock.type === 'table' && normalized(block.columns.join(' ')) !== normalized(originalBlock.columns.join(' '))) {
                        throw new AppError('Los nombres de columnas del editor no son cabeceras del original. Edita la fila original de la tabla o utiliza la plantilla institucional.');
                    }
                    if (originalBlock.cellSpans && block.type === 'table') {
                        if (!isDeepStrictEqual(block.cellSpans, originalBlock.cellSpans) ||
                        block.rows.length !== originalBlock.rows.length ||
                        block.columns.length !== originalBlock.columns.length) {
                            throw new AppError('Se ha modificado la estructura de la tabla. Utiliza la plantilla institucional para cambiar sus filas o celdas combinadas.');
                        }
                        for (const cell of originalBlock.cellSpans) {
                            location = {
                                ...location,
                                field: 'cell',
                                row: cell.row,
                                column: cell.column,
                            };
                            const oldText = originalBlock.rows[cell.row][cell.column];
                            const newText = block.rows[cell.row][cell.column];
                            if (normalized(oldText) === normalized(newText)) {
                                continue;
                            }
                            if (cell.bbox) {
                                const pageNumber = Number(block.sourceRefs[0]?.match(/^p(\d+)-/)?.[1]) || section.pageStart;
                                const referencePage = pages.find((candidate) => candidate.number === pageNumber);
                                const [left, top, right, bottom] = cell.bbox;
                                const anchor = referencePage.texts.find((text) => text.left >= left - 1 &&
                                text.left < right && text.top >= top - 1 && text.top < bottom);
                                referencePage.texts.push({
                                    id: `cell-${block.id}-${cell.row}-${cell.column}`,
                                    text: newText,
                                    originalText: oldText,
                                    region: true,
                                    changed: true,
                                    top,
                                    left,
                                    width: right - left,
                                    height: bottom - top,
                                    maxWidth: right - left - 6,
                                    font: anchor?.font || {
                                        size: 9,
                                        color: '#000000',
                                        family: 'Arial',
                                    },
                                    location: {
                                        ...location,
                                        page: referencePage.number,
                                    },
                                });
                            } else {
                                replaceText(block.sourceRefs, oldText, newText, mapping, section.title, location);
                            }
                        }
                    } else {
                        replaceText(block.sourceRefs, blockText(originalBlock), blockText(block), mapping, section.title, location);
                    }
                }
                if (originalSection.blocks.some((block) => !section.blocks.some((candidate) => signature(candidate.sourceRefs) === signature(block.sourceRefs)))) {
                    throw new AppError('Se han eliminado bloques del original. Para mantener sus páginas, conserva la estructura y edita su contenido.');
                }
            }
            const firstOriginal = baseline.find((candidate) => candidate.sections.some((section) => program.sections.some((current) => current.headingRefs.length && signature(current.headingRefs) === signature(section.headingRefs))));
            if (firstOriginal) {
                const identity = firstOriginal.sections.find((section) => /identificaci[oó]n/i.test(section.title));
                const refs = identity?.blocks.flatMap((block) => block.sourceRefs) || [];
                for (const field of ['code', 'course', 'teacher']) {
                    if (program[field] !== firstOriginal[field]) {
                        if (!firstOriginal[field] || !refs.length) {
                            throw new AppError(`El campo ${field} no tiene una posición identificada en el original. Edita la tabla de identificación o utiliza la plantilla institucional.`);
                        }
                        replaceText(refs, firstOriginal[field], program[field], mapping, field, location);
                    }
                }
            }
        }
        return pages;
    } catch (error) {
        if (error instanceof AppError && location) {
            const position = location.field === 'cell' ? ` · fila ${location.row + 1}, columna ${location.column + 1}` : '';
            throw new AppError(`Página ${location.page} · ${location.sectionTitle || 'Apartado sin título'}${position}: ${error.message}`,
                error.status, {
                    location,
                    solution: 'Abre la edición señalada para corregirla. Si has cambiado filas, columnas o el orden del contenido, exporta con la plantilla institucional para redistribuir el espacio.',
                });
        }
        throw error;
    }
}

export async function prepareOriginalDocument(programs, sources, config) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-original-'));
    try {
        const pages = [];
        const nativeSources = [];
        let unchangedPath;
        for (const source of sources) {
            const input = await originalPDFPath(source, config, directory);
            const { stdout } = await execute(config.pdfToHtml || 'pdftohtml', ['-xml', '-i', '-stdout', '-zoom', '1', input], {
                timeout: 90000,
                maxBuffer: 30 * 1024 * 1024,
            });
            const layout = applyOriginalEdits(source, parseOriginalLayout(stdout), programs);
            nativeSources.push({
                buffer: await readFile(input),
                edits: layout.flatMap((page) => page.texts.filter((text) => text.changed).map((text) => ({
                    ...text,
                    page: page.number,
                }))),
            });
            pages.push(...layout);
            if (sources.length === 1 && !layout.some((page) => page.texts.some((text) => text.changed))) {
                unchangedPath = input;
            }
        }
        if (!pages.length) {
            throw new AppError('Selecciona módulos que tengan un documento original asociado.');
        }
        if (pages.some((page) => page.width !== pages[0].width || page.height !== pages[0].height)) {
            throw new AppError('Los originales tienen tamaños de página diferentes. Expórtalos por separado para conservar su diseño.');
        }
        return {
            nativeSources,
            pageCount: pages.length,
            width: pages[0].width,
            height: pages[0].height,
            unchangedPDF: unchangedPath ? await readFile(unchangedPath) : null,
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        console.error('Diseño original:', error.code || error.name);
        throw new AppError('No se pudo reconstruir el diseño original. Comprueba que Poppler (pdftohtml) esté instalado o utiliza Docker.');
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
}

export async function exportOriginalPDF(document, config) {
    if (document.unchangedPDF) {
        return document.unchangedPDF;
    }
    const directory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-native-pages-'));
    try {
        const sources = [];
        for (const [index, source] of document.nativeSources.entries()) {
            const inputPath = path.join(directory, `source-${index}.pdf`);
            await writeFile(inputPath, source.buffer);
            sources.push({
                path: inputPath,
                edits: source.edits,
            });
        }
        const specification = path.join(directory, 'edits.json');
        const output = path.join(directory, 'export.pdf');
        await writeFile(specification, JSON.stringify({
            sources,
            pageCount: document.pageCount,
        }));
        const { stdout } = await execute(config.python || 'python3', [
            path.join(process.cwd(), 'scripts/export_original.py'), specification, output,
        ], {
            timeout: 90000,
            maxBuffer: 1024 * 1024,
        });
        if (JSON.parse(stdout).pages !== document.pageCount) {
            throw new AppError('La exportación no conserva el número de páginas original. No se ha generado la descarga.', 500);
        }
        return await readFile(output);
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        let message;
        let details;
        try {
            const failure = JSON.parse(error.stdout);
            message = failure.error;
            details = failure.details;
        } catch {
            message = 'Para exportar conservando el diseño original instala Python y pikepdf, o utiliza Docker.';
        }
        throw new AppError(message || 'No se pudo modificar el PDF original conservando sus páginas.', 400, details);
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
}
