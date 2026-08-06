require('dotenv').config();
const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const http = require('http');
const https = require('https');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority';
const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL || 'https://flop-zookeeper-dispose.ngrok-free.dev/extract';

async function extractEmbedding(facePhotoB64, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const payload = JSON.stringify({ facePhoto: facePhotoB64 });

        let requestOptions;
        let client = http;

        try {
          const parsedUrl = new URL(FACE_SERVICE_URL);
          client = parsedUrl.protocol === 'https:' ? https : http;
          requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          };
        } catch (urlErr) {
          return reject(new Error('Invalid FACE_SERVICE_URL configured: ' + urlErr.message));
        }

        const req = client.request(requestOptions, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const data = JSON.parse(body);
                if (data.embedding) return resolve(data.embedding);
                return reject(new Error(data.error || data.detail || 'Failed to extract embedding'));
              } catch (e) {
                return reject(new Error('JSON parse error from face service'));
              }
            } else {
              return reject(new Error(`Face service returned HTTP ${res.statusCode}`));
            }
          });
        });

        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
      });
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const employees = await Employee.find({ facePhoto: { $ne: null, $ne: '' } });
    console.log(`Found ${employees.length} employees with photos to recompute.`);

    for (let emp of employees) {
      if (emp.facePhoto && emp.facePhoto.length > 50) { // arbitrary length to ensure valid base64
        try {
          console.log(`Processing employee: ${emp.employeeId} - ${emp.name}`);
          const embedding = await extractEmbedding(emp.facePhoto);
          emp.faceEmbedding = embedding;
          await emp.save();
          console.log(`Successfully updated embedding for ${emp.employeeId}`);
        } catch (err) {
          console.error(`Failed to process ${emp.employeeId}: ${err.message}`);
        }
      }
    }
    console.log('Finished updating embeddings.');
    process.exit(0);
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
}

run();
