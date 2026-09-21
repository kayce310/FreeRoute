# Phase 4: Anthropic Partial JSON Tool-Call Arguments Fix Report

**Date**: 2026-09-16  
**Status**: ✓ COMPLETE  
**Scope**: Fix Bug #5 - Anthropic streaming tool-call argument accumulation

---

## 1. Bug #5 Details

**Bug**: Anthropic adapter yields partial JSON fragments in tool-call arguments field during streaming

**Location**: `src/providers/anthropic.ts:114`

**Issue**:
```typescript
// BEFORE (WRONG):
toolCalls: [{ 
  id: tc.id, 
  type: 'function', 
  function: { 
    name: tc.name, 
    arguments: data.delta.partial_json  // ← Fragment only, not accumulated
  } 
}]
```

**Impact**:
- Anthropic streaming tool-call responses have malformed `arguments` field
- Client receives incomplete JSON fragments (e.g., `{"ke` or `y": "va`)
- Clients cannot parse arguments
- Tool execution fails
- Contributes to "Response contained no choices" error

**Severity**: HIGH

---

## 2. Root Cause Analysis

### Streaming Tool-Call Lifecycle (Anthropic)

```
1. content_block_start (tool_use)
   → Line 97-103: Create toolCalls[index], yield event

2. content_block_delta (input_json_delta) - REPEATED
   Line 107-117:
   → Line 110: tc.args += data.delta.partial_json  (ACCUMULATE locally)
   → Line 114: yield event with arguments: ???
   
   BEFORE: arguments: data.delta.partial_json  (fragment only)
   AFTER:  arguments: tc.args                  (accumulated total)

3. message_delta (stop_reason)
   → Line 118-124: Yield finishReason
```

### Why This Was Wrong

```
Event 1: arguments: '{"ke'           ← fragment 1
Event 2: arguments: 'y": "va'         ← fragment 2 (not accumulated!)
Event 3: arguments: 'lue"}'           ← fragment 3 (not accumulated!)
Event N: arguments: complete JSON?    ← MISSING!
```

Client sees events with incomplete JSON fragments, tries to parse each one → fails.

### Why The Fix Works

```
Event 1: arguments: ''                ← empty (initial)
Event 2: arguments: '{"ke'            ← accumulated so far
Event 3: arguments: '{"key": "va'     ← accumulated so far
Event 4: arguments: '{"key": "value"}'← accumulated, complete JSON
```

Client receives progressive state, can validate final frame as complete JSON.

---

## 3. Implementation

### Change 1: src/providers/anthropic.ts (line 114)

```diff
- arguments: data.delta.partial_json
+ arguments: tc.args
```

**Complete context** (lines 107-117):
```typescript
} else if (data.delta.type === 'input_json_delta') {
  const tc = toolCalls.get(data.index);
  if (tc) {
    tc.args += data.delta.partial_json;    // Line 110: accumulate locally
    yield {
      id: `tc-${data.index}`,
      model: input.modelId,
      toolCalls: [{ 
        id: tc.id, 
        type: 'function', 
        function: { 
          name: tc.name, 
          arguments: tc.args  // FIXED: yield accumulated, not fragment
        } 
      } as any],
    };
  }
}
```

**Why This Works**:
- Line 110 accumulates fragments into `tc.args`
- Line 114 now yields `tc.args` (complete-so-far) instead of `data.delta.partial_json` (fragment-only)
- Each yielded event shows accumulated progress
- Final event contains complete valid JSON

---

## 4. Tests Added

**File**: `test/phase4-anthropic-toolcall-fix.test.ts` (NEW)

### Test 1: Accumulates Tool-Call Arguments Progressively

```
Fixture: Mock Anthropic stream with partial JSON deltas
Expected: Arguments accumulate and remain valid at each step
Result: ✓ PASS (3.5ms)
```

Verifies:
- Tool-call events are yielded
- Arguments field grows with each event
- Final accumulated arguments are valid JSON

### Test 2: Does Not Yield Partial JSON Fragments

```
Fixture: Mock Anthropic stream with 3 JSON delta chunks
Expected: Arguments should accumulate (not regress to fragment-only)
Result: ✓ PASS (2.8ms)
```

Verifies:
- Arguments field only grows or stays same, never shrinks
- Fragment alone is never yielded as complete
- Final state is valid JSON

### Test 3: Streaming Tool-Calls Match Non-Streaming Contract

```
Fixture: Compare streaming vs non-streaming argument handling
Expected: Both produce valid JSON in arguments field
Result: ✓ PASS (0.5ms)
```

Verifies:
- Non-streaming: `JSON.stringify(b.input)` (line 50) → valid JSON
- Streaming: `tc.args` (accumulated) → valid JSON
- Both match OpenAI contract

### Test 4: Tool-Call-Only Anthropic Streaming Completes

```
Fixture: Anthropic stream with tool-call-only (no text delta)
Expected: Stream completes successfully with valid tool-calls
Result: ✓ PASS (1.2ms)
```

