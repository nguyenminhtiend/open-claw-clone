export interface SandboxConfig {
  mode: 'off' | 'docker' | 'nsjail';
  image?: string;
  bindMounts?: string[];
  networkAccess?: boolean;
  maxMemoryMb?: number;
  maxCpuPercent?: number;
}

export const defaultSandbox: SandboxConfig = {
  mode: 'off',
  networkAccess: true,
};
