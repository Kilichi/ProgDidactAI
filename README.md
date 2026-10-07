# ProgDidactAI

Aplicación fullstack en **Next.js App Router**, React y Tailwind CSS para importar programaciones didácticas en PDF o Word, revisar su estructura, editar textos/listas/tablas y exportar varios módulos a un documento común.

El servidor forma parte de Next.js mediante Route Handlers. No hay un servidor Express ni un proyecto Vite.

## Inicio rápido con Docker

```bash
cp .env.example .env
docker compose up --build -d
```

Abre **http://localhost:3000**. Docker incluye MongoDB, Chromium, Poppler y LibreOffice. Los documentos y la base de datos se conservan en volúmenes. La aplicación utiliza extracción local inicialmente; puedes configurar Gemini o Groq en `.env` y recrear el servicio `web`.

MongoDB se inicia como replica set de un nodo para permitir eliminaciones transaccionales. Si utilizas otra instancia, configura un replica set o Atlas; el almacenamiento local (`DATA_DRIVER=file`) también realiza la eliminación completa en una única escritura. Si un archivo comparte apartados con otros documentos, la aplicación bloquea su eliminación para protegerlos.

```bash
docker compose logs -f web
docker compose down
```

## Instalación local

Requisitos:

- Node.js 24 o posterior y npm.
- Poppler (`pdftotext` y `pdftohtml`) para extraer el texto y su posición en los PDF.
- Chromium para generar documentos nuevos con la plantilla institucional. El formato original se edita directamente y no necesita Chromium.
- LibreOffice Writer para convertir Word a PDF conservando las tablas y su paginación. DOCX también puede importarse mediante Mammoth cuando LibreOffice no está disponible; en ese caso se señala la revisión del formato.
- Python 3 y pikepdf para extraer los bordes y las celdas combinadas de las tablas y modificar el PDF original conservando sus páginas y recursos. Docker incluye ambas herramientas.
- MongoDB para la persistencia exigida en la actividad. El modo `file` permite probar la aplicación sin instalar una base de datos.

En Debian, Ubuntu o LliureX, instala las herramientas del sistema:

```bash
sudo apt-get update
sudo apt-get install poppler-utils chromium libreoffice-writer fonts-liberation python3 python3-pikepdf
```

Después, desde la raíz del proyecto:

```bash
npm ci
cp .env.example .env
npm run dev
```

Abre **http://localhost:3000**. Configura una conexión MongoDB en `.env`, o cambia `DATA_DRIVER=file` para usar la demostración local. No es necesario crear previamente las colecciones.

El botón de la barra superior permite alternar entre modo claro y oscuro. La elección se conserva en el navegador; la primera visita utiliza la preferencia del sistema. La vista previa de la portada y el PDF mantienen el fondo blanco del documento impreso.

El servidor de desarrollo usa `.next-dev` y la compilación de producción usa `.next`, para poder compilar sin interferir con el navegador abierto durante el desarrollo.

Si la subida devuelve «No se puede conectar a MongoDB», comprueba que la base esté disponible y que Atlas permita la conexión desde tu equipo. Para probar la importación sin una base de datos externa, configura `DATA_DRIVER=file` en `.env` y reinicia `npm run dev`. Los datos se guardan en `data/`; cambiar de almacén no migra los documentos existentes.

Los documentos se suben como `multipart/form-data`, con los campos `file` y `provider`. Si un PDF no se procesa, comprueba que `pdftotext` esté instalado y que el documento contenga texto seleccionable. Los errores de extracción aparecen en el estado de cada documento.

Para utilizar una compilación de producción:

```bash
npm run build
npm start
```

