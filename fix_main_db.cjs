const { createOpenRouterRuntime } = require('./dist/src/app.js');

async function fixMainDb() {
  console.log('Fixing main database...');
  const runtime = createOpenRouterRuntime({
    databasePath: './data/freeroute.sqlite',
    masterSecret: 'test-secret-for-fix-verification-minimum-16-chars',
  });
  
  // Give it a moment to run the fix
  await new Promise(r => setTimeout(r, 1000));
  console.log('Done');
  process.exit(0);
}

fixMainDb().catch(err => {
  console.error(err);
  process.exit(1);
});