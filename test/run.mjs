// `npm test`: runs every suite in its own process; exits non-zero if any assertion fails.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const suites = readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.test.mjs')).sort(); let bad = 0;
for (const s of suites) { const r = spawnSync(process.execPath, [fileURLToPath(new URL(s, import.meta.url))], { stdio: 'inherit' }); if (r.status !== 0) bad++; }
console.log(bad ? `\nFAILED: ${bad} of ${suites.length} suites` : `\nAll ${suites.length} suites passed`); process.exit(bad ? 1 : 0);
