const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

async function main() {
  if (!process.env.POCKETDATA_TEST_PLAYWRIGHT) throw new Error('Set the explicit Playwright module path');
  const {chromium} = require(process.env.POCKETDATA_TEST_PLAYWRIGHT);
  const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
  const root = await browser.newPage();
  const verify = eval('(' + fs.readFileSync(path.join(__dirname, 'ph-device-login.browser.js'), 'utf8') + ')');
  const origins = [];
  try {
    for (const attempt of [1, 2]) {
      const proxy = http.createServer((request, response) => {
        const upstream = http.request({hostname: '127.0.0.1', port: 8785, path: request.url, method: request.method, headers: request.headers}, result => {
          response.writeHead(result.statusCode, result.headers);
          result.pipe(response);
        });
        upstream.on('error', () => { response.writeHead(502); response.end(); });
        request.pipe(upstream);
      });
      await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
      const origin = `http://localhost:${proxy.address().port}`;
      try {
        const result = await verify(root, origin);
        origins.push({attempt, origin, passed: result.admin && result.viewerDenied && result.logoutRevoked});
      } finally {
        proxy.closeAllConnections();
        await new Promise(resolve => proxy.close(resolve));
      }
    }
    if (origins[0].origin === origins[1].origin) throw new Error('The proxy restart must allocate another origin');
    console.log(JSON.stringify({nativeProxyRestart: true, authReconfiguration: false, operationalMutations: false, desktopForwardingVerified: false, origins}, null, 2));
  } finally { await browser.close(); }
}

main().catch(failure => { console.error(failure); process.exitCode = 1; });
