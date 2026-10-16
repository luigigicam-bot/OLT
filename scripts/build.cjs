const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist-programacion');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const file of fs.readdirSync(root).filter(f => f.endsWith('.js') || f === 'index.html' || f === 'styles.css')) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}
fs.cpSync(path.join(root, 'styles'), path.join(out, 'styles'), { recursive: true });
fs.mkdirSync(path.join(out, 'vendor'));
for (const file of ['xlsx.js', 'supabase.js']) fs.copyFileSync(path.join(root, 'vendor', file), path.join(out, 'vendor', file));
console.log('Programación: public application assets built');
