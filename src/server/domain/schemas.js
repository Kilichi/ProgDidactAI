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
    });
export const sectionSchema = z.object({
    id: z.string().min(1).max(100),
    code: z.string().max(100),
    originalCode: z.string().max(100).default(''),
    title: z.string().min(1).max(500),
    blocks: z.array(blockSchema).max(1000),
    sourceId: z.string().max(100),
    pageStart: z.number().int().nonnegative(),
    pageEnd: z.number().int().nonnegative(),
    warnings: z.array(z.string().max(2000)).max(100).default([]),
    reviewed: z.boolean().default(false),
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
    constructor(message, status = 400) {
        super(message);
        this.status = status;
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
