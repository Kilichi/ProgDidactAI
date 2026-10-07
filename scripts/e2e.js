import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const executeFile = promisify(execFile);
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-e2e-'));
const port = process.env.E2E_PORT || '3107';
const baseURL = `http://127.0.0.1:${port}`;
const artifactsDirectory = path.join(process.cwd(), 'artifacts');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', port], {
    env: {
        ...process.env,
        DATA_DRIVER: 'file',
        DATA_DIR: temporaryDirectory,
        AI_PROVIDER: 'local',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (chunk) => {
    serverLog += chunk.toString();
});
server.stderr.on('data', (chunk) => {
    serverLog += chunk.toString();
});
let browser;

async function waitForServer() {
    for (let attempt = 0; attempt < 80; attempt++) {
        if (server.exitCode !== null) {
            throw new Error(serverLog || `Next.js terminó al arrancar (código ${server.exitCode}). Comprueba que puedas abrir un puerto local.`);
        }
        try {
            const response = await fetch(`${baseURL}/api/health`);
            if (response.ok) {
                return;
            }
        } catch {
            // Next puede tardar unos segundos en arrancar la compilación.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('No se pudo arrancar Next.js. Ejecuta npm run build antes de la prueba.');
}

try {
    await waitForServer();
    await mkdir(artifactsDirectory, { recursive: true });
    browser = await puppeteer.launch({
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
        userDataDir: path.join(temporaryDirectory, 'browser'),
    });
    const page = await browser.newPage();
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('dialog', (dialog) => dialog.accept());
    await page.setViewport({
        width: 1440,
        height: 1000,
    });
    await page.goto(baseURL, { waitUntil: 'networkidle0' });
    await page.screenshot({
        path: path.join(artifactsDirectory, 'dashboard-desktop.png'),
        fullPage: true,
    });
    const initialTheme = await page.$eval('html', (node) => node.dataset.theme);
    await page.click('.theme-toggle');
    assert.notEqual(await page.$eval('html', (node) => node.dataset.theme), initialTheme);
    await page.screenshot({
        path: path.join(artifactsDirectory, 'dashboard-alternate-theme.png'),
        fullPage: true,
    });
    await page.reload({ waitUntil: 'networkidle0' });
    assert.notEqual(await page.$eval('html', (node) => node.dataset.theme), initialTheme);
    await page.goto(`${baseURL}/importar`, { waitUntil: 'networkidle0' });
    await page.click('button::-p-text(Probar con el PDF de ejemplo)');
    await page.waitForSelector('.jobs-panel .job-links', { timeout: 120000 });
    const importedPrograms = await (await fetch(`${baseURL}/api/programs`)).json();
    assert.equal(importedPrograms.length, 3);
    const program = importedPrograms.find((candidate) => candidate.code === '0613');
    const files = await (await fetch(`${baseURL}/api/files`)).json();
    assert.equal(files.length, 1);
    await page.goto(baseURL, { waitUntil: 'networkidle0' });
    assert.equal((await page.$$('.file-card')).length, 1);
    await page.goto(`${baseURL}/archivos/${files[0].id}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.doc-table [contenteditable]');
    const firstCell = await page.$('.doc-table [contenteditable]');
    const initialCell = await firstCell.evaluate((field) => field.innerText);
    let editedCell = initialCell.replace('creado', 'añadido');
    await page.setRequestInterception(true);
    let holdSave = true;
    let releaseSave;
    const heldSave = new Promise((resolve) => {
        releaseSave = resolve;
    });
    const intercept = (request) => {
        if (holdSave && request.method() === 'PUT' && request.url().includes('/api/programs/')) {
            holdSave = false;
            releaseSave(request);
        } else {
            request.continue();
        }
    };
    page.on('request', intercept);
    await firstCell.click({ clickCount: 3 });
    await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control');
    await firstCell.type(editedCell);
    const delayedSave = await heldSave;
    await firstCell.type(' Revisión concurrente.');
    editedCell += ' Revisión concurrente.';
    await delayedSave.continue();
    await page.waitForFunction(() => document.querySelector('.studio-save-state')?.textContent.includes('Todos los cambios guardados'));
    assert.equal(await firstCell.evaluate((field) => field.innerText), editedCell, 'Una respuesta antigua no puede borrar texto nuevo');
    page.off('request', intercept);
    await page.setRequestInterception(false);
    await page.select('select[aria-label="Página del archivo"]', '2');
    await page.waitForFunction(() => [...document.querySelectorAll('.doc-table [contenteditable]')].some((field) => field.innerText === 'MÓDULO PROFESIONAL'));
    assert.equal(await page.$eval('select[aria-label="Página del archivo"]', (select) => select.value), '2');
    await page.select('select[aria-label="Página del archivo"]', '1');
    await page.waitForFunction((expected) => document.querySelector('.doc-table [contenteditable]')?.innerText === expected, {}, editedCell);
    const previewResponse = page.waitForResponse((response) => response.url().endsWith(`/api/files/${files[0].id}/preview`));
    await page.click('button::-p-text(Vista previa PDF)');
    const previewResult = await previewResponse;
    assert.equal(previewResult.status(), 200);
    await page.waitForSelector('.studio-pdf iframe');
    const livePreviewPath = path.join(artifactsDirectory, 'file-live-preview.pdf');
    const actualPreview = await fetch(previewResult.url(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: previewResult.request().postData(),
    });
    assert.equal(actualPreview.status, 200);
    const previewBytes = Buffer.from(await actualPreview.arrayBuffer());
    assert.ok(previewBytes.length > 1000, `PDF vacío: ${previewBytes.length} bytes`);
    await writeFile(livePreviewPath, previewBytes);
    const livePreviewText = await executeFile(process.env.PDFTOTEXT_PATH || 'pdftotext', ['-layout', livePreviewPath, '-']);
    assert.match(livePreviewText.stdout, /añadido/);
    assert.ok(livePreviewText.stdout.split('\f').length - 1 >= 38);
    const payload = JSON.parse(previewResult.request().postData());
    const expectedContent = payload.programs.flatMap((program) => program.sections.flatMap((section) => [
        ...(section.headingRefs.length ? [section.title] : []),
        ...section.blocks.map((block) => block.type === 'table' ? block.rows.flat().join(' ') : block.type === 'list' ? block.items.join(' ') : block.text),
    ])).join(' ');
    const wordCounts = (content) => {
        const counts = new Map();
        for (const word of content.normalize('NFKC').toLowerCase().match(/\p{L}{2,}/gu) || []) {
            counts.set(word, (counts.get(word) || 0) + 1);
        }
        return counts;
    };
    const actualWords = wordCounts(livePreviewText.stdout);
    const missingWords = [...wordCounts(expectedContent)].filter(([word,count]) => (actualWords.get(word) || 0) < count);
    assert.deepEqual(missingWords, [], 'El PDF debe conservar el contenido de todos los módulos y tablas');
    assert.ok(!livePreviewText.stdout.includes('PD_FILE_PAGE_'));
    const fontXML = await executeFile('pdftohtml', ['-xml', '-i', '-stdout', '-zoom', '1', livePreviewPath]);
    const fontSizes = [...fontXML.stdout.matchAll(/<fontspec[^>]+size="([^"]+)"/g)].map((match) => Number(match[1]));
    const originalFontXML = await executeFile('pdftohtml', ['-xml', '-i', '-stdout', '-zoom', '1', 'ejemplo_pdf.pdf']);
    const originalSizes = [...originalFontXML.stdout.matchAll(/<fontspec[^>]+size="([^"]+)"/g)].map((match) => Number(match[1]));
    assert.ok(fontSizes.every((size) => size >= Math.min(...originalSizes)), 'El modo original no debe reducir el tamaño mínimo del documento');
    const pageMap = JSON.parse(actualPreview.headers.get('X-Page-Map'));
    assert.equal(Object.keys(pageMap).length, 38);
    console.log(`Vista previa real: ${previewBytes.length} bytes, ${actualPreview.headers.get('X-Page-Count')} páginas, contenido íntegro.`);

    const legacyDownload = await fetch(actualPreview.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...payload,
            layout: 'readable',
        }),
    });
    assert.equal(legacyDownload.status, 200);
    assert.equal(legacyDownload.headers.get('X-Page-Count'), '38', 'Incluso las pestañas antiguas deben conservar las páginas');

    await page.click('.studio-tabs button:first-child');
    const rowCount = await page.$eval('.doc-table', (table) => table.rows.length);
    await page.click('.doc-table-actions [data-table-action="row"]');
    await page.waitForFunction((count) => document.querySelector('.doc-table').rows.length === count + 1, {}, rowCount);
    await page.click('.doc-remove-rows summary');
    await page.click('.doc-remove-rows [data-table-action="remove-row"]:last-child');
    await page.waitForFunction((count) => document.querySelector('.doc-table').rows.length === count, {}, rowCount);
    await page.click('[aria-label="Deshacer cambio"]');
    await page.waitForFunction((count) => document.querySelector('.doc-table').rows.length === count + 1, {}, rowCount);
    await page.click('[aria-label="Rehacer cambio"]');
    await page.waitForFunction((count) => document.querySelector('.doc-table').rows.length === count, {}, rowCount);
    await page.waitForFunction(() => document.querySelector('.studio-save-state')?.textContent.includes('Todos los cambios guardados'));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction((expected) => document.querySelector('.doc-table [contenteditable]')?.innerText === expected, {}, editedCell);
    await page.screenshot({
        path: path.join(artifactsDirectory, 'file-editor-desktop.png'),
        fullPage: false,
    });
    await page.setViewport({
        width: 390,
        height: 844,
    });
    await page.screenshot({
        path: path.join(artifactsDirectory, 'file-editor-mobile.png'),
        fullPage: false,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.setViewport({
        width: 1440,
        height: 1000,
    });

    const beforeMetadata = await (await fetch(`${baseURL}/api/programs/${program.id}`)).json();
    await page.goto(`${baseURL}/programaciones/${program.id}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.metadata-fields');
    await page.click('.editor-metadata > summary');
    const teacherInput = await page.$('.metadata-fields label:last-child input');
    await teacherInput.click({ clickCount: 3 });
    await teacherInput.type('Docente E2E');
    await page.click('button::-p-text(Guardar cambios)');
    await page.waitForFunction((revision) => document.querySelector('.version-label')?.textContent.replace(/\s+/g, ' ').includes(`Versión ${revision}`), {}, beforeMetadata.revision + 1);
    await page.click('button::-p-text(Propuestas de mejora del curso anterior)');
    await page.screenshot({
        path: path.join(artifactsDirectory, 'editor-desktop.png'),
        fullPage: false,
    });
    await page.click('button::-p-text(Ver documento original)');
    await page.waitForSelector('dialog[open] .document-preview-frame');
    await page.keyboard.press('Escape');
    await page.click('button::-p-text(Histórico)');
    await page.waitForSelector('dialog[open] .history-row');
    await page.click('button::-p-text(Recuperar)');
    await page.waitForFunction((revision) => document.querySelector('.version-label')?.textContent.replace(/\s+/g, ' ').includes(`Versión ${revision}`), {}, beforeMetadata.revision + 2);
    const restored = await (await fetch(`${baseURL}/api/programs/${program.id}`)).json();
    assert.equal(restored.teacher, program.teacher);
    await page.setViewport({
        width: 390,
        height: 844,
    });
    await page.goto(baseURL, { waitUntil: 'networkidle0' });
    await page.screenshot({
        path: path.join(artifactsDirectory, 'dashboard-mobile.png'),
        fullPage: true,
    });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const currentProgram = await (await fetch(`${baseURL}/api/programs/${program.id}`)).json();
    await fetch(`${baseURL}/api/programs/${program.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            revision: currentProgram.revision,
            targetRevision: 1,
        }),
    });
    const exported = await fetch(`${baseURL}/api/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ids: importedPrograms.map((candidate) => candidate.id),
            draft: true,
            renumber: true,
            layout: 'original',
        }),
    });
    if (!exported.ok) {
        throw new Error(await exported.text());
    }
    const pdfPath = path.join(artifactsDirectory, 'example-export.pdf');
    await writeFile(pdfPath, Buffer.from(await exported.arrayBuffer()));
    const { stdout } = await executeFile(process.env.PDFTOTEXT_PATH || 'pdftotext', ['-layout', pdfPath, '-']);
    assert.equal(stdout.split('\f').length - 1, 38);
    assert.equal(exported.headers.get('X-Page-Count'), '38');
    assert.match(stdout, /Propuestas de mejora/);
    assert.match(stdout, /0613/);
    assert.ok(!stdout.includes('PD_MARK_'));
    await page.goto(baseURL, { waitUntil: 'networkidle0' });
    await page.click('.library-delete');
    await page.waitForFunction(() => !document.querySelector('.file-card'));
    assert.deepEqual(await (await fetch(`${baseURL}/api/files`)).json(), []);
    assert.deepEqual(await (await fetch(`${baseURL}/api/programs`)).json(), []);
    assert.equal((await fetch(`${baseURL}/api/sources/${files[0].id}/original`)).status, 404);
    assert.deepEqual(browserErrors, []);
    console.log('E2E correcto: archivos, edición por páginas, vista previa sin guardar, original, histórico, vista móvil y PDF.');
    console.log(`Capturas y PDF: ${artifactsDirectory}`);
} catch (error) {
    if (browser) {
        const pages = await browser.pages();
        const current = pages.at(-1);
        await current.screenshot({
            path: path.join(artifactsDirectory, 'e2e-failure.png'),
            fullPage: true,
        }).catch(() => {});
        console.error(await current.evaluate(() => ({
            url: location.href,
            page: document.querySelector('select[aria-label="Página del archivo"]')?.value,
            cells: [...document.querySelectorAll('.doc-table [contenteditable]')].slice(0,5).map(field => field.innerText),
            alerts: [...document.querySelectorAll('[role=alert]')].map(node => node.textContent),
        })));
    }
    throw error;
} finally {
    if (browser) {
        await browser.close();
    }
    if (server.exitCode === null) {
        server.kill('SIGTERM');
        await new Promise((resolve) => server.once('exit', resolve));
    }
    await rm(temporaryDirectory, {
        recursive: true,
        force: true,
    });
}
