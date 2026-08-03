const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  _id: {
    type: String
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  plainPassword: {
    type: String,
    default: ''
  },

  facePhoto: {
    type: String, // Stored as Base64/Data URL of the main photo
    required: true
  },
  facePhotos: {
    type: [String], // Array of all uploaded face photos (4-5 images)
    default: []
  },
  department: {
    type: String,
    default: 'Engineering'
  },
  role: {
    type: String,
    enum: ['employee', 'sub-admin', 'admin', 'super-admin', 'hr-admin', 'viewer-admin'],
    default: 'employee'
  },
  branch: {
    type: String,
    default: 'Main'
  },
  employeeType: {
    type: String,
    enum: ['employee', 'intern'],
    default: 'employee'
  },
  weeklyHours: {
    type: Number,
    default: 40
  },
  arrivalTime: {
    type: String,
    default: '09:00 AM'
  },
  departureTime: {
    type: String,
    default: '05:00 PM'
  },
  faceEmbedding: {
    type: [Number], // 512-dim embedding from InsightFace
    default: []
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  adminMessage: {
    type: String,
    default: ''
  }
}, {
  timestamps: true,
  versionKey: false
});

module.exports = mongoose.model('Employee', employeeSchema);
