const mongoose = require('mongoose');

const uri = "mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority";

const holidaySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  name: { type: String, required: true },
  type: { type: String, default: 'company' }
});

const Holiday = mongoose.model('Holiday', holidaySchema);

async function checkHolidays() {
  await mongoose.connect(uri);
  
  // Get all holidays in August 2026
  const start = new Date('2026-08-01T00:00:00Z');
  const end = new Date('2026-08-31T23:59:59Z');
  
  const holidays = await Holiday.find({ date: { $gte: start, $lte: end } });
  
  console.log('Holidays in August 2026:');
  holidays.forEach(h => {
    console.log(`- ID: ${h._id} | Name: ${h.name} | Date: ${h.date.toISOString()}`);
  });
  
  await mongoose.disconnect();
}

checkHolidays();
