// pdfjs-dist ships no types for its worker entry; we only pass the module to pdfjs.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
