import type { OptionField, PdfPrintOptions } from '@shared/converter';

export type FontChoice = 'sans' | 'serif' | 'mono';

/** CSS stacks (HTML/PDF) and the matching Word font name (DOCX). */
export const FONTS: Record<FontChoice, { css: string; docx: string }> = {
  sans: {
    css: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    docx: 'Calibri',
  },
  serif: { css: 'Georgia, "Times New Roman", "Noto Serif", serif', docx: 'Times New Roman' },
  mono: {
    css: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", "Noto Sans Mono", monospace',
    docx: 'Courier New',
  },
};

export const fontField: OptionField = {
  key: 'font',
  label: 'Font',
  type: 'select',
  choices: [
    { value: 'sans', label: 'Sans-serif' },
    { value: 'serif', label: 'Serif' },
    { value: 'mono', label: 'Monospace' },
  ],
};

export const pageSizeField: OptionField = {
  key: 'pageSize',
  label: 'Page size',
  type: 'select',
  choices: [
    { value: 'a4', label: 'A4' },
    { value: 'letter', label: 'US Letter' },
  ],
};

export const marginField: OptionField = {
  key: 'margin',
  label: 'Margins (mm)',
  type: 'number',
  min: 0,
  max: 50,
};

export const fontOf = (value: string): FontChoice =>
  value === 'serif' || value === 'mono' ? value : 'sans';

export const printOptions = (o: { pageSize: string; margin: number }): PdfPrintOptions => ({
  pageSize: o.pageSize === 'letter' ? 'Letter' : 'A4',
  marginMm: o.margin,
});

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A complete, self-contained HTML document. The CSP blocks scripts and everything except
 * images and inline styles, so the file is inert when printed or opened in a browser.
 */
export function htmlDocument(title: string, body: string, font: FontChoice = 'sans'): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data:; style-src 'unsafe-inline'; font-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: ${FONTS[font].css}; line-height: 1.5; color: #111; max-width: 50rem; margin: 2rem auto; padding: 0 1rem; }
  @media print { body { max-width: none; margin: 0; padding: 0; } }
  img { max-width: 100%; height: auto; }
  pre, code { font-family: ${FONTS.mono.css}; font-size: 0.92em; }
  pre { background: #f5f5f5; padding: 0.75rem; overflow-x: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  pre.plain { background: none; padding: 0; font-family: inherit; font-size: inherit; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 0.25rem 0.5rem; vertical-align: top; }
  blockquote { margin-left: 0; padding-left: 1rem; border-left: 3px solid #ccc; color: #444; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
