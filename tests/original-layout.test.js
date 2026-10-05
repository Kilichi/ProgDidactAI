import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../src/server/config.js';
import { extractDocument } from '../src/server/services/document-extraction.js';
import { parseSource } from '../src/server/services/document-parser.js';
import { prepareOriginalDocument, parseOriginalLayout, applyOriginalEdits, exportOriginalPDF } from '../src/server/services/original-layout.js';

const execute = promisify(execFile);
const input = new URL('../ejemplo_pdf.pdf', import.meta.url).pathname;

async function getSource() {
    return {
        id: 'fixed-pages-source',
        filename: 'ejemplo_pdf.pdf',
        extension: '.pdf',
        storedPath: input,
        ...await extractDocument(input, '.pdf', config),
    };
}

test('el modo original conserva las 38 páginas y devuelve exactamente el PDF sin cambios', async () => {
    const source = await getSource();
    const programs = parseSource(source);
    const prepared = await prepareOriginalDocument(programs, [source], config);
    assert.equal(prepared.pageCount, 38);
    assert.deepEqual(prepared.unchangedPDF, await readFile(input));
    assert.deepEqual(await exportOriginalPDF(prepared, config), await readFile(input));
    assert.equal(prepared.nativeSources.length, 1);
    assert.equal(prepared.nativeSources[0].edits.length, 0);
});

test('las ediciones de títulos y celdas conservan la posición y el número de páginas', async () => {
    const source = await getSource();
    const { stdout } = await execute(config.pdfToHtml, ['-xml', '-i', '-stdout', '-zoom', '1', input]);
    const programs = parseSource(source);
    const section = programs[1].sections.find((candidate) => candidate.title === 'Desarrollo curricular');
    section.title = 'Desarrollo actualizado';
    const table = programs[1].sections.flatMap((candidate) => candidate.blocks).find((block) => block.type === 'table' && block.rows.some((row) => row.some((cell) => cell.includes('Gestionar servidores'))));
    const row = table.rows.find((candidate) => candidate.some((cell) => cell.includes('Gestionar servidores')));
    const index = row.findIndex((cell) => cell.includes('Gestionar servidores'));
    row[index] = row[index].replace('Gestionar servidores', 'Gestionar sistemas');
    const original = parseOriginalLayout(stdout);
    const edited = applyOriginalEdits(source, structuredClone(original), programs);
    assert.equal(edited.length, 38);
    const changes = edited.flatMap((page) => page.texts.filter((text) => text.changed));
    assert.ok(changes.length >= 2);
    assert.ok(changes.some((text) => text.text.includes('actualizado')));
    assert.ok(changes.some((text) => text.text.includes('sistemas')));
    for (const page of edited) {
        assert.equal(page.texts.length, original[page.number - 1].texts.length);
        for (const text of page.texts) {
            const previous = original[page.number - 1].texts.find((candidate) => candidate.id === text.id);
            assert.equal(text.top, previous.top);
            assert.equal(text.left, previous.left);
        }
    }
    programs[1].sections.reverse();
    assert.throws(() => applyOriginalEdits(source, parseOriginalLayout(stdout), programs), /reordenado/);
});

test('el PDF modificado conserva sus páginas, recursos y texto sin depender de Chromium', async () => {
    const source = await getSource();
    const programs = parseSource(source);
    programs[1].sections.find((section) => section.title === 'Desarrollo curricular').title = 'Desarrollo actualizado';
    const table = programs[1].sections.flatMap((section) => section.blocks).find((block) => block.type === 'table' && block.rows.some((row) => row.some((cell) => cell.includes('Gestionar servidores'))));
    table.rows = table.rows.map((row) => row.map((cell) => cell.replace('Gestionar servidores', 'Gestionar sistemas')));
    const prepared = await prepareOriginalDocument(programs, [source], config);
    const directory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-native-test-'));
    try {
        const output = path.join(directory, 'edited.pdf');
        await writeFile(output, await exportOriginalPDF(prepared, config));
        const { stdout } = await execute(config.pdfToText, ['-layout', output, '-']);
        assert.equal(stdout.split('\f').length - 1, 38);
        assert.match(stdout, /Desarrollo actualizado/);
        assert.match(stdout, /Gestionar sistemas/);
        assert.doesNotMatch(stdout, /Desarrollo curricular/);
        const validation = await execute(config.python, ['-c', `
import pikepdf, sys
original = pikepdf.Pdf.open(sys.argv[1])
edited = pikepdf.Pdf.open(sys.argv[2])
assert len(original.pages) == len(edited.pages) == 38
for index in range(38):
    assert original.pages[index].MediaBox == edited.pages[index].MediaBox
    if index != 2:
        assert pikepdf.unparse_content_stream(pikepdf.parse_content_stream(original.pages[index])) == pikepdf.unparse_content_stream(pikepdf.parse_content_stream(edited.pages[index]))
for name, font in original.pages[2].Resources.Font.items():
    assert font.BaseFont == edited.pages[2].Resources.Font[name].BaseFont
print('Diseño y páginas preservados')
`, input, output]);
        assert.match(validation.stdout, /preservados/);
        prepared.nativeSources[0].edits[0].text = 'Desarrollo '.repeat(100);
        await assert.rejects(() => exportOriginalPDF(prepared, config), /no cabe/);
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});
