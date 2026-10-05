import path from 'node:path';
export function getConfiguration() {
    return {
        driver: process.env.DATA_DRIVER || 'file',
        dataDir: path.resolve(process.env.DATA_DIR || 'data'),
        mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
        mongoDb: process.env.MONGODB_DB || 'progdidactai',
        provider: process.env.AI_PROVIDER || 'local',
        chromium: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
        pdfToText: process.env.PDFTOTEXT_PATH || 'pdftotext',
        pdfToHtml: process.env.PDFTOHTML_PATH || 'pdftohtml',
        python: process.env.PYTHON_PATH || 'python3',
        libreoffice: process.env.LIBREOFFICE_PATH || 'libreoffice',
    };
}

export const config = getConfiguration();
export const defaultSettings = {
    institution: 'Centro de Formación Profesional',
    department: 'Departamento de Informática',
    cycle: 'Desarrollo de Aplicaciones Web',
    academicYear: '2026/2027',
    title: 'Programación didáctica',
    primaryColor: '#243c65',
    footer: 'Programación didáctica · Documento revisado por el departamento',
    logo: '',
};
