const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['public', 'company', 'emergency'],
    default: 'company'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Holiday', holidaySchema);
