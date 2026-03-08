/**
 * Token budget utilities for AI context assembly.
 * Uses a conservative 3.5 chars/token estimate for English text.
 * Prevents context blowouts that cause model errors or degraded responses.
 */

const CHARS_PER_TOKEN = 3.5

/** Conservative token estimate for a string. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Maximum tokens to allocate for the combined system prompt + context string.
 * Leaves room for conversation history and model output.
 *
 * Claude Sonnet context: 200k tokens
 * Reserve: ~40k for conversation history + ~8k for output = ~48k
 * Budget: ~150k tokens for system + context
 */
export const MAX_CONTEXT_TOKENS = 150_000

/**
 * Truncate a context string to fit within a token budget.
 * Keeps the beginning (most important: current page, structure overview)
 * and truncates from the end (secondary context: full script text).
 */
export function truncateToTokenBudget(
  contextString: string,
  systemPromptTokens: number,
  maxTotalTokens: number = MAX_CONTEXT_TOKENS
): string {
  const budgetForContext = maxTotalTokens - systemPromptTokens
  const estimatedContextTokens = estimateTokens(contextString)

  if (estimatedContextTokens <= budgetForContext) {
    return contextString
  }

  // Calculate max characters we can keep
  const maxChars = Math.floor(budgetForContext * CHARS_PER_TOKEN)

  // Truncate and add notice
  const truncated = contextString.substring(0, maxChars)
  const lastNewline = truncated.lastIndexOf('\n')
  const cleanCut = lastNewline > maxChars * 0.8 ? truncated.substring(0, lastNewline) : truncated

  return cleanCut + '\n\n[Context truncated to fit within token budget. Some background details were omitted.]'
}
