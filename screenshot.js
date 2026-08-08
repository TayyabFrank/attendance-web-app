const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
const browser = await puppeteer.launch({ headless: 'new', executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  
  // 1. Admin Dashboard
  const pageAdmin = await browser.newPage();
  await pageAdmin.setViewport({ width: 1280, height: 800 });
  await pageAdmin.setRequestInterception(true);
  pageAdmin.on('request', request => {
    const url = request.url();
    if (url.includes('/api/admin/verify-session')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { role: 'super-admin', name: 'Admin User' } }) });
    } else if (url.includes('/api/employees')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([{ employeeId: 'EMP001', name: 'John Doe', department: 'Engineering', role: 'employee', status: 'Present' }]) });
    } else if (url.includes('/api/attendance/logs')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else if (url.includes('/api/requests')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else if (url.includes('/api/departments')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([{ name: 'Engineering' }]) });
    } else if (url.includes('/api/settings/office')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ officeLatitude: 33.6, officeLongitude: 73.0, allowedRadius: 100 }) });
    } else if (url.includes('/api/holidays')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else {
      request.continue();
    }
  });

  await pageAdmin.goto('http://localhost:5173/');
  await pageAdmin.evaluate(() => {
    localStorage.setItem('adminToken', 'dummy-token');
    localStorage.setItem('admin', JSON.stringify({ role: 'super-admin', name: 'Admin User' }));
  });
  await pageAdmin.goto('http://localhost:5173/admin-dashboard');
  await new Promise(r => setTimeout(r, 6000)); // wait for splash and renders
  await pageAdmin.screenshot({ path: 'admin.png' });
  console.log('Admin screenshot taken.');

  // 2. Employee Dashboard
  const pageEmp = await browser.newPage();
  await pageEmp.setViewport({ width: 375, height: 812, isMobile: true }); // Mobile view
  await pageEmp.setRequestInterception(true);
  pageEmp.on('request', request => {
    const url = request.url();
    if (url.includes('/api/verify-session')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { name: 'Employee User', employeeId: 'EMP001' } }) });
    } else if (url.includes('/api/attendance/history')) {
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    } else {
      request.continue();
    }
  });

  await pageEmp.goto('http://localhost:5173/');
  await pageEmp.evaluate(() => {
    localStorage.setItem('token', 'dummy-token');
    localStorage.setItem('user', JSON.stringify({ name: 'Employee User', employeeId: 'EMP001' }));
  });
  await pageEmp.goto('http://localhost:5173/employee-dashboard');
  await new Promise(r => setTimeout(r, 6000)); // wait for splash and renders
  await pageEmp.screenshot({ path: 'mobile.png' });
  console.log('Mobile screenshot taken.');

  // 3. Scan
  const pageScan = await browser.newPage();
  await pageScan.setViewport({ width: 375, height: 812, isMobile: true });
  
  await pageScan.goto('http://localhost:5173/scan');
  await new Promise(r => setTimeout(r, 6000)); // wait for splash and renders
  await pageScan.screenshot({ path: 'biometric.png' });
  console.log('Biometric screenshot taken.');

  await browser.close();
  console.log('Done.');
})();
