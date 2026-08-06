const mongoose = require('mongoose');
const uri = "mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority";

const holidaySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  name: { type: String, required: true },
  type: { type: String, default: 'company' }
});
const Holiday = mongoose.model('Holiday', holidaySchema);

async function testDelete() {
  await mongoose.connect(uri);
  
  const date = '2026-08-05'; // Let's try August 5th
  const [year, month, day] = date.split('-');
  const startOfDay = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0));
  const endOfDay = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 23, 59, 59, 999));
  
  console.log('Querying from:', startOfDay, 'to', endOfDay);
  const found = await Holiday.find({ date: { $gte: startOfDay, $lte: endOfDay } });
  console.log('Found to delete:', found);
  
  // await Holiday.deleteMany({ date: { $gte: startOfDay, $lte: endOfDay } });
  
  await mongoose.disconnect();
}
testDelete();
