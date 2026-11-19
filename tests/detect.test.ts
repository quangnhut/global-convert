import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectFormat, DETECT_HEAD_BYTES } from '@shared/detect';
import type { FormatId } from '@shared/formats';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(import.meta.dirname, 'fixtures', name))).subarray(
    0,
    DETECT_HEAD_BYTES,
  );

const text = (s: string) => new TextEncoder().encode(s);

describe('detectFormat — fixtures', () => {
  const cases: [string, FormatId, 'content' | 'extension'][] = [
    ['sample.png', 'png', 'content'],
    ['sample.jpg', 'jpg', 'content'],
    ['sample.webp', 'webp', 'content'],
    ['sample.avif', 'avif', 'content'],
    ['sample-animated.gif', 'gif', 'content'],
    ['sample.tiff', 'tiff', 'content'],
    ['sample.ico', 'ico', 'content'],
    ['sample.svg', 'svg', 'content'],
    ['sample.pdf', 'pdf', 'content'],
    ['sample.docx', 'docx', 'content'],
    ['sample.html', 'html', 'content'],
    ['sample.txt', 'txt', 'extension'],
    ['sample.md', 'md', 'extension'],
  ];

  it.each(cases)('%s → %s', (name, format, by) => {
    expect(detectFormat(fixture(name), name)).toEqual({ format, by });
  });
});

describe('detectFormat — content beats extension', () => {
  it.each([
    ['sample.png', 'photo.jpg', 'png'],
    ['sample.jpg', 'image.png', 'jpg'],
    ['sample.webp', 'file.gif', 'webp'],
    ['sample.avif', 'file.webp', 'avif'],
    ['sample.pdf', 'report.docx', 'pdf'],
    ['sample.docx', 'letter.zip', 'docx'],
    ['sample.svg', 'drawing.txt', 'svg'],
    ['sample.ico', 'noext', 'ico'],
  ] as const)('%s renamed to %s → %s', (source, renamed, format) => {
    expect(detectFormat(fixture(source), renamed)).toEqual({ format, by: 'content' });
  });
});

describe('detectFormat — edge cases', () => {
  it('svg with BOM, comment and doctype', () => {
    const svg =
      '﻿<?xml version="1.0"?>\n<!-- hi -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg xmlns="http://www.w3.org/2000/svg"/>';
    expect(detectFormat(text(svg), 'a.xml')?.format).toBe('svg');
  });

  it('UTF-16LE text with BOM is text', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]);
    expect(detectFormat(utf16, 'notes.txt')).toEqual({ format: 'txt', by: 'extension' });
  });

  it('plain text without extension → txt by content', () => {
    expect(detectFormat(text('hello world'), 'README')).toEqual({ format: 'txt', by: 'content' });
  });

  it('PDF header after leading junk', () => {
    expect(detectFormat(text('\n\n  %PDF-1.7\n...'), 'x.bin')?.format).toBe('pdf');
  });

  it('zip without word/ entries and no .docx name → unknown', () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0x08, 0]);
    expect(detectFormat(zip, 'archive.zip')).toBeNull();
  });

  it('unknown binary falls back to a binary-format extension', () => {
    const junk = new Uint8Array([0x00, 0x13, 0x37, 0x00, 0x42]);
    expect(detectFormat(junk, 'broken.png')).toEqual({ format: 'png', by: 'extension' });
  });

  it('binary content named .txt is not text', () => {
    expect(detectFormat(new Uint8Array([0x00, 0x01, 0x02]), 'fake.txt')).toBeNull();
  });

  it('empty file → null', () => {
    expect(detectFormat(new Uint8Array(), 'empty.bin')).toBeNull();
  });
});
