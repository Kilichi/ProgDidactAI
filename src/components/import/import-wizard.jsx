'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useResource } from '@/hooks/use-resource';
import { apiRequest } from '@/lib/api';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice } from '@/components/ui/feedback';
export function ImportWizard() {
    const { data: health, error: healthError } = useResource('/api/health');
    const [files, setFiles] = useState([]);
    const [provider, setProvider] = useState('local');
    const [jobs, setJobs] = useState([]);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const fileInput = useRef(null);
    const completed = jobs.length > 0 && jobs.every((job) => ['done', 'error'].includes(job.status));
    const active = jobs.some((job) => !['done', 'error'].includes(job.status));
    const successful = jobs.filter((job) => job.status === 'done');
    useEffect(() => {
        if (health?.providers.default && health.providers[health.providers.default]) {
            setProvider(health.providers.default);
        }
    }, [health]);
    useEffect(() => {
        if (!active) {
            return;
        }
        let disposed = false;
        const timer = setInterval(async () => {
            try {
                const updates = await Promise.all(jobs.map((job) => ['done', 'error'].includes(job.status) ? job : apiRequest(`/api/jobs/${job.id}`)));
                if (!disposed) {
                    setJobs(updates);
                }
            } catch (failure) {
                if (!disposed) {
                    setError(failure.message);
                    setJobs((previous) => previous.map((job) => ['done', 'error'].includes(job.status) ? job : {
                        ...job,
                        status: 'error',
                        message: failure.message,
                    }));
                }
            }
        }, 1500);
        return () => {
            disposed = true;
            clearInterval(timer);
        };
    }, [active, jobs]);
    function addFiles(incoming) {
        setError('');
        const selected = Array.from(incoming);
        const invalid = selected.find((file) => !/\.(pdf|docx|doc)$/i.test(file.name) || file.size > 15 * 1024 * 1024);
        if (invalid) {
            setError(`«${invalid.name}»: usa PDF, DOCX o DOC de hasta 15 MB.`);
            return;
        }
        setFiles((previous) => [...previous, ...selected.filter((file) => !previous.some((existing) => existing.name === file.name && existing.size === file.size))].slice(0, 20));
    }
    async function startImport(example = false) {
        setUploading(true);
        setError('');
        setJobs([]);
        try {
            if (example) {
                setJobs([await apiRequest('/api/import/example', {
                    method: 'POST',
                    body: { provider },
                })]);
            } else {
                for (const file of files) {
                    const body = new FormData();
                    body.append('file', file);
                    body.append('provider', provider);
                    const result = await apiRequest('/api/import', {
                        method: 'POST',
                        body,
                    });
                    setJobs((previous) => [...previous, result]);
                }
            }
        } catch (failure) {
            setError(failure.message);
        } finally {
            setUploading(false);
        }
    }
    return (
        <>
            <section className="page-heading">
                <div>
                    <p className="eyebrow">
                        DALE UNA NUEVA VIDA A TUS DOCUMENTOS
                    </p>
                    <h1>
                        Importar programaciones
                        <span className="heading-dot">
                            .
                        </span>
                    </h1>
                    <p>
                        Conserva el contenido. Actualiza lo que necesita cambiar.
                    </p>
                </div>
            </section>
            <ol className="wizard-steps">
                {[['upload', 'Subir documentos'], ['sparkles', 'Organizar contenido'], ['check', 'Revisar y guardar']].map(([icon, label], index) => <li
                    key={label}
                    className={(jobs.length ? completed ? 2 : 1 : 0) >= index ? 'current' : ''}
                >
                    <span>
                        <Icon
                            name={icon}
                            size={18}
                        />
                    </span>
                    <div>
                        <small>
                            PASO
                            {index + 1}
                        </small>
                        <strong>
                            {label}
                        </strong>
                    </div>
                </li>)}
            </ol>
            <div className="import-grid">
                <section className="card import-card">
                    <div className="panel-heading">
                        <div>
                            <h2>
                                Tus documentos de partida
                            </h2>
                            <p>
                                Puedes importar varios módulos a la vez.
                            </p>
                        </div>
                        <span className="badge badge-neutral">
                            PDF / Word
                        </span>
                    </div>
                    <ErrorNotice message={error || healthError} />
                    <div
                        className={`dropzone ${dragging ? 'dragging' : ''}`}
                        onDragOver={(event) => {
                            event.preventDefault();
                            setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(event) => {
                            event.preventDefault();
                            setDragging(false);
                            if (!active && !uploading) {
                                addFiles(event.dataTransfer.files);
                            }
                        }}
                    >
                        <span className="upload-circle">
                            <Icon
                                name="upload"
                                size={28}
                            />
                        </span>
                        <h3>
                            Arrastra tus documentos aquí
                        </h3>
                        <p>
                            o selecciónalos desde tu equipo
                        </p>
                        <button
                            className="button button-secondary"
                            disabled={active || uploading}
                            onClick={() => fileInput.current?.click()}
                        >
                            Seleccionar archivos
                        </button>
                        <small>
                            Hasta 20 archivos · 15 MB por archivo · 400 páginas
                        </small>
                        <input
                            ref={fileInput}
                            type="file"
                            accept=".pdf,.docx,.doc"
                            multiple
                            hidden
                            onChange={(event) => {
                                addFiles(event.target.files);
                                event.target.value = '';
                            }}
                        />
                    </div>
                    {!!files.length && <ul className="uploaded-files">
                        {files.map((file, index) => <li key={`${file.name}-${file.size}`}>
                            <Icon name="file" />
                            <div>
                                <strong>
                                    {file.name}
                                </strong>
                                <small>
                                    {(file.size / 1024 / 1024).toFixed(2)}
                                    {' '}
                                    MB
                                </small>
                            </div>
                            <button
                                className="icon-button"
                                aria-label={`Quitar ${file.name}`}
                                disabled={active || uploading}
                                onClick={() => setFiles((previous) => previous.filter((_, position) => position !== index))}
                            >
                                <Icon
                                    name="close"
                                    size={16}
                                />
                            </button>
                        </li>)}
                    </ul>}
                    <div className="provider-selector">
                        <label htmlFor="provider">
                            Cómo organizar el contenido
                        </label>
                        <select
                            id="provider"
                            value={provider}
                            onChange={(event) => setProvider(event.target.value)}
                            disabled={active || uploading}
                        >
                            <option value="local">
                                Extracción local · sin clave
                            </option>
                            <option
                                value="gemini"
                                disabled={!health?.providers.gemini}
                            >
                                Gemini
                                {health?.providers.gemini ? '' : '· pendiente de configurar'}
                            </option>
                            <option
                                value="groq"
                                disabled={!health?.providers.groq}
                            >
                                Groq
                                {health?.providers.groq ? '' : '· pendiente de configurar'}
                            </option>
                        </select>
                        <p>
                            {provider === 'local' ? 'Organiza el texto por jerarquía y posición. Las tablas y los apartados dudosos quedan marcados para revisión.' : 'El contenido se enviará al proveedor elegido. La estructura propuesta se comprobará para evitar pérdidas de contenido.'}
                        </p>
                    </div>
                    <div className="import-actions">
                        <button
                            className="button button-primary"
                            disabled={!files.length || active || uploading}
                            onClick={() => startImport()}
                        >
                            {uploading ? <span className="spinner small" /> : <Icon
                                name="sparkles"
                                size={17}
                            />}
                            {uploading ? 'Subiendo…' : 'Organizar documentos'}
                        </button>
                        <button
                            className="text-button"
                            disabled={active || uploading}
                            onClick={() => startImport(true)}
                        >
                            Probar con el PDF de ejemplo
                            <Icon
                                name="arrow"
                                size={15}
                            />
                        </button>
                    </div>
                </section>
                <aside className="import-aside">
                    <div className="card info-card">
                        <span className="stat-icon blue">
                            <Icon name="sparkles" />
                        </span>
                        <h3>
                            De documentos a datos editables
                        </h3>
                        <p>
                            Detectamos apartados y los convertimos en campos, listas y tablas para que puedas actualizarlos.
                        </p>
                        <ul className="check-list">
                            <li>
                                <Icon
                                    name="check"
                                    size={16}
                                />
                                Se conserva el archivo original
                            </li>
                            <li>
                                <Icon
                                    name="check"
                                    size={16}
                                />
                                Cada bloque mantiene su procedencia
                            </li>
                            <li>
                                <Icon
                                    name="check"
                                    size={16}
                                />
                                Tú confirmas la estructura final
                            </li>
                            <li>
                                <Icon
                                    name="check"
                                    size={16}
                                />
                                Un archivo puede contener varios módulos
                            </li>
                        </ul>
                    </div>
                    <div className="tip-card">
                        <Icon
                            name="warning"
                            size={19}
                        />
                        <h3>
                            ¿Un documento incompleto?
                        </h3>
                        <p>
                            Los fragmentos sin módulo y las numeraciones dudosas quedan señalados. Puedes corregirlos y reasignarlos desde el editor.
                        </p>
                    </div>
                </aside>
            </div>
            {!!jobs.length && <section
                className="card jobs-panel"
                aria-live="polite"
            >
                <div className="panel-heading">
                    <div>
                        <h2>
                            {completed ? 'Documentos procesados' : 'Estamos organizando tus documentos'}
                        </h2>
                        <p>
                            Los originales permanecen intactos.
                        </p>
                    </div>
                    {active && <span className="spinner" />}
                </div>
                {jobs.map((job) => <article
                    className="job-row"
                    key={job.id}
                >
                    <Icon name={job.status === 'done' ? 'check' : job.status === 'error' ? 'warning' : 'file'} />
                    <div>
                        <strong>
                            {job.filename}
                        </strong>
                        <p>
                            {job.message}
                        </p>
                        <progress
                            value={job.progress}
                            max="100"
                            aria-label={`Progreso de ${job.filename}`}
                        />
                        {job.coverage && <small>
                            {job.coverage.total}
                            {' '}
                            líneas de contenido conservadas ·
                            {' '}
                            {job.coverage.missing}
                            {' '}
                            omitidas
                        </small>}
                        {job.status === 'done' && <div className="job-links">
                            {job.programIds.map((id, index) => <Link
                                key={id}
                                href={`/programaciones/${id}`}
                                className="text-button"
                            >
                                Revisar módulo
                                {index + 1}
                                {' '}
                                <Icon
                                    name="arrow"
                                    size={14}
                                />
                            </Link>)}
                        </div>}
                    </div>
                </article>)}
                {successful.length > 0 && <Link
                    href="/"
                    className="button button-primary"
                >
                    Ver mis programaciones
                    <Icon
                        name="arrow"
                        size={16}
                    />
                </Link>}
            </section>}
        </>);
}
