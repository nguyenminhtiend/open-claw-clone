export interface TokenUsage {
	inputTokens: number
	outputTokens: number
}

export class TokenBudget {
	private maxContextTokens: number
	private softThreshold: number
	private currentInputTokens = 0
	private totalOutputTokens = 0

	constructor(maxContextTokens: number, softThresholdRatio = 0.8) {
		this.maxContextTokens = maxContextTokens
		this.softThreshold = Math.floor(maxContextTokens * softThresholdRatio)
	}

	update(usage: TokenUsage): void {
		this.currentInputTokens = usage.inputTokens
		this.totalOutputTokens += usage.outputTokens
	}

	/** True when input context is approaching the soft threshold */
	nearLimit(): boolean {
		return this.currentInputTokens >= this.softThreshold
	}

	/** True when input context has hit the hard limit */
	exhausted(): boolean {
		return this.currentInputTokens >= this.maxContextTokens
	}

	get inputTokens(): number {
		return this.currentInputTokens
	}

	get outputTokens(): number {
		return this.totalOutputTokens
	}

	get remaining(): number {
		return Math.max(0, this.maxContextTokens - this.currentInputTokens)
	}

	reset(): void {
		this.currentInputTokens = 0
		this.totalOutputTokens = 0
	}
}
