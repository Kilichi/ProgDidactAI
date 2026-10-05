import './globals.css';
import { WorkspaceShell } from '@/components/layout/workspace-shell';
const themeInitialization = `
    (function () {
        try {
            var savedTheme = localStorage.getItem('progdidactai-theme');
            var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            var theme = savedTheme === 'dark' || savedTheme === 'light'
                ? savedTheme
                : systemDark ? 'dark' : 'light';
            document.documentElement.dataset.theme = theme;
        } catch (error) {
            document.documentElement.dataset.theme = 'light';
        }
    })();
`;
export const metadata = {
    title: 'ProgDidactAI · Programaciones didácticas',
    description: 'Importa, revisa y unifica las programaciones didácticas de tu ciclo formativo.',
};
export default function RootLayout({ children }) {
    return <html
        lang="es"
        suppressHydrationWarning
    >
        <head>
            <script dangerouslySetInnerHTML={{ __html: themeInitialization }} />
        </head>
        <body>
            <WorkspaceShell>
                {children}
            </WorkspaceShell>
        </body>
    </html>;
}
