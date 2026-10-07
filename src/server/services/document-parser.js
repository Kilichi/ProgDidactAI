import { randomUUID } from 'node:crypto';
const uid = () => randomUUID();
const headingPattern = /^\s*(\d+(?:\.\d+){1,6})\.?\s+([A-ZÁÉÍÓÚÜÑ¿][^\n]{2,})$/;
const situationHeading = /^\s*(Situaci[oó]n de aprendizaje\s+(\d+):\s*.*)$/i;
const bulletPattern = /^\s*(?:[•▪·◦‣∙○−–]|-(?!\d)|[a-zñ]\)|[a-zñ]\.\s|o\s)\s*(.*)$/i;
// Qualification rows are frequently spaced like a two-column PDF table, but
// semantically they are one ordered list item (RA code + score).
const gradingPattern = /^\s*[•▪−–*-]?\s*(?:(?:calificación|evaluación|nota|puntuación)\s+)?RA\s*\d+\s*(?:->|→|=>|:|-|–)\s*\d+(?:[.,]\d+)?\s*%?\s*$/i;
const orderedPattern = /^\s*\d+[.)]\s+(.+)$/;
const listItemPattern = (value) => bulletPattern.test(value) || gradingPattern.test(value) || orderedPattern.test(value);
const listItemText = (value) => {
    const bullet = value.match(bulletPattern);
    if (bullet) {
        return bullet[1];
    }
    const ordered = value.match(orderedPattern);
    if (ordered) {
        return ordered[1];
    }
    return value.replace(/^\s*[•▪·◦‣∙○−–*-]?\s*/, '').trim();
};
const bulletOnly = (value) => String(value || '').replace(/^\s*[•▪·◦‣∙○−–*-]\s*/, '').trim() === '';
const strip = (line) => line.text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const fold = (s) => s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function parseBlocks(lines, { structuredTable = false, tables = [] } = {}) {
    const blocks = [];
    const emittedTables = new Set();
    let current;
    let tableHasStarted = false;
    // Poppler can put a vertically centred percentage on its own physical line.
    // Detect the surrounding table before bullet/list classification.
    const percentageLines = new Set();
    const percentage = /(?:^|\s)(\d+(?:[.,]\d+)?\s*%)\s*$/;
    const adjacent = (left, right) => left && right && left.page === right.page &&
        Number(right.id.match(/-l(\d+)$/)?.[1]) - Number(left.id.match(/-l(\d+)$/)?.[1]) <= 2;
    lines.forEach((line, index) => {
        if (!percentage.test(line.text) || !/\s{2,}\d/.test(line.text)) {
            return;
        }
        let start = index;
        let end = index;
        while (start > 0 && adjacent(lines[start - 1], lines[start])) {
            start--;
        }
        while (end + 1 < lines.length && adjacent(lines[end], lines[end + 1])) {
            end++;
        }
        for (let position = start; position <= end; position++) {
            percentageLines.add(position);
        }
    });
    const flush = () => {
        if (!current) {
            return;
        }
        const base = {
            id: uid(),
            type: current.type,
            text: '',
            items: [],
            columns: [],
            rows: [],
            sourceRefs: current.lines.map((l) => l.id),
        };
        if (current.type === 'table') {
            const rows = current.lines.map((l) => l.text
                .trim()
                .split(/\s{2,}|\t+/)
                .map((s) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()));
            const width = Math.max(2, ...rows.map((r) => r.length));
            const bulletOnlyFirstColumn = width === 2 && rows.length > 0 && rows.every((row) => {
                return bulletOnly(row[0]) && Boolean(row[1]);
            });
            if (bulletOnlyFirstColumn) {
                base.type = 'list';
                base.items = rows.map((row) => row[1]);
                blocks.push(base);
                current = undefined;
                return;
            }
            const singleTextColumn = width === 2 && rows.length > 0 && rows.every((row) => !String(row[1] || '').trim());
            if (singleTextColumn) {
                base.type = 'text';
                base.text = rows.map((row) => row[0] || '').join('\n');
                blocks.push(base);
                current = undefined;
                return;
            }
            base.columns = Array.from({ length: width }, (_, i) => `Columna ${i + 1}`);
            base.rows = rows.map((r) => [...r, ...Array(width - r.length).fill('')]);
            if (width === 2) {
                const columnStarts = current.lines.map((line) => {
                    const gap = line.text.match(/\S.*?\s{2,}(\S)/);
                    return gap ? gap.index + gap[0].length - 1 : null;
                }).filter((position) => position !== null);
                const rightColumnStart = columnStarts.length ? Math.min(...columnStarts) : Infinity;
                base.rows = rows.map((row, index) => {
                    if (row.length > 1) {
                        return row;
                    }
                    const textStart = current.lines[index].text.search(/\S/);
                    return textStart >= rightColumnStart ? ['', row[0]] : [row[0], ''];
                });
            }
            // Join wrapped two-column rows while retaining the literal criterion
            // marker and every source reference. Headers remain ordinary rows.
            if (width === 2 && current.lines.some((line) => percentage.test(line.text))) {
                const joined = [];
                let pendingRow = null;
                const finishRow = () => {
                    if (pendingRow) {
                        joined.push(pendingRow);
                    }
                    pendingRow = null;
                };
                base.rows.forEach((row) => {
                    const [text, value] = row;
                    const isPercentage = /^\d+(?:[.,]\d+)?\s*%$/.test(value);
                    const isHeader = value && !isPercentage;
                    const startsCriterion = bulletPattern.test(text);
                    if (isHeader) {
                        finishRow();
                        joined.push(row);
                    } else if (startsCriterion || (isPercentage && pendingRow?.[1])) {
                        finishRow();
                        pendingRow = [text, value];
                    } else {
                        if (!pendingRow) {
                            pendingRow = ['', ''];
                        }
                        if (text) {
                            pendingRow[0] = [pendingRow[0], text].filter(Boolean).join(' ');
                        }
                        if (value) {
                            pendingRow[1] = value;
                        }
                    }
                });
                finishRow();
                base.rows = joined;
            }
        } else if (current.type === 'list') {
            for (const line of current.lines) {
                if (listItemPattern(line.text)) {
                    base.items.push(listItemText(line.text));
                } else if (base.items.length) {
                    base.items[base.items.length - 1] += '\n' + strip(line);
                } else {
                    base.items.push(strip(line));
                }
            }
        } else {
            base.text = current.lines.map(strip).join('\n');
        }
        blocks.push(base);
        current = undefined;
    };
    for (const [lineIndex, line] of lines.entries()) {
        if (line.tableId) {
            const originalTable = tables.find((candidate) => candidate.id === line.tableId);
            if (originalTable) {
                flush();
                tableHasStarted = false;
                if (!emittedTables.has(originalTable.id)) {
                    blocks.push({
                        id: uid(),
                        type: 'table',
                        text: '',
                        items: [],
                        columns: originalTable.columnWidths.map((_, index) => `Columna ${index + 1}`),
                        rows: structuredClone(originalTable.rows),
                        cellSpans: structuredClone(originalTable.cellSpans),
                        columnWidths: [...originalTable.columnWidths],
                        sourceRefs: [...originalTable.sourceRefs],
                    });
                    emittedTables.add(originalTable.id);
                }
                continue;
            }
        }
        const isGradingLine = gradingPattern.test(line.text);
        const table = !isGradingLine && (/\S\s{2,}\S/.test(line.text.trim()) || /\t/.test(line.text));
        let type = table
            ? 'table'
            : listItemPattern(line.text)
                ? 'list'
                : 'text';
        if (percentageLines.has(lineIndex)) {
            type = 'table';
        }
        if (structuredTable && (table || tableHasStarted || percentageLines.has(lineIndex))) {
            type = 'table';
            tableHasStarted = true;
        }
        // Una línea corta puede ser continuación de una celda o elemento anterior.
        if (type === 'text' &&
            current?.type === 'table' &&
            /^\s{12,}\S/.test(line.text)) {
            type = 'table';
        }
        if (type === 'text' &&
            current?.type === 'list' &&
            /^\s{3,}\S/.test(line.text)) {
            type = 'list';
        }
        // A learning-outcome heading begins a new physical table. Its
        // criteria heading belongs to that same table and must stay inside it.
        const startsLearningTable = /^\s*Resultado de aprendizaje\b/i.test(line.text) && table;
        const previousLine = lines[lineIndex - 1];
        const separatedOnPage = previousLine?.page === line.page &&
            Number(line.id.match(/-l(\d+)$/)?.[1]) - Number(previousLine.id.match(/-l(\d+)$/)?.[1]) > 2;
        if (current?.type === 'table' && type === 'table' &&
            (startsLearningTable || (!structuredTable && separatedOnPage))) {
            flush();
        }
        if (current?.type !== type) {
            flush();
        }
        if (!current) {
            current = {
                type,
                lines: [],
            };
        }
        current.lines.push(line);
    }
    flush();
    return blocks;
}

