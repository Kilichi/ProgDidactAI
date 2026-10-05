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
    await page.goto(`${baseURL}/importar`, { waitUntil: 'networkidle0' });
    await page.click('button::-p-text(Probar con el PDF de ejemplo)');
    await page.waitForSelector('.jobs-panel .job-links', { timeout: 120000 });
    const importedPrograms = await (await fetch(`${baseURL}/api/programs`)).json();
    assert.equal(importedPrograms.length, 3);
    const program = importedPrograms.find((candidate) => candidate.code === '0613');
    await page.goto(`${baseURL}/programaciones/${program.id}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.metadata-fields');
    await page.click('.editor-metadata > summary');
    const teacherInput = await page.$('.metadata-fields label:last-child input');
    await teacherInput.click({ clickCount: 3 });
    await teacherInput.type('Docente E2E');
    await page.click('button::-p-text(Guardar cambios)');
    await page.waitForFunction(() => document.querySelector('.version-label')?.textContent.includes('Versión 2'));
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
    await page.waitForFunction(() => document.querySelector('.version-label')?.textContent.includes('Versión 3'));
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
    const exported = await fetch(`${baseURL}/api/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ids: importedPrograms.map((candidate) => candidate.id),
            draft: true,
            renumber: true,
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
    assert.deepEqual(browserErrors, []);
    console.log('E2E correcto: importación, edición, original, histórico, vista móvil y PDF.');
    console.log(`Capturas y PDF: ${artifactsDirectory}`);
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
