'use strict';
// Ephemeral local engine only. No ports, network, host mounts, persistence or
// service credentials. Does not pull/provision; needs the official image local.
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const run = promisify(execFile);
const name = `doctorai-redis-cas-${randomBytes(6).toString('hex')}`;
const docker = (...args) => run('docker', ['--config', '/tmp/doctorai-redis-docker-config', '--host', 'unix:///var/run/docker.sock', ...args], { timeout: 20000, maxBuffer: 1048576 });
let started = false;
(async () => {
  fs.mkdirSync('/tmp/doctorai-redis-docker-config', { recursive: true });
  await docker('image', 'inspect', 'redis:8.2.10');
  await docker('run', '--detach', '--rm', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '999:999', '--memory', '128m', '--cpus', '1', '--pids-limit', '64', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--entrypoint', 'redis-server', 'redis:8.2.10', '--port', '0', '--unixsocket', '/tmp/doctorai-redis.sock', '--unixsocketperm', '700', '--save', '', '--appendonly', 'no', '--protected-mode', 'yes');
  started = true;
  const version = await docker('exec', name, 'redis-server', '--version');
  console.log(version.stdout.trim());
  const config = JSON.parse((await docker('inspect', name)).stdout)[0];
  console.log(JSON.stringify({ networkMode: config.HostConfig.NetworkMode, readonlyRootfs: config.HostConfig.ReadonlyRootfs, publishedPorts: Object.keys(config.NetworkSettings.Ports || {}), hostMounts: config.Mounts.filter(m => m.Type === 'bind').length, persistentHealthStorage: false }));
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-health-concurrency.cjs'], { cwd: process.cwd(), env: { ...process.env, DOCTORAI_REDIS_TEST_CONTAINER: name }, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (exitCode !== 0) throw new Error('Real Redis concurrency verification failed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (started) { await docker('stop', '--time', '1', name).catch(() => { process.exitCode = 1; }); console.log('Ephemeral Redis container stopped and removed.'); }
});
