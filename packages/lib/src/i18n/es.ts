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
} as const;

export function pageIndicator(page: number, total: number): string {
  return `Página ${page} de ${total}`;
}

export function pageImageAlt(page: number): string {
  return `Página ${page} del documento`;
}

export const processing = {
  flowsheetSkipped: "Planilla manuscrita: no se extrae celda por celda.",
  notDataBearing: "Página sin datos clínicos: no se extrae.",
} as const;

export const ui = {
  appTitle: "Historias clínicas",
  newDocument: "Nueva historia",
  upload: "Subir",
  uploading: "Subiendo…",
  uploadSuccess: "Documento subido.",
  loading: "Cargando…",
  noDocuments: "No hay documentos.",
  loadError: "No se pudieron cargar los documentos.",
  documentLoadError: "No se pudo cargar el documento.",
  noPages: "El documento no tiene páginas.",
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
