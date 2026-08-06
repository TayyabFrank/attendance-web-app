const mongoose = require('mongoose');
const uri = "mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority";
const Holiday = mongoose.model('Holiday', new mongoose.Schema({ date: Date, name: String, type: String }));

async function checkAll() {
  await mongoose.connect(uri);
  const all = await Holiday.find({});
  console.log('ALL Holidays:', all);
  await mongoose.disconnect();
}
checkAll();
