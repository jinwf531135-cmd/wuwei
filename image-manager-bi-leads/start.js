// start.js
const { exec } = require('child_process');
const open = require('open');
const path = require('path');

const server = exec('node backend/server.js', { cwd: path.join(__dirname) });

server.stdout.on('data', (data) => {
  console.log(data.toString());
  if (data.toString().toLowerCase().includes('local lead backend running')) {
    // 自动打开两页：落地页和后台
    open('http://localhost:3000/frontend/landing.html');
    open('http://localhost:3000/frontend/admin.html');
  }
});

server.stderr.on('data', (d) => console.error(d.toString()));
server.on('exit', (code) => console.log('server exit', code));
