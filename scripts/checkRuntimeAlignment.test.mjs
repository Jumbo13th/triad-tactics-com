import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRuntimeAlignment } from './checkRuntimeAlignment.mjs';

function fixture() {
  const packageJson = {
    engines: { node: '>=24.22.1 <25' },
    devDependencies: { '@types/node': '^24.19.2' },
  };
  return {
    nvmrc: '24.22.1\n',
    packageJson,
    packageLock: { packages: {
      '': structuredClone(packageJson),
      'node_modules/@types/node': { version: '24.19.2' },
    } },
    dockerfile: 'FROM node:24.22.1-bookworm-slim AS deps\nFROM deps AS production-deps\nFROM node:24.22.1-bookworm-slim AS runner\n',
    workflows: { 'ci.yml': '    - uses: actions/setup-node@v7\n      with:\n        node-version-file: .nvmrc\n    - run: npm ci\n' },
  };
}

test('aligned runtime, inherited stages and digest-pinned images pass', () => {
  const input = fixture();
  input.dockerfile += `FROM --platform=linux/amd64 node:24.22.1-bookworm-slim@sha256:${'a'.repeat(64)} AS other\n`;
  assert.deepEqual(checkRuntimeAlignment(input), []);
});

test('a Docker-only major upgrade is blocked', () => {
  const input = fixture();
  input.dockerfile = input.dockerfile.replace('node:24.22.1-', 'node:26.0.0-');
  assert.match(checkRuntimeAlignment(input).join('\n'), /Dockerfile node:26/);
});

test('same-major patch upgrades may retain an older engine minimum', () => {
  const input = fixture();
  input.nvmrc = '24.23.0';
  input.dockerfile = input.dockerfile.replaceAll('24.22.1', '24.23.0');
  assert.deepEqual(checkRuntimeAlignment(input), []);
  input.packageJson.engines.node = '>=24.24.0 <25';
  assert.match(checkRuntimeAlignment(input).join('\n'), /engines.node must contain/);
});

test('Node types cannot move ahead of the runtime', () => {
  const input = fixture();
  input.packageJson.devDependencies['@types/node'] = '^26.0.0';
  assert.match(checkRuntimeAlignment(input).join('\n'), /@types\/node must stay on Node 24/);
});

test('stale lockfile is detected even when package.json was updated', () => {
  const input = fixture();
  input.packageLock.packages['node_modules/@types/node'].version = '26.0.0';
  input.packageLock.packages[''].engines.node = '>=22';
  const errors = checkRuntimeAlignment(input).join('\n');
  assert.match(errors, /root Node requirements/);
  assert.match(errors, /must resolve @types\/node 24/);
});

test('floating Node versions and an engine range allowing a new major are blocked', () => {
  const floating = fixture();
  floating.nvmrc = 'lts/*';
  assert.match(checkRuntimeAlignment(floating).join('\n'), /exact Node version/);
  const wide = fixture();
  wide.packageJson.engines.node = '>=24.22.1';
  assert.match(checkRuntimeAlignment(wide).join('\n'), /engines.node/);
});

test('CI cannot override .nvmrc with a hardcoded version or borrow config from another step', () => {
  const input = fixture();
  input.workflows['ci.yml'] = '    - uses: actions/setup-node@v7\n      with:\n        node-version: 26\n    - uses: actions/setup-node@v7\n      with:\n        node-version-file: .nvmrc\n';
  assert.equal(checkRuntimeAlignment(input).length, 1);
});
