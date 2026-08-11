const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const morgan = require('morgan');
const Employee = require('./models/Employee');
const Attendance = require('./models/Attendance');
const RequestModel = require('./models/Request');
const Department = require('./models/Department');
const supabase = null;
const OfficeSettings = require('./models/OfficeSettings');
const Holiday = require('./models/Holiday');
const path = require('path');
const { spawn } = require('child_process');

require('dotenv').config();

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}


const https = require('https');

function getCurrentTimeFromInternetOrLocal() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'worldtimeapi.org',
      path: '/api/timezone/Etc/UTC',
      method: 'GET',
      timeout: 1500
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data && data.datetime) {
            const utcD = new Date(data.datetime);
            resolve(utcD);
            return;
          }
        } catch (_) { }
        resolve(new Date());
      });
    });

    req.on('error', () => resolve(new Date()));
    req.on('timeout', () => {
      req.destroy();
      resolve(new Date());
    });
    req.end();
  });
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 540;
  const cleaned = timeStr.trim().toUpperCase();
  const ampmMatch = cleaned.match(/^(\d+):(\d+)\s*(AM|PM)$/);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const ampm = ampmMatch[3];
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const twentyFourMatch = cleaned.match(/^(\d+):(\d+)$/);
  if (twentyFourMatch) {
    const hours = parseInt(twentyFourMatch[1], 10);
    const minutes = parseInt(twentyFourMatch[2], 10);
    return hours * 60 + minutes;
  }
  return 540;
}

function calculateHoursWorked(checkIn, checkOut) {
  if (!checkIn || checkIn === '--:--' || !checkOut || checkOut === '--:--') return 0;
  const inMins = timeToMinutes(checkIn);
  const outMins = timeToMinutes(checkOut);
  if (outMins > inMins) {
    return (outMins - inMins) / 60;
  }
  return 0;
}

async function getWeeklyHoursCompleted(employeeId) {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const logs = await Attendance.find({
      employeeId: employeeId,
      createdAt: { $gte: startOfWeek }
    });

    let totalHours = 0;
    for (const log of logs) {
      if (log.checkIn && log.checkIn !== '--:--' && log.checkOut && log.checkOut !== '--:--') {
        totalHours += calculateHoursWorked(log.checkIn, log.checkOut);
      }
    }
    return totalHours;
  } catch (err) {
    console.error('Error calculating weekly hours:', err);
    return 0;
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_system_secret_key_production_grade_123!';

const http = require('http');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function extractEmbedding(facePhotoB64, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const payload = JSON.stringify({ facePhoto: facePhotoB64 });

        let requestOptions;
        let client = http;

        const faceServiceUrl = process.env.FACE_SERVICE_URL || 'https://flop-zookeeper-dispose.ngrok-free.dev/extract';
        
        if (faceServiceUrl) {
          try {
            const parsedUrl = new URL(faceServiceUrl);
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
              try {
                const data = JSON.parse(body);
                // If it's a 400 error (like spoofing detected), do NOT retry. Bubble up immediately.
                if (res.statusCode === 400) {
                  return reject(new Error(data.error || data.detail || 'Face validation failed'));
                }
                return reject(new Error(data.error || data.detail || `HTTP error ${res.statusCode}`));
              } catch (_) {
                return reject(new Error(`Face service returned HTTP ${res.statusCode}`));
              }
            }
          });
        });

        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
      });
    } catch (err) {
      // If it's a validation error (e.g. Spoofing), don't retry, just throw.
      if (err.message.includes('Spoofing') || err.message.includes('No face detected') || err.message.includes('validation failed')) {
        throw err;
      }
      if (attempt === retries) {
        throw new Error('Face scan service is currently offline or busy. Please try again in a moment or use the password option.');
      }
      console.warn(`[FaceService] Request failed (attempt ${attempt}/${retries}): ${err.message}. Retrying in 1.5s...`);
      await wait(1500);
    }
  }
}

const app = express();

// Required for rate limiting to work behind Vercel's proxy
app.set('trust proxy', 1);

// Security and Optimization Middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Allows cross-origin image loading if needed
}));
app.use(mongoSanitize());
app.use(compression());
app.use(morgan('dev'));

// Payload size limit to accept base64 image data URIs
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins for capacitor & local development ease
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-role']
}));

// Apply Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// Apply Rate Limiting to prevent brute-force attacks on sensitive endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { error: 'Too many authentication attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/admin-login', loginLimiter);
app.use('/api/scan-attendance', rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  message: { error: 'Too many face verification attempts. Please try again in 5 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Serve well‑known static files (e.g., Chrome DevTools JSON)
app.use('/.well-known', express.static(path.join(__dirname, '.well-known')));

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority';

// --- Global In-Memory Cache for Blazing Fast Scans ---
let employeeFaceCache = [];
async function refreshFaceCache() {
  try {
    const allEmployees = await Employee.find({ role: 'employee', isDeleted: { $ne: true }, isActive: true })
                                     .select('_id employeeId name faceEmbedding')
                                     .lean(); // .lean() makes queries faster by returning plain JSON
    employeeFaceCache = allEmployees.filter(emp => emp.faceEmbedding && emp.faceEmbedding.length > 0);
    console.log(`[Cache] Loaded ${employeeFaceCache.length} employee face embeddings into memory.`);
  } catch (err) {
    console.error('[Cache] Failed to load employee face embeddings:', err.message);
  }
}

mongoose.set('bufferCommands', true); // Allow commands to buffer while connecting (Fix for Vercel cold starts)
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000
})
  .then(async () => {
    console.log('Connected to MongoDB');
    await seedAdmins();
    await seedDepartments();
    // Do not await this, let it load in the background so Vercel Serverless doesn't timeout!
    refreshFaceCache().catch(console.error);
  })
  .catch(err => console.error('MongoDB connection error:', err.message));

// Global middleware to check MongoDB connection status for API routes (Serverless-friendly)
app.use('/api', async (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    try {
      console.log('[Database] Connection not ready. Awaiting/initiating connection...');
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000
      });
    } catch (err) {
      return res.status(503).json({
        error: 'MongoDB Database Service is currently stopped or offline. Please check your Atlas connection. Error: ' + err.message
      });
    }
  }
  next();
});

// Initial seeding of Admin accounts if they don't exist
async function seedAdmins() {
  try {
    // 2. Seed admins
    const adminsToSeed = [
      { email: 'tayyabfrank@gmail.com', name: 'Tayyab Frank', role: 'super-admin', pass: 'Tayyab1234' },
      { email: 'atif@gmail.com', name: 'Atif Khan', role: 'hr-admin', pass: 'Atif1234' },
      { email: 'viewer@gmail.com', name: 'Viewer Admin', role: 'viewer-admin', pass: 'Viewer1234' }
    ];

    for (const admin of adminsToSeed) {
      const exists = await Employee.findOne({ employeeId: admin.email });
      if (!exists) {
        const hashedPassword = await bcrypt.hash(admin.pass, 10);
        await Employee.create({
          _id: admin.email,
          name: admin.name,
          employeeId: admin.email,
          password: hashedPassword,
          facePhoto: 'data:image/svg+xml;utf8,<svg></svg>',
          facePhotos: [],
          role: admin.role,
          department: 'Management'
        });
        console.log(`Seeded admin account: ${admin.email} as ${admin.role}`);

        if (supabase) {
          try {
            await supabase.from('profiles').upsert({
              name: admin.name,
              employee_id: admin.email,
              password: hashedPassword,
              role: admin.role,
              face_photo: 'data:image/svg+xml;utf8,<svg></svg>',
              face_photos: [],
              department: 'Management'
            });
          } catch (sbErr) {
            console.error(`Failed to seed admin ${admin.email} in Supabase:`, sbErr);
          }
        }
      } else {
        // Ensure role is updated to the intended role
        await Employee.updateOne({ employeeId: admin.email }, { $set: { role: admin.role } });
        console.log(`Updated admin account role: ${admin.email} as ${admin.role}`);
      }
    }
  } catch (err) {
    console.error('Error seeding admins:', err);
  }
}

async function seedDepartments() {
  try {
    const defaults = ['Engineering', 'Marketing', 'HR', 'Sales', 'Finance'];
    for (const dept of defaults) {
      const exists = await Department.findOne({ name: dept });
      if (!exists) {
        await Department.create({ name: dept });
        console.log(`Seeded department: ${dept}`);
      }
    }
  } catch (err) {
    console.error('Error seeding departments:', err);
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Attendance backend running.' });
});

// Admin login endpoint
app.post('/api/admin-login', async (req, res) => {
  const { email, employeeId, password } = req.body;
  const identifier = email || employeeId;
  console.log('[Login API] Attempting login for:', identifier);

  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email/EmployeeId and password required.' });
  }
  try {
    const admin = await Employee.findOne({ employeeId: identifier });
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found.' });
    }
    let match = false;
    if (admin.password) {
      try {
        match = await bcrypt.compare(password, admin.password);
      } catch (e) {
        match = false;
      }
    }
    if (!match && admin.password && password === admin.password) {
      match = true;
    }
    if (!match && admin.plainPassword && password === admin.plainPassword) {
      match = true;
    }
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Auto-migrate missing plainPassword for Admins
    if (!admin.plainPassword) {
      try {
        await Employee.updateOne({ employeeId: identifier }, { $set: { plainPassword: password } });
      } catch (e) {
        console.error('Error auto-migrating plainPassword:', e);
      }
    }

    // Sign JWT containing identity & authorization claims
    const token = jwt.sign(
      { id: admin._id, employeeId: admin.employeeId, role: admin.role, name: admin.name, department: admin.department },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Send JWT token inside an HTTP-Only secure cookie to protect against XSS token extraction
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });

    console.log('[Login API] Authentication successful for:', identifier, 'role:', admin.role);
    return res.json({
      success: true,
      token,
      employee: {
        employeeId: admin.employeeId,
        name: admin.name,
        role: admin.role,
        department: admin.department,
        plainPassword: password
      }
    });
  } catch (err) {
    console.error('[Login API] Admin login error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// Admin logout endpoint
app.post('/api/admin-logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully' });
});

// --- RBAC Middleware (JWT Verification) ---
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // 1. Get token from cookies or authorization header fallback
    let token = req.cookies.token;
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required: Session token is missing.' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded; // Store identity claim in request context

      if (!allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ error: `Access denied: Role '${decoded.role}' is not authorized.` });
      }
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    }
  };
};

// Verify admin session token route
app.get('/api/admin/verify-session', requireRole(['admin', 'super-admin', 'hr-admin', 'viewer-admin', 'sub-admin']), (req, res) => {
  return res.json({ success: true, user: req.user });
});

app.get('/api/scan-attendance', (req, res) => {
  const token = require('crypto').randomBytes(16).toString('hex');
  res.json({ token });
});

