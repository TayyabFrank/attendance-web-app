const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  _id: {
    type: String
  },
  employeeId: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: String, // Format: e.g. "2023-10-24" or "Oct 24, 2023"
    required: true
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
    default: ''
  },
  workDone: {
    type: String,
    default: ''
  },
  photo: {
    type: String // Captured face photo data URL
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Attendance', attendanceSchema);
