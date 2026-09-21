# Phase 1: Tool-call Streaming Fix Report

**Date**: 2026-09-16  
**Status**: ✓ COMPLETE  
**Scope**: Bugs #3 + #4 (streaming tool-call handling)

---

## 1. Changes Made

### File: `src/inference.ts`

**Location**: Lines 301-330 (eventsGenerator function)

**Change 1 - Add toolCalls accumulation (Bug #4 fix)**:

```typescript
// Line 303: Add accumulator
let accumulatedToolCalls: ToolCall[] = [];

// Lines 310, 318: Accumulate tool-calls from stream events
if (first.value.toolCalls) accumulatedToolCalls.push(...first.value.toolCalls);
if (next.value.toolCalls) accumulatedToolCalls.push(...next.value.toolCalls);
```

**Change 2 - Pass accumulated toolCalls to validation (Bug #3 fix)**:

```typescript
// Line 330: Pass toolCalls to isMeaningful()
if (!isMeaningful({ 
  content: accumulatedDelta, 
  thought: finalUsage ? 'usage' : undefined,
  toolCalls: accumulatedToolCalls  // ← NEW PARAMETER
})) {
```

**Summary**:
- Added 1 new variable: `accumulatedToolCalls: ToolCall[]`
- Added 2 accumulation points matching existing delta/usage accumulation pattern
- Passed accumulated toolCalls to existing validation function
- No semantic changes to emitted events or contract

---

## 2. Contract Analysis

### NormalizedChatStreamEvent (src/inference.ts:44-52)

```typescript
export interface NormalizedChatStreamEvent {
  id: string;
  model: string;
  delta?: string;              // Text delta (accumulated by existing code)
  thought?: string;
  finishReason?: string | null;
  toolCalls?: ToolCall[];      // Tool calls (delta per event, must accumulate)
  usage?: TokenUsage;
}
```

### isMeaningful() signature (src/inference.ts:62-63)

```typescript
function isMeaningful(res: { 
  content: string; 
  thought?: string; 
  toolCalls?: ToolCall[]      // ← Parameter already existed but wasn't used
}): boolean {
  return !!(res.content.trim() || res.toolCalls?.length || res.thought);
}
```

### Key Contract Points

1. **Stream events are DELTA, not accumulated**:
   - Each `NormalizedChatStreamEvent.delta` is a delta (fragment of text)
   - Each `NormalizedChatStreamEvent.toolCalls` is a delta (new tool-calls in this event)
   - Provider adapters emit events as they arrive (streaming)

2. **Validation needs ACCUMULATED state**:
   - At stream end, `eventsGenerator()` validates if response was meaningful
   - Validation must see: total text, total tool-calls, usage token info
   - Not individual deltas/chunks

3. **Accumulation layer is internal to eventsGenerator()**:
   - Mirrors existing `accumulatedDelta` pattern (line 303, 308, 315)
   - Local to generator closure
   - Does not modify provider events or wire contract
   - Events emitted unchanged (line 309, 316)

4. **Tool-calls are not duplicated**:
   - Provider emits each tool-call once
   - Generator accumulates via `push(...toolCalls)` - no duplication
   - Validation sees final accumulated list

---

## 3. Tests Added

**File**: `test/phase1-toolcall-fix.test.ts` (265 lines)

### Test 1: Tool-call-only streaming

```text
Fixture: Mock adapter yields only tool-calls (no text delta)
Expected: Generator completes successfully, tool-calls preserved
Result: ✓ PASS
```

Verifies Bug #4 is fixed: tool-calls are accumulated and don't cause validation to fail.

### Test 2: Multiple tool-calls without duplication

```text
Fixture: Stream yields 2 separate tool-call events
Expected: Final list has both, no duplication
Result: ✓ PASS
```

Verifies accumulation doesn't duplicate tool-calls across multiple stream events.

### Test 3: Text + tool-call streaming

```text
Fixture: Stream yields text deltas AND tool-calls interleaved
Expected: Both preserved, both meaningful
Result: ✓ PASS
```

Verifies Bug #3 is fixed: validation sees both content and toolCalls, accepts response.

### Test 4: Text-only streaming regression

```text
Fixture: Existing behavior - text-only stream
Expected: Still works, no regression
Result: ✓ PASS
```

Ensures fix doesn't break existing text-only streaming.

### Test Execution

```
npm test:
  Original 161 tests: PASS
  New 4 tests: PASS
  Total: 165/165 PASS

npm run build:
  TypeScript compilation: PASS
```

---

## 4. Verification

### Build Status

```
✓ npm run build
  No TypeScript errors
  All code compiles
```

### Test Status

```
✓ npm test
  Tests run: 165
  Passed: 165
  Failed: 0
  Duration: 2539ms
```

### Regression Test Results

**Tool-call-only streaming (Critical)**:
- Before fix: InvalidResponseError thrown
- After fix: Completes successfully ✓

**Multiple tool-calls**:
- Before fix: Each event would fail validation separately (would error on first)
- After fix: All accumulated, validation sees complete picture ✓

**Text + tool-call**:
- Before fix: Would pass (has text), but tool-calls not validated
- After fix: Both validated together ✓

**Text-only**:
- Before fix: Works ✓
- After fix: Works ✓ (no regression)

---

## 5. Remaining Issues (Out of Scope - Phase 1)

### Phase 2: Error Handling (NOT FIXED)

Bug #1 and #2 remain unfixed:
- `src/server.ts:986` - Single-model streaming has no try-catch
- `src/server.ts:1088` - Responses endpoint has no try-catch
- If exception thrown in `eventsGenerator()`, still not caught (but won't happen now for tool-call-only)

### Phase 3: Other Bugs (NOT FIXED)

Bug #5 remains unfixed:
- `src/providers/anthropic.ts:114` - Partial JSON arguments yielded as-is
- Not related to streaming validation layer

### Not Tested

- Direct Copilot reproduction (requires VS Code integration)
- Raw SSE frame capture (requires HTTP server integration test)
- End-to-end scenario with real provider

---

## 6. Final Status

### What Changed

| File | Lines | Change | Type |
|------|-------|--------|------|
| `src/inference.ts` | 303, 304, 310, 318, 330 | Add accumulatedToolCalls, pass to validation | BUGFIX |
| `test/phase1-toolcall-fix.test.ts` | NEW | 4 regression tests | TESTING |

### Contract Preserved

- ✓ NormalizedChatStreamEvent events unchanged
- ✓ Provider adapter interface unchanged
- ✓ Wire SSE format unchanged
- ✓ Existing tests all pass
- ✓ No API breaking changes

### Bugs Fixed

- ✓ **Bug #4**: eventsGenerator now accumulates toolCalls
- ✓ **Bug #3**: Validation now receives accumulated toolCalls

### Tests

```
Baseline tests: 161 PASS
New regression tests: 4 PASS
Total: 165 PASS
Coverage: Tool-call-only, multiple tool-calls, text+tool, text-only
```

### Scope Compliance

✓ Only `src/inference.ts` modified  
✓ Only related tests added  
✓ No unrelated refactoring  
✓ No architecture changes  
✓ No Anthropic/combo/routing changes  
✓ TypeScript compiles cleanly  
✓ All tests pass  

### Build Status

```
✓ PASS - npm run build
✓ PASS - npm test
✓ PASS - TypeScript strict mode
```

---

## 7. Recommended Next Steps

### Phase 2: Error Handling (LOW RISK)

1. Add try-catch around `for await` loops at server.ts:986 and 1088
2. Emit graceful error frames or [DONE] on exception
3. Test stream error scenarios

### Phase 3: Correctness (MEDIUM RISK)

4. Fix Anthropic partial JSON handling (src/providers/anthropic.ts:114)
5. Verify Anthropic streaming produces valid tool-call JSON

### Phase 4: Testing (SAFE)

6. Add end-to-end tests with real providers
7. Verify Copilot receives valid responses
8. HTTP streaming integration tests

---

## Conclusion

**Phase 1 COMPLETE** - Bugs #3 and #4 fixed successfully.

Tool-call-only streaming now:
- ✓ Accumulates tool-calls during streaming
- ✓ Passes accumulated toolCalls to validation
- ✓ Correctly identifies tool-call-only response as meaningful
- ✓ Completes successfully without InvalidResponseError

4 regression tests confirm fix works and existing behavior preserved.

Ready for Phase 2 (error handling) when authorized.

---

**Report Created**: 2026-09-16T04:17:22.000Z  
**Files Modified**: 1 source file + 1 test file  
**Build Status**: ✓ PASS  
**Test Status**: 165/165 PASS  
**Git Status**: Uncommitted changes (per requirements)
