/**
 * Zero-dependency heuristic token estimator.
 * Estimates token count based on character lengths, message structure overhead,
 * and language characteristics (English, Code, Vietnamese/CJK).
 */

export function estimateTokensFromText(text?: string | null): number {
  if (!text) return 0;
  const chars = text.length;
  if (chars === 0) return 0;
  // English/Code: ~3.8 chars per token.
  // Vietnamese / UTF-8 multi-byte: ~1.8 - 2.5 chars per token.
  // We use 3.5 chars per token as a balanced cross-language average.
  return Math.max(1, Math.ceil(chars / 3.5));
}

export function estimatePromptTokens(messages?: Array<{ role: string; content?: string | unknown }> | null): number {
  if (!messages || !Array.isArray(messages) || messages.length === 0) return 0;
  let total = 0;
  for (const m of messages) {
    total += 4; // OpenAI chat format per-message overhead (<|im_start|>role\n...<|im_end|>)
    if (typeof m.content === 'string') {
      total += estimateTokensFromText(m.content);
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part && typeof part === 'object') {
          if ('text' in part && typeof (part as { text: unknown }).text === 'string') {
            total += estimateTokensFromText((part as { text: string }).text);
          } else if ('image_url' in part) {
            total += 65; // Low-res image default token cost
          }
        }
      }
    }
  }
  return total + 2; // Priming tokens
}