app.post('/api/scan-attendance', async (req, res) => {
  try {
    const { frameA, frameB, token, timestamp, signature, employeeId } = req.body;

    if (!frameB) {
      return res.status(400).json({ error: 'No camera frame provided for face scanning.' });
    }

    let queryEmbedding;
    try {
      const framesInput = (frameA && frameB) ? [frameA, frameB] : frameB;
      queryEmbedding = await extractEmbedding(framesInput);
    } catch (err) {
      console.error('Failed to extract face embedding on scan:', err);
      return res.status(400).json({ error: err.message || 'Biometric verification failed' });
    }

    let matchedEmployee = null;
    let highestSimilarity = 0.0;

    if (employeeId) {
      const emp = await Employee.findOne({ employeeId: employeeId.trim(), isDeleted: { $ne: true } });
      if (!emp) {
        return res.status(404).json({ error: 'Logged-in employee profile not found.' });
      }
      if (!emp.isActive) {
        return res.status(403).json({ error: 'Your account is inactive. Please contact the administrator.' });
      }
      if (!emp.faceEmbedding || emp.faceEmbedding.length === 0) {
        return res.status(400).json({ error: 'Biometric profile not configured for your account.' });
      }

      const similarity = queryEmbedding.reduce((sum, val, idx) => sum + val * emp.faceEmbedding[idx], 0);
      highestSimilarity = similarity;

      if (similarity >= 0.40) {
        matchedEmployee = emp;
      } else {
        return res.status(403).json({ error: `Face verification failed: Biometrics do not match your profile (${(similarity * 100).toFixed(1)}%)` });
      }
    } else {
      // BLAZING FAST CACHE LOOKUP
      for (const emp of employeeFaceCache) {
        const similarity = queryEmbedding.reduce((sum, val, idx) => sum + val * emp.faceEmbedding[idx], 0);
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          if (similarity >= 0.40) {
            matchedEmployee = emp;
          }
        }
      }
    }

    if (!matchedEmployee) {
      return res.status(404).json({ error: 'Face print not matched in corporate database.' });
    }

    const now = await getCurrentTimeFromInternetOrLocal();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Karachi' });
    let log = await Attendance.findOne({ employeeId: matchedEmployee.employeeId, date: dateStr });

    let action = 'check-in';
    if (log) {
      if (log.checkOut === '--:--') {
        action = 'check-out';
      } else {
        action = 'already-completed';
      }
    }

    // Fetch the photo only after a successful match to save massive bandwidth and RAM
    let employeePhoto = matchedEmployee.facePhoto;
    if (!employeePhoto) {
      const empDb = await Employee.findOne({ employeeId: matchedEmployee.employeeId }).select('facePhoto').lean();
      if (empDb) employeePhoto = empDb.facePhoto;
    }

    return res.json({
      success: true,
      employee: {
        employeeId: matchedEmployee.employeeId,
        name: matchedEmployee.name,
        photo: employeePhoto
      },
      action,
      confidence: `${(highestSimilarity * 100).toFixed(1)}%`,
      scannedPhoto: frameB
    });

  } catch (err) {
    console.error('Scan attendance error:', err);
    res.status(500).json({ error: 'Internal server scan verification error: ' + err.message });
  }
});

// --- API ROUTES ---

// 1. Authentication - Register (Disabled for public access)
app.post('/api/auth/register', async (req, res) => {
  return res.status(403).json({ error: 'Registration is restricted to the Administrator Portal only.' });
});

