const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./data/freeroute.sqlite');

console.log('=== KIRO PROVIDER BEFORE FIX (CURRENT) ===');
db.get("SELECT * FROM providers WHERE provider_id = 'kiro';", (err, row) => {
  if (err) throw err;
  console.log(JSON.stringify(row, null, 2));
  db.close();
});