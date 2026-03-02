import type { ToolGroup } from '../types.js';

export interface ToolPolicy {
  allow?: string[];
  deny?: string[];
  groups?: {
    allow?: ToolGroup[];
    deny?: ToolGroup[];
  };
}
