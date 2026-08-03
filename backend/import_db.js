const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Get the connection string from environment variables
const MONGO_URI = process.env.MONGO_URI;

async function importDatabase() {
  if (!MONGO_URI || MONGO_URI.includes('127.0.0.1') || MONGO_URI.includes('localhost')) {
    console.error('ERROR: MONGO_URI is either undefined or still pointing to localhost/127.0.0.1.');
    console.log('Please ensure your backend/.env file contains your MongoDB Atlas connection string, e.g.:');
    console.log('MONGO_URI="mongodb+srv://<username>:<password>@cluster.mongodb.net/attendance?retryWrites=true&w=majority"');
    process.exit(1);
  }

  try {
    const backupPath = path.join(__dirname, 'attendance_backup.json');
    if (!fs.existsSync(backupPath)) {
      console.error(`ERROR: Backup file not found at ${backupPath}`);
      process.exit(1);
    }

    console.log('Reading database backup...');
    const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected successfully to Atlas cluster!');

    const db = mongoose.connection.db;

    for (const [colName, documents] of Object.entries(backupData)) {
      if (documents.length === 0) continue;
      
      console.log(`Importing ${documents.length} documents into collection: ${colName}...`);
      
      // Clean existing data in the collection to avoid duplicates
      await db.collection(colName).deleteMany({});
      
      // Insert documents directly
      await db.collection(colName).insertMany(documents);
      console.log(`Successfully imported ${colName}`);
    }

    console.log('\n🎉 All collections imported successfully to your MongoDB Atlas cloud database!');
    await mongoose.disconnect();
  } catch (err) {
    console.error('Import failed:', err);
  }
}

importDatabase();
