'use client';
import { useEffect, useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { apiRequest } from '@/lib/api';
import { useWorkspace } from '@/components/layout/workspace-shell';
import { Icon } from '@/components/ui/icon';
import { ErrorNotice, LoadingState } from '@/components/ui/feedback';
export function TemplateSettings() {
    const { data: settings, setData: setSettings, error, loading } = useResource('/api/settings');
    const { data: health } = useResource('/api/health');
    const [actionError, setActionError] = useState('');
    const [saving, setSaving] = useState(false);
    const { setDirty, dirty, notify } = useWorkspace();
    useEffect(() => () => setDirty(false), [setDirty]);
    function updateSettings(changes) {
        setSettings((previous) => ({
            ...previous,
            ...changes,
        }));
        setDirty(true);
    }
    async function saveSettings(event) {
        event.preventDefault();
        setSaving(true);
        setActionError('');
        try {
            setSettings(await apiRequest('/api/settings', {
                method: 'PUT',
                body: settings,
            }));
            setDirty(false);
            notify('Plantilla institucional actualizada.');
        } catch (failure) {
            setActionError(failure.message);
        } finally {
            setSaving(false);
        }
    }
    function uploadLogo(event) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 200000) {
            setActionError('Selecciona un logo PNG o JPEG de hasta 200 KB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => updateSettings({ logo: String(reader.result) });
        reader.readAsDataURL(file);
    }
    return (
        <>
            <section className="page-heading">
                <div>
                    <p className="eyebrow">
                        LA IDENTIDAD DE TU CENTRO
                    </p>
                    <h1>
                        Una plantilla común
                        <span className="heading-dot">
                            .
                        </span>
                    </h1>
                    <p>
                        Personaliza la portada, los encabezados y el pie del documento unificado.
                    </p>
                </div>
            </section>
            <ErrorNotice message={error || actionError} />
            {loading || !settings ? <LoadingState /> : <div className="settings-grid">
                <form
                    className="card settings-form"
                    onSubmit={saveSettings}
                >
                    <div className="panel-heading">
                        <div>
                            <h2>
                                Datos institucionales
                            </h2>
                            <p>
                                Se aplicarán en las próximas exportaciones.
                            </p>
                        </div>
                    </div>
                    {[['institution', 'Nombre del centro'], ['department', 'Departamento'], ['cycle', 'Ciclo formativo'], ['academicYear', 'Curso académico'], ['title', 'Título del documento'], ['footer', 'Pie de página']].map(([field, label]) => <label key={field}>
                        {label}
                        <input
                            required={['institution', 'cycle', 'title'].includes(field)}
                            value={settings[field]}
                            onChange={(event) => updateSettings({ [field]: event.target.value })}
                        />
                    </label>)}
                    <label>
                        Color institucional
                        <div className="color-input">
                            <input
                                type="color"
                                value={settings.primaryColor}
                                onChange={(event) => updateSettings({ primaryColor: event.target.value })}
                            />
                            <span>
                                {settings.primaryColor}
                            </span>
                        </div>
                    </label>
                    <label>
                        Logo del centro
                        <input
                            type="file"
                            accept="image/png,image/jpeg"
                            onChange={uploadLogo}
                        />
                        <span className="field-hint">
                            PNG o JPEG · hasta 200 KB
                        </span>
                    </label>
                    {settings.logo && <div className="logo-preview">
                        <img
                            src={settings.logo}
                            alt="Logo del centro"
                        />
                        <button
                            type="button"
                            className="text-button"
                            onClick={() => updateSettings({ logo: '' })}
                        >
                            Quitar logo
                        </button>
                    </div>}
                    <button
                        type="submit"
                        className="button button-primary"
                        disabled={saving || !dirty}
                    >
                        <Icon
                            name="save"
                            size={17}
                        />
                        {saving ? 'Guardando…' : 'Guardar plantilla'}
                    </button>
                </form>
                <aside>
                    <div
                        className="card template-cover-preview"
                        style={{ '--template-color': settings.primaryColor }}
                    >
                        {settings.logo && <img
                            src={settings.logo}
                            alt="Logo en la portada"
                        />}
                        <span>
                            {settings.institution}
                        </span>
                        <h2>
                            {settings.title}
                        </h2>
                        <h3>
                            {settings.cycle}
                        </h3>
                        <p>
                            Curso
                            {settings.academicYear}
                        </p>
                        <small>
                            {settings.department}
                        </small>
                    </div>
                    <p className="field-hint">
                        Plantilla configurable de partida. Adapta estos datos al formato que requiera tu centro.
                    </p>
                    <section className="card connection-card">
                        <h3>
                            Configuración del espacio
                        </h3>
                        <p>
                            Persistencia:
                            <strong>
                                {health?.storage === 'mongodb' ? 'MongoDB' : 'Archivos locales · demostración'}
                            </strong>
                        </p>
                        <p>
                            Gemini:
                            <strong>
                                {health?.providers.gemini ? 'Configurado' : 'Sin clave'}
                            </strong>
                        </p>
                        <p>
                            Groq:
                            <strong>
                                {health?.providers.groq ? 'Configurado' : 'Sin clave'}
                            </strong>
                        </p>
                        <p className="field-hint">
                            Las conexiones y claves se configuran en el servidor mediante variables de entorno.
                        </p>
                    </section>
                </aside>
            </div>}
        </>);
}
