const mongoose = require('mongoose');

const officeSettingsSchema = new mongoose.Schema({
  officeLatitude: {
    type: Number,
    default: 33.6844 // Default: Islamabad latitude
  },
  officeLongitude: {
    type: Number,
    default: 73.0479 // Default: Islamabad longitude
  },
  allowedRadius: {
    type: Number,
    default: 100 // Default: 100 meters
  },
  vpnCheckEnabled: {
    type: Boolean,
    default: true
  },
  geofenceEnabled: {
    type: Boolean,
    default: true
  },

  saturdayOff: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('OfficeSettings', officeSettingsSchema);
