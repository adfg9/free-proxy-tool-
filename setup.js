#!/usr/bin/env node
/**
 * Free Proxy Tool - One-click Setup Script
 * Automatically: install dependencies + configure browser + create desktop shortcut
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('https');

const ROOT = __dirname;
const BROWSER_DIR = path.join(ROOT, 'browser');
const APP_DIR = path.join(BROWSER_DIR, 'app');

// Colors
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m'
};

function ok(msg) { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function fail(msg) { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function info(msg) { console.log(`  ${C.cyan}[*]${C.reset} ${msg}`); }
function warn(msg) { console.log(`  ${C.yellow}!${C.reset} ${msg}`); }

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', windowsHide: true, timeout: 120000, ...opts }).trim();
  } catch {
    return null;
  }
}

async function main() {
  console.log('');
  console.log(`  ${C.bold}${C.cyan}╔═══════════════════════════════════════╗${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}║     ⚡ Free Proxy Tool - One-click Setup       ║${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}╚═══════════════════════════════════════╝${C.reset}`);
  console.log('');

  // Step 1: Check Node.js
  info('Checking Node.js...');
  const nodeVer = run('node --version');
  if (!nodeVer) {
    fail('Node.js not detected');
    console.log(`  ${C.yellow}Please install Node.js first: https://nodejs.org/${C.reset}`);
    process.exit(1);
  }
  ok(`Node.js ${nodeVer}`);

  // Step 2: npm install
  info('Checking dependencies...');
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    info('First install, downloading dependencies...');
    run('npm install --production', { cwd: ROOT, stdio: 'inherit' });
    ok('Dependencies installed successfully');
  } else {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    const missing = deps.filter(d => !fs.existsSync(path.join(ROOT, 'node_modules', d)));
    if (missing.length > 0) {
      info(`Installing missing dependencies: ${missing.join(', ')}`);
      run('npm install --production', { cwd: ROOT, stdio: 'inherit' });
      ok('Missing dependencies installed');
    } else {
      ok('Dependencies ready');
    }
  }

  // Step 3: Download Neutralino binaries
  info('Checking browser engine...');
  const neuExe = path.join(BROWSER_DIR, 'bin', 'neutralino-win_x64.exe');
  if (!fs.existsSync(neuExe)) {
    info('Downloading Neutralino engine...');
    try {
      execSync('npx neu update', {
        cwd: BROWSER_DIR, stdio: 'inherit',
        env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
      });
      ok('Browser engine downloaded');
    } catch {
      warn('Browser engine download failed, browser may not function');
    }
  } else {
    ok('Browser engine ready');
  }

  // Step 4: Download Neutralino client library
  info('Checking client library...');
  const neuClient = path.join(APP_DIR, 'neutralino.js');
  if (!fs.existsSync(neuClient)) {
    info('Downloading client library...');
    try {
      const tmpDir = path.join(ROOT, '.tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
      execSync('npm pack @neutralinojs/lib --pack-destination ' + tmpDir, { stdio: 'inherit' });
      const tgz = fs.readdirSync(tmpDir).find(f => f.endsWith('.tgz'));
      if (tgz) {
        execSync('tar -xzf ' + path.join(tmpDir, tgz) + ' -C ' + tmpDir);
        fs.copyFileSync(path.join(tmpDir, 'package', 'dist', 'neutralino.js'), neuClient);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        ok('Client library downloaded');
      }
    } catch {
      warn('Client library download failed, browser may not function');
    }
  } else {
    ok('Client library ready');
  }

  // Step 5: Create desktop shortcut
  info('Creating desktop shortcut...');
  try {
    const ps = [
      '$WshShell = New-Object -ComObject WScript.Shell',
      `$Shortcut = $WshShell.CreateShortcut("${process.env.USERPROFILE}\\Desktop\\Free Proxy Tool.lnk")`,
      '$Shortcut.TargetPath = "cmd.exe"',
      `$Shortcut.Arguments = '/c "cd /d "${ROOT}" && node index.js up"'`,
      `$Shortcut.WorkingDirectory = "${ROOT}"`,
      '$Shortcut.IconLocation = "shell32.dll,13"',
      '$Shortcut.Description = "Free Proxy Tool - One-click Start"',
      '$Shortcut.Save()'
    ].join('\n');
    execSync(`powershell -Command "${ps.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    ok('Desktop shortcut created');
  } catch {
    warn('Failed to create desktop shortcut (you can create one manually)');
  }

  // Step 6: Verify
  info('Verifying installation...');
  const checks = [
    ['Main program', () => fs.existsSync(path.join(ROOT, 'index.js'))],
    ['GUI Server', () => fs.existsSync(path.join(ROOT, 'gui', 'server.js'))],
    ['Browser UI', () => fs.existsSync(path.join(APP_DIR, 'index.html'))],
    ['Statistics Module', () => fs.existsSync(path.join(ROOT, 'lib', 'stats.js'))],
    ['socks-proxy-agent', () => fs.existsSync(path.join(ROOT, 'node_modules', 'socks-proxy-agent'))],
    ['chalk', () => fs.existsSync(path.join(ROOT, 'node_modules', 'chalk'))],
    ['ws', () => fs.existsSync(path.join(ROOT, 'node_modules', 'ws'))],
  ];
  let allPass = true;
  for (const [name, check] of checks) {
    if (check()) ok(name);
    else { fail(name); allPass = false; }
  }

  // Done
  console.log('');
  if (allPass) {
    console.log(`  ${C.bold}${C.green}🎉 Installation Complete!${C.reset}`);
  } else {
    console.log(`  ${C.bold}${C.yellow}⚠ Setup complete, some features may not be available${C.reset}`);
  }
  console.log('');
  console.log(`  ${C.bold}Usage:${C.reset}`);
  console.log(`    ${C.cyan}Double-click the "Free Proxy Tool" desktop shortcut${C.reset}`);
  console.log(`    Or run in terminal: ${C.cyan}node index.js up${C.reset}`);
  console.log(`    Quick start (skip proxy test): ${C.cyan}node index.js up --fast${C.reset}`);
  console.log('');
}

main().catch(err => {
  console.error(`  ${C.red}Installation failed: ${err.message}${C.reset}`);
  process.exit(1);
});