Las rutas de las herramientas del sistema pueden adaptarse en `.env`, también si trabajas en Windows. Docker proporciona el mismo entorno de ejecución en todos los equipos.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATA_DRIVER` | `mongodb` para la entrega; `file` para demostración local. Sin `.env`, el modo local es el predeterminado. |
| `MONGODB_URI` | Conexión a MongoDB. |
| `MONGODB_DB` | Nombre de la base de datos. |
| `DATA_DIR` | Directorio persistente para originales y, en modo local, `store.json`. |
| `AI_PROVIDER` | Proveedor predeterminado: `local`, `gemini` o `groq`. También se puede elegir al importar. |
| `GEMINI_API_KEY` | Clave del servidor obtenida en [Google AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | Modelo configurable; ejemplo: `gemini-3.5-flash-lite`. |
| `GROQ_API_KEY` | Clave del servidor obtenida en [Groq Console](https://console.groq.com/keys). |
| `GROQ_MODEL` | Modelo configurable; ejemplo: `openai/gpt-oss-20b`. |
| `CHROMIUM_PATH` | Ejecutable de Chromium; por defecto, `/usr/bin/chromium`. |
| `PDFTOTEXT_PATH` | Ejecutable de Poppler; por defecto, `pdftotext`. |
| `LIBREOFFICE_PATH` | Ejecutable de LibreOffice; por defecto, `libreoffice`. |

Las claves se utilizan exclusivamente en el servidor. Los modelos disponibles y las cuotas gratuitas dependen del proveedor y de la cuenta; el nombre del modelo es configurable para poder actualizarlo. Una cuota agotada o una respuesta inválida conserva la extracción local y añade observaciones para su revisión.

## Guía de uso

1. **Comenzar asistente.** Abre «Importar documentos» desde el panel.
2. **Subir documentos.** Selecciona o arrastra PDF, DOCX o DOC. Se admiten hasta 20 archivos en cola, de hasta 15 MB y 400 páginas por archivo. El botón «Probar con el PDF de ejemplo» importa `ejemplo_pdf.pdf` realmente.
3. **Organizar.** Selecciona extracción local, Gemini o Groq. El progreso muestra la extracción, la interpretación y la conservación de líneas. Las opciones de IA se activan cuando hay una clave en el servidor.
4. **Abrir el archivo.** «Documentos» reúne los archivos con búsqueda y filtros de revisión. Cada importación aparece una sola vez, aunque contenga varios módulos.
5. **Editar por páginas.** Haz clic en un texto o celda para modificarlo. Usa el índice, el selector de página o las flechas para desplazarte. «Original» permite consultar el archivo de partida. Puedes deshacer y rehacer cambios.
6. **Previsualizar y descargar.** «Vista previa PDF» guarda los cambios pendientes y genera el documento conservando las páginas originales. Las descargas de archivos importados no añaden páginas; si una edición no cabe, se indica dónde corregirla. Debajo de cada tabla puedes añadir filas o abrir «Eliminar una fila» y elegir la fila; también puedes deshacer la eliminación.
7. **Guardar y revisar.** El guardado es automático; también puedes usar el botón de guardar o Ctrl+S. El estado confirma cuándo se han guardado los cambios. Marca cada página como revisada; editarla vuelve a marcarla como pendiente.
8. **Resolver errores.** Si una edición no puede situarse o excede su espacio, el mensaje indica el apartado, la página y, para tablas, la fila y columna. «Ir a la edición señalada» abre ese campo para corregirlo y muestra una indicación para resolver el problema.
9. **Preparar la plantilla.** Ajusta nombre del centro, departamento, ciclo, curso, título, color, pie de página y logo PNG/JPEG de hasta 200 KB.
10. **Consolidar.** La pantalla de exportación conserva la selección de módulos y la plantilla institucional para generar documentos nuevos. El editor anterior sigue disponible para programaciones creadas manualmente y para la gestión de estructura e histórico.

El PDF incluye portada, índice con las páginas calculadas durante el renderizado, encabezados de tablas y pie con numeración. La numeración de apartados puede unificarse o conservarse. Las referencias escritas dentro de los párrafos deben revisarse cuando se renumeran los epígrafes.

La plantilla es una base configurable: el material de la actividad no incluye una plantilla oficial independiente. El diseño de impresión puede adaptarse en `src/server/templates/institutional.css` y en el servicio de exportación.

## Exportación con el diseño original

El formato predeterminado es **Diseño original · mismas páginas**. Se modifican las páginas PDF existentes mediante pikepdf: se conservan dimensiones, fuentes incrustadas, tablas, imágenes, colores, márgenes y números impresos. No se añade portada, índice ni paginación nueva. Sin ediciones, se devuelve el mismo archivo PDF byte por byte.

El ejemplo conserva sus **38 páginas**, también cuando solo se selecciona uno de sus módulos: se mantiene el archivo completo y los módulos no seleccionados permanecen intactos. Si se reúnen varios originales, cada uno se incluye una vez y el total es la suma de sus páginas. La previsualización muestra el PDF generado, con el mismo motor que la descarga.

Las ediciones deben caber en el espacio disponible. Si un texto invade otro contenido, una fuente no contiene un carácter nuevo, o no se puede identificar con precisión su posición, la operación informa del problema y no genera una descarga incompleta. No se recorta texto ni se añaden páginas. Para descargar un archivo importado se debe conservar su estructura: puedes deshacer cambios de filas o eliminar las filas añadidas. La plantilla institucional se reserva para programaciones manuales sin original asociado. Los PDF con texto dentro de estructuras gráficas complejas o páginas giradas pueden necesitar normalización previa.

La edición de Word con su formato original requiere LibreOffice para obtener sus páginas PDF. La fidelidad de esa conversión depende de que las fuentes del documento estén instaladas.

## Tratamiento del documento de ejemplo

`ejemplo_pdf.pdf` tiene 38 páginas físicas, numeradas del 195 al 232 en el documento original. La importación detecta tres unidades:

- Un fragmento inicial del módulo anterior, pendiente de asignación.
- Desarrollo web en entorno servidor, código `0613`.
- El inicio de Despliegue de aplicaciones web, código `0614`, señalado como incompleto.

Se conservan las **1.601 líneas de contenido**. Los epígrafes `10.3.4`, `10.3.4.1` y `10.3.7.5` dentro del bloque de DWES se mantienen en su contexto y se señalan para revisión. Las situaciones de aprendizaje reciben apartados independientes. Las tablas continúan a través de los saltos de página y conservan referencias a las líneas del original.

La extracción local lee los bordes dibujados y las palabras posicionadas de las tablas PDF: conserva tablas separadas, anchos de columnas, celdas combinadas y continuaciones dentro de cada celda. El editor y la plantilla institucional usan esa misma geometría. La IA conserva esas tablas y su salida para el resto del texto se valida para impedir omisiones, duplicaciones o contenido inventado. Si no hay bordes detectables o falta Python/pikepdf, se utiliza la reconstrucción por texto, que requiere revisión. Los bloques extensos se dividen antes del análisis. La validación admite que un encabezado original pase a las columnas de una tabla.

Los PDF escaneados sin texto requieren OCR previo. Las páginas sin texto dentro de un documento mixto quedan señaladas. La aplicación no inventa datos para completar documentos parciales.

## Estructura del código

```text
src/
    app/
        api/                    Rutas HTTP de Next.js
        importar/               Asistente de importación
        programaciones/[id]/    Editor de un módulo
        exportar/               Consolidación y exportación
        configuracion/          Plantilla institucional
        globals.css             Estilos de la aplicación
    components/
        layout/                 Navegación y avisos
        dashboard/              Panel de módulos
        import/                 Subida y seguimiento
        editor/                 Bloques, original e histórico
        export/                 Opciones y previsualización
        settings/               Formulario de la plantilla
        ui/                     Elementos compartidos
    hooks/                      Carga de recursos
    lib/                        Utilidades del cliente
    server/
        controllers/            Entrada y salida de las rutas
        domain/                 Esquemas y validación
        http/                   Lectura de peticiones y errores
        repositories/           Patrón DAO: MongoDB y archivos
        services/               Extracción, IA, edición y exportación
        templates/              Estilos de impresión
