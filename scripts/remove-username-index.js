require('dotenv/config');
const mongoose = require('mongoose');

async function main() {

await mongoose.connect(
process.env.MONGODB_URI
);

console.log(
'Connected'
);

try{

await mongoose.connection.db
.collection('users')
.dropIndex(
'username_1'
);

console.log(
'✅ username_1 removed'
);

}
catch(err){

console.log(
'Index not found:',
err.message
);

}

await mongoose.disconnect();

}

main();