// 2. Authentication - Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res.status(400).json({ error: 'Employee/Admin ID and password are required' });
    }

    let employee;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('employee_id', employeeId.trim())
          .single();
        if (!error && data) {
          employee = {
            _id: data.id,
            name: data.name,
            employeeId: data.employee_id,
            password: data.password,
            role: data.role,
            facePhoto: data.face_photo
          };
        }
      } catch (sbErr) {
        console.error('Supabase login check failed:', sbErr);
      }
    }

    if (!employee) {
      const mongoEmp = await Employee.findOne({ employeeId: employeeId.trim() });
      if (mongoEmp) {
        employee = {
          _id: mongoEmp._id,
          name: mongoEmp.name,
          employeeId: mongoEmp.employeeId,
          password: mongoEmp.password,
          role: mongoEmp.role,
          facePhoto: mongoEmp.facePhoto,
          adminMessage: mongoEmp.adminMessage,
          isActive: mongoEmp.isActive
        };
      }
    }

    if (!employee) {
      return res.status(400).json({ error: 'Invalid Employee/Admin ID or Password' });
    }

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid Employee/Admin ID or Password' });
    }

    // Auto-migrate missing plainPassword in MongoDB
    try {
      const dbEmp = await Employee.findOne({ employeeId: employeeId.trim() });
      if (dbEmp && !dbEmp.plainPassword) {
        await Employee.updateOne({ employeeId: employeeId.trim() }, { $set: { plainPassword: password } });
      }
    } catch (e) {
      console.error('Error auto-migrating plainPassword:', e);
    }

    res.json({
      message: 'Login successful',
      employee: {
        id: employee._id,
        name: employee.name,
        employeeId: employee.employeeId,
        role: employee.role,
        facePhoto: employee.facePhoto,
        adminMessage: employee.adminMessage,
        isActive: employee.isActive,
        plainPassword: password
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Helper to sync Attendance logs to Supabase
async function syncAttendanceToSupabase(log) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('attendance')
      .upsert({
        id: log._id ? log._id.toString() : log.id,
        employee_id: log.employeeId,
        name: log.name,
        date: log.date,
        check_in: log.checkIn,
        check_out: log.checkOut,
        status: log.status,
        confidence: log.confidence,
        photo: log.photo,
        tasks: log.tasks || '',
        work_done: log.workDone || '',
        created_at: log.createdAt || new Date()
      });
    if (error) {
      console.error('Error syncing to Supabase:', error.message);
    } else {
      console.log('Successfully synced attendance record to Supabase');
    }
  } catch (err) {
    console.error('Supabase sync exception:', err);
  }
}

// 3. Attendance - Scan / Mark Attendance (Face Match simulation & PIN logic)
app.post('/api/attendance/scan', async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res.status(400).json({ error: 'Employee ID and Password are required.' });
    }

    const targetId = employeeId.trim();
    const employee = await Employee.findOne({
      $or: [
        { employeeId: targetId },
        { employeeId: new RegExp(`^${targetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      ],
      isDeleted: { $ne: true }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    if (!employee.isActive) {
      return res.status(403).json({ error: 'Your account is inactive. Please contact the administrator.' });
    }

    if (!employee.password && !employee.plainPassword) {
      return res.status(400).json({ error: 'No password set for this employee account. Please contact your administrator.' });
    }

    let isMatch = false;
    if (employee.password) {
      try {
        isMatch = await bcrypt.compare(password, employee.password);
      } catch (bErr) {
        console.error('Bcrypt comparison error during attendance scan:', bErr);
        isMatch = false;
      }
    }

    if (!isMatch && employee.password && password === employee.password) {
      isMatch = true;
    }

    if (!isMatch && employee.plainPassword && password === employee.plainPassword) {
      isMatch = true;
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password provided for this employee.' });
    }

    let now;
    try {
      now = await getCurrentTimeFromInternetOrLocal();
    } catch (tErr) {
      console.error('Error getting time during attendance scan:', tErr);
      now = new Date();
    }
    if (!now || isNaN(now.getTime())) {
      now = new Date();
    }

    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Karachi' });
    let log = await Attendance.findOne({ employeeId: employee.employeeId, date: dateStr });

    let action = 'check-in';
    if (log) {
      if (log.checkOut === '--:--') {
        action = 'check-out';
      } else {
        action = 'already-completed';
      }
    }

    return res.json({
      success: true,
      employee: {
        employeeId: employee.employeeId,
        name: employee.name,
        photo: employee.facePhoto
      },
      action,
      confidence: '--'
    });

  } catch (err) {
    console.error('Scan credentials verification error:', err);
    res.status(500).json({ error: 'Server error during credentials verification: ' + (err.message || 'Unknown error') });
  }
});

// 3.5. Complete check-in or checkout with tasks/work validation and database writes
app.post('/api/attendance/submit-log', async (req, res) => {
  try {
    const { employeeId, action, tasks, workDone, confidence, photo, latitude, longitude, timezoneOffset } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID is required.' });
    }

    // Geofencing and VPN Checks
    const settings = await OfficeSettings.findOne();
    if (settings) {
      // Only enforce Geofencing if geofenceEnabled is true (not disabled/nullified)
      if (settings.geofenceEnabled !== false) {
        let isWithinGeofence = false;

        if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
          const distance = getDistanceInMeters(
            Number(latitude),
            Number(longitude),
            settings.officeLatitude,
            settings.officeLongitude
          );
          if (distance <= settings.allowedRadius) {
            isWithinGeofence = true;
          } else {
            return res.status(400).json({
              error: `Access denied. You are ${Math.round(distance)}m away from the office. Allowed radius is ${settings.allowedRadius}m.`
            });
          }
        } else {
          return res.status(400).json({ error: 'Location coordinates are required to mark attendance when Geofencing is enabled.' });
        }
      }

      // VPN Check: Only enforced if VPN check is enabled
      if (settings.vpnCheckEnabled) {
        // Pakistan Standard Time is UTC+5, meaning timezoneOffset should be -300 minutes.
        // We allow up to 60 minutes of deviation to account for daylight saving time or minor clock drift.
        if (timezoneOffset !== undefined && Math.abs(Number(timezoneOffset) - (-300)) > 60) {
          return res.status(400).json({
            error: 'VPN or Location Spoofing detected. Please disable your VPN and ensure your system time zone is correct.'
          });
        }
      }

      // 🚨 Mock Location / Fake GPS Detection 🚨
      // Real GPS accuracy is almost never perfectly 1.0 or 0.0 meters. Fake GPS apps often hardcode this.
      // We also check for the explicit isMocked flag (if the native plugin exposes it).
      if (settings.geofenceEnabled !== false) {
          const acc = req.body.accuracy;
          if (req.body.isMocked === true || acc === 1 || acc === 0 || acc === 5.0) {
              return res.status(400).json({ 
                  error: 'Fake GPS / Mock Location detected! Please disable coordinate changers to mark attendance.' 
              });
          }
      }
    }

    const employee = await Employee.findOne({ employeeId: employeeId.trim(), isDeleted: { $ne: true } });
    if (!employee) {
      return res.status(404).json({ error: 'Employee profile not found.' });
    }

    const now = await getCurrentTimeFromInternetOrLocal();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Karachi' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });

    // --- Holiday Check ---
    const pkDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }); // Returns YYYY-MM-DD
    const [pkYear, pkMonth, pkDay] = pkDateStr.split('-');
    const dateObj = new Date(Date.UTC(parseInt(pkYear), parseInt(pkMonth) - 1, parseInt(pkDay)));
    const isHoliday = await Holiday.findOne({ date: dateObj });
    const dayOfWeek = now.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isSatOff = settings && settings.saturdayOff && dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;

    if (action === 'check-in' && (isHoliday || isSunday || isSatOff)) {
      let reason = 'a Holiday';
      if (isSunday || isSatOff) reason = 'a Weekend';
      if (isHoliday) reason = `a Holiday (${isHoliday.name})`;
      return res.status(400).json({ error: `Cannot check in today. It is ${reason}. Enjoy your day off!` });
    }
    // ---------------------

    let log = await Attendance.findOne({ employeeId: employee.employeeId, date: dateStr });

    const initialStatus = isWeekend ? 'Pending' : 'Present';

    if (action === 'check-out') {
      if (!log) {
        return res.status(400).json({ error: 'Cannot check out without checking in first.' });
      }
      if (log.checkOut !== '--:--') {
        return res.status(400).json({ error: 'Already checked out for today.' });
      }

      log.checkOut = timeStr;
      log.workDone = '';
      if (isWeekend) {
        log.status = 'Pending';
      }
      await log.save();
      await syncAttendanceToSupabase(log);

      const todayHours = calculateHoursWorked(log.checkIn, timeStr);
      const weeklyHoursCompleted = await getWeeklyHoursCompleted(employee.employeeId);

      return res.json({
        message: 'Checked out successfully',
        log,
        employeeName: employee.name,
        employeePhoto: employee.facePhoto,
        stats: {
          todayHours: todayHours.toFixed(1),
          weeklyHoursCompleted: weeklyHoursCompleted.toFixed(1),
          weeklyHoursTarget: employee.weeklyHours || 40,
          employeeType: employee.employeeType || 'employee',
          isLate: log.isLate
        }
      });
    } else if (action === 'check-in') {
      if (log) {
        return res.status(400).json({ error: 'Already checked in for today.' });
      }

      const isLate = timeToMinutes(timeStr) > timeToMinutes(employee.arrivalTime || '09:00 AM');
      const logId = `${employee.employeeId}_${now.toISOString().split('T')[0].replace(/-/g, '')}`;

      const newLog = new Attendance({
        _id: logId,
        employeeId: employee.employeeId,
        name: employee.name,
        date: dateStr,
        checkIn: timeStr,
        checkOut: '--:--',
        status: initialStatus,
        isLate: isLate,
        confidence: confidence || '--',
        photo: photo || employee.facePhoto,
        tasks: '',
        workDone: ''
      });

      await newLog.save();
      await syncAttendanceToSupabase(newLog);

      const weeklyHoursCompleted = await getWeeklyHoursCompleted(employee.employeeId);

      return res.json({
        message: isWeekend ? 'Checked in successfully, pending admin approval.' : 'Checked in successfully',
        log: newLog,
        employeeName: employee.name,
        employeePhoto: employee.facePhoto,
        stats: {
          todayHours: '0.0',
          weeklyHoursCompleted: weeklyHoursCompleted.toFixed(1),
          weeklyHoursTarget: employee.weeklyHours || 40,
          employeeType: employee.employeeType || 'employee',
          isLate: isLate
        }
      });
    } else {
      return res.status(400).json({ error: 'Invalid attendance action.' });
    }
  } catch (err) {
    console.error('Submit log error:', err);
    res.status(500).json({ error: 'Server error during log submission.' });
  }
});

// 4. Get attendance logs for a specific employee
app.get('/api/attendance/logs/:employeeId', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('attendance').select('id, employee_id, name, date, check_in, check_out, status, confidence').eq('employee_id', req.params.employeeId.trim());
      if (!error && data) {
        const logs = data.map(log => ({
          _id: log.id,
          employeeId: log.employee_id,
          name: log.name,
          date: log.date,
          checkIn: log.check_in,
          checkOut: log.check_out,
          status: log.status,
          confidence: log.confidence
        }));
        return res.json(logs);
      }
    }
    const logs = await Attendance.find({ employeeId: req.params.employeeId.trim() }).select('-photo');
    res.json(logs);
  } catch (err) {
    console.error('Fetch logs error:', err);
    res.status(500).json({ error: 'Server error retrieving logs' });
  }
});

// 5. Get all attendance logs (Admin)
app.get('/api/attendance/logs', requireRole(['admin', 'super-admin', 'hr-admin', 'viewer-admin', 'sub-admin']), async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('attendance').select('id, employee_id, name, date, check_in, check_out, status, confidence').order('created_at', { ascending: false }).limit(3000);
      if (!error && data) {
        const logs = data.map(log => ({
          _id: log.id,
          employeeId: log.employee_id,
          name: log.name,
          date: log.date,
          checkIn: log.check_in,
          checkOut: log.check_out,
          status: log.status,
          confidence: log.confidence
        }));
        return res.json(logs);
      }
    }
    const logs = await Attendance.find({}).select('-photo').sort({ createdAt: -1 }).limit(3000);
    res.json(logs);
  } catch (err) {
    console.error('Fetch all logs error:', err);
    res.status(500).json({ error: 'Server error retrieving all logs' });
  }
});

// 5.5 Get optimized Dashboard Data (Admin)
app.get('/api/admin/dashboard-data', requireRole(['admin', 'super-admin', 'hr-admin', 'viewer-admin', 'sub-admin']), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 200;
    const skip = (page - 1) * limit;

    let empFilter = { isDeleted: { $ne: true } };
    if (req.user.role === 'sub-admin') {
      empFilter.department = req.user.department;
    }
    const statusFilter = req.query.status;
    if (statusFilter === 'active') empFilter.isActive = { $ne: false };
    else if (statusFilter === 'inactive') empFilter.isActive = false;

    // Concurrently fetch employees, recent logs, and recent requests
    const [empDataRes, logsRes, reqDataRes] = await Promise.all([
      // Employees
      (async () => {
        if (supabase) {
          const { data } = await supabase.from('profiles').select('id, employee_id, name, department, role, departure_time').range(skip, skip + limit - 1);
          if (data) return data.map(emp => ({
            _id: emp.id, employeeId: emp.employee_id, name: emp.name, department: emp.department || 'Engineering', role: emp.role, isActive: true, departureTime: emp.departure_time || '05:00 PM', adminMessage: ''
          }));
        }
        return await Employee.find(empFilter).select('-password -pin -facePhotos -faceEmbedding -facePhoto').skip(skip).limit(limit).lean();
      })(),
      // Logs
      (async () => {
        if (supabase) {
          const { data } = await supabase.from('attendance').select('id, employee_id, name, date, check_in, check_out, status, confidence').order('created_at', { ascending: false }).limit(200);
          if (data) return data.map(log => ({
            _id: log.id, employeeId: log.employee_id, name: log.name, date: log.date, checkIn: log.check_in, checkOut: log.check_out, status: log.status, confidence: log.confidence
          }));
        }
        return await Attendance.find({}).select('-photo').sort({ createdAt: -1 }).limit(200).lean();
      })(),
      // Requests
      (async () => {
        if (supabase) {
          const { data } = await supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(100);
          if (data) return data.map(r => ({
             _id: r.id, employeeId: r.employee_id, employeeName: r.employee_name,
             type: r.type, reason: r.reason, status: r.status, createdAt: r.created_at, date: r.date
          }));
        }
        return await RequestModel.find({}).sort({ createdAt: -1 }).limit(100).lean();
      })()
    ]);

    res.json({
      employees: empDataRes || [],
      logs: logsRes || [],
      requests: reqDataRes || []
    });
  } catch (err) {
    console.error('Fetch dashboard data error:', err);
    res.status(500).json({ error: 'Server error retrieving dashboard data' });
  }
});

// 6. Get all employees (Admin)
app.get('/api/employees', requireRole(['admin', 'super-admin', 'hr-admin', 'viewer-admin', 'sub-admin']), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const skip = (page - 1) * limit;

    let filter = { isDeleted: { $ne: true } };
    if (req.user.role === 'sub-admin') {
      filter.department = req.user.department; // Assume branch == department for now
    }

    const status = req.query.status;
    if (status === 'active') {
      filter.isActive = { $ne: false };
    } else if (status === 'inactive') {
      filter.isActive = false;
    }

    if (supabase) {
      const { data, error } = await supabase.from('profiles').select('id, employee_id, name, department, role, departure_time').range(skip, skip + limit - 1);
      if (!error && data) {
        const employees = data.map(emp => ({
          _id: emp.id,
          employeeId: emp.employee_id,
          name: emp.name,
          department: emp.department || 'Engineering',
          role: emp.role,
          isActive: true, // fallback if not tracked in supabase
          departureTime: emp.departure_time || '05:00 PM',
          adminMessage: ''
        }));
        return res.json({ employees, page, limit });
      }
    }
    const employees = await Employee.find(filter).select('-password -pin -facePhotos -faceEmbedding').skip(skip).limit(limit);
    const total = await Employee.countDocuments(filter);
    res.json({ employees, page, limit, total });
  } catch (err) {
    console.error('Fetch employees error:', err);
    res.status(500).json({ error: 'Server error retrieving employees' });
  }
});

// 6.5 Serve Employee Face Photo as an Image
app.get('/api/employees/:employeeId/photo', async (req, res) => {
  try {
    const { employeeId } = req.params;
    let base64Photo = null;

    if (supabase) {
      const { data } = await supabase.from('profiles').select('face_photo').eq('employee_id', employeeId.trim()).single();
      if (data && data.face_photo) base64Photo = data.face_photo;
    }

    if (!base64Photo) {
      const employee = await Employee.findOne({ employeeId: employeeId.trim() }).select('facePhoto facePhotos');
      if (employee) {
        if (employee.facePhoto) base64Photo = employee.facePhoto;
        else if (employee.facePhotos && employee.facePhotos.length > 0) base64Photo = employee.facePhotos[0];
      }
    }

    if (!base64Photo || !base64Photo.startsWith('data:image')) {
      return res.redirect('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150');
    }

    const matches = base64Photo.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.redirect('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150');
    }

    const mimeType = matches[1];
    const imageBuffer = Buffer.from(matches[2], 'base64');

    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(imageBuffer);
  } catch (err) {
    console.error('Fetch photo error:', err);
    res.redirect('https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150');
  }
});

// 7. Add a new employee (Admin only)
app.post('/api/employees', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const { name, department, password, facePhotos, role, employeeType, weeklyHours, arrivalTime, departureTime } = req.body;

    if (!name || !department || !password || !facePhotos || !facePhotos.length) {
      return res.status(400).json({ error: 'Name, Department, Password, and 4-5 Face Photos are required' });
    }

    // Query the last employee created regardless of role to find the actual maximum ID
    const lastEmployee = await Employee.findOne({}).sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastEmployee && lastEmployee.employeeId) {
      // If it is an email (like seeded admins), ignore it for numeric auto-increment ID
      if (!lastEmployee.employeeId.includes('@')) {
        const lastIdDirect = parseInt(lastEmployee.employeeId, 10);
        if (!isNaN(lastIdDirect)) {
          nextNum = lastIdDirect + 1;
        } else {
          const match = lastEmployee.employeeId.match(/EMP-(\d+)/);
          if (match) {
            nextNum = parseInt(match[1], 10) + 1;
          }
        }
      }
    }

    // If the nextNum still collides with an existing ID, auto-increment until unique
    let generatedId = String(nextNum);
    let idCollision = await Employee.findOne({ employeeId: generatedId });
    while (idCollision) {
      nextNum++;
      generatedId = String(nextNum);
      idCollision = await Employee.findOne({ employeeId: generatedId });
    }

    let embedding;
    try {
      embedding = await extractEmbedding(facePhotos);
    } catch (err) {
      console.error('Failed to extract face embedding:', err);
      return res.status(400).json({ error: 'Biometric verification setup failed: ' + err.message });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const primaryPhoto = facePhotos[0];
    const targetRole = role || 'employee';

    // Role Hierarchy Checks
    if (req.user.role === 'sub-admin') {
      if (targetRole !== 'employee') return res.status(403).json({ error: 'Sub-admins can only create employees.' });
      if (department !== req.user.department) return res.status(403).json({ error: 'Sub-admins can only create employees in their own branch.' });
    }
    if (req.user.role === 'admin') {
      if (targetRole === 'super-admin') return res.status(403).json({ error: 'Admins cannot create Super-Admins.' });
    }

    if (supabase) {
      try {
        const { error: sbError } = await supabase
          .from('profiles')
          .upsert({
            name: name.trim(),
            employee_id: generatedId,
            face_embedding: embedding,
            password: hashedPassword,
            role: targetRole,
            face_photo: primaryPhoto,
            face_photos: facePhotos,
            department: department.trim(),
            departure_time: departureTime || '05:00 PM'
          });
        if (sbError) {
          console.error('Supabase profile sync error:', sbError.message);
          return res.status(500).json({ error: 'Supabase profile sync failed: ' + sbError.message });
        }
      } catch (sbErr) {
        console.error('Supabase profile exception:', sbErr);
        return res.status(500).json({ error: 'Supabase integration error: ' + sbErr.message });
      }
    }

    const newEmp = new Employee({
      _id: generatedId,
      name: name.trim(),
      employeeId: generatedId,
      password: hashedPassword,
      plainPassword: password,
      facePhoto: primaryPhoto,
      facePhotos: facePhotos,
      department: department.trim(),
      role: targetRole,
      faceEmbedding: embedding,
      employeeType: employeeType || 'employee',
      weeklyHours: weeklyHours ? parseInt(weeklyHours, 10) : 40,
      arrivalTime: arrivalTime || '09:00 AM',
      departureTime: departureTime || '05:00 PM'
    });

    await newEmp.save();
    // Re-sync cache for blazing fast face matching
    await refreshFaceCache();
    res.status(201).json(newEmp);
  } catch (err) {
    console.error('Add employee error:', err);
    res.status(500).json({ error: 'Server error creating employee' });
  }
});

// 8. Submit Correction or Message Request
// 8. Submit Correction or Message Request
app.post('/api/requests', async (req, res) => {
  try {
    const { employeeId, name, requestType, details, targetAdmins } = req.body;

    if (!employeeId || !name || !requestType || !details) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    let finalAdmins = [];
    if (Array.isArray(targetAdmins) && targetAdmins.length > 0) {
      finalAdmins = targetAdmins;
    } else {
      finalAdmins = [{ adminId: 'all', adminName: 'All Admins' }];
    }

    const crypto = require('crypto');
    const requestId = crypto.randomUUID();

    if (supabase) {
      try {
        await supabase.from('requests').insert({
          id: requestId,
          employee_id: employeeId.trim(),
          name: name.trim(),
          request_type: requestType,
          details: details,
          status: 'Pending',
          target_admins: finalAdmins,
          admin_seen: false,
          employee_seen: true,
          messages: [{
            senderId: employeeId.trim(),
            senderName: name.trim(),
            senderRole: 'employee',
            text: `Submitted Correction Request: ${details}`
          }]
        });
      } catch (sbErr) {
        console.error('Supabase requests insert failed:', sbErr);
      }
    }

    const newRequest = new RequestModel({
      _id: requestId,
      employeeId: employeeId.trim(),
      name: name.trim(),
      requestType,
      details,
      targetAdmins: finalAdmins,
      messages: [{
        senderId: employeeId.trim(),
        senderName: name.trim(),
        senderRole: 'employee',
        text: `Submitted Correction Request: ${details}`
      }],
      employeeSeen: true,
      adminSeen: false
    });

    await newRequest.save();
    res.status(201).json({ message: 'Request submitted successfully', request: newRequest });
  } catch (err) {
    console.error('Submit request error:', err);
    res.status(500).json({ error: 'Server error submitting request' });
  }
});

// Get requests for a specific employee
app.get('/api/requests/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const requests = await RequestModel.find({ employeeId: employeeId.trim() }).sort({ createdAt: -1 }).limit(500);
    res.json(requests);
  } catch (err) {
    console.error('Fetch employee requests error:', err);
    res.status(500).json({ error: 'Server error fetching employee requests' });
  }
});

// Post message to request thread
app.post('/api/requests/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { senderId, senderName, senderRole, text } = req.body;
    if (!text || !senderId || !senderName) {
      return res.status(400).json({ error: 'Message content and sender details are required.' });
    }

    const request = await RequestModel.findById(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    request.messages.push({
      senderId,
      senderName,
      senderRole,
      text
    });

    if (senderRole === 'admin') {
      request.employeeSeen = false;
      request.adminSeen = true;
    } else {
      request.employeeSeen = true;
      request.adminSeen = false;
    }

    await request.save();

    if (supabase) {
      try {
        await supabase
          .from('requests')
          .update({
            messages: request.messages,
            employee_seen: request.employeeSeen,
            admin_seen: request.adminSeen
          })
          .eq('id', id);
      } catch (sbErr) {
        console.error('Failed to sync message to Supabase:', sbErr);
      }
    }

    res.status(201).json(request);
  } catch (err) {
    console.error('Post request message error:', err);
    res.status(500).json({ error: 'Server error posting message' });
  }
});

// Mark request as seen by employee
app.post('/api/requests/:id/employee-seen', async (req, res) => {
  try {
    const request = await RequestModel.findById(req.params.id);
    if (request) {
      request.employeeSeen = true;
      await request.save();
    }
    res.json({ message: 'Seen status marked' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error marking seen status' });
  }
});

// Get all admins (visible to logged-in employees)
app.get('/api/admins', async (req, res) => {
  try {
    const admins = await Employee.find(
      { role: { $in: ['admin', 'super-admin', 'hr-admin'] }, isDeleted: { $ne: true } },
      { _id: 1, name: 1, role: 1, employeeId: 1 }
    );
    res.json(admins);
  } catch (err) {
    console.error('Fetch admins error:', err);
    res.status(500).json({ error: 'Server error retrieving admins list' });
  }
});

// 9. Get all requests (Admin)
app.get('/api/requests', requireRole(['admin', 'super-admin', 'hr-admin', 'viewer-admin', 'sub-admin']), async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(1000);
      if (!error && data) {
        const requests = data.map(req => ({
          _id: req.id,
          employeeId: req.employee_id,
          name: req.name,
          requestType: req.request_type,
          details: req.details,
          status: req.status,
          targetAdmins: req.target_admins || [{ adminId: 'all', adminName: 'All Admins' }],
          messages: req.messages || [],
          employeeSeen: req.employee_seen,
          adminSeen: req.admin_seen,
          createdAt: req.created_at
        }));
        return res.json(requests);
      }
    }
    const requests = await RequestModel.find({}).sort({ createdAt: -1 }).limit(1000);
    res.json(requests);
  } catch (err) {
    console.error('Fetch requests error:', err);
    res.status(500).json({ error: 'Server error retrieving requests' });
  }
});

// 9.1 Mark request as seen (Admin)
app.post('/api/requests/:id/seen', requireRole(['admin', 'super-admin', 'hr-admin', 'viewer-admin', 'sub-admin']), async (req, res) => {
  try {
    const { ObjectId } = require('mongoose').Types;
    let queryId = req.params.id;
    let queryCondition = { _id: queryId };
    
    // Bypass mongoose casting by using native collection updateOne to handle mixed _id types
    if (ObjectId.isValid(queryId) && queryId.length === 24) {
      queryCondition = { $or: [{ _id: queryId }, { _id: new ObjectId(queryId) }] };
    }

    const result = await RequestModel.collection.updateOne(
      queryCondition,
      { $set: { adminSeen: true } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (supabase) {
      try {
        await supabase.from('requests').update({ admin_seen: true }).eq('id', req.params.id);
      } catch (_) {}
    }
    console.log(`[API] Marked request ${req.params.id} as seen.`);
    res.json({ success: true, message: 'Request marked as seen' });
  } catch (err) {
    console.error('Mark seen error:', err);
    res.status(500).json({ error: 'Server error marking request as seen' });
  }
});

// 9.2 Undo Approve/Reject action (Admin)
app.post('/api/requests/:id/undo', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const request = await RequestModel.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    request.status = 'Pending';
    request.employeeSeen = false;
    request.messages.push({
      senderId: 'system',
      senderName: 'System Notification',
      senderRole: 'system',
      text: 'Action has been undone. Request is back to Pending.'
    });
    await request.save();

    if (supabase) {
      try {
        await supabase.from('requests').update({ status: 'Pending', employee_seen: false }).eq('id', req.params.id);
      } catch (_) {}
    }
    res.json({ message: 'Request status reverted to Pending successfully', request });
  } catch (err) {
    console.error('Undo request error:', err);
    res.status(500).json({ error: 'Server error undoing request action' });
  }
});

// 9.5 Approve Employee Correction/Message Request (Admin only)
app.post('/api/requests/:id/approve', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const request = await RequestModel.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    request.status = 'Approved';
    request.employeeSeen = false;
    request.messages.push({
      senderId: 'system',
      senderName: 'System Notification',
      senderRole: 'system',
      text: 'Correction request has been Approved.'
    });
    await request.save();

    if (supabase) {
      await supabase.from('requests').update({ status: 'Approved', employee_seen: false }).eq('id', req.params.id);
    }
    res.json({ message: 'Request approved successfully', request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error approving request' });
  }
});

// 9.6 Reject Employee Correction/Message Request (Admin only)
app.post('/api/requests/:id/reject', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const request = await RequestModel.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    request.status = 'Rejected';
    request.employeeSeen = false;
    request.messages.push({
      senderId: 'system',
      senderName: 'System Notification',
      senderRole: 'system',
      text: 'Correction request has been Rejected.'
    });
    await request.save();

    if (supabase) {
      await supabase.from('requests').update({ status: 'Rejected', employee_seen: false }).eq('id', req.params.id);
    }
    res.json({ message: 'Request rejected successfully', request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error rejecting request' });
  }
});

// 10. Approve Attendance (Admin)
app.post('/api/attendance/approve/:id', requireRole(['admin', 'super-admin', 'hr-admin', 'viewer-admin', 'sub-admin']), async (req, res) => {
  try {
    if (supabase) {
      await supabase.from('attendance').update({ status: 'Present' }).eq('id', req.params.id);
    }
    const log = await Attendance.findById(req.params.id);
    if (log) {
      log.status = 'Present';
      await log.save();
      return res.json({ message: 'Attendance approved successfully', log });
    }
    res.json({ message: 'Attendance log approved/updated successfully' });
  } catch (err) {
    console.error('Approve attendance error:', err);
    res.status(500).json({ error: 'Server error during approval' });
  }
});

// 11. Reject Attendance (Admin)
app.post('/api/attendance/reject/:id', requireRole(['admin', 'super-admin', 'hr-admin', 'viewer-admin', 'sub-admin']), async (req, res) => {
  try {
    if (supabase) {
      await supabase.from('attendance').update({ status: 'Absent' }).eq('id', req.params.id);
    }
    const log = await Attendance.findById(req.params.id);
    if (log) {
      log.status = 'Absent';
      await log.save();
      return res.json({ message: 'Attendance rejected successfully', log });
    }
    res.json({ message: 'Attendance log rejected/updated successfully' });
  } catch (err) {
    console.error('Reject attendance error:', err);
    res.status(500).json({ error: 'Server error during rejection' });
  }
});

// 11.5 Undo Attendance (Super Admin only)
app.post('/api/attendance/undo/:id', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    if (supabase) {
      await supabase.from('attendance').update({ status: 'Pending' }).eq('id', req.params.id);
    }
    const log = await Attendance.findById(req.params.id);
    if (log) {
      log.status = 'Pending';
      await log.save();
      return res.json({ message: 'Attendance reset to Pending', log });
    }
    res.json({ message: 'Attendance log reset to pending successfully' });
  } catch (err) {
    console.error('Undo attendance error:', err);
    res.status(500).json({ error: 'Server error during undo' });
  }
});

// 11.6 Undo Checkout (Admin/Super Admin)
app.post('/api/attendance/undo-checkout/:id', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const log = await Attendance.findById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Attendance log not found' });

    log.checkOut = '--:--';
    log.status = 'Present'; // Reset status to checked-in
    await log.save();

    if (supabase) {
      await supabase.from('attendance').update({ check_out: '--:--', status: 'Present' }).eq('id', req.params.id);
    }

    return res.json({ message: 'Checkout undone successfully', log });
  } catch (err) {
    console.error('Undo checkout error:', err);
    res.status(500).json({ error: 'Server error during undo checkout' });
  }
});

// 11.7 Mark Leave (Admin/Super Admin)
app.post('/api/attendance/mark-leave', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const { employeeId, date } = req.body;
    if (!employeeId || !date) {
      return res.status(400).json({ error: 'Employee ID and Date are required.' });
    }

    const employee = await Employee.findOne({ employeeId: employeeId.trim(), isDeleted: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    // Check if attendance log already exists for this date
    let log = await Attendance.findOne({ employeeId: employee.employeeId, date: date.trim() });

    if (log) {
      log.checkIn = '--:--';
      log.checkOut = '--:--';
      log.status = 'Leave';
      log.confidence = '--';
      await log.save();
    } else {
      const dParts = new Date(date);
      const isoDate = !isNaN(dParts.getTime()) ? dParts.toISOString().split('T')[0].replace(/-/g, '') : String(Date.now());
      const logId = `${employee.employeeId}_${isoDate}`;
      log = new Attendance({
        _id: logId,
        employeeId: employee.employeeId,
        name: employee.name,
        date: date.trim(),
        checkIn: '--:--',
        checkOut: '--:--',
        status: 'Leave',
        confidence: '--',
        photo: employee.facePhoto || 'data:image/svg+xml;utf8,<svg></svg>'
      });
      await log.save();
    }

    await syncAttendanceToSupabase(log);
    return res.json({ message: 'Leave marked successfully', log });
  } catch (err) {
    console.error('Mark leave error:', err);
    res.status(500).json({ error: 'Server error during marking leave' });
  }
});

// 11.8 Manual Edit Past Attendance (Super Admin only)
app.put('/api/attendance/manual-edit', requireRole(['super-admin', 'admin', 'sub-admin', 'hr-admin']), async (req, res) => {
  try {
    const { employeeId, date, status, checkIn, checkOut } = req.body;
    if (!employeeId || !date || !status || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'All fields (employeeId, date, status, checkIn, checkOut) are required.' });
    }

    const employee = await Employee.findOne({ employeeId: employeeId.trim(), isDeleted: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    // Enforce Hierarchy Rules
    if (req.user.role === 'sub-admin') {
      if (employee.role !== 'employee') return res.status(403).json({ error: 'Sub-admins can only edit employees.' });
      if (employee.department !== req.user.department) return res.status(403).json({ error: 'Sub-admins can only edit employees in their own branch.' });
    }
    if (req.user.role === 'admin') {
      if (['super-admin', 'admin'].includes(employee.role)) return res.status(403).json({ error: 'Admins cannot edit other Admins or Super-Admins.' });
    }
    if (employee.employeeId === req.user.employeeId && req.user.role !== 'super-admin') {
      return res.status(403).json({ error: 'You cannot edit your own attendance.' });
    }
    const parsedLogDate = new Date(date);
    const todayMidnight = new Date();
    todayMidnight.setHours(23, 59, 59, 999);
    if (!isNaN(parsedLogDate.getTime()) && parsedLogDate > todayMidnight) {
      if (status === 'Present') {
        return res.status(400).json({ error: 'Cannot mark Present for future dates. (Leave is allowed).' });
      }
    }

    const dParts = new Date(date);
    const isoDate = !isNaN(dParts.getTime()) ? dParts.toISOString().split('T')[0].replace(/-/g, '') : String(Date.now());
    const logId = `${employee.employeeId}_${isoDate}`;

    let log = await Attendance.findById(logId);

    if (status === 'Clear' || status === 'None') {
      if (log) {
        await Attendance.deleteOne({ _id: log._id });
        if (supabase) {
          await supabase.from('attendance').delete().eq('id', log._id);
        }
      }
      return res.json({ message: 'Attendance record cleared successfully' });
    }

    const isLateVal = (checkIn && checkIn !== '--:--') ? (timeToMinutes(checkIn) > timeToMinutes(employee.arrivalTime || '09:00 AM')) : false;

    if (log) {
      log.checkIn = checkIn;
      log.checkOut = checkOut;
      log.status = status;
      log.isLate = isLateVal;
      await log.save();
    } else {
      log = new Attendance({
        _id: logId,
        employeeId: employee.employeeId,
        name: employee.name,
        date: date.trim(),
        checkIn: checkIn,
        checkOut: checkOut,
        status: status,
        isLate: isLateVal,
        confidence: '--', // Manual
        photo: employee.facePhoto || 'data:image/svg+xml;utf8,<svg></svg>'
      });
      await log.save();
    }

    await syncAttendanceToSupabase(log);
    return res.json({ message: 'Attendance record updated successfully', log });
  } catch (err) {
    console.error('Manual edit error:', err);
    res.status(500).json({ error: 'Server error during manual edit' });
  }
});

// Purge / reset any invalid future "Present" attendance logs back to null/deleted
app.post('/api/attendance/clean-future-present', requireRole(['super-admin', 'admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const logs = await Attendance.find({ status: 'Present' });
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    let purgedCount = 0;
    for (const log of logs) {
      const parsedDate = new Date(log.date);
      if (!isNaN(parsedDate.getTime()) && parsedDate > today) {
        await Attendance.deleteOne({ _id: log._id });
        if (supabase) {
          await supabase.from('attendance').delete().eq('id', log._id);
        }
        purgedCount++;
      }
    }
    return res.json({ message: `Purged ${purgedCount} invalid future Present logs.`, count: purgedCount });
  } catch (err) {
    console.error('Clean future logs error:', err);
    res.status(500).json({ error: 'Server error cleaning future logs' });
  }
});

// 12. Delete an employee (Admin only - Super Admin Only)
app.delete('/api/employees/:employeeId', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (supabase) {
      try {
        await supabase.from('profiles').delete().eq('employee_id', employeeId.trim());
      } catch (sbErr) {
        console.error('Failed to remove profile from Supabase:', sbErr);
      }
    }

    // Perform Soft Delete to preserve audit trails for attendance records
    const result = await Employee.updateOne({ employeeId: employeeId.trim() }, { isDeleted: true });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    await refreshFaceCache();
    res.json({ message: 'Employee removed successfully' });
  } catch (err) {
    console.error('Delete employee error:', err);
    res.status(500).json({ error: 'Server error deleting employee' });
  }
});

// 13. Update an employee's details (Admin only)
app.put('/api/employees/:employeeId', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const { name, department, password, pin, facePhotos, role, isActive, adminMessage, employeeType, weeklyHours, arrivalTime, departureTime } = req.body;
    const { employeeId } = req.params;

    const employee = await Employee.findOne({ employeeId: employeeId.trim(), isDeleted: { $ne: true } });
    let currentProfile;
    if (supabase) {
      const { data } = await supabase.from('profiles').select('*').eq('employee_id', employeeId.trim()).single();
      currentProfile = data;
    }

    if (!employee && !currentProfile) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    let embedding = null;
    if (facePhotos && facePhotos.length > 0) {
      try {
        embedding = await extractEmbedding(facePhotos);
      } catch (err) {
        console.error('Failed to extract face embedding on update:', err);
        return res.status(400).json({ error: 'Biometric update failed: ' + err.message });
      }
    }

    let hashedPassword = null;
    if (password && password.trim() !== '') {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Update MongoDB
    if (employee) {
      if (name) employee.name = name.trim();
      if (department) employee.department = department.trim();
      if (facePhotos && facePhotos.length > 0) {
        employee.facePhoto = facePhotos[0];
        employee.facePhotos = facePhotos;
        employee.faceEmbedding = embedding;
      }
      if (hashedPassword) {
        employee.password = hashedPassword;
        employee.plainPassword = password;
      }
      if (role) employee.role = role;
      if (employeeType) employee.employeeType = employeeType;
      if (weeklyHours !== undefined) employee.weeklyHours = parseInt(weeklyHours, 10);
      if (arrivalTime) employee.arrivalTime = arrivalTime;
      if (departureTime) employee.departureTime = departureTime;
      if (isActive !== undefined) employee.isActive = isActive;
      if (adminMessage !== undefined) employee.adminMessage = adminMessage;
      await employee.save();
      // Re-sync cache if biometrics or status changed
      await refreshFaceCache();
    }

    // Update Supabase
    if (supabase) {
      try {
        const profileUpdate = {
          name: name ? name.trim() : (employee ? employee.name : currentProfile.name),
          employee_id: employeeId.trim(),
          department: department ? department.trim() : (employee ? employee.department : currentProfile.department),
          role: role || (employee ? employee.role : currentProfile.role),
          departure_time: departureTime || (employee ? employee.departureTime : currentProfile.departure_time)
        };
        if (embedding) {
          profileUpdate.face_embedding = embedding;
          profileUpdate.face_photo = facePhotos[0];
          profileUpdate.face_photos = facePhotos;
        }
        if (hashedPassword) {
          profileUpdate.password = hashedPassword;
        }
        await supabase.from('profiles').upsert(profileUpdate);
      } catch (sbErr) {
        console.error('Failed to update profile in Supabase:', sbErr);
      }
    }

    if (name) {
      await Attendance.updateMany({ employeeId: employeeId.trim() }, { name: name.trim() });
      if (supabase) {
        await supabase.from('attendance').update({ name: name.trim() }).eq('employee_id', employeeId.trim());
      }
    }

    res.json({ message: 'Employee updated successfully' });
  } catch (err) {
    console.error('Update employee error:', err);
    res.status(500).json({ error: 'Server error updating employee' });
  }
});

// 13.1 Toggle Active status (Admin only)
app.put('/api/employees/:employeeId/active', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { isActive } = req.body;
    const employee = await Employee.findOne({ employeeId: employeeId.trim(), isDeleted: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    employee.isActive = isActive;
    await employee.save();
    res.json({ message: 'Employee active status updated', isActive: employee.isActive });
  } catch (err) {
    console.error('Toggle active error:', err);
    res.status(500).json({ error: 'Server error updating active status' });
  }
});

// 13.2 Broadcast Message (Admin/HR-Admin/Super-Admin)
app.post('/api/employees/message', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const { message, targetType, targets } = req.body;
    if (message === undefined || !targetType) {
      return res.status(400).json({ error: 'Message and targetType are required.' });
    }

    let filter = { isDeleted: { $ne: true } };
    if (targetType === 'department') {
      if (!targets || !targets.length) return res.status(400).json({ error: 'Department names are required in targets.' });
      filter.department = { $in: targets };
    } else if (targetType === 'selective') {
      if (!targets || !targets.length) return res.status(400).json({ error: 'Employee IDs are required in targets.' });
      filter.employeeId = { $in: targets };
    }

    const result = await Employee.updateMany(filter, { adminMessage: message.trim() });

    if (supabase) {
      try {
        if (targetType === 'all') {
          await supabase.from('profiles').update({ admin_message: message.trim() }).neq('id', 'dummy');
        } else if (targetType === 'department') {
          await supabase.from('profiles').update({ admin_message: message.trim() }).in('department', targets);
        } else if (targetType === 'selective') {
          await supabase.from('profiles').update({ admin_message: message.trim() }).in('employee_id', targets);
        }
      } catch (sbErr) {
        console.error('Failed to sync message to Supabase:', sbErr);
      }
    }

    res.json({ message: 'Message sent successfully', updatedCount: result.modifiedCount });
  } catch (err) {
    console.error('Broadcast message error:', err);
    res.status(500).json({ error: 'Server error sending message' });
  }
});

// 13.4 Get employee profile (User Self-Service)
app.get('/api/employees/:employeeId/profile', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findOne({ employeeId: employeeId.trim(), isDeleted: { $ne: true } }).select('-pin -facePhotos -faceEmbedding');
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    const empObj = employee.toObject();
    if (!empObj.plainPassword && empObj.password) {
      empObj.plainPassword = empObj.password;
    }
    res.json(empObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

// 13.4.1 Get employee biometric photos explicitly
app.get('/api/employees/:employeeId/photos', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findOne({ employeeId: employeeId.trim(), isDeleted: { $ne: true } }).select('facePhotos');
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee.facePhotos || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching photos' });
  }
});

// 13.5 Update an employee's own profile (User Self-Service)
app.put('/api/employees/:employeeId/profile', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { password, pin, facePhotos } = req.body;

    let employee = await Employee.findOne({ employeeId: employeeId.trim() });
    let currentProfile = null;
    if (!employee && supabase) {
      const { data } = await supabase.from('profiles').select('*').eq('employee_id', employeeId.trim()).single();
      currentProfile = data;
    }
    if (!employee && !currentProfile) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    let embedding = null;
    if (facePhotos && facePhotos.length >= 4) {
      try {
        embedding = await extractEmbedding(facePhotos);
      } catch (err) {
        console.error('Failed to extract face embedding on update:', err);
        return res.status(400).json({ error: 'Biometric update failed: ' + err.message });
      }
    }

    let hashedPassword = null;
    if (password && password.trim() !== '') {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Update MongoDB
    if (employee) {
      if (facePhotos && facePhotos.length > 0) {
        employee.facePhoto = facePhotos[0];
        if (facePhotos.length >= 4) {
          employee.facePhotos = facePhotos;
          employee.faceEmbedding = embedding;
        }
      }
      if (hashedPassword) {
        employee.password = hashedPassword;
        employee.plainPassword = password;
      }
      await employee.save();
    }

    // Update Supabase
    if (supabase) {
      try {
        const profileUpdate = {
          employee_id: employeeId.trim()
        };
        if (facePhotos && facePhotos.length > 0) {
          profileUpdate.face_photo = facePhotos[0];
          if (facePhotos.length >= 4) {
            profileUpdate.face_embedding = embedding;
            profileUpdate.face_photos = facePhotos;
          }
        }
        if (hashedPassword) {
          profileUpdate.password = hashedPassword;
        }
        await supabase.from('profiles').upsert(profileUpdate);
      } catch (sbErr) {
        console.error('Failed to update profile in Supabase:', sbErr);
      }
    }

    res.json({ message: 'Profile updated successfully', facePhoto: facePhotos && facePhotos.length > 0 ? facePhotos[0] : null });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// 13.5.1 Add an employee photo (Admin or Self)
app.post('/api/employees/:employeeId/photos', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { photo } = req.body;
    
    if (!photo) return res.status(400).json({ error: 'Photo is required' });

    let employee = await Employee.findOne({ employeeId: employeeId.trim() });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    employee.facePhotos.push(photo);
    
    // Recompute embedding if they have at least 4 photos
    if (employee.facePhotos.length >= 4) {
      try {
        const embedding = await extractEmbedding(employee.facePhotos);
        employee.faceEmbedding = embedding;
      } catch (err) {
        console.error('Failed to extract face embedding on photo add:', err);
        // Continue anyway so they can at least store the photo
      }
    }
    
    if (employee.facePhotos.length === 1) {
      employee.facePhoto = photo;
    }

    await employee.save();
    
    if (supabase) {
      try {
        const updatePayload = { face_photos: employee.facePhotos };
        if (employee.facePhotos.length === 1) updatePayload.face_photo = photo;
        if (employee.faceEmbedding && employee.faceEmbedding.length > 0) updatePayload.face_embedding = employee.faceEmbedding;
        await supabase.from('profiles').update(updatePayload).eq('employee_id', employeeId.trim());
      } catch (sbErr) {
        console.error('Supabase sync error on photo add', sbErr);
      }
    }

    res.json({ message: 'Photo added successfully', facePhotos: employee.facePhotos });
  } catch (err) {
    console.error('Add photo error:', err);
    res.status(500).json({ error: 'Server error adding photo' });
  }
});

// 13.5.2 Delete an employee photo (Admin or Self)
app.delete('/api/employees/:employeeId/photos/:index', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const { employeeId, index } = req.params;
    const idx = parseInt(index);

    let employee = await Employee.findOne({ employeeId: employeeId.trim() });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    if (isNaN(idx) || idx < 0 || idx >= employee.facePhotos.length) {
      return res.status(400).json({ error: 'Invalid photo index' });
    }

    employee.facePhotos.splice(idx, 1);
    
    // Recompute embedding if they still have at least 4 photos, otherwise clear it
    if (employee.facePhotos.length >= 4) {
      try {
        const embedding = await extractEmbedding(employee.facePhotos);
        employee.faceEmbedding = embedding;
      } catch (err) {
        console.error('Failed to extract face embedding on photo delete:', err);
      }
    } else {
       employee.faceEmbedding = [];
    }
    
    if (employee.facePhotos.length > 0) {
      employee.facePhoto = employee.facePhotos[0];
    } else {
      employee.facePhoto = 'data:image/svg+xml;utf8,<svg></svg>'; // default
    }

    await employee.save();

    if (supabase) {
      try {
        await supabase.from('profiles').update({
          face_photos: employee.facePhotos,
          face_photo: employee.facePhoto,
          face_embedding: employee.faceEmbedding
        }).eq('employee_id', employeeId.trim());
      } catch (sbErr) {
        console.error('Supabase sync error on photo delete', sbErr);
      }
    }

    res.json({ message: 'Photo deleted successfully', facePhotos: employee.facePhotos });
  } catch (err) {
    console.error('Delete photo error:', err);
    res.status(500).json({ error: 'Server error deleting photo' });
  }
});

// 13.6 Admin/Super-Admin Unlock Employee Credentials (Biometric Face Scan)
app.post('/api/employees/:employeeId/unlock-credentials', requireRole(['admin', 'super-admin', 'hr-admin', 'sub-admin']), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { frameA, frameB, token, timestamp, signature } = req.body;

    const employee = await Employee.findOne({ employeeId: employeeId.trim() });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    if (!frameB) {
      return res.status(400).json({ error: 'No camera frame provided for face scanning.' });
    }

    if (!employee.faceEmbedding || employee.faceEmbedding.length === 0) {
      return res.status(400).json({ error: 'Biometric profile not configured for this account.' });
    }

    // 1. Extract embedding and perform liveness verification
    let queryEmbedding;
    try {
      const framesInput = (frameA && frameB) ? [frameA, frameB] : frameB;
      queryEmbedding = await extractEmbedding(framesInput);
    } catch (err) {
      console.error('Failed to extract face embedding on unlock:', err);
      return res.status(400).json({ error: 'Biometric verification failed: ' + err.message });
    }

    // 2. Perform Biometric Verification Match
    const similarity = queryEmbedding.reduce((sum, val, idx) => sum + val * employee.faceEmbedding[idx], 0);
    const matchThreshold = 0.40; // match threshold same as scan-attendance

    if (similarity >= matchThreshold) {
      return res.json({
        message: 'Credentials unlocked securely',
        password: employee.plainPassword || ''
      });
    } else {
      return res.status(401).json({ error: `Verification failed. Face does not match: (${(similarity * 100).toFixed(1)}%)` });
    }
  } catch (err) {
    console.error('Unlock credentials error:', err);
    res.status(500).json({ error: 'Server error unlocking credentials' });
  }
});

// Background Worker: Auto-accept pending attendance logs older than 5 minutes (300000 ms)
setInterval(async () => {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Find all pending logs in MongoDB older than 5 minutes
    const pendingLogs = await Attendance.find({
      status: 'Pending',
      createdAt: { $lte: fiveMinutesAgo }
    });

    if (pendingLogs.length > 0) {
      let approvedCount = 0;
      for (const log of pendingLogs) {
        // Skip Saturday (6) and Sunday (0)
        const logDay = new Date(log.createdAt).getDay();
        if (logDay === 0 || logDay === 6) {
          continue;
        }
        log.status = 'Present';
        await log.save();
        await syncAttendanceToSupabase(log);
        approvedCount++;
      }
      if (approvedCount > 0) {
        console.log(`[Auto-Approve] Approving ${approvedCount} pending attendance log(s) older than 5 minutes.`);
      }
    }

    // Update on Supabase directly if connected
    if (supabase) {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('status', 'Pending')
        .lte('created_at', fiveMinutesAgo.toISOString());

      if (!error && data && data.length > 0) {
        console.log(`[Auto-Approve Supabase] Approving ${data.length} pending logs on Supabase.`);
        for (const row of data) {
          const { error: updateErr } = await supabase
            .from('attendance')
            .update({ status: 'Present' })
            .eq('id', row.id);
          if (updateErr) {
            console.error('Supabase auto-approve error:', updateErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Background auto-approval error:', err);
  }
}, 10000); // Check every 10 seconds

// Background Worker: Run every 6 hours to mark past unlogged weekdays as Absent
const runAutoAbsentCheck = async () => {
  try {
    console.log('[Auto-Absent Worker] Checking for unlogged weekdays...');
    const now = await getCurrentTimeFromInternetOrLocal();

    // Pre-calculate the dates to check
    const datesToCheck = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

      const dateParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Karachi',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }).formatToParts(d);

      const dayName = dateParts.find(p => p.type === 'weekday').value;
      if (dayName === 'Sat' || dayName === 'Sun') continue;

      const monthName = dateParts.find(p => p.type === 'month').value;
      const dayNum = dateParts.find(p => p.type === 'day').value;
      const yearNum = dateParts.find(p => p.type === 'year').value;
      const dateStr = `${monthName} ${dayNum}, ${yearNum}`;

      const isoDate = d.toISOString().split('T')[0].replace(/-/g, '');
      datesToCheck.push({ dateStr, isoDate, dateObj: d });
    }

    // Process employees iteratively using a cursor to prevent memory spikes
    const cursor = Employee.find({ role: 'employee', isDeleted: { $ne: true } }).select('employeeId name facePhoto').cursor();
    
    for await (const emp of cursor) {
      for (const { dateStr, isoDate, dateObj } of datesToCheck) {
        let log = await Attendance.findOne({ employeeId: emp.employeeId, date: dateStr });

        // If not found in MongoDB and Supabase is connected, check Supabase
        if (!log && supabase) {
          try {
            const { data } = await supabase
              .from('attendance')
              .select('*')
              .eq('employee_id', emp.employeeId)
              .eq('date', dateStr)
              .single();
            if (data) {
              log = data; // log exists on Supabase
            }
          } catch (sbErr) {
            // Ignore single not found error
          }
        }

        // If no log exists for this weekday, mark them as Absent!
        if (!log) {
          const logId = `${emp.employeeId}_${isoDate}`;
          const newLog = new Attendance({
            _id: logId,
            employeeId: emp.employeeId,
            name: emp.name,
            date: dateStr,
            checkIn: '--:--',
            checkOut: '--:--',
            status: 'Absent',
            confidence: '--',
            photo: emp.facePhoto || 'data:image/svg+xml;utf8,<svg></svg>',
            createdAt: dateObj // Save as that past date
          });
          await newLog.save();
          await syncAttendanceToSupabase(newLog);
          console.log(`[Auto-Absent Worker] Marked ${emp.name} (${emp.employeeId}) Absent for ${dateStr}`);
        }
      }
    }
  } catch (err) {
    console.error('Auto-Absent Worker error:', err);
  }
};

// Run auto-absent check every 6 hours and also 5 seconds after startup
setInterval(runAutoAbsentCheck, 6 * 60 * 60 * 1000);
setTimeout(runAutoAbsentCheck, 5000);

// --- Department Endpoints ---
app.get('/api/departments', async (req, res) => {
  try {
    const departments = await Department.find({});
    res.json(departments);
  } catch (err) {
    console.error('Fetch departments error:', err);
    res.status(500).json({ error: 'Server error retrieving departments' });
  }
});

app.post('/api/departments', requireRole(['super-admin']), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Department name is required' });
    }
    const exists = await Department.findOne({ name: name.trim() });
    if (exists) {
      return res.status(400).json({ error: 'Department already exists' });
    }
    const newDept = new Department({ name: name.trim() });
    await newDept.save();
    res.status(201).json(newDept);
  } catch (err) {
    console.error('Add department error:', err);
    res.status(500).json({ error: 'Server error creating department' });
  }
});

app.delete('/api/departments/:name', requireRole(['super-admin']), async (req, res) => {
  try {
    const { name } = req.params;
    const { transferTo } = req.body;

    const departmentName = name.trim();

    // Check if we need to transfer employees
    if (transferTo && transferTo.trim() !== '') {
      const targetDept = await Department.findOne({ name: transferTo.trim() });
      if (!targetDept) {
        return res.status(400).json({ error: 'Target department for transfer does not exist.' });
      }
      // Update employees
      await Employee.updateMany(
        { department: departmentName },
        { $set: { department: transferTo.trim() } }
      );
      
      if (supabase) {
        try {
            await supabase.from('profiles').update({ department: transferTo.trim() }).eq('department', departmentName);
        } catch (sbErr) {
            console.error('Error syncing department transfer to supabase', sbErr);
        }
      }
    }

    const deleted = await Department.findOneAndDelete({ name: departmentName });
    if (!deleted) {
      return res.status(404).json({ error: 'Department not found' });
    }
    res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    console.error('Delete department error:', err);
    res.status(500).json({ error: 'Server error deleting department' });
  }
});

// --- Office Settings Endpoints ---

// Helper endpoint to resolve Google Maps shortlinks (bypassing CORS)
app.get('/api/resolve-shortlink', async (req, res) => {
  const shortUrl = req.query.url;
  if (!shortUrl) return res.status(400).json({ error: 'URL is required' });
  try {
    const fetchRes = await fetch(shortUrl, { redirect: 'follow' });
    const finalUrl = fetchRes.url;
    const location = fetchRes.headers.get('location');
    res.json({ url: finalUrl || location || shortUrl });
  } catch (err) {
    console.error('Resolve shortlink error:', err);
    res.status(500).json({ error: 'Failed to resolve link' });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    let settings = await OfficeSettings.findOne();
    if (!settings) {
      settings = await OfficeSettings.create({
        officeLatitude: 33.6844,
        officeLongitude: 73.0479,
        allowedRadius: 100,
        vpnCheckEnabled: true
      });
    }
    res.json(settings);
  } catch (err) {
    console.error('Fetch settings error:', err);
    res.status(500).json({ error: 'Server error retrieving settings' });
  }
});

app.post('/api/settings', requireRole(['super-admin', 'admin']), async (req, res) => {
  try {
    const { officeLatitude, officeLongitude, allowedRadius, vpnCheckEnabled } = req.body;
    let settings = await OfficeSettings.findOne();
    if (!settings) {
      settings = new OfficeSettings();
    }
    if (officeLatitude !== undefined) settings.officeLatitude = Number(officeLatitude);
    if (officeLongitude !== undefined) settings.officeLongitude = Number(officeLongitude);
    if (allowedRadius !== undefined) settings.allowedRadius = Number(allowedRadius);
    if (vpnCheckEnabled !== undefined) settings.vpnCheckEnabled = Boolean(vpnCheckEnabled);

    await settings.save();
    res.json({ message: 'Office settings updated successfully', settings });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Server error updating settings' });
  }
});


// direct dashboard check-in/out endpoint for authenticated employees
app.post('/api/attendance/dashboard-mark', async (req, res) => {
  try {
    const { employeeId, latitude, longitude, timezoneOffset } = req.body;

    // Geofencing and VPN Checks
    const settings = await OfficeSettings.findOne();
    if (settings) {
      if (settings.vpnCheckEnabled) {
        if (timezoneOffset !== undefined && Math.abs(Number(timezoneOffset) - (-300)) > 60) {
          return res.status(400).json({ error: 'VPN or proxy timezone detected. Please disable VPN to mark attendance.' });
        }
      }
      if (latitude !== undefined && longitude !== undefined) {
        const distance = getDistanceInMeters(
          Number(latitude),
          Number(longitude),
          settings.officeLatitude,
          settings.officeLongitude
        );
        if (distance > settings.allowedRadius) {
          return res.status(400).json({
            error: `Access denied. You are ${Math.round(distance)}m away from the office. Allowed radius is ${settings.allowedRadius}m.`
          });
        }
      } else {
        return res.status(400).json({ error: 'Location coordinates are required to mark attendance.' });
      }
    }

    const employee = await Employee.findOne({ employeeId: employeeId.trim(), isDeleted: { $ne: true } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const now = await getCurrentTimeFromInternetOrLocal();
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Karachi' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });

    let log = await Attendance.findOne({ employeeId: employee.employeeId, date: dateStr });
    let action = 'check-in';

    if (log) {
      if (log.checkOut === '--:--') {
        action = 'check-out';
      } else {
        return res.status(400).json({ error: 'Already checked out for today.' });
      }
    }

    // --- Holiday Check ---
    const pkDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }); // Returns YYYY-MM-DD
    const [pkYear, pkMonth, pkDay] = pkDateStr.split('-');
    const dateObj = new Date(Date.UTC(parseInt(pkYear), parseInt(pkMonth) - 1, parseInt(pkDay)));
    const isHoliday = await Holiday.findOne({ date: dateObj });
    const dayOfWeek = now.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isSatOff = settings && settings.saturdayOff && dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;

    if (action === 'check-in' && (isHoliday || isSunday || isSatOff)) {
      let reason = 'a Holiday';
      if (isSunday || isSatOff) reason = 'a Weekend';
      if (isHoliday) reason = `a Holiday (${isHoliday.name})`;
      return res.status(400).json({ error: `Cannot check in today. It is ${reason}. Enjoy your day off!` });
    }
    // ---------------------

    const initialStatus = isWeekend ? 'Pending' : 'Present';

    if (action === 'check-out') {
        log.checkOut = timeStr;
        if (isWeekend) {
          log.status = 'Pending';
        } else {
          log.status = 'Present';
        }
        await log.save();
        await syncAttendanceToSupabase(log);
        return res.json({ message: isWeekend ? 'Checked out successfully, pending admin approval.' : 'Checked out successfully', log });
    } else {
      const isLate = timeToMinutes(timeStr) > timeToMinutes(employee.arrivalTime || '09:00 AM');
      const logId = `${employee.employeeId}_${now.toISOString().split('T')[0].replace(/-/g, '')}`;
      log = new Attendance({
        _id: logId,
        employeeId: employee.employeeId,
        name: employee.name,
        date: dateStr,
        checkIn: timeStr,
        checkOut: '--:--',
        status: initialStatus,
        isLate: isLate,
        confidence: '100%',
        photo: employee.facePhoto
      });
      await log.save();
      await syncAttendanceToSupabase(log);
      return res.json({ message: isWeekend ? 'Checked in successfully, pending admin approval.' : 'Checked in successfully', log });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error marking attendance' });
  }
});

// Start server

// Goal endpoint for slash command verification
app.get('/goal', (req, res) => {
  res.json({ message: 'Goal endpoint is active' });
});
// Start the face recognition microservice daemon in the background
let faceServiceProcess = null;
function startFaceService() {
  if (process.env.FACE_SERVICE_URL) {
    console.log(`[FaceService] Bypassing background Python daemon. Using external API: ${process.env.FACE_SERVICE_URL}`);
    return;
  }
  const pythonPath = process.platform === 'win32' ? 'py' : 'python3';
  const scriptPath = path.join(__dirname, 'face_service.py');

  console.log('[FaceService] Starting Python biometric daemon...');
  try {
    faceServiceProcess = spawn(pythonPath, [scriptPath]);

    faceServiceProcess.stdout.on('data', (data) => {
      console.log(`[FaceService Output]: ${data.toString().trim()}`);
    });

    faceServiceProcess.stderr.on('data', (data) => {
      console.error(`[FaceService Error]: ${data.toString().trim()}`);
    });

    faceServiceProcess.on('close', (code) => {
      console.warn(`[FaceService] Daemon exited with code ${code}. Restarting in 5 seconds...`);
      setTimeout(startFaceService, 5000);
    });
  } catch (err) {
    console.error('[FaceService] Failed to start Python process:', err);
  }
}

// Auto-Checkout Routine
async function performAutoCheckouts() {
  // Disabled as per requirements. Employees must manually check out, or their hours stay at 0.0.
}

const PORT = process.env.PORT || 5000;

app.get('/api/time', async (req, res) => {
  try {
    const now = await getCurrentTimeFromInternetOrLocal();
    res.json({ time: now.toISOString() });
  } catch (err) {
    res.json({ time: new Date().toISOString() });
  }
});

app.post('/api/admin/verify-face-for-password', requireRole(['admin', 'super-admin', 'hr-admin', 'viewer-admin', 'sub-admin']), async (req, res) => {
  try {
    const { frameA, frameB, adminId, targetEmployeeId } = req.body;
    const admin = await Employee.findOne({ employeeId: adminId });
    if (!admin || !admin.faceEmbedding || admin.faceEmbedding.length === 0) {
      return res.status(400).json({ error: 'Admin biometric profile not found.' });
    }
    const framesInput = (frameA && frameB) ? [frameA, frameB] : frameB;
    const queryEmbedding = await extractEmbedding(framesInput);
    if (!queryEmbedding) return res.status(400).json({ error: 'No face detected.' });

    const similarity = queryEmbedding.reduce((sum, val, idx) => sum + val * admin.faceEmbedding[idx], 0);
    if (similarity >= 0.40) {
      const targetEmp = await Employee.findOne({ employeeId: targetEmployeeId });
      if (!targetEmp) return res.status(404).json({ error: 'Target employee not found.' });

      return res.json({ success: true, password: targetEmp.plainPassword || targetEmp.password });
    }
    return res.status(401).json({ error: 'Face verification failed.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error verifying face.' });
  }
});

app.post('/api/attendance/manual-checkout', requireRole(['admin', 'super-admin', 'hr-admin']), async (req, res) => {
  try {
    const { logId, checkOutTime } = req.body;
    const log = await Attendance.findById(logId);
    if (!log) return res.status(404).json({ error: 'Log not found' });

    log.checkOut = checkOutTime;
    log.status = 'Present';
    await log.save();
    await syncAttendanceToSupabase(log);

    res.json({ message: 'Manual checkout successful', log });
  } catch (err) {
    res.status(500).json({ error: 'Server error checking out manually' });
  }
});

app.post('/api/attendance/leave', requireRole(['admin', 'super-admin', 'hr-admin', 'employee']), async (req, res) => {
  try {
    const { employeeId, date, reason } = req.body;
    const emp = await Employee.findOne({ employeeId });
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // date must be formatted 'MMM D, YYYY'
    const logId = `${employeeId}_${date.replace(/[\s,]/g, '')}_leave`;
    const newLog = new Attendance({
      _id: logId,
      employeeId: emp.employeeId,
      name: emp.name,
      date: date,
      checkIn: '--:--',
      checkOut: '--:--',
      status: 'Leave',
      confidence: '--',
      photo: emp.facePhoto,
      adminMessage: reason || 'Leave Requested'
    });

    await newLog.save();
    await syncAttendanceToSupabase(newLog);
    res.json({ message: 'Leave marked successfully', log: newLog });
  } catch (err) {
    res.status(500).json({ error: 'Server error marking leave' });
  }
});

// GET office settings
app.get('/api/settings/office', async (req, res) => {
  try {
    let settings = await OfficeSettings.findOne();
    if (!settings) {
      settings = await OfficeSettings.create({
        officeLatitude: 33.6844,
        officeLongitude: 73.0479,
        allowedRadius: 100,
        vpnCheckEnabled: false,
        saturdayOff: false
      });
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching office settings' });
  }
});

// POST update office settings
app.post('/api/settings/office', requireRole(['admin', 'super-admin', 'hr-admin']), async (req, res) => {
  try {
    const { officeLatitude, officeLongitude, allowedRadius, vpnCheckEnabled, geofenceEnabled, saturdayOff } = req.body;
    let settings = await OfficeSettings.findOne();
    if (!settings) {
      settings = new OfficeSettings();
    }
    settings.officeLatitude = officeLatitude !== undefined ? officeLatitude : settings.officeLatitude;
    settings.officeLongitude = officeLongitude !== undefined ? officeLongitude : settings.officeLongitude;
    settings.allowedRadius = allowedRadius !== undefined ? allowedRadius : settings.allowedRadius;
    settings.vpnCheckEnabled = vpnCheckEnabled !== undefined ? vpnCheckEnabled : settings.vpnCheckEnabled;
    settings.geofenceEnabled = geofenceEnabled !== undefined ? geofenceEnabled : settings.geofenceEnabled;
    settings.saturdayOff = saturdayOff !== undefined ? saturdayOff : settings.saturdayOff;
    await settings.save();
    res.json({ message: 'Settings updated successfully', settings });
  } catch (err) {
    res.status(500).json({ error: 'Server error updating office settings' });
  }
});

// GET holidays
app.get('/api/holidays', async (req, res) => {
  try {
    let holidays = await Holiday.find().lean();
    
    try {
      const year = new Date().getFullYear();
      let nagerData = [];
      const nagerRes = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PK`);
      if (nagerRes.ok && nagerRes.status !== 204) {
        nagerData = await nagerRes.json();
      } else {
        // Fallback for Pakistan since Nager API returns 204 No Content for PK
        nagerData = [
          { date: `${year}-02-05`, localName: "Kashmir Day" },
          { date: `${year}-03-23`, localName: "Pakistan Day" },
          { date: `${year}-05-01`, localName: "Labour Day" },
          { date: `${year}-08-14`, localName: "Independence Day" },
          { date: `${year}-11-09`, localName: "Iqbal Day" },
          { date: `${year}-12-25`, localName: "Quaid-e-Azam Day / Christmas" }
        ];
      }
      
      const dbDates = new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0]));
      
      nagerData.forEach(h => {
        if (!dbDates.has(h.date)) {
           holidays.push({ date: new Date(h.date), name: h.localName, type: 'public' });
           dbDates.add(h.date);
        }
      });
    } catch (apiErr) {
      console.log('Could not fetch live Nager API holidays', apiErr.message);
    }
    
    holidays.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching holidays' });
  }
});

