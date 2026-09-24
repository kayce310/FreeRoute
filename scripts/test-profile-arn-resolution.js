#!/usr/bin/env node

import { resolveKiroProfileArn } from './src/providers/kiro.js';

async function testProfileArnResolution() {
  console.log('Testing profileArn resolution logic...');
  
  // Test case 1: Source has profileArn, should preserve it
  console.log('\nTest 1: Source has profileArn');
  const sourceCred1 = {
    accessToken: 'test-token',
    authMethod: 'builder_id',
    profileArn: 'arn:aws:codewhisperer:us-east-1:123456789012:profile/ABCDE12345',
    region: 'us-east-1',
    refreshToken: 'refresh-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    expiresAt: Date.now() + 3600000,
  };
  
  const resolved1 = await resolveKiroProfileArn(
    sourceCred1.providerSpecificData?.profileArn || null,
    sourceCred1.accessToken,
    sourceCred1.region || 'us-east-1',
    () => Promise.resolve({ ok: true, json: () => Promise.resolve({ profiles: [{ arn: 'arn:aws:codewhisperer:us-east-1:123456789012:profile/ABCDE12345' }] }) })
  );
  
  console.log('Source profileArn:', sourceCred1.profileArn);
  console.log('Resolved profileArn:', resolved1);
  console.log('Should preserve source profileArn:', resolved1 === sourceCred1.profileArn);
  
  // Test case 2: Source missing profileArn, should resolve from API
  console.log('\nTest 2: Source missing profileArn, API resolves it');
  const sourceCred2 = {
    accessToken: 'test-token-2',
    authMethod: 'builder_id',
    profileArn: null,
    region: 'us-east-1',
    refreshToken: 'refresh-token-2',
    clientId: 'client-id-2',
    clientSecret: 'client-secret-2',
    expiresAt: Date.now() + 3600000,
  };
  
  const resolved2 = await resolveKiroProfileArn(
    sourceCred2.providerSpecificData?.profileArn || null,
    sourceCred2.accessToken,
    sourceCred2.region || 'us-east-1',
    () => Promise.resolve({ ok: true, json: () => Promise.resolve({ profiles: [{ arn: 'arn:aws:codewhisperer:us-east-1:999999999999:profile/XXX' }] }) })
  );
  
  console.log('Source profileArn:', sourceCred2.profileArn);
  console.log('Resolved profileArn:', resolved2);
  console.log('Should resolve from API:', resolved2 === 'arn:aws:codewhisperer:us-east-1:999999999999:profile/XXX');
  
  // Test case 3: Source missing profileArn, API fails, should return null
  console.log('\nTest 3: Source missing profileArn, API fails');
  const sourceCred3 = {
    accessToken: 'test-token-3',
    authMethod: 'builder_id',
    profileArn: null,
    region: 'us-east-1',
    refreshToken: 'refresh-token-3',
    clientId: 'client-id-3',
    clientSecret: 'client-secret-3',
    expiresAt: Date.now() + 3600000,
  };
  
  const resolved3 = await resolveKiroProfileArn(
    sourceCred3.providerSpecificData?.profileArn || null,
    sourceCred3.accessToken,
    sourceCred3.region || 'us-east-1',
    () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
  );
  
  console.log('Source profileArn:', sourceCred3.profileArn);
  console.log('Resolved profileArn:', resolved3);
  console.log('Should be null:', resolved3 === null);
  
  console.log('\n=== All tests completed ===');
}

testProfileArnResolution();