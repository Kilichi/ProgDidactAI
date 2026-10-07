import { tableCellSpan } from '../../lib/table-layout.js';
import puppeteer from 'puppeteer-core';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppError } from '../domain/schemas.js';

const executeFile = promisify(execFile);
const stylesheet = readFileSync(path.join(process.cwd(), 'src/server/templates/institutional.css'), 'utf8');

export function escapeHTML(value) {
    const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };
    return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

function renderRichText(value) {
    return escapeHTML(value)
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

export function getSectionNumbers(program, moduleIndex, renumber = true) {
    const counters = [];
    return program.sections.map((section) => {
        if (!renumber) {
            return section.code;
        }
        const requestedDepth = Math.max(1, section.code.split('.').length - 2);
        const depth = Math.min(requestedDepth, counters.length + 1, 5);
        counters.length = depth;
        counters[depth - 1] = (counters[depth - 1] || 0) + 1;
        return [moduleIndex + 1, ...counters].join('.');
    });
}

export function exportEntries(programs, renumber = true) {
    return programs.flatMap((program, moduleIndex) => {
        const sectionNumbers = getSectionNumbers(program, moduleIndex, renumber);
        return [
            {
                id: `module-${program.id}`,
                title: `${moduleIndex + 1}. ${program.module}`,
                depth: 0,
            },
            ...program.sections.map((section, index) => ({
                id: section.id,
                title: `${sectionNumbers[index]} ${section.title}`.trim(),
                depth: Math.max(1, sectionNumbers[index].split('.').length - 1),
            })),
        ];
    });
}

function renderBlock(block) {
    if (block.type === 'text') {
        return `<p>${renderRichText(block.text)}</p>`;
    }
    if (block.type === 'list') {
        return `<ul>${block.items.map((item) => `<li>${renderRichText(item)}</li>`).join('')}</ul>`;
    }
    const header = block.columns.map((column) => `<th>${escapeHTML(column)}</th>`).join('');
    const rows = block.rows.map((row, rowIndex) => `<tr>${row.map((cell, columnIndex) => {
        const span = tableCellSpan(block, rowIndex, columnIndex);
        return span ? `<td rowspan="${span.rowSpan}" colspan="${span.colSpan}">${renderRichText(cell)}</td>` : '';
    }).join('')}</tr>`).join('');
    const columns = block.columnWidths ? `<colgroup>${block.columnWidths.map((width) => `<col style="width:${width}%">`).join('')}</colgroup>` : '';
    return `<table>${columns}${block.cellSpans ? '' : `<thead><tr>${header}</tr></thead>`}<tbody>${rows}</tbody></table>`;
}

function markerToken(identifier) {
    return `PD_MARK_${identifier.replaceAll('-', '')}`;
}

function renderMarker(identifier, visible) {
    return `<span class="marker">${visible ? markerToken(identifier) : ''}</span>`;
}

function renderProgram(program, moduleIndex, options) {
    const sectionNumbers = getSectionNumbers(program, moduleIndex, options.renumber);
    const sections = program.sections.map((section, index) => {
        const headingLevel = sectionNumbers[index].split('.').length > 2 ? 3 : 2;
        return `
            <section>
                <h${headingLevel} id="${escapeHTML(section.id)}">
                    ${escapeHTML(sectionNumbers[index])} ${escapeHTML(section.title)}${renderMarker(section.id, options.markers)}
                </h${headingLevel}>
                ${options.draft && !section.reviewed ? '<p class="source-note">Apartado pendiente de revisión.</p>' : ''}
                ${section.blocks.map(renderBlock).join('\n')}
            </section>`;
    }).join('\n');

    return `
        <article class="module">
            <header class="module-head">
                <h1 id="module-${escapeHTML(program.id)}">
                    ${moduleIndex + 1}. ${escapeHTML(program.module)}${renderMarker(`module-${program.id}`, options.markers)}
                </h1>
                <div class="metadata">
                    <span>Código: ${escapeHTML(program.code || 'Pendiente')}</span>
                    <span>Curso: ${escapeHTML(program.course || 'Pendiente')}</span>
                    <span>Profesorado: ${escapeHTML(program.teacher || 'Pendiente')}</span>
                </div>
            </header>
            ${options.draft && program.status !== 'reviewed' ? '<div class="notice">Programación pendiente de validación.</div>' : ''}
            ${sections}
        </article>`;
}

export function renderDocument(programs, settings, options = {}) {
    const configuration = {
        pageMap: {},
        markers: false,
        renumber: true,
        draft: false,
        ...options,
    };
    const entries = exportEntries(programs, configuration.renumber);
    const index = entries.map((entry) => `
        <div class="toc-row" style="padding-left:${Math.min(entry.depth, 5) * 10}pt">
            <a href="#${escapeHTML(entry.id)}">${escapeHTML(entry.title)}</a>
            <span class="page">${configuration.pageMap[entry.id] || '—'}</span>
        </div>`).join('\n');

    return `<!doctype html>
        <html lang="es">
            <head>
                <meta charset="utf-8">
                <title>${escapeHTML(settings.title)}</title>
                <style>${stylesheet}\n:root { --primary: ${settings.primaryColor}; }</style>
            </head>
            <body>
                <section class="cover">
                    ${settings.logo ? `<img src="${escapeHTML(settings.logo)}" alt="Logo del centro">` : ''}
                    <p class="overline">${escapeHTML(settings.institution)}</p>
                    <h1>${escapeHTML(settings.title)}</h1>
                    <p style="font-size:19pt">${escapeHTML(settings.cycle)}</p>
                    <p class="year">Curso ${escapeHTML(settings.academicYear)}</p>
                    <p>${escapeHTML(settings.department)}</p>
                    ${configuration.draft ? '<div class="notice">BORRADOR · Contiene apartados pendientes de revisión.</div>' : ''}
                    <div class="modules">${programs.map((program) => `<p>${escapeHTML(program.code)} · ${escapeHTML(program.module)}</p>`).join('')}</div>
                </section>
                <nav class="toc" aria-label="Índice"><h1>Índice</h1>${index}</nav>
                ${programs.map((program, index) => renderProgram(program, index, configuration)).join('\n')}
            </body>
        </html>`;
}

function getPDFOptions(settings) {
    return {
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        margin: {
            top: '18mm',
            right: '16mm',
            bottom: '20mm',
            left: '16mm',
        },
        headerTemplate: '<span></span>',
        footerTemplate: `
            <div style="font-family:Arial;font-size:8px;color:#69758a;width:100%;padding:0 16mm;display:flex;justify-content:space-between">
                <span>${escapeHTML(settings.footer)}</span>
                <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
            </div>`,
    };
}

export async function exportPDF(programs, settings, options, config) {
    let browser;
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'progdidactai-export-'));
    try {
        browser = await puppeteer.launch({
            executablePath: config.chromium,
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            userDataDir: path.join(temporaryDirectory, 'browser-profile'),
        });
        const page = await browser.newPage();
        const pdfOptions = getPDFOptions(settings);
        const entries = exportEntries(programs, options.renumber);
        let pageMap = {};
        let stable = false;

        for (let pass = 0; pass < 5; pass++) {
            await page.setContent(renderDocument(programs, settings, {
                ...options,
                pageMap,
                markers: true,
            }), { waitUntil: 'load' });
            const measuredPDF = await page.pdf(pdfOptions);
            const measuredPath = path.join(temporaryDirectory, 'measurement.pdf');
            await writeFile(measuredPath, measuredPDF);
            const { stdout } = await executeFile(config.pdfToText, ['-layout', measuredPath, '-'], { maxBuffer: 20 * 1024 * 1024 });
            const renderedPages = stdout.split('\f');
            const measuredMap = {};

            for (const entry of entries) {
                const pageIndex = renderedPages.findIndex((content) => content.includes(markerToken(entry.id)));
                if (pageIndex >= 0) {
                    measuredMap[entry.id] = pageIndex + 1;
                }
            }
            if (Object.keys(measuredMap).length !== entries.length) {
                throw new AppError('No se ha podido generar el índice completo. Revisa los títulos del documento.', 500);
            }
            stable = JSON.stringify(measuredMap) === JSON.stringify(pageMap);
            pageMap = measuredMap;
            if (stable) {
                break;
            }
        }
        if (!stable) {
            throw new AppError('La paginación no se ha estabilizado. Revisa la longitud de los títulos del índice.', 500);
        }
        await page.setContent(renderDocument(programs, settings, {
            ...options,
            pageMap,
            markers: false,
        }), { waitUntil: 'load' });
        return await page.pdf(pdfOptions);
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        console.error('Error de exportación:', error.message);
        throw new AppError('No se pudo generar el PDF. Comprueba CHROMIUM_PATH y que Chromium esté instalado.', 500);
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
        await rm(temporaryDirectory, {
            recursive: true,
            force: true,
        });
    }
}
