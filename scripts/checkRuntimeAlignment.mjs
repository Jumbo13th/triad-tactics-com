import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// A Node upgrade is one change: local tooling, CI, Docker and type definitions.
// Keep this dependency-free so CI can reject incompatible upgrades before npm ci.
export function checkRuntimeAlignment({ nvmrc, packageJson, packageLock, dockerfile, workflows = {} }) {
  const errors = [];
  const version = nvmrc.trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return ['.nvmrc must pin an exact Node version (major.minor.patch).'];
  }
  const major = Number(version.split('.')[0]);
  const engine = packageJson.engines?.node?.match(/^>=(\d+)\.(\d+)\.(\d+) <(\d+)$/);
  const pinned = version.split('.').map(Number);
  const minimum = engine?.slice(1, 4).map(Number);
  const older = minimum && pinned.findIndex((part, index) => part !== minimum[index]);
  if (!engine || Number(engine[1]) !== major || Number(engine[4]) !== major + 1 ||
      (older >= 0 && pinned[older] < minimum[older])) {
    errors.push(`package.json engines.node must contain Node ${version} and exclude other majors (>=minimum <${major + 1}).`);
  }
  const nodeTypes = packageJson.devDependencies?.['@types/node'] ?? '';
  if (!new RegExp(`^[~^]?${major}\\.\\d+\\.\\d+$`).test(nodeTypes)) {
    errors.push(`@types/node must stay on Node ${major} until the runtime is upgraded.`);
  }
  const lockRoot = packageLock.packages?.[''];
  if (lockRoot?.engines?.node !== packageJson.engines?.node ||
      lockRoot?.devDependencies?.['@types/node'] !== nodeTypes) {
    errors.push('package-lock.json root Node requirements must match package.json. Regenerate the lockfile.');
  }
  const lockedTypes = packageLock.packages?.['node_modules/@types/node']?.version;
  if (Number(lockedTypes?.split('.')[0]) !== major) {
    errors.push(`package-lock.json must resolve @types/node ${major}.`);
  }
  const images = [...dockerfile.matchAll(/^FROM\s+(?:--platform=\S+\s+)?node:([^\s]+)(?:\s|$)/gim)];
  if (images.length === 0) errors.push('Dockerfile must declare a versioned Node base image.');
  for (const [, image] of images) {
    if (!image.startsWith(`${version}-`)) {
      errors.push(`Dockerfile node:${image} does not match .nvmrc ${version}.`);
    }
  }
  for (const [filename, source] of Object.entries(workflows)) {
    // Inspect the setup-node step, stopping at the next step at the same indent.
    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (!/^\s*(?:-\s*)?uses:\s*actions\/setup-node@/.test(lines[index])) continue;
      const indent = lines[index].match(/^\s*/)[0].length;
      const step = [];
      for (let next = index + 1; next < lines.length; next++) {
        if (/^\s*-\s/.test(lines[next]) && lines[next].match(/^\s*/)[0].length <= indent) break;
        step.push(lines[next]);
      }
      const config = step.join('\n');
      if (!/^\s*node-version-file:\s*['"]?\.nvmrc['"]?\s*$/m.test(config) ||
          /^\s*node-version:/m.test(config)) {
        errors.push(`${filename}: every actions/setup-node step must use node-version-file: .nvmrc.`);
      }
    }
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(process.argv[2] ?? '.');
  const read = (filename) => readFileSync(resolve(root, filename), 'utf8');
  const workflows = Object.fromEntries(readdirSync(resolve(root, '.github/workflows'))
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => [name, read(`.github/workflows/${name}`)]));
  const errors = checkRuntimeAlignment({
    nvmrc: read('.nvmrc'),
    packageJson: JSON.parse(read('package.json')),
    packageLock: JSON.parse(read('package-lock.json')),
    dockerfile: read('Dockerfile'),
    workflows,
  });
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Node ${read('.nvmrc').trim()} is aligned across CI, Docker, engines and type definitions.`);
  }
}
