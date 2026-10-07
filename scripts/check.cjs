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
