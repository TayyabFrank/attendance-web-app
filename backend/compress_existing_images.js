require('dotenv').config();
const mongoose = require('mongoose');
const sharp = require('sharp');
const Employee = require('./models/Employee');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority';

async function compressBase64(base64Str) {
  if (!base64Str) return base64Str;
  try {
    const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return base64Str;
    }
    const type = matches[1];
    const data = Buffer.from(matches[2], 'base64');
    
    // Only compress if the image is larger than 100KB to save processing
    if (data.length < 100 * 1024) {
      return base64Str;
    }

    console.log(`Compressing image of size: ${(data.length / 1024).toFixed(2)} KB`);

    const compressedBuffer = await sharp(data)
      .resize({ width: 500, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    console.log(`New size: ${(compressedBuffer.length / 1024).toFixed(2)} KB`);

    return `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;
  } catch (err) {
    console.error('Error compressing image:', err);
    return base64Str; // Return original if error
  }
}

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const employees = await Employee.find({});
    console.log(`Found ${employees.length} employees to check.`);

    for (const emp of employees) {
      let updated = false;

      // Compress single facePhoto
      if (emp.facePhoto && typeof emp.facePhoto === 'string' && emp.facePhoto.length > 200000) { // ~150KB string size
        const compressed = await compressBase64(emp.facePhoto);
        if (compressed !== emp.facePhoto) {
          emp.facePhoto = compressed;
          updated = true;
        }
      }

      // Compress facePhotos array
      if (emp.facePhotos && Array.isArray(emp.facePhotos)) {
        for (let i = 0; i < emp.facePhotos.length; i++) {
          if (emp.facePhotos[i] && emp.facePhotos[i].length > 200000) {
            const compressed = await compressBase64(emp.facePhotos[i]);
            if (compressed !== emp.facePhotos[i]) {
              emp.facePhotos[i] = compressed;
              updated = true;
            }
          }
        }
      }

      if (updated) {
        await emp.save();
        console.log(`Updated images for employee: ${emp.name} (${emp.employeeId})`);
      }
    }

    console.log('Compression complete!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed', err);
    process.exit(1);
  }
}

run();
