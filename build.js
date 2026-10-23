// node build.js  -> writes public/index.html (single self-contained file) from src/template.html + core.js + src/client.js
const fs = require('fs');
const t = fs.readFileSync(__dirname + '/src/template.html', 'utf8');
const core = fs.readFileSync(__dirname + '/core.js', 'utf8'), client = fs.readFileSync(__dirname + '/src/client.js', 'utf8');
if ((core + client).includes('</script')) throw new Error('script end tag in source');
fs.mkdirSync(__dirname + '/public', { recursive: true });
fs.writeFileSync(__dirname + '/public/index.html', t.replace('</body>', "<script>\n(()=>{\n'use strict';\n" + core + '\n' + client + '\n})();\n</script>\n</body>'));
console.log('built public/index.html');
