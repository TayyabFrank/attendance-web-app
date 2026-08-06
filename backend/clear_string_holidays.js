const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority";

async function run() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('attendance');
  const collection = db.collection('holidays');
  
  const all = await collection.find({}).toArray();
  let deletedCount = 0;
  
  for (const doc of all) {
    if (typeof doc.date === 'string') {
      console.log(`Deleting string date for ${doc._id}: ${doc.date}`);
      await collection.deleteOne({ _id: doc._id });
      deletedCount++;
    }
  }
  
  // Also delete ANY holiday on August 6th to clear it for the user
  const todayStart = new Date('2026-08-06T00:00:00.000Z');
  const todayEnd = new Date('2026-08-06T23:59:59.999Z');
  const deleteRes = await collection.deleteMany({ date: { $gte: todayStart, $lte: todayEnd } });
  
  console.log(`Deleted ${deletedCount} legacy string dates.`);
  console.log(`Deleted ${deleteRes.deletedCount} holidays on August 6th.`);
  
  await client.close();
}
run();
