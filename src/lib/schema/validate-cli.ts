/**
 * Template authoring CLI (issue #4): validates a template JSON file against
 * the schema and builder constraints before it is committed to the library.
 *
 * Usage: npm run validate -- path/to/template.json
 * Exits 1 if the file is missing, not JSON, or fails a hard constraint.
 */
import { readFileSync } from 'node:fs';
import { validateTemplate, type Violation } from './validator.ts';

function fmt(v: Violation): string {
  const where = v.path === '' ? '(template)' : v.path;
  return `[${v.severity}] ${v.code} at ${where}: ${v.message}`;
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npm run validate -- <template.json>');
  process.exit(1);
}

let input: unknown;
try {
  // Strip a UTF-8 BOM; Windows editors often add one and JSON.parse rejects it.
  input = JSON.parse(readFileSync(filePath, 'utf8').replace(/^﻿/, ''));
} catch (err) {
  console.error(`Cannot read ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const result = validateTemplate(input);
for (const violation of result.violations) {
  console.log(fmt(violation));
}
if (result.ok) {
  console.log('✓ valid');
} else {
  process.exit(1);
}
