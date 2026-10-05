import { randomUUID } from 'node:crypto';
const uid = () => randomUUID();
const headingPattern = /^\s*(\d+(?:\.\d+){1,6})\.?\s+([A-ZÁÉÍÓÚÜÑ¿][^\n]{2,})$/;
const situationHeading = /^\s*(Situaci[oó]n de aprendizaje\s+(\d+):\s*.*)$/i;
const bulletPattern = /^\s*(?:[•▪−–]|-(?!\d)|[a-zñ]\)|[a-zñ]\.\s|o\s)\s*(.*)$/i;
const strip = (line) => line.text.trim();
const fold = (s) => s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function parseBlocks(lines, { structuredTable = false } = {}) {
    const blocks = [];
    let current;
    let tableHasStarted = false;
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
                .map((s) => s.trim()));
            const width = Math.max(2, ...rows.map((r) => r.length));
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
        } else if (current.type === 'list') {
            for (const line of current.lines) {
                const m = line.text.match(bulletPattern);
                if (m) {
                    base.items.push(m[1]);
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
    for (const line of lines) {
        const table = /\S\s{2,}\S/.test(line.text.trim()) || /\t/.test(line.text);
        let type = table
            ? 'table'
            : bulletPattern.test(line.text)
                ? 'list'
                : 'text';
        if (structuredTable && (table || tableHasStarted)) {
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
        section.blocks = parseBlocks(pending, { structuredTable });
        pending = [];
        if (section.blocks.some((b) => b.type === 'table')) {
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
        const match = line.text.match(headingPattern);
        const situation = line.text.match(situationHeading);
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
