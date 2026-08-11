require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority';

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const Attendance = require('./models/Attendance');

    const result = await Attendance.updateMany(
      { photo: { $exists: true } },
      { $unset: { photo: 1 } }
    );

    console.log(`Vaporized photos from ${result.modifiedCount} historical attendance logs!`);

    process.exit(0);
  } catch (err) {
    console.error('Deletion failed', err);
    process.exit(1);
  }
}

run();
