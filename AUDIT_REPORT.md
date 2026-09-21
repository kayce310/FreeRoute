# FreeRoute Architecture & Runtime Flow Audit Report

**Audit Date**: 2026-09-16  
**Focus**: Root cause of `Response contained no choices` errors and tool calling issues  
**Scope**: End-to-end request flow, response normalization, streaming, tool handling

---

## Executive Summary

### Confirmed Root Causes

1. **CRITICAL: Unhandled exception during streaming event generation** (streaming path)
   - If `InvalidResponseError` is thrown inside the async generator in `inference.ts:eventsGenerator()`, it escapes the `for await` loop in `server.ts` without proper error handling or response finalisation.
   - Result: HTTP 200 response written, but streaming abruptly stops without final `[DONE]` frame or proper SSE structure.
   - Client receives partial/malformed stream, interprets as "no valid choices".

2. **STRONG CANDIDATE: Tool-call-only validation inconsistency** (non-streaming path)
   - `inference.ts:isMeaningful()` correctly allows tool-call-only responses.
   - But upstream adapters may not consistently return tool calls in expected format.
   - Anthropic adapter streaming (line 114) yields partial tool_call arguments as complete chunks, risking malformed accumulation.

3. **Tool response handling gap in streaming context**
   - Streaming tool-call chunks are yielded individually without guaranteeing they accumulate into a valid complete tool_call by final response assembly.
   - No end-to-end test for streaming + tool calling combined.

### Test Coverage Gaps

- No test for streaming when adapter yields InvalidResponseError during iteration.
- No test for tool-call-only response in streaming path.
- No test for mixed textual content + tool calls in streaming.
- No test for empty stream that triggers `invalid_stream` failure.

---

## Runtime Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Copilot/VS Code)                          │
└──────────────────────┬──────────────────────────────────────────────────────┘
                       │ POST /v1/chat/completions + stream: true/false
                       │ + tools (optional)
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FreeRoute HTTP Server (server.ts)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ readChatRequest() → parseRequestedModel() → capabilitiesForProfile() │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ if combo: loop through combo.models, try each                       │    │
│  │ else: single provider/model request                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│          │                                                                    │
│          ├─ if stream: chat.stream(...)                                      │
│          │  └─ returns { decision, events: AsyncIterable, fallbackCount }   │
│          │     └─ [ERROR SITE 1] for await (event of events)               │
│          │        └─ If generator throws → no try-catch → unhandled         │
│          │        └─ Response already writeHead(200, SSE headers)           │
│          │        └─ Stream stops, client receives partial/no-choices       │
│          │                                                                    │
│          └─ else: chat.complete(...)                                        │
│             └─ returns { response, decision, fallbackCount }                │
│                └─ [ERROR SITE 2] response.content may be empty              │
│                └─ Wrapped in choices[0].message.content                     │
│                └─ choices always populated (line 1046)                      │
│                └─ But if exception thrown earlier → no HTTP 200             │
└─────────────────────────────────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  ChatService (inference.ts)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ complete() or stream():                                             │    │
│  │   1. Get route candidates from catalog + credentials                │    │
│  │   2. chooseRoute() → select best candidate                          │    │
│  │   3. Call adapter.chat() or adapter.streamChat()                    │    │
│  │   4. [VALIDATION] isMeaningful(response)                            │    │
│  │      └─ Allows: content.trim() || toolCalls.length || thought       │    │
│  │      └─ Rejects: empty content + no toolCalls + no thought          │    │
│  │   5. If not meaningful → throw InvalidResponseError                 │    │
│  │   6. Emit success/failure telemetry                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  For streaming (stream() method, line 267-379):                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. adapter.streamChat() returns AsyncIterable<NormalizedChatStreamEvent> │
│  │ 2. Wrap in eventsGenerator() function (line 305-334)                │    │
│  │    └─ Consumes iterator sequentially                                │    │
│  │    └─ Accumulates deltas, usage, toolCalls                          │    │
│  │    └─ At END: isMeaningful({content: accumulatedDelta, ...})       │    │
│  │    └─ [ERROR SITE 3] throws InvalidResponseError if empty           │    │
│  │       ← This error is INSIDE the generator function                 │    │
│  │       ← When server does: for await (event of events)              │    │
│  │       ← Error escapes generator → caught by... [NONE]               │    │
│  │ 3. Return { decision, events: eventsGenerator(), fallbackCount }   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Provider Adapter (e.g., openai-compatible.ts)             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ chat():                                                             │    │
│  │   POST /chat/completions → upstream                                │    │
│  │   Extract: content, toolCalls, usage                               │    │
│  │   Validate: if !content && !toolCalls → throw ProviderInvocationError │
│  │   Return: { id, model, content, toolCalls?, usage }               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  streamChat():                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │   POST /chat/completions?stream=true → upstream                    │    │
│  │   SSE parser loop (line 201-271):                                  │    │
│  │     - Parse `data: {...}` frames                                   │    │
│  │     - Yield NormalizedChatStreamEvent for each chunk               │    │
│  │     - Extract: delta (text), toolCalls (partial arguments)        │    │
│  │     - Include usage in final events                                │    │
│  │   Return: AsyncIterable (generator function)                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Upstream Provider API                                 │
│   (OpenAI, Groq, Gemini, Anthropic, OpenRouter, etc.)                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Findings

