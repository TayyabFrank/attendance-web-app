const https = require('https');
const options = {
  hostname: 'attendance-web-app-five.vercel.app',
  port: 443,
  path: '/api/auth/login',
  method: 'OPTIONS',
  headers: {
    'Origin': 'http://localhost',
    'Access-Control-Request-Method': 'POST'
  }
};
const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log('HEADERS:', res.headers);
});
req.on('error', (e) => { console.error(e); });
req.end();
