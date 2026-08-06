const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://uetkskshared_db_user:m9D92J9ab9WBnfnQ@cluster0.svhx4z2.mongodb.net/attendance?retryWrites=true&w=majority";

async function run() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('attendance');
  const collection = db.collection('holidays');
  
  const all = await collection.find({}).toArray();
  
  all.forEach(doc => {
    console.log(`ID: ${doc._id} | Date Type: ${typeof doc.date} | Date: ${doc.date}`);
  });
  
  await client.close();
}
run();
