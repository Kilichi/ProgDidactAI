import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectPage, referencePage } from '../src/lib/file-pages.js';
import { config, defaultSettings } from '../src/server/config.js';
import { extractDocument, pagesFromText } from '../src/server/services/document-extraction.js';
import { parseBlocks, parseSource, sourceCoverage } from '../src/server/services/document-parser.js';
import { validateProgram, blockSchema } from '../src/server/domain/schemas.js';
import { verifyAI, refinePrograms, splitAnalysisBlock, requestAI } from '../src/server/services/ai-analysis.js';
import { renderDocument, exportEntries, getSectionNumbers } from '../src/server/services/pdf-export.js';

const examplePath = new URL('../ejemplo_pdf.pdf', import.meta.url).pathname;

test('las calificaciones RA se importan como lista, no como tabla de dos columnas', () => {
    const blocks = parseBlocks([
        {
            id: 'p1-l1',
            page: 1,
            text: '▪    Calificación RA1 -> 1',
        },
        {
            id: 'p1-l2',
            page: 1,
            text: '▪    Calificación RA2 -> 7',
        },
        {
            id: 'p1-l3',
            page: 1,
            text: '▪    Calificación RA3 -> 6',
        },
    ]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'list');
    assert.deepEqual(blocks[0].items, [
        'Calificación RA1 -> 1',
        'Calificación RA2 -> 7',
        'Calificación RA3 -> 6',
    ]);
});

test('las variantes de listas numeradas y de calificación se conservan como lista', () => {
    const blocks = parseBlocks([
        {
            id: 'p1-l1',
            page: 1,
            text: '1. Nota RA 1: 7',
        },
        {
            id: 'p1-l2',
            page: 1,
            text: '2) Evaluación RA2 → 8',
        },
        {
            id: 'p1-l3',
            page: 1,
            text: '3. Puntuación RA3 - 6%',
        },
    ]);
    assert.equal(blocks[0].type, 'list');
    assert.deepEqual(blocks[0].items, [
        'Nota RA 1: 7',
        'Evaluación RA2 → 8',
        'Puntuación RA3 - 6%',
    ]);
});

test('Word sigue siendo importable sin LibreOffice y avisa de la revisión de tablas', async () => {
    const fixture = new URL('./fixtures/programacion.docx', import.meta.url).pathname;
    const extracted = await extractDocument(fixture, '.docx', {
        ...config,
        libreoffice: '/no-existe/libreoffice',
    });
    assert.equal(extracted.extraction, 'mammoth');
    assert.match(extracted.warnings.join(' '), /tablas/);
    assert.match(extracted.pages[0].rawText, /Conservar todo el contenido/);
    assert.match(extracted.pages[0].rawText, /RA1/);
    assert.match(extracted.pages[0].rawText, /7%/);
    const source = {
        id: 'word',
        ...extracted,
    };
    assert.deepEqual(sourceCoverage(parseSource(source), source).missing, []);
});