// Repairs documents imported by older versions where a bullet column was
// mistaken for a table. It is safe to run on every read and keeps revisions
// compatible because ids and source references stay unchanged.
export function repairMisclassifiedLists(program) {
    return {
        ...program,
        sections: program.sections.map((section) => ({
            ...section,
            blocks: section.blocks.map((block) => {
                const normalized = { ...block };
                if (normalized.type !== 'table' || normalized.columns.length !== 2 || !normalized.rows.length || normalized.cellSpans?.length) {
                    return normalized;
                }
                const list = normalized.rows.every((row) => {
                    return bulletOnly(row[0]) && Boolean(String(row[1] || '').trim());
                });
                if (list) {
                    return {
                        ...normalized,
                        type: 'list',
                        text: '',
                        items: normalized.rows.map((row) => String(row[1]).trim()),
                        columns: [],
                        rows: [],
                        cellSpans: undefined,
                        columnWidths: undefined,
                    };
                }
                const textOnly = normalized.rows.every((row) => !String(row[1] || '').trim());
                return textOnly ? {
                    ...normalized,
                    type: 'text',
                    text: normalized.rows.map((row) => String(row[0] || '').trim()).join('\n'),
                    items: [],
                    columns: [],
                    rows: [],
                    cellSpans: undefined,
                    columnWidths: undefined,
                } : normalized;
            }),
        })),
    };
}
export function parseSource(source) {
    const programs = [];
    let program;
    let section;
    let pending = [];
    let situationParentCode = '';
    function newProgram(module, prefix = '') {
        const now = new Date().toISOString();
        program = {
            id: uid(),
            revision: 1,
            module,
            code: '',
            course: '',
            teacher: '',
            status: 'draft',
            sections: [],
            sourceIds: [source.id],
            warnings: [...source.warnings],
            createdAt: now,
            updatedAt: now,
            prefix,
        };
        programs.push(program);
    }
    function finishSection() {
        if (!section) {
            return;
        }
        const title = fold(section.title);
        const structuredTable = /identificacion|competencias y objetivos|resultados de aprendizaje y criterios|estrategias metodologicas|ponderaciones|situacion.*aprendizaje/.test(title);
        section.blocks = parseBlocks(pending, {
            structuredTable,
            tables: source.pages.flatMap((page) => page.tables || []),
        });
        pending = [];
        if (section.blocks.some((b) => b.type === 'table' && !b.cellSpans)) {
            section.warnings.push('Tabla reconstruida desde el documento: revisa las celdas y une las filas que sean continuaciones.');
        }
        program.sections.push(section);
        section = undefined;
    }
    function startSection(code, title, line, refs = []) {
        section = {
            id: uid(),
            code,
            originalCode: code,
            title,
            blocks: [],
            sourceId: source.id,
            pageStart: line.page,
            pageEnd: line.page,
            warnings: [],
            reviewed: false,
            headingRefs: refs,
        };
        if (program.prefix &&
            code &&
            !code.startsWith(program.prefix + '.') &&
            code !== program.prefix) {
            section.warnings.push(`Numeración ${code} incoherente con el módulo ${program.prefix}. Se mantiene aquí por su posición; revisa su asignación.`);
        }
    }
    const lines = source.pages.flatMap((p) => p.lines.filter((l) => !l.footer));
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const match = !line.tableId && line.text.match(headingPattern);
        const situation = !line.tableId && line.text.match(situationHeading);
        if (situation && program) {
            finishSection();
            let title = situation[1].trim();
            const refs = [line.id];
            if (/(?:con|de|y|del)\s*$/i.test(title) && lines[index + 1] && !headingPattern.test(lines[index + 1].text) && !/\S\s{2,}\S/.test(lines[index + 1].text.trim())) {
                const continuation = lines[++index];
                title += ' ' + continuation.text.trim();
                refs.push(continuation.id);
            }
            startSection(`${situationParentCode || program.prefix || '1'}.${situation[2]}`, title, line, refs);
            section.originalCode = '';
            section.pageEnd = lines[index].page;
            continue;
        }
        if (match) {
            const [, code, firstTitle] = match;
            if (fold(firstTitle).includes('situaciones de aprendizaje')) {
                situationParentCode = code;
            }
            finishSection();
            if (code.split('.').length === 2) {
                newProgram(firstTitle.trim(), code);
            }
            if (!program) {
                newProgram('Contenido sin módulo identificado');
            }
            let title = firstTitle.trim();
            const refs = [line.id];
            // Epígrafes largos que continúan en la siguiente línea.
            if (/(?:de|los|las|y|del)\s*$/i.test(title) &&
                lines[index + 1] &&
                !headingPattern.test(lines[index + 1].text) &&
                !/\S\s{2,}\S/.test(lines[index + 1].text.trim())) {
                const next = lines[++index];
                title += ' ' + next.text.trim();
                refs.push(next.id);
            }
            startSection(code, title, line, refs);
        } else {
            if (!program) {
                newProgram('Fragmento inicial · pendiente de asignación');
                program.warnings.push('El archivo comienza con contenido de un módulo anterior. Asigna este fragmento al módulo correspondiente.');
            }
            if (!section) {
                startSection('', 'Contenido sin epígrafe', line);
            }
            pending.push(line);
            section.pageEnd = line.page;
        }
    }
    finishSection();
    for (const p of programs) {
        const identity = p.sections.find((s) => fold(s.title).includes('identificacion'));
        const raw = identity
            ? source.pages
                .flatMap((pg) => pg.lines)
                .filter((l) => identity.blocks.some((b) => b.sourceRefs.includes(l.id)))
                .map((l) => l.text)
                .join('\n')
            : '';
        p.code = raw.match(/C[oó]digo\s+(\d{4})/i)?.[1] || '';
        p.course = raw.match(/Curso\s+(\S+)/i)?.[1] || '';
        p.teacher = raw.match(/Titular\s+([^\n]+)/i)?.[1]?.trim() || '';
        if (!identity && !p.module.startsWith('Fragmento')) {
            p.warnings.push('No se ha detectado la identificación del módulo. Completa los datos manualmente.');
        }
        if (p === programs.at(-1) && p.sections.length < 4) {
            p.warnings.push('Este módulo parece incompleto: solo se han encontrado sus apartados iniciales.');
        }
        // Separar identidad del código del epígrafe permite corregir numeraciones sin perder el origen.
        delete p.prefix;
    }
    return programs;
}
export function sourceCoverage(programs, source) {
    const assigned = new Set(programs.flatMap((p) => p.sections.flatMap((s) => [
        ...(s.headingRefs || []),
        ...s.blocks.flatMap((b) => b.sourceRefs),
    ])));
    const missing = source.pages
        .flatMap((p) => p.lines)
        .filter((l) => !l.footer && !assigned.has(l.id));
    return {
        total: source.pages.flatMap((p) => p.lines).filter((l) => !l.footer).length,
        assigned: assigned.size,
        missing,
    };
}
