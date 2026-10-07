export async function apiRequest(url, options = {}) {
    const { body, ...rest } = options;
    const isForm = body instanceof FormData;
    const response = await fetch(url, {
        ...rest,
        headers: {
            ...(!isForm ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
        },
        ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw Object.assign(new Error(payload.error || `La operación ha fallado (${response.status}).`), { details: payload.details });
    }
    return response.json();
}
export async function downloadExport(format, options) {
    const response = await fetch(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw Object.assign(new Error(payload.error || 'No se pudo exportar el documento.'), { details: payload.details });
    }
    return response;
}
export function saveDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function createEmptyBlock(type = 'text') {
    return {
        id: crypto.randomUUID(),
        type,
        text: '',
        items: type === 'list' ? [''] : [],
        columns: type === 'table' ? ['Descripción', 'Contenido'] : [],
        rows: type === 'table' ? [['', '']] : [],
        sourceRefs: [],
    };
}
export function getBlockText(block) {
    if (block.type === 'list') {
        return block.items.join('\n');
    }
    if (block.type === 'table') {
        return [block.columns.join(' | '), ...block.rows.map((row) => row.join(' | '))].join('\n');
    }
    return block.text;
}
export function formatDate(value) {
    return new Intl.DateTimeFormat('es', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}
