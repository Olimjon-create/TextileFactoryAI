// `npm run dev` (loyiha ildizida): backend (:8001) va frontend (:5180) ni bitta oynada ishga tushiradi.
// Backend allaqachon ishlab turgan bo'lsa (masalan ishga-tushirish.bat orqali), faqat frontend yoqiladi.
// To'xtatish: Ctrl+C — ikkalasi ham yopiladi.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.join(root, 'backend');
const isWin = process.platform === 'win32';
const python = path.join(backendDir, 'venv', isWin ? 'Scripts/python.exe' : 'bin/python');
const children = [];

function listening(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

// Vite "localhost" da tinglaydi — Windows'da bu ko'pincha faqat IPv6 (::1), shuning uchun ikkalasi tekshiriladi
async function portBusy(port) {
  return (await listening(port, '127.0.0.1')) || (await listening(port, '::1'));
}

function run(name, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: isWin && cmd === 'npm' });
  child.on('exit', (code) => {
    console.log(`\n[${name}] to'xtadi (kod ${code ?? 0}).`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // Windows'da uvicorn --reload ichki jarayoni yetim qolmasligi uchun butun daraxtni yopamiz
    if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// Qo'shimcha argumentlar vite'ga uzatiladi, masalan: npm run dev -- --port 5181
const viteArgs = process.argv.slice(2);

// Ikkalasi ham band — dastur allaqachon ishlayapti (odatda ishga-tushirish.bat orqali, orqa fonda)
if (!viteArgs.includes('--port') && (await portBusy(5180)) && (await portBusy(8001))) {
  console.log('\nDastur allaqachon ishlab turibdi: http://localhost:5180');
  console.log("  Orqa fonda ishlayotgan bo'lsa (ishga-tushirish.bat) — shu manzilni oching, qayta yoqish shart emas.");
  console.log("  Shu oynada ishlatmoqchi bo'lsangiz: avval toxtatish.bat ni bosing, keyin qaytadan npm run dev.\n");
  process.exit(0);
}

if (await portBusy(8001)) {
  console.log('Backend :8001 allaqachon ishlab turibdi — faqat frontend yoqiladi.');
} else if (!existsSync(python)) {
  console.error("backend\\venv topilmadi. Avval OQING.txt dagi o'rnatish qadamlarini bajaring.");
  process.exit(1);
} else {
  if (!existsSync(path.join(backendDir, '.env'))) {
    console.warn("Diqqat: backend\\.env yo'q — OQING.txt bo'yicha yarating (DATABASE_URL, JWT_SECRET_KEY).");
  }
  run('backend', python, ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8001'], backendDir);
}

run('frontend', 'npm', ['--prefix', 'frontend', 'run', 'dev', ...(viteArgs.length ? ['--', ...viteArgs] : [])], root);
