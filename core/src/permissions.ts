import type { PermissionDecision } from './types';

/**
 * Permissões no estilo Claude Code: Write, Edit e Bash perguntam
 * "Sim / Sim, não perguntar de novo nesta sessão / Não".
 */
export class PermissionManager {
  private allowed = new Set<string>();

  constructor(public allowAll = false) {}

  isAllowed(tool: string): boolean {
    return this.allowAll || this.allowed.has(tool);
  }

  record(tool: string, decision: PermissionDecision): void {
    if (decision === 'always') this.allowed.add(tool);
  }

  reset(): void {
    this.allowed.clear();
  }
}

export const PERMISSION_LABELS: Record<PermissionDecision, string> = {
  yes: 'Sim',
  always: 'Sim, não perguntar de novo nesta sessão',
  no: 'Não',
};
