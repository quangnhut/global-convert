// Generates small sample files in tests/fixtures/ — one per supported input format.
// Output is committed; re-run only when fixtures need to change.
//
// Usage: npm run fixtures
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';

const dir = resolve(import.meta.dirname, '..', 'tests', 'fixtures');
mkdirSync(dir, { recursive: true });
const out = (name, data) => {
  writeFileSync(resolve(dir, name), data);
  console.log(`✔ ${name}`);
};

// Text that converters' tests can look for.
export const FIXTURE_TEXT = 'GlobalConvert fixture';

// --- Raster images: 64×48 gradient with a transparent corner ---------------
const W = 64,
  H = 48;
const raw = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    raw[i] = Math.round((x / W) * 255);
    raw[i + 1] = Math.round((y / H) * 255);
    raw[i + 2] = 160;
    raw[i + 3] = x < 8 && y < 8 ? 0 : 255;
  }
const base = () => sharp(raw, { raw: { width: W, height: H, channels: 4 } });

out('sample.png', await base().png().toBuffer());
out('sample.jpg', await base().flatten({ background: '#ffffff' }).jpeg().toBuffer());
out('sample.webp', await base().webp().toBuffer());
out('sample.avif', await base().avif().toBuffer());
out('sample.tiff', await base().tiff().toBuffer());

// Animated GIF: 3 frames of different solid colours.
const frames = await Promise.all(
  ['#e8711c', '#2f9fd0', '#3cb371'].map((c) =>
    sharp({ create: { width: 32, height: 32, channels: 4, background: c } })
      .png()
      .toBuffer(),
  ),
);
out(
  'sample-animated.gif',
  await sharp(frames, { join: { animated: true } })
    .gif({ delay: [200, 200, 200], loop: 0 })
    .toBuffer(),
);

// ICO containing one 32×32 PNG entry (valid since Windows Vista).
const icoPng = await base().resize(32, 32).png().toBuffer();
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count
header.writeUInt8(32, 6); // width
header.writeUInt8(32, 7); // height
header.writeUInt8(0, 8); // palette
header.writeUInt8(0, 9); // reserved
header.writeUInt16LE(1, 10); // colour planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(icoPng.length, 14); // data size
header.writeUInt32LE(header.length, 18); // data offset
out('sample.ico', Buffer.concat([header, icoPng]));

out(
  'sample.svg',
  `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48">
  <rect width="64" height="48" fill="#2f9fd0"/>
  <circle cx="32" cy="24" r="16" fill="#e8711c"/>
</svg>
`,
);

// --- Documents ---------------------------------------------------------------
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
for (let p = 1; p <= 2; p++) {
  const page = pdf.addPage([595, 842]); // A4 points
  page.drawText(p === 1 ? 'Fixture Heading' : 'Second page', {
    x: 72,
    y: 760,
    size: 24,
    font: bold,
  });
  page.drawText(`${FIXTURE_TEXT} — page ${p}.`, { x: 72, y: 720, size: 12, font });
}
out('sample.pdf', Buffer.from(await pdf.save()));

const docx = new Document({
  sections: [
    {
      children: [
        new Paragraph({ text: 'Fixture Heading', heading: HeadingLevel.HEADING_1 }),
        new Paragraph(`${FIXTURE_TEXT} in a Word document.`),
      ],
    },
  ],
});
out('sample.docx', await Packer.toBuffer(docx));

out('sample.txt', `${FIXTURE_TEXT}\nSecond line — with UTF-8: café, 日本語.\n`);
out(
  'sample.md',
  `# Fixture Heading\n\n${FIXTURE_TEXT} in **Markdown**.\n\n- item one\n- item two\n`,
);
out(
  'sample.html',
  `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Fixture</title></head>\n<body><h1>Fixture Heading</h1><p>${FIXTURE_TEXT} in HTML.</p></body>\n</html>\n`,
);
