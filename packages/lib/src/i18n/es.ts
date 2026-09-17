import type { DocumentStatus, PageDocType } from "@audit/domain";

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
} as const;

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
  age: "Edad",
  sex: "Sexo",
  hospitalization: "Internación",
  admissionDate: "Fecha de ingreso",
  dischargeDate: "Fecha de alta",
  reason: "Motivo de ingreso",
  diagnoses: "Diagnósticos",
  medications: "Medicaciones",
  laboratory: "Laboratorio",
  studies: "Estudios",
  microbiology: "Microbiología",
  noInfo: "No se encontró información suficiente",
} as const;

export const processing = {
  flowsheetSkipped: "Planilla manuscrita: no se extrae celda por celda.",
  notDataBearing: "Página sin datos clínicos: no se extrae.",
  pending: "Página pendiente de procesamiento.",
  failed: "No se pudo procesar esta página.",
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
  noTranscription: "La página no tiene texto transcrito.",
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
  incompleteAnalysis: "Análisis incompleto",
} as const;
