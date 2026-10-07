import { z } from 'zod';
const str = z.string().max(200000);
export const blockSchema = z
    .object({
        id: z.string().min(1).max(100),
        type: z.enum(['text', 'list', 'table']),
        text: str.default(''),
        items: z.array(str).max(5000).default([]),
        columns: z.array(z.string().max(1000)).max(40).default([]),
        rows: z.array(z.array(str).max(40)).max(5000).default([]),
        cellSpans: z.array(z.object({
            row: z.number().int().nonnegative(),
            column: z.number().int().nonnegative(),
            rowSpan: z.number().int().positive(),
            colSpan: z.number().int().positive(),
            background: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
            bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
        })).max(200000).optional(),
        columnWidths: z.array(z.number().positive()).max(40).optional(),
        pageParts: z.array(z.object({
            page: z.number().int().positive(),
            text: str,
            items: z.array(str).max(5000),
            itemIndexes: z.array(z.number().int().nonnegative()).max(5000),
        })).max(400).optional(),
        sourceRefs: z.array(z.string().max(150)).max(20000).default([]),
    })
    .superRefine((b, ctx) => {
        if (b.type === 'table' &&
        (!b.columns.length || b.rows.some((r) => r.length !== b.columns.length))) {
            ctx.addIssue({
                code: 'custom',
                message: 'Las filas deben tener tantas celdas como columnas.',
            });
        }
        if (b.columnWidths && (b.columnWidths.length !== b.columns.length ||
            Math.abs(b.columnWidths.reduce((sum, width) => sum + width, 0) - 100) > 0.1)) {
            ctx.addIssue({
                code: 'custom',
                message: 'Los anchos deben corresponder a las columnas de la tabla.',
            });
        }
        if (b.cellSpans) {
            const occupied = new Set();
            for (const cell of b.cellSpans) {
                if (cell.row + cell.rowSpan > b.rows.length || cell.column + cell.colSpan > b.columns.length) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'Una celda combinada queda fuera de la tabla.',
                    });
                    continue;
                }
                for (let row = cell.row; row < cell.row + cell.rowSpan; row++) {
                    for (let column = cell.column; column < cell.column + cell.colSpan; column++) {
                        const key = `${row}:${column}`;
                        if (occupied.has(key) || ((row !== cell.row || column !== cell.column) && b.rows[row][column])) {
                            ctx.addIssue({
                                code: 'custom',
                                message: 'Las celdas combinadas se solapan o cubren contenido.',
                            });
                        }
                        occupied.add(key);
                    }
                }
            }
            if (occupied.size !== b.rows.length * b.columns.length) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'La geometría debe cubrir todas las celdas de la tabla.',
                });
            }
        }
    });
export const sectionSchema = z.object({
    id: z.string().min(1).max(100),
    code: z.string().max(100),
    originalCode: z.string().max(100).default(''),
    title: z.string().max(500).default(''),
    blocks: z.array(blockSchema).max(1000),
    sourceId: z.string().max(100),
    pageStart: z.number().int().nonnegative(),
    pageEnd: z.number().int().nonnegative(),
    warnings: z.array(z.string().max(2000)).max(100).default([]),
    reviewed: z.boolean().default(false),
    reviewedPages: z.array(z.number().int().positive()).max(400).optional(),
    headingRefs: z.array(z.string().max(150)).max(20).default([]),
});
export const programSchema = z.object({
    module: z.string().min(1).max(300),
    code: z.string().max(100),
    course: z.string().max(100),
    teacher: z.string().max(300),
    status: z.enum(['draft', 'reviewed']),
    sections: z.array(sectionSchema).max(2000),
    sourceIds: z.array(z.string().max(100)).max(100),
    warnings: z.array(z.string().max(2000)).max(100),
});
export const settingsSchema = z.object({
    institution: z.string().min(1).max(300),
    department: z.string().max(300),
    cycle: z.string().min(1).max(300),
    academicYear: z.string().max(50),
    title: z.string().min(1).max(300),
    primaryColor: z.string().regex(/^#[\da-fA-F]{6}$/),
    footer: z.string().max(500),
    logo: z
        .string()
        .max(300000)
        .refine((v) => !v || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v), 'Solo se permiten imágenes PNG o JPEG.'),
});
export class AppError extends Error {
    constructor(message, status = 400, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}
export function validateProgram(value) {
    const p = programSchema.parse(value);
    const ids = p.sections.map((s) => s.id);
    const blocks = p.sections.flatMap((s) => s.blocks.map((b) => b.id));
    if (new Set(ids).size !== ids.length ||
        new Set(blocks).size !== blocks.length) {
        throw new AppError('Los identificadores de secciones y bloques deben ser únicos.');
    }
    if (p.status === 'reviewed' &&
        (!p.sections.length || p.sections.some((s) => !s.reviewed))) {
        throw new AppError('Revisa todas las secciones antes de marcar el módulo como revisado.');
    }
    return p;
}
