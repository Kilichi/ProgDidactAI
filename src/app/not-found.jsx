import Link from 'next/link';
export default function NotFound() {
    return <section className="empty-state">
        <h1>
            No encontramos esta página
        </h1>
        <p>
            Vuelve a tu espacio de trabajo para continuar.
        </p>
        <Link
            href="/"
            className="button button-primary"
        >
            Mis programaciones
        </Link>
    </section>;
}
