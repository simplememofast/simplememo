#!/usr/bin/env node
import fs from 'node:fs';
import { summarizeAiProbes } from '../lib/ai-probes.mjs';

// Reads a private input path; prints aggregates without raw answers/evidence paths.
const input = process.argv[2];
if (!input) {
  console.error('Usage: node growth/scripts/summarize-ai-probes.mjs /private/path/observations.json');
  process.exit(2);
}
const observations = JSON.parse(fs.readFileSync(input, 'utf8'));
console.log(JSON.stringify(summarizeAiProbes(observations), null, 2));
