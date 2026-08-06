const { MongoClient, ObjectId } = require('mongodb');
const uri = "mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority";

async function run() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('attendance');
  const collection = db.collection('holidays');
  
  const all = await collection.find({}).toArray();
  let updatedCount = 0;
  
  for (const doc of all) {
    if (typeof doc.date === 'string') {
      console.log(`Converting string date for ${doc._id}: ${doc.date}`);
      await collection.updateOne(
        { _id: doc._id },
        { $set: { date: new Date(doc.date) } }
      );
      updatedCount++;
    }
  }
  
  // Now delete August 6th to help the user since they want it removed!
  const todayStart = new Date('2026-08-06T00:00:00.000Z');
  const todayEnd = new Date('2026-08-06T23:59:59.999Z');
  const deleteRes = await collection.deleteMany({ date: { $gte: todayStart, $lte: todayEnd } });
  
  console.log(`Converted ${updatedCount} string dates to Date objects.`);
  console.log(`Deleted ${deleteRes.deletedCount} holidays on August 6th.`);
  
  await client.close();
}
run();
