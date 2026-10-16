const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
for (const file of [...fs.readdirSync(root).filter(f => f.endsWith('.js')), ...fs.readdirSync(path.join(root, 'vendor')).filter(f => f.endsWith('.js')).map(f => 'vendor/'+f)]) {
  new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)) {
  if (!fs.existsSync(path.join(root, match[1]))) throw new Error('Missing asset: '+match[1]);
}
console.log('JavaScript syntax and local asset paths: PASS');

const crypto=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor/manifest.json'),'utf8'));
for(const [name,entry] of Object.entries(manifest)){const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'vendor',name))).digest('hex');if(actual!==entry.sha256)throw new Error('Vendor integrity mismatch: '+name);}
console.log('Pinned vendor SHA-256: PASS');
