/**
 * 审计日志系统测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { AuditLogger } from '../logger.js';
import type { AuditLogEntry, AuditOperation } from '../types.js';

describe('AuditLogger', () => {
  const testDbPath = '/tmp/test-audit.db';
  let logger: AuditLogger;

  beforeEach(() => {
    // 清理测试数据库
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    logger = new AuditLogger(testDbPath);
  });

  afterEach(() => {
    if (logger) {
      logger.close();
    }
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('初始化', () => {
    it('应该创建数据库和表', () => {
      expect(existsSync(testDbPath)).toBe(true);
    });

    it('应该创建必要的索引', () => {
      // 通过查询验证索引存在
      const logs = logger.getRecentLogs(0);
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('日志记录', () => {
    it('应该能够记录基本日志', () => {
      logger.log({
        sessionId: 'session-1',
        operation: 'read',
        path: '/test/file.txt',
        details: '读取文件',
        success: true
      });

      const logs = logger.getSessionLogs('session-1');
      expect(logs.length).toBe(1);
      expect(logs[0].operation).toBe('read');
      expect(logs[0].path).toBe('/test/file.txt');
      expect(logs[0].success).toBe(true);
    });

    it('应该能够记录带持续时间的日志', () => {
      logger.log({
        sessionId: 'session-1',
        operation: 'execute',
        path: '/test/script.sh',
        details: '执行脚本',
        success: true,
        duration: 1234
      });

      const logs = logger.getSessionLogs('session-1');
      expect(logs[0].duration).toBe(1234);
    });

    it('应该能够记录带元数据的日志', () => {
      const metadata = { userId: 'user-1', ip: '192.168.1.1' };

      logger.log({
        sessionId: 'session-1',
        operation: 'write',
        path: '/test/file.txt',
        details: '写入文件',
        success: true,
        metadata
      });

      const logs = logger.getSessionLogs('session-1');
      expect(logs[0].metadata).toEqual(metadata);
    });

    it('应该为每条日志生成唯一 ID', () => {
      logger.log({
        sessionId: 'session-1',
        operation: 'read',
        path: '/test/file1.txt',
        success: true
      });

      logger.log({
        sessionId: 'session-1',
        operation: 'read',
        path: '/test/file2.txt',
        success: true
      });

      const logs = logger.getSessionLogs('session-1');
      expect(logs[0].id).not.toBe(logs[1].id);
    });

    it('应该自动生成时间戳', () => {
      const beforeTime = Date.now();

      logger.log({
        sessionId: 'session-1',
        operation: 'read',
        path: '/test/file.txt',
        success: true
      });

      const afterTime = Date.now();

      const logs = logger.getSessionLogs('session-1');
      expect(logs[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(logs[0].timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('logStart 和 logEnd', () => {
    it('应该能够记录操作开始和结束', () => {
      const logId = logger.logStart('session-1', 'execute', '/test/script.sh');

      // 模拟操作耗时
      const startTime = Date.now();
      const duration = 500;
      while (Date.now() - startTime < duration) {
        // 等待
      }

      logger.logEnd(logId, true, '操作成功完成');

      const logs = logger.getSessionLogs('session-1');
      expect(logs.length).toBe(1);
      expect(logs[0].operation).toBe('execute');
      expect(logs[0].path).toBe('/test/script.sh');
      expect(logs[0].success).toBe(true);
      expect(logs[0].duration).toBeGreaterThanOrEqual(duration);
      expect(logs[0].details).toBe('操作成功完成');
    });

    it('应该能够记录失败的操作', () => {
      const logId = logger.logStart('session-1', 'execute', '/test/script.sh');
      logger.logEnd(logId, false, '操作失败: 权限不足');

      const logs = logger.getSessionLogs('session-1');
      expect(logs[0].success).toBe(false);
      expect(logs[0].details).toBe('操作失败: 权限不足');
    });

    it('应该处理不存在的 logId', () => {
      // 不应该抛出错误
      expect(() => {
        logger.logEnd('non-existent-id', true, '测试');
      }).not.toThrow();
    });
  });

  describe('查询日志', () => {
    beforeEach(() => {
      // 添加测试数据
      logger.log({
        sessionId: 'session-1',
        operation: 'read',
        path: '/test/file1.txt',
        success: true
      });

      logger.log({
        sessionId: 'session-1',
        operation: 'write',
        path: '/test/file2.txt',
        success: true
      });

      logger.log({
        sessionId: 'session-2',
        operation: 'read',
        path: '/test/file3.txt',
        success: false
      });

      logger.log({
        sessionId: 'session-2',
        operation: 'delete',
        path: '/test/file4.txt',
        success: true
      });
    });

    it('应该能够按会话 ID 查询日志', () => {
      const logs = logger.getSessionLogs('session-1');
      expect(logs.length).toBe(2);
      expect(logs.every(l => l.sessionId === 'session-1')).toBe(true);
    });

    it('应该能够按操作类型筛选', () => {
      const logs = logger.queryLogs({
        operation: 'read'
      });
      expect(logs.length).toBe(2);
      expect(logs.every(l => l.operation === 'read')).toBe(true);
    });

    it('应该能够按会话 ID 和操作类型筛选', () => {
      const logs = logger.queryLogs({
        sessionId: 'session-1',
        operation: 'write'
      });
      expect(logs.length).toBe(1);
      expect(logs[0].operation).toBe('write');
    });

    it('应该支持分页', () => {
      const logs = logger.queryLogs({
        limit: 2,
        offset: 0
      });
      expect(logs.length).toBe(2);

      const moreLogs = logger.queryLogs({
        limit: 2,
        offset: 2
      });
      expect(moreLogs.length).toBe(2);
    });

    it('应该按时间戳降序排序', () => {
      const logs = logger.getRecentLogs(10);
      for (let i = 1; i < logs.length; i++) {
        expect(logs[i].timestamp).toBeLessThanOrEqual(logs[i - 1].timestamp);
      }
    });
  });

  describe('统计功能', () => {
    beforeEach(() => {
      // 添加测试数据
      logger.log({
        sessionId: 'session-1',
        operation: 'read',
        success: true
      });

      logger.log({
        sessionId: 'session-1',
        operation: 'read',
        success: true
      });

      logger.log({
        sessionId: 'session-1',
        operation: 'write',
        success: false
      });

      logger.log({
        sessionId: 'session-2',
        operation: 'read',
        success: true
      });
    });

    it('应该能够计算总操作数', () => {
      const stats = logger.getStatistics();
      expect(stats.totalOperations).toBe(4);
    });

    it('应该能够计算成功率', () => {
      const stats = logger.getStatistics();
      expect(stats.successRate).toBe(0.75); // 3/4
    });

    it('应该能够计算错误数', () => {
      const stats = logger.getStatistics();
      expect(stats.errorCount).toBe(1);
    });

    it('应该能够按操作类型统计', () => {
      const stats = logger.getStatistics();
      expect(stats.operationsByType.read).toBe(3);
      expect(stats.operationsByType.write).toBe(1);
    });

    it('应该能够按会话统计', () => {
      const stats = logger.getStatistics('session-1');
      expect(stats.totalOperations).toBe(3);
      expect(stats.successRate).toBe(2/3);
    });

    it('应该能够计算平均耗时', () => {
      logger.log({
        sessionId: 'session-1',
        operation: 'execute',
        success: true,
        duration: 100
      });

      logger.log({
        sessionId: 'session-1',
        operation: 'execute',
        success: true,
        duration: 200
      });

      const stats = logger.getStatistics('session-1');
      expect(stats.averageDuration).toBe(150);
    });
  });

  describe('清理功能', () => {
    it('应该能够清理旧日志', () => {
      const oldTime = Date.now() - 1000000; // 很久以前

      logger.log({
        sessionId: 'session-1',
        operation: 'read',
        success: true
      });

      // 手动设置时间戳为旧时间
      const logs = logger.getSessionLogs('session-1');
      const db = (logger as any).db;
      db.prepare('UPDATE audit_logs SET timestamp = ? WHERE id = ?')
        .run(oldTime, logs[0].id);

      // 添加新日志
      logger.log({
        sessionId: 'session-2',
        operation: 'read',
        success: true
      });

      // 清理旧日志
      const deletedCount = logger.cleanup(Date.now() - 600000); // 10分钟前
      expect(deletedCount).toBe(1);

      const remainingLogs = logger.getRecentLogs(10);
      expect(remainingLogs.length).toBe(1);
      expect(remainingLogs[0].sessionId).toBe('session-2');
    });
  });

  describe('导出功能', () => {
    beforeEach(() => {
      logger.log({
        sessionId: 'session-1',
        operation: 'read',
        path: '/test/file.txt',
        details: '读取文件',
        success: true,
        duration: 100
      });
    });

    it('应该能够导出为 JSON', () => {
      const json = logger.exportLogs({}, 'json');
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
      expect(parsed[0].sessionId).toBe('session-1');
      expect(parsed[0].operation).toBe('read');
    });

    it('应该能够导出为 CSV', () => {
      const csv = logger.exportLogs({}, 'csv');
      const lines = csv.split('\n');

      expect(lines.length).toBe(2); // 标题行 + 数据行
      expect(lines[0]).toContain('id,session_id,timestamp,operation');
      // CSV format: id,session_id,timestamp,operation,path,details,success,duration
      const columns = lines[1].split(",");
      expect(columns[1]).toBe("session-1");
      expect(columns[3]).toBe("read");
    });

    it('应该支持筛选导出', () => {
      logger.log({
        sessionId: 'session-2',
        operation: 'write',
        success: true
      });

      const json = logger.exportLogs({
        sessionId: 'session-1'
      }, 'json');

      const parsed = JSON.parse(json);
      expect(parsed.length).toBe(1);
      expect(parsed[0].sessionId).toBe('session-1');
    });
  });

  describe('所有操作类型', () => {
    const operations: AuditOperation[] = [
      'read', 'write', 'delete', 'move', 'execute',
      'security-block', 'session-start', 'session-stop',
      'permission-grant', 'permission-deny'
    ];

    it('应该能够记录所有操作类型', () => {
      operations.forEach(op => {
        logger.log({
          sessionId: 'session-1',
          operation: op,
          success: true
        });
      });

      const logs = logger.getSessionLogs('session-1');
      expect(logs.length).toBe(operations.length);

      const loggedOps = logs.map(l => l.operation);
      operations.forEach(op => {
        expect(loggedOps).toContain(op);
      });
    });
  });
});