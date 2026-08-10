const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
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
  requestType: {
    type: String, // 'Correction' or 'Message'
    required: true,
    maxlength: 50
  },
  details: {
    type: String,
    required: true,
    maxlength: 2000
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending'
  },
  targetAdmins: [{
    adminId: { type: String },
    adminName: { type: String }
  }],
  messages: [{
    senderId: { type: String },
    senderName: { type: String },
    senderRole: { type: String }, // 'employee', 'admin', 'system'
    text: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  employeeSeen: {
    type: Boolean,
    default: true
  },
  adminSeen: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

requestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Request', requestSchema);
