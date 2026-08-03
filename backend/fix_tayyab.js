const mongoose = require('mongoose');
const Employee = require('./models/Employee');

async function fixTayyab() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/attendance');
    console.log('Connected to MongoDB');

    // Find all employees matching tayyab or Tayyab
    const employees = await Employee.find({});
    console.log('All employees in DB:');
    employees.forEach(e => {
      console.log(`ID: ${e._id} | employeeId: ${e.employeeId} | name: ${e.name} | role: ${e.role}`);
    });

    // Update any employee with name or email containing 'tayyab' to super-admin
    const result = await Employee.updateMany(
      { 
        $or: [
          { name: /tayyab/i },
          { employeeId: /tayyab/i },
          { email: /tayyab/i }
        ]
      },
      { $set: { role: 'super-admin' } }
    );

    console.log('Update result:', result);

    const updated = await Employee.find({
      $or: [
        { name: /tayyab/i },
        { employeeId: /tayyab/i },
        { email: /tayyab/i }
      ]
    });
    console.log('Updated Tayyab record(s):', updated);

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error fixing Tayyab role:', err);
  }
}

fixTayyab();