test('el ejemplo conserva todas las líneas, sus módulos y las numeraciones incoherentes', async () => {
    const original = await readFile(examplePath);
    const source = {
        id: 'sample',
        ...await extractDocument(examplePath, '.pdf', config),
    };
    const programs = parseSource(source);
    assert.equal(source.pages.length, 38);
    assert.equal(source.pages[0].printedPage, '195');
    assert.equal(source.pages.at(-1).printedPage, '232');
    assert.equal(programs.length, 3);
    assert.match(programs[0].module, /Fragmento inicial/);
    const serverModule = programs.find((program) => program.code === '0613');
    assert.ok(serverModule);
    assert.ok(serverModule.sections.find((section) => section.code === '10.3.4').warnings.some((warning) => warning.includes('incoherente')));
    assert.ok(serverModule.sections.some((section) => section.title.includes('Situación de aprendizaje 1')));
    const learningOutcomes = serverModule.sections.find((section) => section.code === '10.2.3.2');
    assert.ok(learningOutcomes.pageEnd > learningOutcomes.pageStart);
    assert.equal(learningOutcomes.blocks.filter((block) => block.type === 'table').length, 5);
    assert.match(programs.at(-1).warnings.join(' '), /incompleto/);
    programs.forEach(validateProgram);
    const coverage = sourceCoverage(programs, source);
    assert.equal(coverage.total, 1601);
    assert.equal(coverage.assigned, coverage.total);
    assert.deepEqual(coverage.missing, []);
    const visible = new Set();
    for (const page of source.pages) {
        for (const projection of projectPage(programs, source.id, page.number)) {
            projection.section.headingRefs.filter((ref) => referencePage(ref) === page.number).forEach((ref) => visible.add(ref));
            projection.display.blocks.flatMap((block) => block.sourceRefs).forEach((ref) => visible.add(ref));
        }
    }
    assert.equal(visible.size, coverage.total);
    assert.deepEqual(await readFile(examplePath), original);
});

test('los pies de página no se confunden con contenido y se preservan páginas vacías', () => {
    const pages = pagesFromText('10.2. Servidor\nTexto\n    195\n\f\f');
    assert.equal(pages.length, 2);
    assert.equal(pages[0].lines.at(-1).footer, true);
    assert.equal(pages[1].lines.length, 0);
});

test('la IA no puede omitir, inventar ni duplicar contenido o procedencia', () => {
    const original = [{
        id: 'block',
        type: 'text',
        text: 'RA1 ponderación 7%',
        items: [],
        columns: [],
        rows: [],
        sourceRefs: ['p1-l1'],
    }];
    verifyAI(original, original);
    assert.throws(() => verifyAI(original, [{
        ...original[0],
        text: 'RA1 ponderación',
    }]), /omite/);
    assert.throws(() => verifyAI(original, [{
        ...original[0],
        text: 'RA1 ponderación 7% inventado',
    }]), /añade/);
    assert.throws(() => verifyAI(original, [{
        ...original[0],
        sourceRefs: [],
    }]), /líneas/);
    assert.throws(() => verifyAI(original, [original[0], original[0]]), /duplica/);
    assert.throws(() => blockSchema.parse({
        ...original[0],
        type: 'table',
        columns: ['RA', 'CE'],
        rows: [['Falta una celda']],
    }));
});

test('las tablas extensas se dividen para la IA sin perder ninguna fila', () => {
    const block = {
        id: 'large',
        type: 'table',
        text: '',
        items: [],
        columns: ['RA', 'CE'],
        rows: Array.from({ length: 300 }, (_, index) => [`Resultado ${index}`, 'Criterio de evaluación '.repeat(12)]),
        sourceRefs: Array.from({ length: 300 }, (_, index) => `p1-l${index}`),
    };
    const chunks = splitAnalysisBlock(block);
    assert.ok(chunks.length > 1);
    assert.deepEqual(chunks.flatMap((chunk) => chunk.rows), block.rows);
    assert.deepEqual(chunks.flatMap((chunk) => chunk.sourceRefs), block.sourceRefs);
    chunks.forEach((chunk) => assert.ok(JSON.stringify(chunk).length <= 12000));
    verifyAI([block], chunks);
});

test('una respuesta errónea de Gemini conserva la estructura local y genera un aviso', async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    try {
        const blocks = [{
            id: 'block',
            type: 'text',
            text: 'Original completo 14%',
            items: [],
            columns: [],
            rows: [],
            sourceRefs: ['p1-l1'],
        }];
        const programs = [{
            sections: [{
                code: '10.2',
                title: 'Evaluación',
                blocks: structuredClone(blocks),
                warnings: [],
            }],
        }];
        const mockFetch = async (_url, options) => {
            const payload = JSON.parse(options.body);
            assert.equal(payload.generationConfig.responseMimeType, 'application/json');
            assert.equal(options.headers['x-goog-api-key'], 'test-key');
            return Response.json({
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify({
                                title: 'Evaluación',
                                blocks: [{
                                    ...blocks[0],
                                    text: 'Resumen',
                                }],
                            }),
                        }],
                    },
                }],
            });
        };
        await refinePrograms(programs, 'gemini', () => {}, mockFetch);
        assert.deepEqual(programs[0].sections[0].blocks, blocks);
        assert.match(programs[0].sections[0].warnings.join(' '), /omite/);
    } finally {
        if (previousKey === undefined) {
            delete process.env.GEMINI_API_KEY;
        } else {
            process.env.GEMINI_API_KEY = previousKey;
        }
    }
});

