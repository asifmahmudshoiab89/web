const http = require('http');
const { spawn } = require('child_process');

const port = Number(process.env.PORT || 10000);
const child = spawn(process.execPath, ['dist/server.cjs'], {
  env: { ...process.env, PORT: '3000' },
  stdio: 'inherit'
});

const proxy = http.createServer((req, res) => {
  const request = http.request({
    hostname: '127.0.0.1', port: 3000, method: req.method,
    path: req.url, headers: { ...req.headers, host: '127.0.0.1:3000' }
  }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    upstream.pipe(res);
  });
  request.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Tijarah backend unavailable'); });
  req.pipe(request);
});

proxy.listen(port, '0.0.0.0', () => console.log(`Render proxy listening on ${port}`));
child.on('exit', code => { console.error(`Tijarah process exited: ${code}`); process.exit(code ?? 1); });
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
