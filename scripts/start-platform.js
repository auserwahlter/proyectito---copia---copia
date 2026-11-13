require('dotenv').config();

const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const prototype = path.join(root, 'prototipo');
const development = process.argv[2] === 'dev';
const matctrlPort = process.env.MATCTRL_PORT || '3001';
const mainPort = process.env.PORT || '5000';
const viteCli = path.join(prototype, 'node_modules', 'vite', 'bin', 'vite.js');

const build = spawnSync(process.execPath, [viteCli, 'build'], {
  cwd: prototype,
  stdio: 'inherit',
  env: process.env,
});

if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status || 1);

const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(keepAlive);
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = code;
}

function watch(child) {
  child.on('error', (error) => {
    console.error('No se pudo iniciar un servicio de la plataforma:', error);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(
        `Un servicio de la plataforma finalizó (${signal || code || 'sin código'}).`,
      );
      stop(code || 1);
    }
  });
}

async function isHealthy(url, expectedProperty, expectedValue) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return false;
    const data = await response.json();
    return expectedValue === undefined
      ? data[expectedProperty] === 'ok' || data[expectedProperty] === true
      : data[expectedProperty] === expectedValue;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function start() {
  const mainHealthy = await isHealthy(
    `http://localhost:${mainPort}/health`,
    'matctrlProxy',
    true,
  );
  const matctrlHealthy = await isHealthy(
    `http://localhost:${matctrlPort}/api/health`,
    'status',
  );

  if (mainHealthy) {
    console.log(`API principal reutilizada en http://localhost:${mainPort}`);
  } else {
    const main = spawn(
      process.execPath,
      development ? ['--watch', 'src/server.js'] : ['src/server.js'],
      { cwd: root, stdio: 'inherit', env: process.env },
    );
    children.push(main);
    watch(main);
  }

  if (matctrlHealthy) {
    console.log(`MATCTRL reutilizado en http://localhost:${matctrlPort}`);
  } else {
    const matctrl = spawn(process.execPath, ['server/index.js'], {
      cwd: prototype,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production', PORT: matctrlPort },
    });
    children.push(matctrl);
    watch(matctrl);
  }

  if (!children.length) {
    console.log('Todos los servicios ya estaban activos y saludables.');
  }
}

const keepAlive = setInterval(() => {}, 60000);
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start().catch((error) => {
  console.error('No se pudo iniciar la plataforma:', error);
  stop(1);
});
