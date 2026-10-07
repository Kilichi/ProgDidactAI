export const referencePage = (reference) => Number(reference?.match(/^p(\d+)-/)?.[1]);

export function sectionPages(section) {
    const references = [...(section.headingRefs || []), ...section.blocks.flatMap((block) => block.sourceRefs)];
    const pages = [...new Set(references.map(referencePage).filter(Boolean))];
    return pages.length ? pages : Array.from({ length: section.pageEnd - section.pageStart + 1 }, (_, index) => section.pageStart + index);
}

export function pageIsReviewed(programs, sourceId, page) {
    const sections = programs.flatMap((program) => program.sections).filter((section) => section.sourceId === sourceId && sectionPages(section).includes(page));
    return sections.every((section) => section.reviewed || section.reviewedPages?.includes(page));
}

// Keep a projection of each block on the selected page. The merge replaces
// only that page's text; edits on preceding and following pages stay intact.
export function projectBlock(block, page) {
    const pages = block.sourceRefs.map(referencePage);
    if (!pages.includes(page)) {
        return null;
    }
    if (block.type === 'table' || new Set(pages).size === 1) {
        return pages[0] === page ? {
            block,
            merge: (updated) => updated,
        } : null;
    }
    let parts = block.pageParts;
    if (!parts) {
        const groups = block.type === 'text' ? [block.text.split('\n')] : block.items.map((item) => item.split('\n'));
        if (groups.flat().length !== pages.length) {
            return pages[0] === page ? {
                block,
                merge: (updated) => updated,
            } : null;
        }
        parts = [...new Set(pages)].map((number) => {
            let offset = 0;
            const slices = groups.flatMap((lines, group) => {
                const selected = lines.filter((_, index) => pages[offset + index] === number);
                offset += lines.length;
                return selected.length ? [{
                    group,
                    text: selected.join('\n'),
                }] : [];
            });
            return {
                page: number,
                text: block.type === 'text' ? slices[0].text : '',
                items: block.type === 'list' ? slices.map((slice) => slice.text) : [],
                itemIndexes: block.type === 'list' ? slices.map((slice) => slice.group) : [],
            };
        });
    }
    const part = parts.find((candidate) => candidate.page === page);
    if (!part) {
        return null;
    }
    return {
        block: {
            ...block,
            text: part.text,
            items: part.items,
            sourceRefs: block.sourceRefs.filter((_, index) => pages[index] === page),
        },
        merge(updated) {
            const pageParts = parts.map((candidate) => candidate.page === page ? {
                ...candidate,
                text: updated.text,
                items: updated.items,
            } : candidate);
            const items = [];
            if (block.type === 'list') {
                for (const candidate of pageParts) {
                    candidate.items.forEach((item, index) => {
                        const group = candidate.itemIndexes[index];
                        items[group] = [items[group], item].filter((value) => value !== undefined).join('\n');
                    });
                }
            }
            return {
                ...block,
                pageParts,
                text: block.type === 'text' ? pageParts.map((candidate) => candidate.text).join('\n') : '',
                items,
            };
        },
    };
}

export function projectPage(programs, sourceId, page) {
    return programs.flatMap((program) => program.sections.filter((section) => section.sourceId === sourceId && sectionPages(section).includes(page)).map((section) => {
        const projections = section.blocks.map((block) => projectBlock(block, page)).filter(Boolean);
        const headingOnPage = section.headingRefs.some((reference) => referencePage(reference) === page);
        return {
            programId: program.id,
            section,
            projections,
            headingOnPage,
            display: {
                ...section,
                blocks: projections.map((projection) => projection.block),
                pageStart: page,
                pageEnd: page,
            },
        };
    }));
}
