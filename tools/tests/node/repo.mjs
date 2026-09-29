// Repo root for the Node tests: CR_REPO env or two levels up from tools/tests.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const REPO = process.env.CR_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
