# Auditoría Médica AI

Copiloto de auditoría de historias clínicas. Subís un PDF de historia clínica, el sistema lo procesa (render de páginas, OCR de escaneos, extracción estructurada con LLM) y muestra un registro clínico normalizado con trazabilidad a la página de origen.

Auto-alojado: todo corre en tu máquina vía Docker Compose, salvo las llamadas a OpenAI (OCR/extracción). La interfaz está en español.

## Alcance actual (MVP, fases P0–P3)

- Subida de PDF y almacenamiento del original en MinIO.
- Procesamiento en segundo plano con pg-boss: renderizado de páginas (mupdf), clasificación de tipo de documento, OCR/transcripción, extracción de un `ClinicalRecord` con procedencia (`sources`).
- Visor de páginas y vista del registro clínico.
- **Sin autenticación** en esta etapa.
- Pendiente para fases siguientes: línea temporal, resúmenes, motor de hallazgos, chat sobre la historia.

## Requisitos (host)

- Ubuntu/Linux con Docker y Docker Compose.
- Tu usuario con acceso al socket de Docker: `sudo usermod -aG docker $USER` (y volver a iniciar sesión).
- [Bun](https://bun.sh) 1.3.14 y Node 24+.
- Una `OPENAI_API_KEY` válida (las llamadas salen del host hacia OpenAI). Opcional: no hace falta en **modo local**.
- Opcional: [Tailscale](https://tailscale.com) para acceder desde otra máquina.

## Puesta en marcha

```bash
git clone git@github.com:ignaciano3/auditoria-medica-ai.git
cd auditoria-medica-ai

# 1) Configuración
cp .env.example .env
# editar .env y completar OPENAI_API_KEY

# 2) Variables visibles para Docker Compose y para la app web
set -a; source .env; set +a

# 3) Backend: Postgres, MinIO, migraciones y worker
docker compose --env-file .env -f docker/compose.yaml up -d --build
docker compose -f docker/compose.yaml ps

# 4) Dependencias del monorepo
bun install

# 5) App web (puerto 3000)
bun run --cwd apps/web build
bun run --cwd apps/web start -- -H 0.0.0.0 -p 3000
```

Verificación rápida:

```bash
curl -s localhost:3000/api/health   # {"status":"ok"}
```

### Modo local (sin OpenAI)

Para correr todo sin clave ni llamadas a OpenAI, usá el proveedor heurístico y el OCR local (tesseract con clasificador local):

```bash
# .env
LLM_PROVIDER=heuristic
OCR_PROVIDER=local
OPENAI_API_KEY=      # vacío: no se usa
```

`OPENAI_API_KEY` es obligatoria cuando `LLM_PROVIDER` es `openai` o `OCR_PROVIDER` es `openai`/`tesseract` (Tesseract transcribe localmente, pero la clasificación de páginas usa el modelo de visión). El worker dentro de Compose ya incluye `tesseract-ocr` + `tesseract-ocr-spa`; el clasificador local marca todas las páginas como portadoras de datos, así que las planillas manuscritas se transcriben en vez de omitirse.

El bucket de MinIO (`documents`) y las tablas se crean solos con los servicios `minio-init` y `migrate` de Compose. Para correr las migraciones a mano:

```bash
bun run --cwd packages/db db:migrate
```

## Acceso desde tu PC por Tailscale

En la laptop (host) y en la PC, con la misma tailnet:

```bash
tailscale up
tailscale status        # identificá la IP 100.x.y.z o el nombre MagicDNS
```

Desde la PC, abrí `http://<ip-o-nombre-tailscale-de-la-laptop>:3000`.

Si tenés `ufw` activo, habilitá el puerto solo para la interfaz de Tailscale:

```bash
sudo ufw allow in on tailscale0 to any port 3000
```

Alternativa sin abrir puertos, con HTTPS de Tailscale:

```bash
tailscale serve --bg http://localhost:3000
# acceso en https://<laptop>.<tailnet>.ts.net
```

## Variables de entorno

Referencia en `.env.example`:

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Conexión a Postgres |
| `S3_ENDPOINT` | Endpoint de MinIO/S3 |
| `S3_BUCKET` | Bucket de documentos (`documents`) |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Credenciales S3/MinIO |
| `LLM_PROVIDER` / `LLM_MODEL` | Proveedor y modelo para extracción (`openai` \| `heuristic`). Modelo por defecto: `gpt-5.6-terra` |
| `OCR_PROVIDER` / `OCR_MODEL` | Proveedor y modelo para OCR (`openai` \| `tesseract` \| `local`). Por defecto `tesseract`; `OCR_MODEL` (`gpt-5.6-luna`) se usa para clasificar páginas |
| `OPENAI_API_KEY` | Clave de OpenAI (obligatoria si `LLM_PROVIDER` es `openai` o `OCR_PROVIDER` es `openai`/`tesseract`) |
| `OPENCODE_API_KEY` | Clave de OpenCode Go (`LLM_PROVIDER=opencode` u `OCR_PROVIDER=opencode`) |
| `SETTINGS_ENCRYPTION_KEY` | Clave de 32 bytes (base64 o hex de 64 caracteres) que cifra las claves guardadas desde `/settings`. Generala con `openssl rand -base64 32` |
| `DOCUMENT_RETENTION_DAYS` | Retención de documentos |

Notas:

- La app web corre en el host, así que usa los valores de `.env` con `localhost` (`DATABASE_URL=...@localhost:5432/...`, `S3_ENDPOINT=http://localhost:9000`).
- El `worker` corre dentro de Compose y usa nombres de servicio (`postgres`, `minio`); Compose le inyecta sus propias variables.
- Existen tests de integración que se **omiten** salvo que definas `TEST_DATABASE_URL`.

### Configuración de IA

La app lee la configuración de proveedores desde `/settings`: ahí elegís proveedor y modelo de LLM y de OCR, y pegás las claves de API. Las claves guardadas se cifran con AES-256-GCM en Postgres; necesitás definir `SETTINGS_ENCRYPTION_KEY` (`openssl rand -base64 32`) para poder guardarlas. Los cambios se aplican en el siguiente job de procesamiento.

> **OpenCode Go** está pensado para agentes de programación: el tráfico de este pipeline puede ser monitoreado o limitado, y la retención por modelo varía según el proveedor. Revisá las condiciones antes de usarlo con datos reales (PHI).

La página `/settings` no tiene autenticación: se apoya en que la tailnet sea de confianza.

## Comandos de desarrollo

```bash
bun install

bun run dev          # turbo: levanta web + worker en modo watch
bun run lint         # Biome
bun run typecheck    # TypeScript estricto
bun run test         # bun test (vía turbo)
bun run build        # build de todos los paquetes
bun run format       # formatea con Biome

# Un solo paquete/archivo
bun run --cwd packages/lib test
bun test packages/documents/src/rendering/render-pages.test.ts
```

Fixture local del PDF real (nunca se commitea, está ignorado por `.gitignore`):

```bash
PDF_FIXTURE_PATH=./fixtures/local/auditoria-ejemplo.pdf \
  bun test packages/documents/src/rendering/render-pages.test.ts
```

## Estructura

```text
apps/
  web/       Next.js (App Router): UI en español + rutas de API
  worker/    bootstrap de pg-boss + pipeline de procesamiento
packages/
  domain/    tipos y esquemas Zod (ClinicalRecord, Finding, procedencia)
  db/        esquema Drizzle, cliente y repositorios
  documents/ renderizado mupdf, clasificación y OCR
  ai/        LLMProvider, proveedor OpenAI, chunking/map/reduce
  lib/       env perezoso, i18n es.ts, storage (S3/in-memory), cola pg-boss
  config/    tsconfig y Biome compartidos
docker/      compose.yaml, Dockerfile, .dockerignore
```

## Flujo de procesamiento

1. Subís un PDF en `/` → `POST /api/documents` guarda el original en MinIO y encola un job.
2. El `worker` toma el job y transiciona el documento:
   - renderiza cada página a PNG y las guarda en `documents/{documentId}/pages/{n}.png`;
   - clasifica cada página y transcribe las que tienen datos (las planillas manuscritas se omiten con motivo);
   - divide en chunks, extrae con el LLM, reduce y valida con Zod, y persiste el `ClinicalRecord`.
3. En `/documents/{id}` ves el visor de páginas, el registro clínico y el estado.

Estados del documento: `uploaded → processing → extracting → ready | error`. Si la extracción queda incompleta, la vista lo indica con **Análisis incompleto**.

## Rutas de API

| Método y ruta | Uso |
| --- | --- |
| `GET /api/health` | Health check |
| `POST /api/documents` | Subir PDF (multipart `file`) |
| `GET /api/documents` | Listar documentos |
| `GET /api/documents/[id]` | Documento + registro clínico + estado de páginas |
| `DELETE /api/documents/[id]` | Eliminar documento |
| `GET /api/documents/[id]/pages/[page]` | PNG de una página |

## Seguridad y limitaciones

- **Sin autenticación:** cualquiera con acceso al puerto 3000 puede ver y subir historias clínicas. Mantené la tailnet restringida (ACLs) o poné un proxy con autenticación antes de usar datos reales (PHI).
- **Postgres y MinIO** se publican en todas las interfaces con credenciales por defecto. Para exposición en red, cambialos a `127.0.0.1` en `docker/compose.yaml`:
  `"127.0.0.1:5432:5432"`, `"127.0.0.1:9000:9000"`, `"127.0.0.1:9001:9001"`.
- **Sin PHI en logs:** se registran solo ids, estados y números de página.
- **Nunca se commitean PDFs:** `*.pdf` está ignorado; el único fixture versionado es sintético (`packages/documents/fixtures/sample.pdf`).
- **Licencia:** `mupdf` es AGPL-3.0-or-later; revisá las implicancias si vas a distribuir o exponer el servicio.
- No hay TLS propio; usá `tailscale serve` o un reverse proxy si necesitás HTTPS.