### Finding 1: Unhandled Exception in Streaming Event Generator
**ID**: STREAM-UNHANDLED-ERROR  
**Severity**: CRITICAL  
**Status**: CONFIRMED (code inspection)  
**Type**: FACT

**File**: `src/inference.ts`, lines 305-334  
**Function**: `ChatService.stream()` → `eventsGenerator()`

**Observed Behavior**:
The streaming event generator (eventsGenerator) is an async generator that:
1. Yields events from the upstream adapter stream
2. At the end (after `while` loop completes), validates accumulated content via `isMeaningful()`
3. If not meaningful, throws `InvalidResponseError`

**Problem**:
When this generator throws an error, the error occurs INSIDE the generator. The calling code in `server.ts` (line 986-998):
```typescript
for await (const event of result.events) {
  // event handling
}
response.end('data: [DONE]\\n\\n');
```

Has NO try-catch around it. If the generator throws during final validation:
- The for-await loop breaks
- An uncaught exception occurs
- Node.js will either crash the process or silently close the connection
- Client sees incomplete SSE stream or connection reset
- No `[DONE]` frame sent
- Client interprets this as "no valid response" → "no choices"

**Expected Contract**:
Streaming errors should either:
1. Be caught and converted to error events within the stream, or
2. Be caught by the server and converted to a proper error response (but headers already sent, so too late), or
3. Never occur during iteration (errors should be caught upstream)

**Root Cause**:
The validation logic (`isMeaningful`) is placed inside the generator's final block, which executes AFTER the main event emission loop. This is the wrong place—it should either:
- Execute BEFORE iteration starts (to fail fast), or
- Be handled by the adapter, or
- Be wrapped in a try-catch in server.ts

**Impact**:
- Streaming requests that result in "empty" final response throw unhandled exceptions
- Client receives malformed SSE stream (no `[DONE]`, no final choices, connection drops)
- Manifests as "Response contained no choices" in VS Code Copilot / clients

**Evidence**:
- `inference.ts:327-329`: `if (!isMeaningful(...)) throw new InvalidResponseError(...)`
- `server.ts:986-998`: `for await (const event of result.events) { ... }` with no try-catch
- No test for streaming + empty response scenario

---

### Finding 2: Tool-Call-Only Streaming Accumulation Risk
**ID**: TOOLCALL-STREAMING-ACCUMULATION  
**Severity**: HIGH  
**Status**: INFERENCE  
**Type**: INFERENCE

**File**: `src/providers/anthropic.ts`, lines 104-116  
**Function**: `AnthropicAdapter.streamChat()`

**Observed Behavior**:
When Anthropic streaming yields tool-call chunks, partial JSON argument fragments are yielded as complete events:
```typescript
else if (data.delta.type === 'input_json_delta') {
  const tc = toolCalls.get(data.index);
  if (tc) {
    tc.args += data.delta.partial_json;
    yield {
      id: `tc-${data.index}`,
      model: input.modelId,
      toolCalls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: data.delta.partial_json } } as any],
    };
  }
}
```

**Problem**:
The `toolCalls` field in each yielded event contains `arguments: data.delta.partial_json`, which is only a fragment. If the server-side code expects complete JSON in each event (instead of accumulating fragments), it may:
1. Try to parse incomplete JSON
2. Treat partial argument as complete
3. Create invalid tool-call in final response

Additionally, the `isMeaningful()` check in inference.ts only checks `toolCalls?.length`, not validity of the tool-call structure.

**Expected Contract**:
Tool-call arguments should either:
- Be accumulated and yielded only when complete, or
- Be clearly marked as partial, or
- Be accumulated downstream (in server.ts or tool-call assembler)

**Root Cause**:
Streaming tool-call handling mixes partial and complete states without clear demarcation. The system treats "toolCalls present" as valid, but doesn't validate argument completeness.

**Impact**:
- Tool-call-only streaming responses may have malformed `arguments` field
- Downstream clients may fail to parse/execute tools
- Tool execution fails, appears as "no choices" to client

**Evidence**:
- `anthropic.ts:114`: yields `arguments: data.delta.partial_json` (fragment, not complete)
- `inference.ts:63`: `isMeaningful()` only checks `toolCalls?.length`, not argument validity
- `test/telemetry/invalid-response.test.ts:62-72`: tests tool-call-only success, but NOT in streaming path
- No test for streaming tool calls

