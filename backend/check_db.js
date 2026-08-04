const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

const EmployeeSchema = new mongoose.Schema({}, { strict: false });
const Employee = mongoose.model('Employee', EmployeeSchema);

async function run() {
  console.log("Connecting to:", MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log("Connected successfully!");

  const all = await Employee.find({});
  console.log(`Total employee documents found: ${all.length}`);

  all.forEach(emp => {
    console.log(`- ID: ${emp.get('employeeId')}, Name: ${emp.get('name')}, Role: ${emp.get('role')}, isDeleted: ${emp.get('isDeleted')}, isActive: ${emp.get('isActive')}`);
  });

  await mongoose.disconnect();
}

run().catch(console.error);
