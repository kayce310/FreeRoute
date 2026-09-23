const sqlite3 = require('sqlite3').verbose();

try {
  const db = new sqlite3.Database('data/freeroute.sqlite');
  
  console.log('=== KIRO PROVIDER RECORD ===');
  db.get("SELECT * FROM providers WHERE provider_id = 'kiro';", (err, row) => {
    if (err) throw err;
    console.log(JSON.stringify(row, null, 2));
    
    console.log('\n=== KIRO CREDENTIALS ===');
    db.all("SELECT provider_id, credential_id, name, enabled, priority, test_status FROM credentials WHERE provider_id = 'kiro';", (err2, rows) => {
      if (err2) throw err2;
      console.log(JSON.stringify(rows, null, 2));
      
      console.log('\n=== CREDENTIALS TABLE SCHEMA ===');
      db.get("SELECT sql FROM sqlite_master WHERE name='credentials';", (err3, row3) => {
        if (err3) throw err3;
        console.log(row3.sql);
        
        console.log('\n=== PROVIDERS TABLE SCHEMA ===');
        db.get("SELECT sql FROM sqlite_master WHERE name='providers';", (err4, row4) => {
          if (err4) throw err4;
          console.log(row4.sql);
          
          console.log('\n=== ALL PROVIDER IDs ===');
          db.all("SELECT provider_id, adapter_type, base_url FROM providers ORDER BY provider_id;", (err5, rows5) => {
            if (err5) throw err5;
            for (const r of rows5) {
              console.log(r.provider_id, r.adapter_type, r.base_url);
            }
            db.close();
          });
        });
      });
    });
  });
} catch (err) {
  console.error('Error:', err);
}