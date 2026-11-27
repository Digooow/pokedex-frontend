import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DRACO_SRC_DIR = path.join(REPO_ROOT, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf');
const DRACO_DEST_DIR = path.join(REPO_ROOT, 'apps', 'web', 'public', 'assets', 'draco');
const DRACO_FILES = ['draco_decoder.wasm', 'draco_wasm_wrapper.js', 'draco_decoder.js'];

if (!fs.existsSync(DRACO_SRC_DIR)) {
  throw new Error(`Missing Three.js Draco decoder directory: ${DRACO_SRC_DIR}`);
}

fs.mkdirSync(DRACO_DEST_DIR, { recursive: true });

for (const fileName of DRACO_FILES) {
  const srcPath = path.join(DRACO_SRC_DIR, fileName);
  const destPath = path.join(DRACO_DEST_DIR, fileName);
  const srcSize = fs.statSync(srcPath).size;
  const needsCopy = !fs.existsSync(destPath) || fs.statSync(destPath).size !== srcSize;
  if (needsCopy) {
    fs.copyFileSync(srcPath, destPath);
  }
}
