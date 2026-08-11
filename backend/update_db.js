const mongoose = require('mongoose');

async function update() {
  await mongoose.connect('mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority');
  const db = mongoose.connection.db;
  
  await db.collection('employees').updateMany(
    { employeeId: { $in: ['1', '2', 'viewer@gmail.com'] } },
    { $set: { department: 'Marketing' } }
  );

  console.log("Updated employees to Marketing!");
  process.exit(0);
}
update().catch(console.error);