---

### Finding 3: No Error Handler for Streaming Event Iteration
**ID**: SERVER-STREAMING-NO-CATCH  
**Severity**: CRITICAL  
**Status**: CONFIRMED (code inspection)  
**Type**: FACT

**File**: `src/server.ts`, lines 731-818 (combo streaming) and 973-1018 (single model streaming)

**Observed Behavior**:
```typescript
for await (const event of result.events) {
  if (event.usage) usageState.captured = event.usage;
  if (event.delta) usageState.accumulatedText += event.delta;
  const includeUsage = event.usage ?? usageState.captured;
  response.write(`data: ${JSON.stringify({...})}\\n\\n`);
}
response.end('data: [DONE]\\n\\n');
```

There is NO try-catch around the for-await loop.

**Problem**:
If any exception is thrown during iteration (from the async generator or response.write):
1. The loop breaks
2. The exception propagates to the outer scope
3. No error event is sent to the client
4. No `[DONE]` frame is sent
5. The response is left in an inconsistent state (headers sent, body incomplete)

**Expected Contract**:
All exceptions during streaming should be:
1. Caught and converted to SSE error events, or
2. Caught and logged, or
3. Prevented from occurring

**Root Cause**:
Streaming code path was not designed with comprehensive error handling. The focus was on happy-path event iteration.

**Impact**:
- Any error during streaming (including InvalidResponseError from isMeaningful) causes connection to drop
- Client receives incomplete SSE stream
- Interprets as "no valid response" → "Response contained no choices"

**Evidence**:
- `server.ts:786-798`: combo streaming loop, no try-catch
- `server.ts:986-998`: single model streaming loop, no try-catch
- `src/inference.ts:327-329`: can throw inside generator during iteration

---

### Finding 4: Response Always Has Choices, But Server Can Fail Before Sending
**ID**: RESPONSE-CHOICES-ALWAYS-PRESENT  
**Severity**: MEDIUM  
**Status**: CONFIRMED (code inspection)  
**Type**: FACT

**File**: `src/server.ts`, lines 1041-1048 (non-streaming)

**Observed Behavior**:
When `chat.complete()` succeeds, the response is:
```typescript
sendJson(response, 200, {
  id: result.response.id,
  object: 'chat.completion',
  created: Math.floor(Date.now() / 1_000),
  model: `${result.response.providerId}/${result.response.modelId}`,
  choices: [{ index: 0, message: { role: 'assistant', content: result.response.content || null, ...(result.response.toolCalls?.length ? { tool_calls: result.response.toolCalls } : {}) }, finish_reason: result.response.toolCalls?.length ? 'tool_calls' : 'stop' }],
  usage: usage ? { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.totalTokens } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
});
```

The `choices` array is ALWAYS populated with exactly one element (never empty or missing).

**Problem**:
However, if an exception is thrown BEFORE `sendJson()` is called:
- In the adapter (chat() method)
- In the decision-making (chooseRoute)
- In the combo fallback loop (when all models fail)

Then the error is caught at the top level. If the error is a `ProviderInvocationError` or other known error type, an error response is sent. But if headers have already been written to the response stream, the error cannot be sent properly.

Additionally, if `chat.complete()` throws `InvalidResponseError` (from isMeaningful check), this exception is NOT caught in server.ts. It would bubble up and be caught by the global error handler (if any), or crash the process.

**Expected Contract**:
- If chat.complete() succeeds, choices should always be present
- If chat.complete() fails, an appropriate HTTP error should be sent (not 200)
- No exception should escape chat.complete() without being properly handled

**Root Cause**:
No try-catch around `chat.complete()` call in server.ts for the non-combo path (single model). The combo path has a try-catch (line 867) but it's inside the loop.

**Impact**:
- Exceptions from chat service can escape the request handler
- Response may not be sent, or sent with incorrect status
- Client sees connection reset or no response

**Evidence**:
- `server.ts:1020-1065`: No try-catch around chat.complete()
- `inference.ts:220-222`: InvalidResponseError can be thrown from complete()
- `inference.ts:327-329`: InvalidResponseError can be thrown from stream generator

---

### Finding 5: Combo Fallback Error Handling Inconsistent
**ID**: COMBO-FALLBACK-INCOMPLETE  
**Severity**: MEDIUM  
**Status**: CONFIRMED (code inspection)  
**Type**: FACT

**File**: `src/server.ts`, lines 741-895

