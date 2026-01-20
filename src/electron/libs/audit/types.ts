/**
 * 审计日志类型定义
 */

export type AuditOperation =
  | 'read'
  | 'write'
  | 'delete'
  | 'move'
  | 'execute'
  | 'security-block'
  | 'session-start'
  | 'session-stop'
  | 'permission-grant'
  | 'permission-deny';

export interface AuditLogEntry {
  id: string;
  sessionId: string;
  timestamp: number;
  operation: AuditOperation;
  path?: string;
  details?: string;
  success: boolean;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface AuditQueryOptions {
  sessionId?: string;
  operation?: AuditOperation;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
}

export interface AuditStatistics {
  totalOperations: number;
  successRate: number;
  operationsByType: Record<AuditOperation, number>;
  averageDuration: number;
  errorCount: number;
}