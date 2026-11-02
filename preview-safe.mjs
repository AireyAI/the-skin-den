import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.dirname(fileURLToPath(import.meta.url));
const tracked = new Set(execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding:'utf8'}).split('\0'));
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.mp4':'video/mp4','.webm':'video/webm'};
http.createServer((req,res) => {
  try {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    if (!name || name.endsWith('/')) name += 'index.html';
    const parts = name.split('/');
    const ext = path.extname(name).toLowerCase();
    const publicArea = parts.length === 1 || ['dist','video','brand_assets','admin','account'].includes(parts[0]);
    const generatedCSS = name === 'dist/styles.css';
    if (!['GET','HEAD'].includes(req.method) || !publicArea || parts.some(p=>p.startsWith('.')) || !types[ext] || (!tracked.has(name) && !generatedCSS)) throw Error('blocked');
    const file = fs.realpathSync(path.join(root,name));
    if (!file.startsWith(root + path.sep)) throw Error('blocked');
    const body = fs.readFileSync(file);
    res.writeHead(200, {'Content-Type':types[ext], 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT || 4318), '127.0.0.1', () => console.log('Safe preview: http://127.0.0.1:' + (process.env.PORT || 4318)));