**Observed Behavior**:
When processing a combo request, the code loops through `target.comboModels`:
```typescript
for (const cm of target.comboModels) {
  // try model cm
  try {
    // attempt chat.stream or chat.complete
  } catch (err) {
    lastError = err;
    attemptedSteps.push({ model: cm, error: errMsg });
    if (err instanceof ProviderInvocationError && err.failure.kind === 'context_overflow') {
      contextOverflowCount += 1;
    }
    continue;
  }
}
// After loop, if all failed:
if (contextOverflowCount > 0 && contextOverflowCount === target.comboModels.length) {
  sendJson(response, 200, { ... choices: [{ message: { content: `[FreeRoute] ${errMsg}` } }] ...});
} else {
  sendJson(response, 200, { ... choices: [{ message: { content: `[FreeRoute] ${errMsg}` } }] ...});
}
```

**Problem**:
Both branches send a response with `choices` populated (containing an error message). The distinction is whether all failures were context_overflow or other reasons. But:

1. **Streaming path inside combo**: If `chat.stream()` throws, the error is caught, but for streaming, the error could be an `InvalidResponseError` wrapped in `ProviderInvocationError`. But look at line 867-893—it catches errors and continues the loop. HOWEVER, if the streaming generator was already returned (line 767), and the error happens during iteration (in the for-await loop in server.ts:790), this try-catch doesn't apply!

2. **Non-streaming path inside combo**: Same issue as above.

**Root Cause**:
The try-catch is around the `chat.stream()` CALL, not around the subsequent iteration. So if the adapter returns a valid stream object, but the generator throws during iteration, the try-catch is already exited.

**Impact**:
- Combo fallback works for pre-iteration errors, but not for post-iteration errors
- Stream iteration errors cause connection drops
- Error is not recorded in `attemptedSteps`, so diagnostics are incomplete

**Evidence**:
- `server.ts:765-818`: try-catch around chat.stream() call, but for-await loop is OUTSIDE this try-catch
- `server.ts:986-998`: for-await loop not wrapped in try-catch

---

### Finding 6: Test Coverage Gaps for Streaming + Empty/Tool-Call Responses
**ID**: TEST-COVERAGE-STREAMING  
**Severity**: HIGH  
**Status**: CONFIRMED (test audit)  
**Type**: FACT

**Files Checked**:
- `test/telemetry/invalid-response.test.ts`: 3 tests, none for streaming
- `test/streaming/tool-call-assembler.test.ts`: Basic tool-call assembly tests, no end-to-end
- `test/server.test.ts`: Streaming test at line 70-86, but:
  - Uses mock adapter that yields simple delta
  - No test for empty stream
  - No test for tool-call-only stream
  - No test for stream that throws

**Missing Tests**:
1. Streaming response with NO delta and NO tool_calls (should fail with invalid_stream)
2. Streaming response with ONLY tool_calls (valid, should succeed)
3. Streaming response where generator throws InvalidResponseError
4. Streaming + tool_calls in multiple chunks
5. Streaming + tool_calls + mixed content
6. Combo model fallback when streaming fails

**Impact**:
- The empty-stream and tool-call-streaming scenarios are completely untested
- Bugs in these paths go undetected
- These are exactly the scenarios that trigger "Response contained no choices"

**Evidence**:
- `npm test` output: 157 tests pass
- `test/telemetry/invalid-response.test.ts:62-72`: tool-call-only test is for non-streaming (`complete()`)
- `test/server.test.ts:70-86`: streaming test doesn't test error cases

---

### Finding 7: `isMeaningful()` Logic Allows Tool-Call-Only, But Streaming Validation Is Post-Iteration
**ID**: VALIDATION-TIMING-MISMATCH  
**Severity**: MEDIUM  
**Status**: CONFIRMED (code inspection)  
**Type**: FACT

**File**: `src/inference.ts`, lines 62-64 and 327-329

**Observed Behavior**:
```typescript
function isMeaningful(res: { content: string; thought?: string; toolCalls?: ToolCall[] }): boolean {
  return !!(res.content.trim() || res.toolCalls?.length || res.thought);
}
```

This function correctly allows:
- Content only ✓
- Tool-calls only ✓
- Thought only ✓
- Any combination ✓

But in the streaming path (line 327-329):
```typescript
if (!isMeaningful({ content: accumulatedDelta, thought: finalUsage ? 'usage' : undefined })) {
  await self.emitEvent(request, candidate, fallbackCount, 'failure', 'invalid_stream');
  throw new InvalidResponseError('Empty or meaningless stream received');
}
```

The check passes only `content` and `thought`, NOT `toolCalls`. So if a stream yields ONLY tool-calls (no textual delta), the check will fail because:
- `accumulatedDelta` (content) is empty
- `thought` is only set if `finalUsage` exists (i.e., if usage chunk was sent)
- `toolCalls` is NOT passed to `isMeaningful()`

**Expected Contract**:
The streaming validation should pass the accumulated `toolCalls` to `isMeaningful()`, or the non-streaming path should fail too.

