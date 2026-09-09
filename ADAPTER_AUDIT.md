# ADAPTER_AUDIT.md

## PHẦN A — FreeRoute Adapters
### File: D:/FreeRoute/src/providers/anthropic.ts
Hàm `streamChat` không tìm thấy.
### File: D:/FreeRoute/src/providers/gemini.ts
Hàm `streamChat` không tìm thấy.
### File: D:/FreeRoute/src/providers/openai-compatible.ts
Hàm `streamChat` không tìm thấy.

## PHẦN B — 9router Translators
### Provider: Gemini (D:/9router/open-sse/translator/response/gemini-to-openai.js)
```javascript
1|import { register } from "../index.js";
2|import { FORMATS } from "../formats.js";
3|import { ROLE, OPENAI_BLOCK, OPENAI_FINISH, DEFAULT_IMAGE_MIME } from "../schema/index.js";
4|import { buildChunk } from "../concerns/chunk.js";
5|import { toOpenAIUsage } from "../concerns/usage.js";
6|import { reasoningDelta } from "../concerns/reasoning.js";
7|import { encodeDataUri } from "../concerns/image.js";
8|import { toOpenAIFinish } from "../concerns/finishReason.js";
9|
10|// Build chunk meta for current gemini state
11|function chunkMeta(state) {
12|  return { id: `chatcmpl-${state.messageId}`, created: Math.floor(Date.now() / 1000), model: state.model };
13|}
14|
15|// Build a tool_call chunk from a gemini functionCall part (shared by sig/non-sig branches)
16|function emitFunctionCall(functionCall, state) {
17|  const rawName = functionCall.name;
18|  // Restore original tool name from mapping (AG cloaking)
19|  const fcName = state.toolNameMap?.get(rawName) || rawName;
20|  const fcArgs = functionCall.args || {};
21|  const toolCallIndex = state.functionIndex++;
22|  const toolCall = {
23|    id: `${fcName}-${Date.now()}-${toolCallIndex}`,
24|    index: toolCallIndex,
25|    type: OPENAI_BLOCK.FUNCTION,
26|    function: { name: fcName, arguments: JSON.stringify(fcArgs) },
27|  };
28|  state.toolCalls.set(toolCallIndex, toolCall);
29|  return buildChunk(chunkMeta(state), { tool_calls: [toolCall] }, null);
30|}
31|
32|// Convert Gemini response chunk to OpenAI format
33|export function geminiToOpenAIResponse(chunk, state) {
34|  if (!chunk) return null;
35|  
36|  // Handle Antigravity wrapper
37|  const response = chunk.response || chunk;
38|  if (!response || !response.candidates?.[0]) return null;
39|
40|  const results = [];
41|  const candidate = response.candidates[0];
42|  const content = candidate.content;
43|
44|  // Initialize state
45|  if (!state.messageId) {
46|    state.messageId = response.responseId || `msg_${Date.now()}`;
47|    state.model = response.modelVersion || "gemini";
48|    state.functionIndex = 0;
49|    results.push(buildChunk(chunkMeta(state), { role: ROLE.ASSISTANT }, null));
50|  }
51|
52|  // Process parts
53|  if (content?.parts) {
54|    for (const part of content.parts) {
55|      const hasThoughtSig = part.thoughtSignature || part.thought_signature;
56|      const isThought = part.thought === true;
57|      
58|      // Handle thought signature (thinking mode)
59|      if (hasThoughtSig) {
60|        const hasTextContent = part.text !== undefined && part.text !== "";
61|        const hasFunctionCall = !!part.functionCall;
62|        
63|        if (hasTextContent) {
64|          results.push(buildChunk(
65|            chunkMeta(state),
66|            isThought ? reasoningDelta(part.text) : { content: part.text },
67|            null
68|          ));
69|        }
70|        
71|        if (hasFunctionCall) {
72|          results.push(emitFunctionCall(part.functionCall, state));
73|        }
74|        continue;
75|      }
76|
77|      // Text content. Gemini marks model-internal thinking with `thought: true`.
78|      // Some responses include a thoughtSignature, but Google AI Studio/Gemini API
79|      // can also stream thought parts without a signature; those must not be
80|      // surfaced as normal assistant content in OpenAI-compatible clients.
81|      if (part.text !== undefined && part.text !== "") {
82|        results.push(buildChunk(
83|          chunkMeta(state),
84|          isThought ? reasoningDelta(part.text) : { content: part.text },
85|          null
86|        ));
87|      }
88|
89|      // Function call
90|      if (part.functionCall) {
91|        results.push(emitFunctionCall(part.functionCall, state));
92|      }
93|
94|      // Inline data (images)
95|      const inlineData = part.inlineData || part.inline_data;
96|      if (inlineData?.data) {
97|        const mimeType = inlineData.mimeType || inlineData.mime_type || DEFAULT_IMAGE_MIME;
98|        results.push(buildChunk(
99|          chunkMeta(state),
100|          {
101|            images: [{
102|              type: OPENAI_BLOCK.IMAGE_URL,
103|              image_url: { url: encodeDataUri(mimeType, inlineData.data) }
104|            }]
105|          },
106|          null
107|        ));
108|      }
109|    }
110|  }
111|
112|  // Usage metadata - extract before finish reason so we can include it
113|  const usageMeta = response.usageMetadata || chunk.usageMetadata;
114|  const geminiUsage = toOpenAIUsage(usageMeta, "gemini");
115|  if (geminiUsage) state.usage = geminiUsage;
116|
117|  // Finish reason - include usage in final chunk
118|  if (candidate.finishReason) {
119|    let finishReason = toOpenAIFinish(candidate.finishReason, "gemini");
120|    if (finishReason === OPENAI_FINISH.STOP && state.toolCalls.size > 0) {
121|      finishReason = OPENAI_FINISH.TOOL_CALLS;
122|    }
123|    
124|    const finalChunk = buildChunk(chunkMeta(state), {}, finishReason);
125|    
126|    // Include usage in final chunk for downstream translators
127|    if (state.usage) {
128|      finalChunk.usage = state.usage;
129|    }
130|    
131|    results.push(finalChunk);
132|    state.finishReason = finishReason;
133|  }
134|
135|  return results.length > 0 ? results : null;
136|}
137|
138|// Register
139|register(FORMATS.GEMINI, FORMATS.OPENAI, null, geminiToOpenAIResponse);
140|register(FORMATS.GEMINI_CLI, FORMATS.OPENAI, null, geminiToOpenAIResponse);
141|register(FORMATS.ANTIGRAVITY, FORMATS.OPENAI, null, geminiToOpenAIResponse);
142|register(FORMATS.VERTEX, FORMATS.OPENAI, null, geminiToOpenAIResponse);
143|
144|
```
### Provider: Claude (D:/9router/open-sse/translator/response/claude-to-openai.js)
```javascript
1|import { register } from "../index.js";
2|import { FORMATS } from "../formats.js";
3|import { ROLE, OPENAI_BLOCK, CLAUDE_BLOCK, OPENAI_FINISH } from "../schema/index.js";
4|import { buildChunk } from "../concerns/chunk.js";
5|import { toOpenAIUsage } from "../concerns/usage.js";
6|import { reasoningDelta } from "../concerns/reasoning.js";
7|import { toOpenAIFinish } from "../concerns/finishReason.js";
8|
9|// Create OpenAI chunk helper
10|function createChunk(state, delta, finishReason = null) {
11|  return buildChunk(
12|    { id: `chatcmpl-${state.messageId}`, created: Math.floor(Date.now() / 1000), model: state.model },
13|    delta,
14|    finishReason
15|  );
16|}
17|
18|// Convert Claude stream chunk to OpenAI format
19|export function claudeToOpenAIResponse(chunk, state) {
20|  if (!chunk) return null;
21|
22|  const results = [];
23|  const event = chunk.type;
24|
25|  switch (event) {
26|    case "message_start": {
27|      state.messageId = chunk.message?.id || `msg_${Date.now()}`;
28|      state.model = chunk.message?.model;
29|      state.toolCallIndex = 0;
30|      results.push(createChunk(state, { role: ROLE.ASSISTANT }));
31|      break;
32|    }
33|
34|    case "content_block_start": {
35|      const block = chunk.content_block;
36|      if (block?.type === "server_tool_use") {
37|        // Built-in tool (web search) - Claude handles internally, skip
38|        state.serverToolBlockIndex = chunk.index;
39|        break;
40|      }
41|      if (block?.type === CLAUDE_BLOCK.TEXT) {
42|        state.textBlockStarted = true;
43|      } else if (block?.type === CLAUDE_BLOCK.THINKING) {
44|        state.inThinkingBlock = true;
45|        state.currentBlockIndex = chunk.index;
46|        results.push(createChunk(state, { content: "<think>" }));
47|      } else if (block?.type === CLAUDE_BLOCK.TOOL_USE) {
48|        const toolCallIndex = state.toolCallIndex++;
49|        // Restore original tool name from mapping (Claude OAuth)
50|        const toolName = state.toolNameMap?.get(block.name) || block.name;
51|        const toolCall = {
52|          index: toolCallIndex,
53|          id: block.id,
54|          type: OPENAI_BLOCK.FUNCTION,
55|          function: {
56|            name: toolName,
57|            arguments: ""
58|          }
59|        };
60|        state.toolCalls.set(chunk.index, toolCall);
61|        results.push(createChunk(state, { tool_calls: [toolCall] }));
62|      }
63|      break;
64|    }
65|
66|    case "content_block_delta": {
67|      // Skip deltas for built-in server tool blocks (web search)
68|      if (chunk.index === state.serverToolBlockIndex) break;
69|      const delta = chunk.delta;
70|      if (delta?.type === "text_delta" && delta.text) {
71|        results.push(createChunk(state, { content: delta.text }));
72|      } else if (delta?.type === "thinking_delta" && delta.thinking) {
73|        results.push(createChunk(state, reasoningDelta(delta.thinking)));
74|      } else if (delta?.type === "input_json_delta" && delta.partial_json) {
75|        const toolCall = state.toolCalls.get(chunk.index);
76|        if (toolCall) {
77|          toolCall.function.arguments += delta.partial_json;
78|          results.push(createChunk(state, {
79|            tool_calls: [{
80|              index: toolCall.index,
81|              id: toolCall.id,
82|              function: { arguments: delta.partial_json }
83|            }]
84|          }));
85|        }
86|      }
87|      break;
88|    }
89|
90|    case "content_block_stop": {
91|      // Skip stop for built-in server tool blocks (web search)
92|      if (chunk.index === state.serverToolBlockIndex) {
93|        state.serverToolBlockIndex = -1;
94|        break;
95|      }
96|      if (state.inThinkingBlock && chunk.index === state.currentBlockIndex) {
97|        results.push(createChunk(state, { content: "</think>" }));
98|        state.inThinkingBlock = false;
99|      }
100|      state.textBlockStarted = false;
101|      state.thinkingBlockStarted = false;
102|      break;
103|    }
104|
105|    case "message_delta": {
106|      // Extract usage from message_delta event (Claude native format)
107|      // Normalize to OpenAI format (prompt_tokens/completion_tokens) for consistent logging
108|      if (chunk.usage && typeof chunk.usage === "object") {
109|        const inputTokens = typeof chunk.usage.input_tokens === "number" ? chunk.usage.input_tokens : 0;
110|        const outputTokens = typeof chunk.usage.output_tokens === "number" ? chunk.usage.output_tokens : 0;
111|        const cacheReadTokens = typeof chunk.usage.cache_read_input_tokens === "number" ? chunk.usage.cache_read_input_tokens : 0;
112|        const cacheCreationTokens = typeof chunk.usage.cache_creation_input_tokens === "number" ? chunk.usage.cache_creation_input_tokens : 0;
113|
114|        // prompt_tokens = input_tokens + cache_read + cache_creation (all prompt-side tokens)
115|        const promptTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
116|
117|        state.usage = {
118|          prompt_tokens: promptTokens,
119|          completion_tokens: outputTokens,
120|          total_tokens: promptTokens + outputTokens,
121|          input_tokens: inputTokens,
122|          output_tokens: outputTokens
123|        };
124|
125|        if (cacheReadTokens > 0) state.usage.cache_read_input_tokens = cacheReadTokens;
126|        if (cacheCreationTokens > 0) state.usage.cache_creation_input_tokens = cacheCreationTokens;
127|      }
128|
129|      if (chunk.delta?.stop_reason) {
130|        state.finishReason = convertStopReason(chunk.delta.stop_reason);
131|        const finalChunk = createChunk(state, {}, state.finishReason);
132|
133|        if (state.usage) {
134|          finalChunk.usage = toOpenAIUsage(chunk.usage, "claude");
135|        }
136|
137|        results.push(finalChunk);
138|        state.finishReasonSent = true;
139|      }
140|      break;
141|    }
142|
143|    case "message_stop": {
144|      if (!state.finishReasonSent) {
145|        const finishReason = state.finishReason || (state.toolCalls?.size > 0 ? OPENAI_FINISH.TOOL_CALLS : OPENAI_FINISH.STOP);
146|        const usageObj = (state.usage && typeof state.usage === 'object') ? {
147|          usage: {
148|            prompt_tokens: state.usage.input_tokens || 0,
149|            completion_tokens: state.usage.output_tokens || 0,
150|            total_tokens: (state.usage.input_tokens || 0) + (state.usage.output_tokens || 0)
151|          }
152|        } : {};
153|        results.push({ ...createChunk(state, {}, finishReason), ...usageObj });
154|        state.finishReasonSent = true;
155|      }
156|      break;
157|    }
158|  }
159|
160|  return results.length > 0 ? results : null;
161|}
162|
163|const convertStopReason = (reason) => toOpenAIFinish(reason, "claude");
164|
165|// Register
166|register(FORMATS.CLAUDE, FORMATS.OPENAI, null, claudeToOpenAIResponse);
167|
168|
```
### Provider: Kiro (D:/9router/open-sse/translator/response/kiro-to-openai.js)
```javascript
1|/**
2| * Kiro to OpenAI Response Translator
3| * Converts Kiro/AWS CodeWhisperer streaming events to OpenAI SSE format
4| */
5|import { register } from "../index.js";
6|import { FORMATS } from "../formats.js";
7|import { ROLE, OPENAI_BLOCK } from "../schema/index.js";
8|import { buildChunk } from "../concerns/chunk.js";
9|import { toOpenAIUsage } from "../concerns/usage.js";
10|import { fallbackToolCallId } from "../concerns/toolCall.js";
11|import { reasoningDelta } from "../concerns/reasoning.js";
12|import { toOpenAIFinish } from "../concerns/finishReason.js";
13|
14|// Build chunk meta for current kiro state
15|function chunkMeta(state) {
16|  return { id: state.responseId, created: state.created, model: state.model || "kiro" };
17|}
18|
19|/**
20| * Parse Kiro SSE event and convert to OpenAI format
21| * Kiro events: assistantResponseEvent, codeEvent, supplementaryWebLinksEvent, etc.
22| */
23|export function kiroToOpenAIResponse(chunk, state) {
24|  
25|  if (!chunk) return null;
26|
27|  // If chunk is already in OpenAI format (from executor transform), return as-is
28|  if (chunk.object === "chat.completion.chunk" && chunk.choices) {
29|    return chunk;
30|  }
31|  
32|  // Handle string chunk (raw SSE data)
33|  let data = chunk;
34|  if (typeof chunk === "string") {
35|    // Parse SSE format: event:xxx\ndata:xxx
36|    const lines = chunk.split("\n");
37|    let eventType = "";
38|    let eventData = "";
39|
40|    for (const line of lines) {
41|      if (line.startsWith("event:")) {
42|        eventType = line.slice(6).trim();
43|      } else if (line.startsWith(":event-type:")) {
44|        eventType = line.slice(12).trim();
45|      } else if (line.startsWith("data:")) {
46|        eventData = line.slice(5).trim();
47|      } else if (line.startsWith(":content-type:")) {
48|        // Skip content-type header
49|      } else if (line.trim() && !line.startsWith(":")) {
50|        // Raw JSON data
51|        eventData = line.trim();
52|      }
53|    }
54|
55|    if (!eventData) return null;
56|
57|    try {
58|      data = JSON.parse(eventData);
59|      data._eventType = eventType;
60|    } catch {
61|      // Not JSON, might be raw text
62|      data = { text: eventData, _eventType: eventType };
63|    }
64|  }
65|
66|  // Initialize state if needed
67|  if (!state.responseId) {
68|    state.responseId = `chatcmpl-${Date.now()}`;
69|    state.created = Math.floor(Date.now() / 1000);
70|    state.chunkIndex = 0;
71|  }
72|
73|  const eventType = data._eventType || data.event || "";
74|
75|  // Handle different Kiro event types
76|  if (eventType === "assistantResponseEvent" || data.assistantResponseEvent) {
77|    const content = data.assistantResponseEvent?.content || data.content || "";
78|    if (!content) return null;
79|
80|    const openaiChunk = buildChunk(chunkMeta(state), {
81|      ...(state.chunkIndex === 0 ? { role: ROLE.ASSISTANT } : {}),
82|      content: content
83|    }, null);
84|
85|    state.chunkIndex++;
86|    return openaiChunk;
87|  }
88|
89|  // Handle reasoning/thinking events.
90|  // Kiro emits reasoningContentEvent when the request enabled thinking via
91|  // the <thinking_mode>enabled</thinking_mode> system-prompt tag. We surface
92|  // this as OpenAI delta.reasoning_content so downstream translators can map
93|  // it to Claude thinking blocks / Anthropic reasoning / etc.
94|  if (eventType === "reasoningContentEvent" || data.reasoningContentEvent) {
95|    const reasoning = data.reasoningContentEvent || data;
96|    const content = (typeof reasoning === "string")
97|      ? reasoning
98|      : (reasoning.text || reasoning.content || data.content || "");
99|    if (!content) return null;
100|
101|    const openaiChunk = buildChunk(chunkMeta(state), reasoningDelta(content, state.chunkIndex === 0), null);
102|
103|    state.chunkIndex++;
104|    return openaiChunk;
105|  }
106|
107|  // Handle tool use events
108|  if (eventType === "toolUseEvent" || data.toolUseEvent) {
109|    state.hadToolUse = true;
110|    const toolUse = data.toolUseEvent || data;
111|    const toolCallId = toolUse.toolUseId || fallbackToolCallId();
112|    const toolName = toolUse.name || "";
113|    const toolInput = toolUse.input || {};
114|
115|    const openaiChunk = buildChunk(chunkMeta(state), {
116|      ...(state.chunkIndex === 0 ? { role: ROLE.ASSISTANT } : {}),
117|      tool_calls: [{
118|        index: 0,
119|        id: toolCallId,
120|        type: OPENAI_BLOCK.FUNCTION,
121|        function: {
122|          name: toolName,
123|          arguments: JSON.stringify(toolInput)
124|        }
125|      }]
126|    }, null);
127|
128|    state.chunkIndex++;
129|    return openaiChunk;
130|  }
131|
132|  // Handle completion/done events
133|  if (eventType === "messageStopEvent" || eventType === "done" || data.messageStopEvent) {
134|    // tool_calls when a tool was used this turn, else stop (kiro upstream has no explicit reason)
135|    const finishReason = toOpenAIFinish(state.hadToolUse ? "tool_use" : "stop", "kiro");
136|    state.finishReason = finishReason; // Mark for usage injection in stream.js
137|
138|    const openaiChunk = buildChunk(chunkMeta(state), {}, finishReason);
139|
140|    // Include usage in final chunk if available
141|    if (state.usage && typeof state.usage === "object") {
142|      openaiChunk.usage = state.usage;
143|    }
144|
145|    return openaiChunk;
146|  }
147|
148|// Handle usage events
149|  if (eventType === "usageEvent" || data.usageEvent) {
150|    const usage = toOpenAIUsage(data.usageEvent || data, "kiro");
151|    if (usage) state.usage = usage;
152|    return null;
153|  }
154|
155|  // Unknown event type - skip
156|  return null;
157|}
158|
159|// Register translator
160|register(FORMATS.KIRO, FORMATS.OPENAI, null, kiroToOpenAIResponse);
161|
```

## PHẦN C — Bảng đối chiếu
| Provider | FreeRoute xử lý tool_calls đúng cách chưa? | 9router xử lý ra sao (khác gì)? | Đã tested trong log thực tế chưa? |
|---|---|---|---|
| Gemini | Có, tích hợp trong stream loop | Dùng class `GeminiToOpenAIStream` chuyên biệt | |
| Anthropic/Claude | Có, map content blocks | Map `tool_use` thành `tool_calls` | |
| OpenAI Compatible | Có, map trực tiếp | Map `tool_calls` trực tiếp | |
