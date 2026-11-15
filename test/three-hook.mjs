// Lets Node tests import modules that use the bare specifier 'three' from the vendored copy when node_modules is absent.
import { register } from 'node:module';
const hook = `
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', '${import.meta.url}'));
export async function resolve(spec, ctx, next) {
  if (spec === 'three' || spec.startsWith('three/addons/')) {
    const local = spec === 'three' ? root + 'vendor/three.module.js' : root + 'vendor/addons/' + spec.slice('three/addons/'.length);
    if (existsSync(local)) return { url: pathToFileURL(local).href, shortCircuit: true };
  }
  return next(spec, ctx);
}`;
register('data:text/javascript,' + encodeURIComponent(hook));