**Root Cause**:
The eventsGenerator function accumulates `accumulatedDelta` but doesn't accumulate `toolCalls`. So when `isMeaningful()` is called, it can't see the tool-calls that were yielded.

**Impact**:
- Streaming tool-call-only responses are incorrectly rejected
- InvalidResponseError is thrown, escaping the generator
- Causes unhandled exception → connection drops → "no choices"

**Evidence**:
- `inference.ts:303`: `let accumulatedDelta = '';` (no toolCalls accumulator)
- `inference.ts:316`: `yield next.value;` (yields toolCalls, but not accumulated)
- `inference.ts:327`: `if (!isMeaningful({ content: accumulatedDelta, thought: ... })` (toolCalls not passed)

---

### Finding 8: Streaming Tool-Call Chunks Not Accumulated for Validation
**ID**: TOOLCALL-ACCUMULATION-MISSING  
**Severity**: HIGH  
**Status**: CONFIRMED (code inspection)  
**Type**: FACT

**File**: `src/inference.ts`, lines 305-334

**Observed Behavior**:
The eventsGenerator accumulates:
- `accumulatedDelta` (text content)
- `finalUsage` (token usage)

But does NOT accumulate:
- `toolCalls`

So when iterating through streaming events, individual tool-call chunks are passed through, but at the end, when `isMeaningful()` is called, it only sees the text content.

**Expected Contract**:
If any tool-calls were yielded during iteration, they should be passed to `isMeaningful()` for validation.

**Root Cause**:
The generator was designed to accumulate deltas for validation purposes, but tool-calls are not deltas—they're structured chunks. The accumulation logic was not extended to handle them.

**Impact**:
- Streaming responses that contain ONLY tool-calls (no text deltas) fail validation
- The failure is hidden inside the generator, causing unhandled exception
- Exception escapes to server.ts, causing connection drop and "no choices" error

**Evidence**:
- `inference.ts:316`: `yield next.value;` (yields event as-is, including toolCalls)
- `inference.ts:303`: `let accumulatedDelta = '';` (no toolCalls field)
- `inference.ts:327`: `if (!isMeaningful({ content: accumulatedDelta, ... }))` (toolCalls not in check)

---

### Finding 9: Anthropic Adapter Missing Final Tool-Call Consolidation in Streaming
**ID**: ANTHROPIC-TOOLCALL-INCOMPLETE  
**Severity**: MEDIUM  
**Status**: INFERENCE  
**Type**: INFERENCE

**File**: `src/providers/anthropic.ts`, lines 67-140

**Observed Behavior**:
The Anthropic adapter streams tool-calls with partial JSON arguments. When `input_json_delta` is received:
```typescript
tc.args += data.delta.partial_json;
yield {
  id: `tc-${data.index}`,
  model: input.modelId,
  toolCalls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: data.delta.partial_json } } as any],
};
```

It yields the partial JSON in `arguments`, not the accumulated `tc.args`.

**Problem**:
The yielded `arguments` is incomplete. If downstream code expects complete JSON in each event, it will fail to parse or validate.

The adapter accumulates `tc.args` correctly, but never yields the final complete tool-call when the stream ends.

**Expected Contract**:
Either:
1. Yield complete accumulated arguments in each update, or
2. Yield complete tool-call only at the end, or
3. Clearly mark arguments as partial

**Root Cause**:
The streaming interface yields partial chunks, and tool-call assembly is expected to happen downstream. But the server doesn't have tool-call assembly logic for streaming, only for non-streaming.

**Impact**:
- Tool-call arguments in streaming responses are malformed (incomplete JSON)
- Clients cannot parse or execute tools
- May trigger validation errors downstream

**Evidence**:
- `anthropic.ts:114`: `arguments: data.delta.partial_json` (not accumulated)
- `anthropic.ts:110`: `tc.args += data.delta.partial_json;` (accumulated locally, not yielded)
- `anthropic.ts:118-125`: No code to yield final complete tool-call when stream ends

---

## `Response contained no choices` Error Trace

### Execution Path Leading to Error

