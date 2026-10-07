import puppeteer from 'puppeteer-core';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
import { readFileSync } from 'node:fs';
import { escapeHTML, renderPageContent } from '../../lib/document-layout.js';
const documentStyles = readFileSync(path.join(process.cwd(), 'src/styles/document-content.css'), 'utf8');
import { projectPage } from '../../lib/file-pages.js';
import { AppError } from '../domain/schemas.js';

export function renderReadableDocument(programs, source, { markers = false } = {}) {
    const pages = source.pages.map((page) => {
        const projections = projectPage(programs, source.id, page.number);
        const content = renderPageContent(projections, { fallback: page.rawText || '' });
        return `<article class="source-page">${markers ? `<span class="page-anchor">PD_FILE_PAGE_${page.number}</span>` : ''}<div class="source-content">${content}</div></article>`;
    }).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHTML(source.filename)}</title><style>
        ${documentStyles}
        @page { size:A4 portrait; margin:16mm 16mm 18mm; }
        body { margin:0; background:#fff; }
        .source-page { break-before:page; position:relative; }
        .source-page:first-child { break-before:auto; }
        .page-anchor { position:absolute; top:0; left:0; font:1pt/1 Arial; color:white; }
    </style></head><body class="document-content">${pages}</body></html>`;
}

export async function exportReadablePDF(programs, source, config) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-readable-'));
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: config.chromium,
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
            userDataDir: path.join(directory, 'browser'),
        });
        const page = await browser.newPage();
        await page.emulateMediaType('print');
        const options = {
            preferCSSPageSize: true,
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: '<div style="font:8pt Arial;color:#555;text-align:center;width:100%"><span class="pageNumber"></span></div>',
        };
        await page.setContent(renderReadableDocument(programs, source, { markers: true }), { waitUntil: 'load' });
        const measured = path.join(directory, 'measured.pdf');
        await writeFile(measured, await page.pdf(options));
        const { stdout } = await execute(config.pdfToText, ['-layout', measured, '-'], { maxBuffer: 30 * 1024 * 1024 });
        const rendered = stdout.split('\f');
        const pageMap = {};
        for (const original of source.pages) {
            const position = rendered.findIndex((content) => new RegExp(`PD_FILE_PAGE_${original.number}(?!\\d)`).test(content));
            if (position < 0) {
                throw new AppError('No se ha podido situar una página en la vista previa.', 500);
            }
            pageMap[original.number] = position + 1;
        }
        await page.setContent(renderReadableDocument(programs, source), { waitUntil: 'load' });
        return {
            buffer: await page.pdf(options),
            pageMap,
            pageCount: rendered.length - 1,
        };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        console.error('PDF legible:', error.message);
        throw new AppError('No se pudo generar la vista previa. Comprueba que Chromium esté disponible.', 500);
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
}