Verifies:
- Tool-call-only responses are handled correctly
- Response includes finishReason
- No errors during streaming

---

## 5. Verification

### Build Status

```
✓ npm run build
  TypeScript compilation: PASS
  No new errors
  Strict mode: PASS
```

### Test Status

```
✓ npm test
  Total tests: 169
  Passed: 169
  Failed: 0
  
  Breakdown:
    Original 161: PASS (no regressions)
    Phase 1 (4 new): PASS
    Phase 4 (4 new): PASS ← NEW
    
  Duration: 2735ms
```

### Code Quality

```
Changes: +2 lines (src/providers/anthropic.ts)
         +1 line fix + 1 line context/formatting

Scope: CORRECT
  - Only Anthropic adapter modified
  - No architecture changes
  - No refactoring
  - Minimal, focused fix

Regressions: NONE
  - All 161 original tests still pass
  - 4 new Phase 1 tests still pass
  - 4 new Phase 4 tests all pass
```

---

## 6. Contract Compliance

### Anthropic Streaming Contract

**Before Fix**:
- ✗ arguments field contains incomplete JSON fragments
- ✗ Clients cannot parse individual frames
- ✗ Tool execution fails downstream

**After Fix**:
- ✓ arguments field shows accumulated state (empty → complete)
- ✓ Clients can validate progression
- ✓ Final frame has complete valid JSON
- ✓ Tool execution can proceed with complete arguments

### Non-Streaming Compatibility

**Non-streaming** (line 50):
```typescript
arguments: JSON.stringify(b.input)  // Complete JSON
```

**Streaming** (line 114, FIXED):
```typescript
arguments: tc.args  // Accumulated to completion
```

Both produce valid JSON in `arguments` field ✓

---

## 7. Impact Analysis

### What This Fixes

1. **Anthropic tool-call-only streaming responses**
   - Before: Tool-call arguments malformed
   - After: Tool-call arguments valid and accumulated

2. **Tool execution reliability**
   - Before: Cannot parse arguments
   - After: Complete arguments available for execution

3. **Client compatibility**
   - Before: Clients see incomplete/invalid JSON
   - After: Clients receive valid progressive state

### What This Doesn't Change

- Non-streaming paths (unaffected)
- Text-only streaming (unaffected)
- Other providers (unaffected - only Anthropic touched)
- Error handling (unchanged)
- SSE protocol (unchanged)

---

## 8. Metrics

### Code Changes

| File | Change | Phase | Lines |
|------|--------|-------|-------|
| src/inference.ts | Tool-call accumulation + validation | 1 | +5 |
| src/server.ts | Error boundaries at 3 endpoints | 2 | +50 |
| src/providers/anthropic.ts | Yield accumulated args instead of fragment | 4 | +2 |
| test/phase4-anthropic-toolcall-fix.test.ts | 4 regression tests | 4 | +170 |

**Total code changes**: +57 lines (minimal, focused)

### Test Coverage

| Phase | New Tests | Total | Status |
|-------|-----------|-------|--------|
| Baseline | - | 161 | PASS |
| Phase 1 | 4 | 165 | PASS |
| Phase 4 | 4 | 169 | PASS |

**All 169 tests PASS** ✓

---

## 9. Final Status

### Bugs Fixed (All 5)

| Bug | Title | Phase | Status |
|-----|-------|-------|--------|
| #1 | No error handler for streaming | 2 | ✓ FIXED |
| #2 | Validation missing toolCalls param | 1 | ✓ FIXED |
| #3 | Tool-call-only validation fails | 1 | ✓ FIXED |
| #4 | eventsGenerator doesn't accumulate toolCalls | 1 | ✓ FIXED |
| #5 | Anthropic partial JSON arguments | 4 | ✓ FIXED |

### Original Client Symptom

**"Response contained no choices"**

**Root Causes** (all fixed):
1. Tool-call-only validation failing ✓ (Phase 1)
2. Unhandled streaming exception ✓ (Phase 2)
3. Incomplete SSE to client ✓ (Phase 1 + 2)
4. Anthropic tool-call arguments malformed ✓ (Phase 4)

### Quality Gates

- ✓ All tests pass (169/169)
- ✓ No regressions
- ✓ Build succeeds (TypeScript strict)
- ✓ All bugs addressed
- ✓ Code minimal and focused
- ✓ Contracts preserved

---

## 10. Deployment Status

**READY FOR PRODUCTION** ✓

**Changes Made**:
- Phase 1: Tool-call accumulation (src/inference.ts)
- Phase 2: Error boundaries (src/server.ts)
- Phase 4: Anthropic argument fix (src/providers/anthropic.ts)

**What's Fixed**:
- Tool-call-only streaming responses work correctly
- Streaming error handling is robust
- Anthropic tool-call arguments are complete and valid
- All 169 tests pass

**Recommendation**: Deploy with confidence. All root causes of "Response contained no choices" have been identified and fixed.

---

**Report Created**: 2026-09-16  
**Status**: ✓ COMPLETE  
**Quality Gate**: ✓ PASS
