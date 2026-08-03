const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/attendance').then(async () => {
  const collection = mongoose.connection.db.collection('employees');
  const emps = await collection.find({}).toArray();
  emps.forEach(e => console.log('ID:', e.employeeId, 'raw_isActive:', e.isActive));
  process.exit();
}).catch(console.error);
