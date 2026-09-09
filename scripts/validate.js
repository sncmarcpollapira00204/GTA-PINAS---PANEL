'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const requiredEntry = process.argv[2] || 'index.js';
const failures = [];

function walk(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(fullPath);
  }
  return output;
}

function resolveLocalImport(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

const entryPath = path.join(root, requiredEntry);
if (!fs.existsSync(entryPath)) failures.push(`Missing required entry point: ${requiredEntry}`);

for (const file of walk(root)) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    failures.push(`${path.relative(root, file)}: ${check.stderr.trim() || check.stdout.trim()}`);
    continue;
  }

  const source = fs.readFileSync(file, 'utf8');
  const requirePattern = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
  let match;
  while ((match = requirePattern.exec(source)) !== null) {
    if (!resolveLocalImport(file, match[1])) {
      failures.push(`${path.relative(root, file)}: unresolved local import ${match[1]}`);
    }
  }
}

if (failures.length) {
  console.error('Validation failed:\n' + failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Validation passed for ${path.basename(root)}.`);
