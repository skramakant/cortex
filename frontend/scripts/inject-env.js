/**
 * inject-env.js
 * Replaces __GAS_URL__ and __API_KEY__ placeholders in public/js/api.js
 * with values from environment variables at build time.
 *
 * Usage: node scripts/inject-env.js
 * Requires: GAS_URL and API_KEY environment variables to be set.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const GAS_URL = process.env.GAS_URL;
const API_KEY = process.env.API_KEY;

if (!GAS_URL) {
  console.error('ERROR: GAS_URL environment variable is not set.');
  process.exit(1);
}

if (!API_KEY) {
  console.error('ERROR: API_KEY environment variable is not set.');
  process.exit(1);
}

const apiFilePath = path.resolve(__dirname, '../public/js/api.js');
let content = fs.readFileSync(apiFilePath, 'utf8');

content = content.replace(/__GAS_URL__/g, GAS_URL);
content = content.replace(/__API_KEY__/g, API_KEY);

fs.writeFileSync(apiFilePath, content, 'utf8');

console.log('✓ Injected GAS_URL and API_KEY into public/js/api.js');
