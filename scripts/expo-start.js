#!/usr/bin/env node
/**
 * Starts Expo for testing on a phone with Google sign-in working.
 *
 * Supabase refuses redirect URLs whose host is a raw IP address (exp://10.0.0.5:8081/...), which
 * is what Expo Go uses on a LAN. This serves Metro under a hostname instead, via nip.io
 * ("10.0.0.5.nip.io" resolves to 10.0.0.5), so the redirect is exp://10.0.0.5.nip.io:8081/...
 * and matches the `exp://**` entry in Supabase → Authentication → Redirect URLs.
 *
 * Usage (from an app folder):  node ../scripts/expo-start.js [--port 8082] [other expo flags]
 * Override the detected IP:    LAN_IP=192.168.1.20 node ../scripts/expo-start.js
 */
const os = require('os');
const { spawn } = require('child_process');

const VIRTUAL = /vethernet|virtualbox|vmware|wsl|hyper-v|docker|loopback|bluetooth|tailscale|zerotier|vpn/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function lanIp() {
  if (process.env.LAN_IP) return process.env.LAN_IP.trim();
  const candidates = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || !PRIVATE.test(a.address)) continue;
      const score = (VIRTUAL.test(name) ? 0 : 2) + (/wi-?fi|wlan|ethernet|en0|en1/i.test(name) ? 1 : 0);
      candidates.push({ name, address: a.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address ?? null;
}

const ip = lanIp();
if (!ip) {
  console.error('Could not find a Wi-Fi/LAN IPv4 address. Set LAN_IP=<your laptop IP> and retry.');
  process.exit(1);
}

const hostname = `${ip}.nip.io`;
console.log(`\n  Phone address: exp://${hostname}  (laptop ${ip})`);
console.log('  Phones must be on the same Wi-Fi. Google sign-in returns here via exp://**.\n');

const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: hostname },
});
child.on('exit', (code) => process.exit(code ?? 0));