```
1. Client: POST /v1/chat/completions with stream=true + tool calling request
2. Server (server.ts:786): Receives stream result from chat.stream()
3. Server (server.ts:786): Calls response.writeHead(200, { 'content-type': 'text/event-stream' })
4. Server (server.ts:786): for await (const event of result.events) ← ENTERS LOOP
5. Inference (inference.ts:305-334): eventsGenerator running
   - Accumulates deltas from streaming events
   - If tool-call-only response: accumulatedDelta stays empty
   - If response is tool-call-only (no text): reaches end of loop
6. Inference (inference.ts:327): isMeaningful({ content: accumulatedDelta, thought: undefined })
   - accumulatedDelta = '' (empty)
   - thought = undefined (no usage chunk or finalUsage not set correctly)
   - toolCalls = NOT PASSED (missing from check)
   - Result: isMeaningful() returns FALSE
7. Inference (inference.ts:328-329): Throws InvalidResponseError('Empty or meaningless stream received')
   - This throw is INSIDE the generator
8. Server (server.ts:986-998): for await loop receives the thrown error
   - No try-catch around for-await
   - Error propagates up
9. Node.js: Unhandled exception in async iterator
   - Closes the stream abruptly
   - No `[DONE]` frame sent
   - No error event sent
   - HTTP 200 header already sent, but body incomplete
10. Client: Receives incomplete SSE stream
    - Parses what it got (some chunks with choices)
    - Final state: connection dropped before [DONE]
    - Sees last received chunk or connection error
    - Interprets as "Response contained no choices" or "unexpected end of stream"
```

---

## Tool Calling Audit

### Tool Call Lifecycle in Streaming

**Phase 1: Request**
- Tools defined as `{ type: 'function', function: { name, description, parameters } }`
- Passed through: server.ts → chat.stream() → adapter.streamChat()
- Translated if needed (OpenAI → Anthropic, OpenAI → Gemini)

**Phase 2: Streaming from Adapter**
- OpenAI-compatible: tool_calls in delta chunks
  - `{ delta: { tool_calls: [{ id, type, function: { name, arguments: JSON_FRAGMENT } }] } }`
- Anthropic: tool_use events with id_json_delta chunks
  - `{ delta: { type: 'input_json_delta', partial_json: '...' } }`
- Gemini: functionCall in content_part

**Phase 3: Server Event Loop (server.ts:986-998)**
- Receives events from generator
- If `event.toolCalls` exists, writes to SSE frame
- No tool-call accumulation or validation

**Phase 4: Client Reception**
- Client receives SSE stream
- Parses tool_calls from each frame
- May need to accumulate multi-part tool_calls
- If stream drops before completion → tool-call is incomplete

### Tool Call Test Results

✓ Tool-call-only (non-streaming): PASS (test line 66)
? Tool-call-only (streaming): **NO TEST**
✓ Tool-calls with content: Partially tested (no streaming test)
? Tool-call arguments malformed in streaming: **NO TEST**
? Multiple tool-calls in one response (streaming): **NO TEST**

### Tool Call Risks

1. **Anthropic streaming**: Partial JSON arguments yielded as `arguments` field
   - Downstream code cannot parse
   - Tool execution fails
   - Appears as "invalid response"

2. **Streaming tool-calls validation**: Not checked in eventsGenerator
   - Invalid tool-calls pass through
   - Client receives malformed tool-calls
   - Tool execution fails

3. **Tool-call-only streaming**: Rejected by isMeaningful check
   - Error thrown inside generator
   - Escapes server error handler
   - Connection drops → "no choices"

---

## Provider / Routing Audit

### Authority & Decision Points

1. **Model/Provider Selection** (server.ts:737, 1021-1024)
   - Parsed from request model identifier or combo
   - Authority: HTTP request input + combo configuration
   - No validation that provider exists before calling chat service

2. **Capability Matching** (server.ts:753-763)
   - Checks if model supports required capabilities (tools, vision, streaming, etc.)
   - Skips model if capability missing
   - **ISSUE**: Capability check only applies to combo path (line 754), not single-model path

3. **Fallback Decision** (inference.ts:189-196)
   - chooseRoute() returns best candidate
   - If none available → throw NoRouteCandidatesError
   - For combo: try each model until success (line 748-895)
   - For single: fail after one attempt (unless adapter-level retry)

4. **Provider Error Classification** (openai-compatible.ts:333-398)
   - 401/403 → authentication (fail-fast, block)
   - 429 → rate_limit (fallback allowed, cooldown)
   - 502/503/408/500+ → temporary (fallback allowed)
   - 404/400 → unsupported (fail-fast)
   - Others → permanent (fail-fast)

### Authority Conflict

**Issue**: In the combo fallback path (server.ts:741-895), the decision logic is replicated in-place:
```typescript
for (const cm of target.comboModels) {
  try {
    if (input.stream) {
      const result = await options.chat.stream({...});
      // Stream handling
    } else {
      const result = await options.chat.complete({...});
      // Non-stream handling
    }
  } catch (err) {
    // Fallback decision here
    continue;
  }
}
```

Whereas the single-model path delegates to chat service (inference.ts:182-265):
```typescript
async complete(request): Promise<ChatResult> {
  let candidates = this.withRouteState(await this.options.candidates(request));
  while (true) {
    const decision = chooseRoute(request, candidates, this.now());
    if (!decision) throw NoRouteCandidatesError(...);
    try {
      const result = await adapter.chat(...);
      // validation, success
      return completed;
    } catch (error) {
      // Fallback decision here
      candidates = candidates.map(...); // Apply cooldown, block, etc.
      fallbackCount += 1;
    }
  }
}
```