// POST toggle holiday (add/remove)
app.post('/api/holidays/toggle', requireRole(['admin', 'super-admin', 'hr-admin']), async (req, res) => {
  try {
    const { date, name, type, action } = req.body;
    const [year, month, day] = date.split('-');
    const startOfDay = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0));
    const endOfDay = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 23, 59, 59, 999));

    if (action === 'remove') {
      await Holiday.deleteMany({ date: { $gte: startOfDay, $lte: endOfDay } });
      return res.json({ message: 'Holiday removed', action: 'removed' });
    }

    const existing = await Holiday.findOne({ date: { $gte: startOfDay, $lte: endOfDay } });
    if (existing) {
      existing.name = name || 'Holiday';
      await existing.save();
      return res.json({ message: 'Holiday renamed', action: 'renamed', holiday: existing });
    } else {
      const holiday = new Holiday({ date: startOfDay, name: name || 'Holiday', type: type || 'company' });
      await holiday.save();
      return res.json({ message: 'Holiday added', action: 'added', holiday });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error toggling holiday' });
  }
});

// POST import public holidays
app.post('/api/holidays/import', requireRole(['admin', 'super-admin', 'hr-admin']), async (req, res) => {
  try {
    const { holidays } = req.body; // Array of { date, name, type }
    let addedCount = 0;
    for (const h of holidays) {
      const [year, month, day] = h.date.split('-');
      const dateObj = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
      const existing = await Holiday.findOne({ date: dateObj });
      if (!existing) {
        await Holiday.create({ date: dateObj, name: h.name, type: h.type || 'public' });
        addedCount++;
      }
    }
    res.json({ message: `Imported ${addedCount} new holidays successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Server error importing holidays' });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    // Start the background face service
    startFaceService();
    // Start auto-checkout job on startup
    performAutoCheckouts();
    // Run auto-checkout job every minute
    setInterval(performAutoCheckouts, 60000);
  });
}
app.post('/api/verify-face', async (req, res) => {
  try {
    const { employeeId, frameA, frameB, token, timestamp, signature } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Employee ID required' });
    const employee = await Employee.findOne({ employeeId: employeeId.trim() });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (!employee.faceEmbedding || employee.faceEmbedding.length === 0) {
      return res.status(400).json({ error: 'No biometric profile configured' });
    }

    // We skip signature check for simplicity in pure verification, or we can use it.
    // For pure verification, we just extract embedding and match.
    const framesInput = (frameA && frameB) ? [frameA, frameB] : frameB;
    const queryEmbedding = await extractEmbedding(framesInput);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return res.status(400).json({ error: 'Could not detect face in provided frames. Please try again.' });
    }
    const isMatch = compareEmbeddings(queryEmbedding, employee.faceEmbedding);
    if (!isMatch) {
      return res.status(401).json({ error: 'Face verification failed' });
    }
    res.json({ success: true, message: 'Verified successfully' });
  } catch (err) {
    console.error('Face verification error:', err);
    res.status(500).json({ error: 'Server error during verification' });
  }
});

module.exports = app;

