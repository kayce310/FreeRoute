const sqlite3 = require('sqlite3').verbose();

async function testRuntimeFix() {
  // Copy the database to a test file
  const fs = require('fs');
  fs.copyFileSync('./data/freeroute.sqlite', './data/freeroute_test.sqlite');
  
  // Import the built app
  const { createOpenRouterRuntime } = require('./dist/src/app.js');
  
  console.log('Creating runtime...');
  const runtime = createOpenRouterRuntime({
    databasePath: './data/freeroute_test.sqlite',
    masterSecret: 'test-secret-for-fix-verification-minimum-16-chars',
  });
  
  // Give it a moment to run the fix
  await new Promise(r => setTimeout(r, 1000));
  
  // Now check the database
  const db = new sqlite3.Database('./data/freeroute_test.sqlite');
  
  console.log('\n=== KIRO PROVIDER AFTER FIX ===');
  db.get("SELECT * FROM providers WHERE provider_id = 'kiro';", (err, row) => {
    if (err) throw err;
    console.log(JSON.stringify(row, null, 2));
    
    console.log('\n=== ALL PROVIDER IDs (built-in) ===');
    db.all("SELECT provider_id, adapter_type, base_url FROM providers WHERE provider_id IN ('openrouter', 'groq', 'gemini', 'anthropic', 'kiro');", (err2, rows) => {
      if (err2) throw err2;
      for (const r of rows) {
        console.log(r.provider_id, r.adapter_type, r.base_url);
      }
      db.close();
      fs.unlinkSync('./data/freeroute_test.sqlite');
      process.exit(0);
    });
  });
}

testRuntimeFix().catch(err => {
  console.error(err);
  process.exit(1);
});