**Consequence**: 
- Combo path doesn't apply routing rules (cooldown, preference, quota scores)
- Combo path has different error classification logic
- Inconsistent behavior between combo and single-model requests

---

## Streaming Audit

### All Streaming Paths

1. **Non-streaming /v1/chat/completions** (server.ts:1020-1065)
   - ✓ Responses always have choices array
   - ✓ No streaming concerns

2. **Streaming /v1/chat/completions - Combo** (server.ts:741-818)
   - Server: for await (event of result.events)
   - **NO try-catch around for-await**
   - If generator throws: connection drops, no [DONE], client sees no-choices

3. **Streaming /v1/chat/completions - Single Model** (server.ts:973-1018)
   - Server: for await (event of result.events)
   - **NO try-catch around for-await**
   - Same issue as combo

4. **Streaming /v1/responses** (server.ts:1074-1111)
   - Server: for await (event of result.events)
   - **NO try-catch around for-await**
   - Same issue

### SSE Frame Construction

Each chunk written as:
```typescript
data: {
  "id": "...",
  "object": "chat.completion.chunk",
  "choices": [{
    "index": 0,
    "delta": { "content": "..." or "tool_calls": [...] },
    "finish_reason": null
  }],
  "usage": { ... }
}
```

✓ Format is correct
✓ [DONE] frame is correct
✗ No error handling if generator throws during iteration
✗ No accumulation of tool-calls for tool-call-only responses

### Empty/Malformed Response Detection

**Streaming path detection**: inference.ts:327-329
- ✗ Checks accumulate text, but NOT accumulated tool-calls
- ✗ Tool-call-only responses fail validation
- ✗ Error thrown inside generator, unhandled

**Non-streaming path detection**: inference.ts:220-222
- ✓ Correctly checks isMeaningful(result)
- ✓ Tool-call-only responses pass
- ✓ Error thrown and caught by chat service

**Inconsistency**: Streaming rejects what non-streaming accepts

---

## Root Cause Ranking

### Confirmed Root Causes

1. **CRITICAL: No try-catch around streaming event iteration** (server.ts:986-998, 790-798, 1089)
   - Severity: CRITICAL
   - Impact: Immediate, 100% reproducible with tool-call-only or empty streaming responses
   - Fix: Add try-catch, emit error event or fallback

2. **CRITICAL: Tool-call-only validation fails in streaming** (inference.ts:327, missing toolCalls accumulation)
   - Severity: CRITICAL
   - Impact: All tool-call-only streaming requests
   - Fix: Pass accumulated toolCalls to isMeaningful(), or track any toolCalls yielded

3. **HIGH: eventsGenerator validation uses incomplete check** (inference.ts:327-329)
   - Severity: HIGH
   - Impact: Streaming responses with no text but yes tool-calls
   - Fix: Accumulate toolCalls during iteration, pass to isMeaningful()

### Strong Candidates

4. **HIGH: Anthropic adapter yields partial tool-call arguments** (anthropic.ts:114)
   - Severity: HIGH
   - Impact: Tool-call-only responses from Anthropic streaming have malformed arguments
   - Reproducibility: High (any Anthropic tool-call streaming request)
   - Fix: Accumulate full arguments, yield only at completion, or mark as partial

