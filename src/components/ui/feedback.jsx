import { Icon } from './icon';
export function ErrorNotice({ message, onRetry }) {
    if (!message) {
        return null;
    }
    return <div
        role="alert"
        className="notice error-notice"
    >
        <Icon name="warning" />
        <div>
            <strong>
                No se pudo completar la operación
            </strong>
            <p>
                {message}
            </p>
            {onRetry && <button
                className="text-button"
                onClick={onRetry}
            >
                Volver a intentar
            </button>}
        </div>
    </div>;
}
export function LoadingState({ label = 'Cargando tu espacio de trabajo…' }) {
    return <div
        className="loading-state"
        role="status"
    >
        <span className="spinner" />
        <p>
            {label}
        </p>
    </div>;
}
export function StatusBadge({ reviewed }) {
    return <span className={`badge ${reviewed ? 'badge-green' : 'badge-amber'}`}>
        <span className="status-dot" />
        {reviewed ? 'Revisado' : 'En revisión'}
    </span>;
}
