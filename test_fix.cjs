const sqlite3 = require('sqlite3').verbose();
const { createOpenRouterRuntime } = require('./dist/app.js');

async function test() {
  const runtime = createOpenRouterRuntime({
    databasePath: './data/freeroute.sqlite',
    masterSecret: 'test-secret-for-fix-verification-minimum-16-chars',
  });

  // Give it a moment to run the fix
  await new Promise(r => setTimeout(r, 1000));
  
  // Now check the database
  const db = new sqlite3.Database('./data/freeroute.sqlite');
  
  console.log('=== KIRO PROVIDER AFTER FIX ===');
  db.get("SELECT * FROM providers WHERE provider_id = 'kiro';", (err, row) => {
    if (err) throw err;
    console.log(JSON.stringify(row, null, 2));
    db.close();
    process.exit(0);
  });
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});