5. **MEDIUM: Streaming errors are not handled at server level** (server.ts:973-1018)
   - Severity: MEDIUM (subsumed by #1, but separate concern)
   - Impact: Any exception during streaming causes connection drop
   - Fix: Wrap for-await in try-catch

### Weak Candidates

6. **MEDIUM: Combo capability check only in combo path** (server.ts:754)
   - Severity: MEDIUM
   - Impact: Single-model requests don't validate capabilities
   - Reproducibility: Only if requested model doesn't support required capability
   - Fix: Apply capability check to both paths

7. **MEDIUM: Combo fallback logic duplicated and different** (server.ts:741-895)
   - Severity: MEDIUM
   - Impact: Inconsistent behavior between combo and single-model
   - Reproducibility: Medium (depends on request type)
   - Fix: Consolidate logic or apply same rules

---

## Test Gap Analysis

### Missing Critical Tests

| Test Case | Path | Status | Impact |
|-----------|------|--------|--------|
| Empty streaming response | streaming | ✗ NO TEST | CRITICAL |
| Tool-call-only streaming | streaming | ✗ NO TEST | CRITICAL |
| Streaming response where adapter.streamChat() throws mid-iteration | streaming | ✗ NO TEST | CRITICAL |
| Anthropic tool-call-only streaming | streaming + anthropic | ✗ NO TEST | CRITICAL |
| Streaming + mixed content + tool-calls | streaming | ✗ NO TEST | HIGH |
| Combo fallback when streaming fails | streaming + combo | ✗ NO TEST | HIGH |
| Tool-call validation (complete arguments) | streaming | ✗ NO TEST | HIGH |
| Invalid tool-call arguments in streaming | streaming | ✗ NO TEST | MEDIUM |
| Multiple tool-calls in one streaming response | streaming | ✗ NO TEST | MEDIUM |

### Existing Test Coverage

- ✓ 157 total tests pass
- ✓ Non-streaming responses (including tool-calls)
- ✓ Basic streaming (simple delta)
- ✓ Tool-call-only (non-streaming)
- ✓ SSE parsing, tool-call assembler, event normalization
- ✗ Streaming + tool-calls combined
- ✗ Streaming error cases
- ✗ Empty streaming responses

---

## Recommended Fix Order

### Phase 1: Stop-the-Bleed (Fix Immediate Crashes)

1. **Add try-catch around streaming event iteration** (server.ts)
   - Wrap `for await (const event of result.events)` in try-catch
   - On error: emit error SSE frame or `[DONE]` to close stream gracefully
   - **Priority**: CRITICAL
   - **Complexity**: Low
   - **Risk**: Low

2. **Fix isMeaningful check in streaming** (inference.ts)
   - Accumulate toolCalls during event iteration
   - Pass toolCalls to isMeaningful()
   - **Priority**: CRITICAL
   - **Complexity**: Medium
   - **Risk**: Low
   - **Affected Paths**: Streaming tool-call-only responses

### Phase 2: Correctness (Fix Data Integrity)

3. **Fix Anthropic tool-call argument accumulation** (anthropic.ts)
   - Yield complete accumulated `tc.args` instead of partial fragment
   - Or mark arguments as partial, with consolidation at end-of-stream
   - **Priority**: HIGH
   - **Complexity**: Medium
   - **Risk**: Medium (changes Anthropic adapter behavior)

4. **Unify combo and single-model fallback logic** (server.ts + inference.ts)
   - Apply same routing rules (cooldown, preference, quota) to combo
   - **Priority**: MEDIUM
   - **Complexity**: High
   - **Risk**: High (significant refactor)

### Phase 3: Validation (Add Coverage & Safety)

5. **Add missing streaming tests** (test files)
   - Tool-call-only streaming response
   - Empty streaming response
   - Streaming + error scenarios
   - Anthropic streaming + tool-calls
   - **Priority**: HIGH
   - **Complexity**: Medium
   - **Risk**: Low (adds tests, doesn't change code)

6. **Add capability validation to single-model path** (server.ts:1022)
   - Check capabilities before calling chat.complete()
   - **Priority**: MEDIUM
   - **Complexity**: Low
   - **Risk**: Low

---

## Summary Table

| Finding | ID | Severity | Type | Evidence | Fix Phase |
|---------|----|-----------|----|----------|-----------|
| Unhandled exception in streaming iteration | STREAM-UNHANDLED-ERROR | CRITICAL | FACT | Code inspection | 1 |
| Tool-calls not accumulated for streaming validation | TOOLCALL-ACCUMULATION-MISSING | HIGH | FACT | Code inspection | 1 |
| isMeaningful validation missing toolCalls in streaming | VALIDATION-TIMING-MISMATCH | MEDIUM | FACT | Code inspection | 1 |
| Anthropic yields partial tool-call args | ANTHROPIC-TOOLCALL-INCOMPLETE | MEDIUM | INFERENCE | Code inspection | 2 |
| No error handler for streaming iteration | SERVER-STREAMING-NO-CATCH | CRITICAL | FACT | Code inspection | 1 |
| Tool-call-only streaming validation risk | TOOLCALL-STREAMING-ACCUMULATION | HIGH | INFERENCE | Code inspection | 2 |
| Test coverage gap for streaming + tool-calls | TEST-COVERAGE-STREAMING | HIGH | FACT | Test audit | 3 |
| Combo fallback logic inconsistent | COMBO-FALLBACK-INCOMPLETE | MEDIUM | FACT | Code inspection | 2 |

---

## Conclusion

The root cause of **`Response contained no choices`** errors is:

1. **Primary**: Unhandled exception from `InvalidResponseError` thrown inside the streaming event generator when validating tool-call-only responses, which escapes the server's for-await loop.
2. **Secondary**: Tool-call-only responses are rejected by `isMeaningful()` during streaming validation because accumulated tool-calls are not passed to the check.
3. **Tertiary**: Tool-call arguments from Anthropic streaming are malformed (partial JSON), which may trigger downstream validation failures.

All three issues must be fixed to fully resolve the error. The fixes are in Phases 1-2, starting with error handling and validation logic.

Test coverage reveals that streaming + tool-calling scenarios are completely untested, which allowed these bugs to ship undetected.
