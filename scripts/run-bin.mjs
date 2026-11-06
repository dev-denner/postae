#!/usr/bin/env node
/**
 * Executa o CLI de um pacote Node sem depender do bit de execução dos
 * wrappers em node_modules/.bin.
 *
 * Motivo: o projeto pode estar em um volume NTFS (fmask remove bits +x),
 * onde shell scripts em node_modules/.bin não podem ser executados. Em vez
 * de copiar/alterar permissões, este runner localiza o pacote no
 * node_modules (hoisted ou aninhado) e o executa com o próprio `node`.
 *
 * Uso: node scripts/run-bin.mjs <pacote/caminho-do-bin> [argumentos...]
 * Ex.: node scripts/run-bin.mjs @nestjs/cli/bin/nest.js build
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function splitSpecifier(specifier) {
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    return { packageName: parts.slice(0, 2).join('/'), binPath: parts.slice(2).join('/') };
  }
  return { packageName: parts[0], binPath: parts.slice(1).join('/') };
}

function findPackageDir(packageName) {
  let current = process.cwd();
  while (true) {
    const candidate = path.join(current, 'node_modules', packageName);
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

const [specifier, ...args] = process.argv.slice(2);
if (!specifier) {
  console.error('Uso: node scripts/run-bin.mjs <pacote/caminho-do-bin> [argumentos...]');
  process.exit(1);
}

const { packageName, binPath } = splitSpecifier(specifier);
if (!binPath) {
  console.error(`Informe o caminho do binário dentro do pacote: ${specifier}`);
  process.exit(1);
}

const packageDir = findPackageDir(packageName);
if (!packageDir) {
  console.error(`Pacote não encontrado em node_modules: ${packageName}`);
  process.exit(1);
}

const binFile = path.join(packageDir, binPath);
if (!existsSync(binFile)) {
  console.error(`Binário não encontrado: ${binFile}`);
  process.exit(1);
}

const child = spawn(process.execPath, [binFile, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
