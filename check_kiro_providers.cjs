// Quick script to check Kiro provider using CommonJS
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

try {
  const db = new sqlite3.Database('data/freeroute.sqlite');
  
  db.serialize(() => {
    console.log('=== TABLES ===');
    db.each("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;", (err, row) => {
      if (err) throw err;
      console.log(' ', row.name);
    });
    
    console.log('\n=== KIRO PROVIDERS ===');
    db.each("SELECT * FROM providers WHERE provider_id LIKE '%kiro%';", (err, row) => {
      if (err) throw err;
      console.log(' ', row);
    });
    
    console.log('\n=== ALL PROVIDERS ===');
    db.each("SELECT provider_id, adapter_type, base_url FROM providers;", (err, row) => {
      if (err) throw err;
      console.log(' ', row.provider_id, row.adapter_type, row.base_url);
    });
  });
  
  db.close();
} catch (err) {
  console.error('Error:', err);
}