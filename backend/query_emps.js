const mongoose = require('mongoose');
const Employee = require('./models/Employee');

mongoose.connect('mongodb://127.0.0.1:27017/attendance').then(async () => {
  const employees = await Employee.find({ isDeleted: { $ne: true }, isActive: true }).select('-password -pin -facePhotos -faceEmbedding');
  console.log('Total:', employees.length);
  employees.forEach(e => console.log('ID:', e.employeeId, 'Name:', e.name, 'isActive:', e.isActive, 'Role:', e.role));
  process.exit();
}).catch(console.error);
