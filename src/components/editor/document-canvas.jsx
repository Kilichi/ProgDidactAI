'use client';
import { useLayoutEffect, useRef } from 'react';
import { renderPageContent } from '@/lib/document-layout';

export function DocumentCanvas({ projections, fallback, onEdit, onTableAction }) {
    const canvas = useRef(null);
    const composing = useRef(false);
    const html = renderPageContent(projections, {
        editable: true,
        fallback,
    });
    useLayoutEffect(() => {
        const element = canvas.current;
        // Never replace a live selection while React receives the edited text.
        if (!element.contains(document.activeElement) && element.innerHTML !== html) {
            element.innerHTML = html;
        }
    }, [html]);
    function commit(target) {
        if (target.closest('[data-table-action]')) {
            return;
        }
        const field = target.closest('[data-location]');
        if (field && canvas.current.contains(field)) {
            onEdit(JSON.parse(field.dataset.location), field.innerText.replace(/\r\n/g, '\n'));
        }
    }
    function tableAction(event) {
        const action = event.target.closest('[data-table-action]');
        if (!action || !canvas.current.contains(action)) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (canvas.current.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        onTableAction?.(JSON.parse(action.dataset.location), action.dataset.tableAction);
    }
    return <div
        ref={canvas}
        className="document-content"
        onInput={(event) => {
            if (!composing.current) {
                commit(event.target);
            }
        }}
        onCompositionStart={() => {
            composing.current = true;
        }}
        onCompositionEnd={(event) => {
            composing.current = false; commit(event.target);
        }}
        onBlur={(event) => commit(event.target)}
        onMouseDown={tableAction}
        onClick={(event) => {
            if (event.detail === 0) {
                tableAction(event);
            }
        }}
    />;
}