test('Groq utiliza JSON mode y se valida la estructura devuelta', async () => {
    const previousKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'test-key';
    try {
        const answer = {
            title: 'Apartado',
            blocks: [{
                type: 'text',
                text: 'Contenido',
                items: [],
                columns: [],
                rows: [],
                sourceRefs: ['p1-l1'],
            }],
        };
        const response = await requestAI('groq', 'Extrae este JSON', async (url, options) => {
            assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
            assert.deepEqual(JSON.parse(options.body).response_format, { type: 'json_object' });
            return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
        });
        assert.deepEqual(response, answer);
    } finally {
        if (previousKey === undefined) {
            delete process.env.GROQ_API_KEY;
        } else {
            process.env.GROQ_API_KEY = previousKey;
        }
    }
});

test('la exportación escapa HTML y numera de forma única las secciones reasignadas', () => {
    const program = {
        id: 'module',
        module: 'Servidor <script>alert(1)</script>',
        code: '0613',
        course: '2º',
        teacher: 'Docente',
        status: 'draft',
        sections: [
            {
                id: 'section-a',
                code: '10.2.1',
                title: 'Propuestas',
                reviewed: false,
                blocks: [],
            },
            {
                id: 'section-b',
                code: '10.3.1',
                title: 'Reasignada',
                reviewed: false,
                blocks: [{
                    type: 'text',
                    text: '**Texto** <img src=x onerror=alert(1)>',
                }],
            },
            {
                id: 'section-c',
                code: '10.3.1.1',
                title: 'Detalle',
                reviewed: false,
                blocks: [],
            },
        ],
    };
    assert.deepEqual(getSectionNumbers(program, 0), ['1.1', '1.2', '1.2.1']);
    assert.deepEqual(getSectionNumbers(program, 0, false), ['10.2.1', '10.3.1', '10.3.1.1']);
    assert.equal(exportEntries([program]).length, 4);
    const html = renderDocument([program], defaultSettings, { draft: true });
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('<strong>Texto</strong>'));
    assert.ok(html.includes('BORRADOR'));
    assert.ok(!html.includes('PD_MARK_'));
});

test('los criterios partidos conservan texto y porcentaje en una sola fila', () => {
    const pages = pagesFromText('d. Se han creado nuevos elementos de la estructura y modificado elementos ya\n                                                                                          14%\nexistentes.\ne. Se han asociado acciones a los eventos del modelo.                                     13%');
    const blocks = parseBlocks(pages[0].lines);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, 'table');
    assert.deepEqual(blocks[0].rows, [
        ['d. Se han creado nuevos elementos de la estructura y modificado elementos ya existentes.', '14%'],
        ['e. Se han asociado acciones a los eventos del modelo.', '13%'],
    ]);
    assert.deepEqual(blocks[0].sourceRefs, pages[0].lines.map((line) => line.id));
});

test('el fragmento inicial del PDF mantiene el criterio d completo en su tabla', async () => {
    const source = {
        id: 'sample',
        ...await extractDocument(examplePath, '.pdf', config),
    };
    const blocks = parseSource(source)[0].sections[0].blocks;
    assert.equal(blocks[0].type, 'table');
    assert.deepEqual(blocks[0].rows[0].map((cell) => cell.replace(/\s+/g, ' ')), [
        'd. Se han creado nuevos elementos de la estructura y modificado elementos ya existentes.', '14%',
    ]);
});

