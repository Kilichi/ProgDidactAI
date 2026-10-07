import { ZodError } from 'zod';
import { AppError } from '../domain/schemas.js';
export function jsonResponse(value, status = 200) {
    return Response.json(value, {
        status,
        headers: { 'Cache-Control': 'no-store' },
    });
}
export async function readRequestBody(request, limit = 12 * 1024 * 1024) {
    if (Number(request.headers.get('content-length')) > limit) {
        throw new AppError('El archivo o los datos superan el límite permitido.', 413);
    }
    if (!request.body) {
        return Buffer.alloc(0);
    }
    const reader = request.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        size += value.byteLength;
        if (size > limit) {
            await reader.cancel();
            throw new AppError('El archivo o los datos superan el límite permitido.', 413);
        }
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
}
export async function readJson(request) {
    try {
        return JSON.parse((await readRequestBody(request)).toString('utf8'));
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }
        throw new AppError('El cuerpo de la petición debe contener JSON válido.');
    }
}
export function handleRoute(handler) {
    return async function routeHandler(request, routeContext) {
        try {
            if (!['GET', 'HEAD'].includes(request.method)) {
                const origin = request.headers.get('origin');
                const expectedHost = request.headers.get('host') || new URL(request.url).host;
                if (origin) {
                    let originUrl;
                    try {
                        originUrl = new URL(origin);
                    } catch {
                        throw new AppError('Origen de la petición no permitido.', 403);
                    }
                    if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.host !== expectedHost) {
                        throw new AppError('Origen de la petición no permitido.', 403);
                    }
                }
            }
            const params = routeContext?.params ? await routeContext.params : {};
            return await handler(request, params);
        } catch (error) {
            if (error instanceof ZodError) {
                return jsonResponse({
                    error: 'Datos inválidos: ' + error.issues.slice(0, 3)
                        .map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
                }, 400);
            }
            if (error instanceof AppError) {
                return jsonResponse({
                    error: error.message,
                    ...(error.details ? { details: error.details } : {}),
                }, error.status);
            }
            console.error('Error del servidor:', error.message);
            return jsonResponse({ error: 'No se pudo completar la operación. Inténtalo de nuevo; si continúa, contacta con la persona responsable de la aplicación.' }, 500);
        }
    };
}