tests/                          Pruebas de comportamiento
scripts/                        Prueba en navegador y entrega ZIP
```

Las rutas delegan en los controladores; los servicios aplican las reglas de negocio y acceden al almacén mediante el DAO. MongoDB guarda programaciones, documentos originales, versiones y configuración en colecciones separadas. Las escrituras comprueban la revisión esperada para impedir que una pestaña sobrescriba cambios más recientes.

El despliegue previsto es un proceso persistente de Next.js con un directorio de datos persistente, como el contenedor incluido. Las colas de importación y su progreso viven en ese proceso: después de reiniciarlo, los módulos guardados siguen disponibles, pero las tareas en curso deben volver a importarse. El modo de archivos también está pensado para un único proceso.

## Legibilidad y ESLint

El proyecto instala **ESLint y la configuración de Next.js**, con reglas de React, accesibilidad, variables sin usar, llaves, comillas, espacios e **indentación de cuatro espacios**. `.editorconfig` y `.vscode/settings.json` mantienen el mismo estilo en el editor. Instala la extensión recomendada de ESLint para aplicar las correcciones al guardar.

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

`format` utiliza las correcciones automáticas de ESLint. `lint` y `format:check` fallan si queda algún error o advertencia.

## Pruebas

```bash
npm test
npm run build
```

Las pruebas comprueban la extracción del PDF y de DOCX, la cobertura de contenido, los avisos de numeración, la integridad de la salida de IA, la división de tablas extensas, las peticiones a ambos proveedores mediante respuestas simuladas, la persistencia tras reinicio, el histórico, las escrituras concurrentes, la reasignación y el flujo de controladores HTTP.

Para comprobar el DAO con una base MongoDB real (replica set), las pruebas crean y eliminan una base aislada con nombre aleatorio. Incluyen concurrencia, histórico y reversión de una eliminación transaccional fallida:

```bash
TEST_MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0' npm test
```

En Docker:

```bash
docker compose exec web env TEST_MONGODB_URI='mongodb://mongo:27017/?replicaSet=rs0' npm test
```

Para recorrer la aplicación con Chromium, guardar capturas de escritorio/móvil y comprobar la exportación real del PDF:

```bash
npm run build
npm run test:e2e
```

La prueba de navegador utiliza datos temporales independientes y los elimina al terminar. Deja capturas y el PDF generado en `artifacts/`. Requiere poder abrir un puerto local y ejecutar Chromium. Las llamadas reales a Gemini/Groq requieren claves y conexión; los tests automáticos de sus contratos no consumen cuota.

## Entrega

```bash
npm run package -- --name "Nombre Apellidos"
```

Se genera `artifacts/Extra_ProgDidactAI_Nombre_Apellidos.zip`. Incluye el código, el README, la configuración de ejemplo y los documentos de partida; excluye `node_modules`, `.next`, `.env`, datos personales, repositorio y artefactos. No es necesario borrar las dependencias de tu copia de trabajo para preparar el ZIP.

## Documentación consultada

- [Route Handlers de Next.js](https://nextjs.org/docs/app/api-reference/file-conventions/route).
- [Respuestas estructuradas de Gemini](https://ai.google.dev/gemini-api/docs/structured-output).
- [Formatos de respuesta de Groq](https://console.groq.com/docs/structured-outputs).
- [Modelos de Gemini](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) y [sus condiciones de uso gratuito](https://ai.google.dev/gemini-api/docs/pricing).
- [Modelos de Groq](https://console.groq.com/docs/models) y [cuotas de sus planes](https://console.groq.com/docs/rate-limits).

Los requisitos funcionales proceden de `EXTRA Act - OPCIONAL - ProgDidactAI.pdf`. La rúbrica de Aules no forma parte de los archivos proporcionados.
