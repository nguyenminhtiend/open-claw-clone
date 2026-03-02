export interface ExecApproval {
  pattern: string;
  lastUsed?: Date;
  addedBy: 'user' | 'auto';
}

export interface ExecApprovalConfig {
  mode: 'full' | 'allowlist' | 'deny';
  approvals: ExecApproval[];
}

export const defaultExecApprovalConfig: ExecApprovalConfig = {
  mode: 'full',
  approvals: [],
};
