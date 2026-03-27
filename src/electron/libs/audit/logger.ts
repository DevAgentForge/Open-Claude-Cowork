/**
 * 审计日志记录器
 */

import Database from "better-sqlite3";
import type {
  AuditLogEntry,
  AuditOperation,
  AuditQueryOptions,
  AuditStatistics
} from "./types.js";

export class AuditLogger {
  private db: Database.Database;
  private startTimeMap = new Map<string, number>();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  /**
   * 记录审计日志
   */
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    this.db.prepare(`
      INSERT INTO audit_logs (id, session_id, timestamp, operation, path, details, success, duration, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      entry.sessionId,
      Date.now(),
      entry.operation,
      entry.path ?? null,
      entry.details ?? null,
      entry.success ? 1 : 0,
      entry.duration ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    );
  }

  /**
   * 记录操作开始
   */
  logStart(sessionId: string, operation: AuditOperation, path?: string): string {
    const logId = crypto.randomUUID();
    this.startTimeMap.set(logId, Date.now());

    this.db.prepare(`
      INSERT INTO audit_logs (id, session_id, timestamp, operation, path, success, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      sessionId,
      Date.now(),
      operation,
      path ?? null,
      0, // success will be updated later
      null // duration will be calculated later
    );

    return logId;
  }

  /**
   * 记录操作结束
   */
  logEnd(logId: string, success: boolean, details?: string): void {
    const startTime = this.startTimeMap.get(logId);
    if (!startTime) {
      return;
    }

    const duration = Date.now() - startTime;
    this.startTimeMap.delete(logId);

    this.db.prepare(`
      UPDATE audit_logs
      SET success = ?, duration = ?, details = ?
      WHERE id = ?
    `).run(
      success ? 1 : 0,
      duration,
      details ?? null,
      logId
    );
  }

  /**
   * 查询会话审计日志
   */
  getSessionLogs(sessionId: string, options?: AuditQueryOptions): AuditLogEntry[] {
    const { operation, startDate, endDate, limit = 100, offset = 0 } = options || {};

    let sql = `
      SELECT id, session_id, timestamp, operation, path, details, success, duration, metadata
      FROM audit_logs
      WHERE session_id = ?
    `;
    const params: (string | number)[] = [sessionId];

    if (operation) {
      sql += ` AND operation = ?`;
      params.push(operation);
    }

    if (startDate) {
      sql += ` AND timestamp >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND timestamp <= ?`;
      params.push(endDate);
    }

    sql += ` ORDER BY timestamp ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      timestamp: Number(row.timestamp),
      operation: row.operation as AuditOperation,
      path: row.path ? String(row.path) : undefined,
      details: row.details ? String(row.details) : undefined,
      success: Boolean(row.success),
      duration: row.duration ? Number(row.duration) : undefined,
      metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined
    }));
  }

  /**
   * 查询最近的审计日志
   */
  getRecentLogs(limit: number = 100): AuditLogEntry[] {
    const rows = this.db.prepare(`
      SELECT id, session_id, timestamp, operation, path, details, success, duration, metadata
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      timestamp: Number(row.timestamp),
      operation: row.operation as AuditOperation,
      path: row.path ? String(row.path) : undefined,
      details: row.details ? String(row.details) : undefined,
      success: Boolean(row.success),
      duration: row.duration ? Number(row.duration) : undefined,
      metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined
    }));
  }

  /**
   * 查询审计日志（通用查询）
   */
  queryLogs(options: AuditQueryOptions): AuditLogEntry[] {
    const { sessionId, operation, startDate, endDate, limit = 100, offset = 0 } = options;

    let sql = `
      SELECT id, session_id, timestamp, operation, path, details, success, duration, metadata
      FROM audit_logs
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (sessionId) {
      sql += ` AND session_id = ?`;
      params.push(sessionId);
    }

    if (operation) {
      sql += ` AND operation = ?`;
      params.push(operation);
    }

    if (startDate) {
      sql += ` AND timestamp >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND timestamp <= ?`;
      params.push(endDate);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      timestamp: Number(row.timestamp),
      operation: row.operation as AuditOperation,
      path: row.path ? String(row.path) : undefined,
      details: row.details ? String(row.details) : undefined,
      success: Boolean(row.success),
      duration: row.duration ? Number(row.duration) : undefined,
      metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined
    }));
  }

  /**
   * 获取统计信息
   */
  getStatistics(sessionId?: string): AuditStatistics {
    let sql = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
        AVG(CASE WHEN duration IS NOT NULL THEN duration END) as avg_duration
      FROM audit_logs
    `;
    const params: (string | number)[] = [];

    if (sessionId) {
      sql += ` WHERE session_id = ?`;
      params.push(sessionId);
    }

    const stats = this.db.prepare(sql).get(...params) as {
      total: number;
      success_count: number;
      avg_duration: number | null;
    };

    // 获取按操作类型分组的统计
    let operationSql = `
      SELECT operation, COUNT(*) as count
      FROM audit_logs
    `;
    const operationParams: (string | number)[] = [];

    if (sessionId) {
      operationSql += ` WHERE session_id = ?`;
      operationParams.push(sessionId);
    }

    operationSql += ` GROUP BY operation`;

    const operationRows = this.db.prepare(operationSql).all(...operationParams) as Array<{
      operation: AuditOperation;
      count: number;
    }>;

    const operationsByType: Record<AuditOperation, number> = {
      read: 0,
      write: 0,
      delete: 0,
      move: 0,
      execute: 0,
      'security-block': 0,
      'session-start': 0,
      'session-stop': 0,
      'permission-grant': 0,
      'permission-deny': 0
    };

    for (const row of operationRows) {
      operationsByType[row.operation] = row.count;
    }

    return {
      totalOperations: stats.total,
      successRate: stats.total > 0 ? stats.success_count / stats.total : 1,
      operationsByType,
      averageDuration: stats.avg_duration || 0,
      errorCount: stats.total - stats.success_count
    };
  }

  /**
   * 清理旧日志
   */
  cleanup(beforeDate: number): number {
    const result = this.db.prepare(`
      DELETE FROM audit_logs
      WHERE timestamp < ?
    `).run(beforeDate);

    return result.changes;
  }

  /**
   * 导出审计日志
   */
  exportLogs(options: AuditQueryOptions, format: 'json' | 'csv'): string {
    const logs = this.queryLogs(options);

    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // CSV format
    const headers = ['id', 'session_id', 'timestamp', 'operation', 'path', 'details', 'success', 'duration'];
    const rows = logs.map(log => [
      log.id,
      log.sessionId,
      log.timestamp,
      log.operation,
      log.path || '',
      log.details || '',
      log.success,
      log.duration || ''
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * 初始化数据库表
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        operation TEXT NOT NULL,
        path TEXT,
        details TEXT,
        success INTEGER NOT NULL,
        duration INTEGER,
        metadata TEXT
      )
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS audit_logs_session_id ON audit_logs(session_id)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS audit_logs_timestamp ON audit_logs(timestamp)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS audit_logs_operation ON audit_logs(operation)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS audit_logs_session_timestamp ON audit_logs(session_id, timestamp)`);
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }
}