test('las dos tablas iniciales del PDF se separan sin separar la cabecera de criterios', async () => {
    const source = {
        id: 'sample',
        ...await extractDocument(examplePath, '.pdf', config),
    };
    const blocks = parseSource(source)[0].sections[0].blocks;
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].rows.length, 5);
    assert.match(blocks[0].rows.at(-1)[0], /^h\./);
    assert.deepEqual(blocks[1].rows[0], ['Resultado de aprendizaje (0612.7)', 'Ponderación']);
    assert.deepEqual(blocks[1].rows[2], ['Criterio de Evaluación', 'Ponderación']);
    assert.equal(blocks[1].rows.length, 12);
    assert.deepEqual(sourceCoverage(parseSource(source), source).missing, []);
});

test('la geometría conserva celdas combinadas, síntesis y las dos columnas de competencias', async () => {
    const source = {
        id: 'geometry',
        ...await extractDocument(examplePath, '.pdf', config),
    };
    const programs = parseSource(source);
    const program = programs.find((candidate) => candidate.code === '0613');
    const identity = program.sections.find((section) => section.code === '10.2.2').blocks.find((block) => block.cellSpans);
    assert.equal(identity.rows.length, 9);
    assert.equal(identity.rows[0][0], 'MÓDULO PROFESIONAL');
    assert.ok(identity.cellSpans.some((cell) => cell.row === 1 && cell.column === 0 && cell.rowSpan === 3));
    assert.match(identity.rows[7][0], /Asociado a Unidad\nde competencia/);
    assert.equal(identity.rows[8][0], 'Síntesis del módulo');
    assert.match(identity.rows[8][1], /entornos back-end/);
    const competencies = program.sections.find((section) => section.code === '10.2.3.1').blocks.filter((block) => block.type === 'table');
    assert.ok(competencies.every((block) => block.columns.length === 2));
    assert.deepEqual(competencies[0].rows[0], ['Competencias', 'Objetivos']);
    assert.match(competencies[0].rows[1][0], /Gestionar servidores/);
    assert.match(competencies[0].rows[1][1], /Instalar módulos/);
    const originalCell = source.pages[1].tables[0].rows[1][1];
    identity.rows[1][1] = 'Edición';
    assert.equal(source.pages[1].tables[0].rows[1][1], originalCell);
    programs.forEach(validateProgram);
    assert.deepEqual(sourceCoverage(programs, source).missing, []);
    const html = renderDocument(programs, defaultSettings, { draft: true });
    assert.match(html, /rowspan="3"/);
    assert.match(html, /colspan="5"/);
});

test('las situaciones separan nombre y etiqueta y conservan sesiones y evaluación', async () => {
    const source = {
        id: 'situations',
        ...await extractDocument(examplePath, '.pdf', config),
    };
    const tables = source.pages.flatMap((page) => page.tables || []).filter((table) => /^Situación de\naprendizaje/.test(table.rows[0]?.[0]));
    assert.equal(tables.length, 8);
    for (const table of tables) {
        assert.equal(table.columnWidths.length, 4);
        assert.equal(table.rows[0][2], 'Sesiones');
        assert.equal(table.rows[1][2], 'Evaluación');
        assert.ok(table.rows[0][1].length > 0);
        assert.ok(table.cellSpans.some((cell) => cell.row === 0 && cell.column === 0 && cell.rowSpan === 2 && cell.colSpan === 1));
        assert.ok(table.cellSpans.some((cell) => cell.row === 0 && cell.column === 1 && cell.rowSpan === 2 && cell.colSpan === 1));
    }
    assert.equal(tables[0].rows[0][1], '¿Qué Arquitecturas y Tecnologías Web conocemos?');
    assert.deepEqual(sourceCoverage(parseSource(source), source).missing, []);
});
