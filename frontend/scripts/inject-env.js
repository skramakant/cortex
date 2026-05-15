/**
 * inject-env.js
 * Replaces __GAS_URL__ placeholder in public/js/api.js with the
 * GAS_URL environment variable at build time.
 *
 * Usage: node scripts/inject-env.js
 * Requires: GAS_URL environment variable to be set.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const GAS_URL = process.env.GAS_URL;

if (!GAS_URL) {
  console.error('ERROR: GAS_URL environment variable is not set.');
  process.exit(1);
}

const apiFilePath = path.resolve(__dirname, '../public/js/api.js');
let content = fs.readFileSync(apiFilePath, 'utf8');

if (!content.includes('__GAS_URL__')) {
  console.warn('WARNING: __GAS_URL__ placeholder not found in api.js — skipping injection.');
  process.exit(0);
}

content = content.replace(/__GAS_URL__/g, GAS_URL);
fs.writeFileSync(apiFilePath, content, 'utf8');

console.log('✓ Injected GAS_URL into public/js/api.js');
