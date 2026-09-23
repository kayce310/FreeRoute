const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

try {
  const db = new sqlite3.Database('data/freeroute.sqlite');
  
  db.serialize(() => {
    console.log('Tables:');
    db.each("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;", (err, row) => {
      if (err) throw err;
      console.log(' ', row.name);
    });
    
    console.log('\nProviders with kiro:');
    db.each("SELECT * FROM providers WHERE provider_id LIKE '%kiro%';", (err, row) => {
      if (err) throw err;
      console.log(' ', row);
    });
    
    console.log('\n---');
    db.each("SELECT name, sql FROM sqlite_master WHERE type='table';", (err, row) => {
      if (err) throw err;
      console.log('\nTable:', row.name);
      console.log('Schema:', row.sql);
    });
  });
  
  db.close();
} catch (err) {
  console.error('Error:', err);
}