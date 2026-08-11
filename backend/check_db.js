const mongoose = require('mongoose');

async function check() {
  await mongoose.connect('mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority');
  const db = mongoose.connection.db;
  
  const ids = ['1', '2', 1, 2];
  const emps = await db.collection('employees').find({ employeeId: { $in: ids } }).toArray();
  console.log("IDs 1 & 2:", emps.map(e => ({ employeeId: e.employeeId, name: e.name, department: e.department, isActive: e.isActive, isDeleted: e.isDeleted, role: e.role })));
  
  const viewers = await db.collection('employees').find({ role: 'viewer-admin' }).toArray();
  console.log("Viewer admins:", viewers.map(e => ({ employeeId: e.employeeId, name: e.name, department: e.department, isActive: e.isActive, isDeleted: e.isDeleted, role: e.role })));

  const allEmps = await db.collection('employees').find({}).toArray();
  console.log("Total employees:", allEmps.length);
  
  const marketingEmps = await db.collection('employees').find({ department: /marketing/i }).toArray();
  console.log("Marketing emps:", marketingEmps.map(e => ({ employeeId: e.employeeId, name: e.name, department: e.department, isActive: e.isActive, isDeleted: e.isDeleted, role: e.role })));

  process.exit(0);
}
check().catch(console.error);
