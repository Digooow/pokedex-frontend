import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DRACO_SRC_DIR = path.join(REPO_ROOT, 'node_modules', '@babylonjs', 'core', 'assets', 'Draco');
const DRACO_DEST_DIR = path.join(REPO_ROOT, 'apps', 'web', 'public', 'assets', 'draco');
const DRACO_FILES = [
  'draco_decoder_gltf.wasm',
  'draco_wasm_wrapper_gltf.js',
  'draco_decoder_gltf.js',
  'draco_decoder.wasm',
  'draco_wasm_wrapper.js',
  'draco_decoder.js',
];

const HAVOK_SRC_FILE = path.join(
  REPO_ROOT,
  'node_modules',
  '@babylonjs',
  'havok',
  'lib',
  'esm',
  'HavokPhysics.wasm',
);
const HAVOK_DEST_DIR = path.join(REPO_ROOT, 'apps', 'web', 'public', 'assets', 'havok');

function copyIfChanged(srcPath, destPath) {
  const srcSize = fs.statSync(srcPath).size;
  const needsCopy = !fs.existsSync(destPath) || fs.statSync(destPath).size !== srcSize;
  if (needsCopy) {
    fs.copyFileSync(srcPath, destPath);
  }
}

if (!fs.existsSync(DRACO_SRC_DIR)) {
  throw new Error(`Missing Babylon.js Draco decoder directory: ${DRACO_SRC_DIR}`);
}
if (!fs.existsSync(HAVOK_SRC_FILE)) {
  throw new Error(`Missing Babylon.js Havok WASM file: ${HAVOK_SRC_FILE}`);
}

fs.mkdirSync(DRACO_DEST_DIR, { recursive: true });
for (const fileName of DRACO_FILES) {
  copyIfChanged(path.join(DRACO_SRC_DIR, fileName), path.join(DRACO_DEST_DIR, fileName));
}

fs.mkdirSync(HAVOK_DEST_DIR, { recursive: true });
copyIfChanged(HAVOK_SRC_FILE, path.join(HAVOK_DEST_DIR, 'HavokPhysics.wasm'));
