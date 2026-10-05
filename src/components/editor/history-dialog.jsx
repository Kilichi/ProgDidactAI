'use client';
import { useEffect, useRef, useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { apiRequest, formatDate, getBlockText } from '@/lib/api';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice, LoadingState } from '@/components/ui/feedback';
export function HistoryDialog({ program, onClose, onRestore }) {
    const { data: versions, loading, error } = useResource(`/api/programs/${program.id}/history`);
    const [snapshot, setSnapshot] = useState(null);
    const [actionError, setActionError] = useState('');
    const [busy, setBusy] = useState(false);
    const dialog = useRef(null);
    useEffect(() => {
        dialog.current?.showModal();
    }, []);
    async function previewVersion(revision) {
        setActionError('');
        try {
            setSnapshot(await apiRequest(`/api/programs/${program.id}/history/${revision}`));
        } catch (failure) {
            setActionError(failure.message);
        }
    }
    async function restoreVersion(revision) {
        if (!window.confirm(`¿Recuperar la versión ${revision}? Se creará una nueva versión y se conservará el histórico.`)) {
            return;
        }
        setBusy(true);
        setActionError('');
        try {
            const restored = await apiRequest(`/api/programs/${program.id}/restore`, {
                method: 'POST',
                body: {
                    revision: program.revision,
                    targetRevision: revision,
                },
            });
            onRestore(restored);
        } catch (failure) {
            setActionError(failure.message);
        } finally {
            setBusy(false);
        }
    }
    return <dialog
        ref={dialog}
        className="source-dialog"
        onCancel={onClose}
    >
        <header>
            <div>
                <p className="eyebrow">
                    CAMBIOS CON MEMORIA
                </p>
                <h2>
                    Histórico de versiones
                </h2>
                <p>
                    {program.module}
                </p>
            </div>
            <button
                className="icon-button"
                aria-label="Cerrar histórico"
                onClick={onClose}
            >
                <Icon name="close" />
            </button>
        </header>
        <ErrorNotice message={error || actionError} />
        {loading ? <LoadingState /> : <div className="history-list">
            {versions?.map((version) => <article
                className="history-row"
                key={version.revision}
            >
                <span className="stat-icon blue">
                    <Icon
                        name="clock"
                        size={18}
                    />
                </span>
                <div>
                    <strong>
                        Versión
                        {version.revision}
                        {' '}
                        {version.revision === program.revision && <span className="badge badge-green">
                            Actual
                        </span>}
                    </strong>
                    <p>
                        {formatDate(version.updatedAt)}
                        {' '}
                        ·
                        {' '}
                        {version.sectionCount}
                        {' '}
                        secciones
                    </p>
                </div>
                <button
                    className="button button-secondary button-small"
                    onClick={() => previewVersion(version.revision)}
                >
                    Consultar
                </button>
                {version.revision !== program.revision && <button
                    className="button button-secondary button-small"
                    disabled={busy}
                    onClick={() => restoreVersion(version.revision)}
                >
                    Recuperar
                </button>}
            </article>)}
        </div>}
        {snapshot && <section className="snapshot-preview">
            <h3>
                Contenido de la versión
                {snapshot.revision}
            </h3>
            {snapshot.sections.map((section) => <details key={section.id}>
                <summary>
                    {section.code}
                    {' '}
                    {section.title}
                </summary>
                {section.blocks.map((block) => <pre key={block.id}>
                    {getBlockText(block)}
                </pre>)}
            </details>)}
        </section>}
    </dialog>;
}
