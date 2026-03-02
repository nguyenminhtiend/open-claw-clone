export interface LoopControllerOptions {
  maxIterations?: number;
}

export class LoopController {
  private maxIterations: number;
  private iterations = 0;

  constructor(opts: LoopControllerOptions = {}) {
    this.maxIterations = opts.maxIterations ?? 25;
  }

  tick(): void {
    this.iterations++;
  }

  limitReached(): boolean {
    return this.iterations >= this.maxIterations;
  }

  get count(): number {
    return this.iterations;
  }

  reset(): void {
    this.iterations = 0;
  }
}
