import type {
  DocumentStatus,
  MedicationStatus,
  PageDocType,
} from "@audit/domain";

export const documentStatusLabels: Record<DocumentStatus, string> = {
  uploaded: "Subido",
  processing: "Procesando",
  extracting: "Extrayendo información",
  analyzing: "Analizando",
  ready: "Listo",
  error: "Error",
};

export const pageDocTypeLabels: Record<PageDocType, string> = {
  epicrisis: "Epicrisis",
  admission: "Ingreso",
  evolution: "Evolución",
  imaging: "Diagnóstico por imágenes",
  lab: "Laboratorio",
  microbiology: "Microbiología",
  medsRecord: "Registro de medicación",
  flowsheet: "Planilla de controles",
  nursing: "Enfermería",
  other: "Otro",
};

export const errors = {
  noFile: "No se recibió ningún archivo.",
  notPdf: "El archivo debe ser un PDF.",
  invalidFile: "El archivo no es válido.",
  tooLarge: "El archivo supera el tamaño máximo permitido.",
  uploadFailed: "No se pudo subir el archivo.",
  notFound: "No se encontró el documento.",
  processingFailed: "No se pudo procesar el documento.",
  noExtractableText: "No se pudo extraer texto de ninguna página.",
  extractionFailed: "No se pudo extraer información del documento.",
  deleteFailed: "No se pudo eliminar el documento.",
  invalidFinding: "Hallazgo no válido.",
  invalidReviewStatus: "Estado de revisión no válido.",
  noteTooLong: "La nota no puede superar los 2000 caracteres.",
  redoTranscriptionFailed: "No se pudo rehacer la transcripción.",
  reExtractFailed: "No se pudo reextraer la información.",
  settingsNoEncryptionKey:
    "Falta SETTINGS_ENCRYPTION_KEY en el entorno: no se pueden guardar claves.",
  settingsInvalidProvider: "Proveedor no válido.",
  settingsInvalidModel: "El modelo no corresponde al proveedor seleccionado.",
  settingsSaveFailed: "No se pudo guardar la configuración.",
} as const;

export function deleteConfirm(filename: string): string {
  return `¿Eliminar "${filename}"? Esta acción no se puede deshacer.`;
}

export function pageIndicator(page: number, total: number): string {
  return `Página ${page} de ${total}`;
}

export function pageImageAlt(page: number): string {
  return `Página ${page} del documento`;
}

export function failedPagesIndicator(pages: number[]): string {
  return `Páginas con error: ${pages.join(", ")}`;
}

export function failedChunksIndicator(failedChunks: number): string {
  return `Fragmentos con error: ${failedChunks}`;
}

export const clinicalRecord = {
  patient: "Paciente",
  name: "Nombre",
  age: "Edad",
  sex: "Sexo",
  birthDate: "Fecha de nacimiento",
  hospitalization: "Internación",
  admissionDate: "Fecha de ingreso",
  dischargeDate: "Fecha de alta",
  reason: "Motivo de ingreso",
  diagnoses: "Diagnósticos",
  dischargeDiagnosis: "Diagnóstico de alta",
  admissionDateConflicts: "Fechas de ingreso contradictorias",
  dischargeDateConflicts: "Fechas de alta contradictorias",
  dateConflictNote:
    "La documentación registra más de una fecha. Revisar la documentación original.",
  history: "Antecedentes",
  pathological: "Antecedentes patológicos",
  allergies: "Alergias",
  usualMedications: "Medicación habitual",
  medications: "Medicaciones",
  laboratory: "Laboratorio",
  studies: "Estudios",
  microbiology: "Microbiología",
  discharge: "Alta",
  conditionAtDischarge: "Condición al alta",
  treatment: "Tratamiento",
  instructions: "Indicaciones",
  warningSigns: "Signos de alarma",
  followUp: "Seguimiento",
  dose: "Dosis",
  route: "Vía",
  frequency: "Frecuencia",
  startDate: "Inicio",
  endDate: "Fin",
  status: "Estado",
  date: "Fecha",
  value: "Valor",
  unit: "Unidad",
  referenceRange: "Valor de referencia",
  type: "Tipo",
  indication: "Indicación",
  result: "Resultado",
  sample: "Muestra",
  organism: "Microorganismo",
  sensitivity: "Sensibilidad",
  evidence: "Evidencia",
  noInfo: "No se encontró información suficiente",
  invalidValue: "inválido",
} as const;

