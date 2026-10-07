export function editFieldId(location) {
    if (location.field === 'cell') {
        return `edit-${location.blockId}-${location.row}-${location.column}`;
    }
    if (location.field === 'item' || location.field === 'column') {
        return `edit-${location.blockId}-${location.field}-${location.index}`;
    }
    if (location.field === 'code') {
        return `edit-${location.sectionId}-code`;
    }
    if (location.field === 'title') {
        return `edit-${location.sectionId}-title`;
    }
    return `edit-${location.blockId}-text`;
}

export function editLocationURL(location) {
    const query = new URLSearchParams();
    for (const key of ['sectionId', 'blockId', 'field', 'row', 'column', 'page']) {
        if (location[key] !== undefined) {
            query.set(key, String(location[key]));
        }
    }
    return location.fileId ? `/archivos/${encodeURIComponent(location.fileId)}?${query}` : `/programaciones/${encodeURIComponent(location.programId)}?${query}`;
}
