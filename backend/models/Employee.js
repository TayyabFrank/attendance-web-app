const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  _id: {
    type: String
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  password: {
    type: String,
    required: true,
    maxlength: 1024
  },
  plainPassword: {
    type: String,
    default: '',
    maxlength: 1024
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
    default: 'Engineering',
    maxlength: 100
  },
  role: {
    type: String,
    enum: ['employee', 'sub-admin', 'admin', 'super-admin', 'hr-admin', 'viewer-admin'],
    default: 'employee'
  },
  branch: {
    type: String,
    default: 'Main',
    maxlength: 100
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
    default: '09:00 AM',
    maxlength: 10
  },
  departureTime: {
    type: String,
    default: '05:00 PM',
    maxlength: 10
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
    default: '',
    maxlength: 1000
  }
}, {
  timestamps: true,
  versionKey: false
});

employeeSchema.index({ employeeId: 1 }, { unique: true });
employeeSchema.index({ role: 1, isDeleted: 1, isActive: 1 });
employeeSchema.index({ department: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
