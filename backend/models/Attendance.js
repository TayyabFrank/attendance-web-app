const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  _id: {
    type: String
  },
  employeeId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  date: {
    type: String, // Format: e.g. "2023-10-24" or "Oct 24, 2023"
    required: true,
    maxlength: 50
  },
  checkIn: {
    type: String, // Format: "08:45 AM"
    default: '--:--'
  },
  checkOut: {
    type: String, // Format: "05:15 PM"
    default: '--:--'
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Active', 'Manual Verify', 'Pending', 'Leave'],
    default: 'Pending'
  },
  isLate: {
    type: Boolean,
    default: false
  },
  confidence: {
    type: String, // e.g. "99.8%" or "--"
    default: '--'
  },
  tasks: {
    type: String,
    default: '',
    maxlength: 2000
  },
  workDone: {
    type: String,
    default: '',
    maxlength: 2000
  },
  photo: {
    type: String // Captured face photo data URL
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

attendanceSchema.index({ createdAt: -1 });
attendanceSchema.index({ employeeId: 1, date: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
