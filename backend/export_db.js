const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = 'mongodb://127.0.0.1:27017/attendance';

async function exportDatabase() {
  try {
    console.log('Connecting to local MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected successfully!');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    const backup = {};

    for (const colInfo of collections) {
      const colName = colInfo.name;
      // Skip system indexes/collections
      if (colName.startsWith('system.')) continue;
      
      console.log(`Exporting collection: ${colName}...`);
      const documents = await db.collection(colName).find({}).toArray();
      backup[colName] = documents;
      console.log(`Exported ${documents.length} documents from ${colName}`);
    }

    const outputPath = path.join(__dirname, 'attendance_backup.json');
    fs.writeFileSync(outputPath, JSON.stringify(backup, null, 2), 'utf-8');
    console.log(`Backup saved successfully to ${outputPath}`);
    
    await mongoose.disconnect();
    console.log('Disconnected from database.');
  } catch (err) {
    console.error('Export failed:', err);
  }
}

exportDatabase();