export const findings = {
  empty: "No se encontraron hallazgos.",
  emptyFilter: "No hay hallazgos con este filtro.",
  reviewFailed: "No se pudo guardar la revisión.",
  evidence: "Evidencia",
  note: "Nota",
  notePlaceholder: "Agregar una nota de revisión",
  saveNote: "Guardar nota",
  markPending: "Marcar como pendiente",
  viewPage: (page: number) => `Ver página ${page}`,
  filter: {
    all: "Todos",
    pending: "Pendientes",
    reviewed: "Revisados",
    dismissed: "Descartados",
  },
  status: {
    pending: "Pendiente",
    reviewed: "Revisado",
    dismissed: "Descartado",
  },
  severity: {
    high: "Alta",
    medium: "Media",
    low: "Baja",
    info: "Informativa",
  },
  category: {
    temporal: "Temporal",
    contradiction: "Contradicción",
    medication: "Medicación",
    documentation: "Documentación",
    audit: "Auditoría",
    other: "Otro",
  },
} as const;

export const processing = {
  flowsheetSkipped: "Planilla manuscrita: no se extrae celda por celda.",
  notDataBearing: "Página sin datos clínicos: no se extrae.",
  pending: "Página pendiente de procesamiento.",
  failed: "No se pudo procesar esta página.",
} as const;

export const settings = {
  title: "Configuración de IA",
  description:
    "Elegí el proveedor y modelo para extracción y OCR, y guardá tus claves de API.",
  llmSection: "Extracción (LLM)",
  ocrSection: "OCR / transcripción",
  provider: "Proveedor",
  model: "Modelo",
  keysSection: "Claves de API",
  keyOpenai: "OpenAI",
  keyDeepseek: "DeepSeek",
  keyQwen: "Qwen (DashScope)",
  keyOpencode: "OpenCode Go",
  configured: "Configurada",
  keyPlaceholder: "Pegá la clave para reemplazarla",
  clearKey: "Borrar clave",
  save: "Guardar",
  saving: "Guardando…",
  saved: "Configuración guardada. Se aplica al próximo procesamiento.",
  goWarning:
    "OpenCode Go está pensado para agentes de programación, no para pipelines de documentos médicos. El tráfico se monitorea por abuso y puede ser limitado.",
  goRetention:
    "La retención de datos varía por modelo de Go; algunos retienen hasta 30 días. No envíes datos que no debas exponer.",
  noEncryptionKey:
    "Falta SETTINGS_ENCRYPTION_KEY en el entorno: no se pueden guardar claves.",
  invalidProvider: "Proveedor no válido.",
  invalidModel: "El modelo no corresponde al proveedor seleccionado.",
  saveFailed: "No se pudo guardar la configuración.",
} as const;

export const ui = {
  appTitle: "Historias clínicas",
  backToHome: "← Historias clínicas",
  newDocument: "Nueva historia",
  upload: "Subir",
  uploading: "Subiendo…",
  uploadSuccess: "Documento subido.",
  loading: "Cargando…",
  noDocuments: "No hay documentos.",
  loadError: "No se pudieron cargar los documentos.",
  documentLoadError: "No se pudo cargar el documento.",
  noPages: "El documento no tiene páginas.",
  transcription: "Transcripción",
  image: "Imagen",
  noTranscription: "La página no tiene texto transcrito.",
  redoTranscription: "Rehacer transcripción",
  redoTranscriptionPending: "Rehaciendo…",
  reExtract: "Reextraer información",
  reExtractPending: "Reextrayendo…",
  previousPage: "Anterior",
  nextPage: "Siguiente",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
  pages: "páginas",
  processing: "Procesando",
  summary: "Resumen",
  timeline: "Línea temporal",
  medications: "Medicaciones",
  studies: "Estudios",
  findings: "Hallazgos",
  originalDocument: "Documento original",
  viewEvidence: "Ver evidencia",
  reviewed: "Revisado",
  dismissFinding: "Descartar hallazgo",
  askRecord: "Preguntarle a la historia clínica",
  chatPlaceholder: "Escribí tu pregunta…",
  chatSend: "Enviar",
  chatEmptyTitle: "Hacé una pregunta sobre el documento",
  chatEmptyBody: "Las respuestas citan la página de donde sale la información.",
  chatSuggestions: [
    "¿Cuál fue el motivo de ingreso?",
    "¿Qué medicación recibió durante la internación?",
  ],
  incompleteAnalysis: "Análisis incompleto",
  theme: "Tema",
  themeLight: "Claro",
  themeDark: "Oscuro",
  themeSystem: "Sistema",
  deleteDocument: "Eliminar",
  deleting: "Eliminando…",
} as const;

export const medicationStatusLabels: Record<MedicationStatus, string> = {
  active: "Activa",
  stopped: "Suspendida",
  unknown: "Desconocida",
};
