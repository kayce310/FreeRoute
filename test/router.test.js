import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFailureCooldown, chooseRoute } from '../src/router.js';
const now = new Date('2026-09-03T00:00:00.000Z');
function candidate(overrides = {}) {
    return {
        providerId: 'provider',
        modelId: 'model',
        credentialId: 'key-1',
        capabilities: ['chat', 'streaming'],
        freeTier: 'free_verified',
        checkedAt: now,
        priority: 10,
        preference: 'neutral',
        healthScore: 70,
        latencyScore: 10,
        quotaScore: 10,
        ...overrides,
    };
}
test('routes to the highest scoring compatible free candidate', () => {
    const decision = chooseRoute({ profile: 'auto:free', requiredCapabilities: ['chat', 'streaming'] }, [candidate({ modelId: 'slow', latencyScore: 1 }), candidate({ modelId: 'fast', latencyScore: 20 })], now);
    assert.equal(decision?.candidate.modelId, 'fast');
    assert.match(decision?.reasons.join(' ') ?? '', /tier:free_verified/);
});
test('never auto-routes blocked, paid, cooled down, or incompatible candidates', () => {
    const decision = chooseRoute({ profile: 'auto:free', requiredCapabilities: ['tools'] }, [
        candidate({ modelId: 'blocked', capabilities: ['chat', 'tools'], preference: 'block' }),
        candidate({ modelId: 'paid', capabilities: ['chat', 'tools'], freeTier: 'paid' }),
        candidate({ modelId: 'cooling', capabilities: ['chat', 'tools'], cooldownUntil: new Date(now.getTime() + 1) }),
        candidate({ modelId: 'usable', capabilities: ['chat', 'tools'] }),
    ], now);
    assert.equal(decision?.candidate.modelId, 'usable');
});
test('rate limits apply a scoped cooldown', () => {
    const cooled = applyFailureCooldown(candidate(), { kind: 'rate_limit', retryAfterMs: 5_000 }, now);
    assert.equal(cooled.cooldownUntil?.toISOString(), '2026-09-03T00:00:05.000Z');
});
//# sourceMappingURL=router.test.js.map