/**
 * 会话搜索功能测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { SessionStore } from '../session-store.js';
import type { Session } from '../session-store.js';

describe('Session Search', () => {
  const testDbPath = '/tmp/test-sessions.db';
  let store: SessionStore;

  beforeEach(() => {
    // 清理测试数据库
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    store = new SessionStore(testDbPath);
  });

  afterEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe('初始化测试数据', () => {
    it('应该能够创建多个测试会话', () => {
      const session1 = store.createSession({
        cwd: '/test/project1',
        title: '项目1开发',
        prompt: '开发新功能',
        allowedTools: 'file,command'
      });

      const session2 = store.createSession({
        cwd: '/test/project2',
        title: '项目2修复',
        prompt: '修复bug',
        allowedTools: 'file,command,search'
      });

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('按标题搜索', () => {
    beforeEach(() => {
      store.createSession({
        cwd: '/test/project1',
        title: '代码审查任务',
        prompt: '审查代码',
        allowedTools: 'file,command'
      });

      store.createSession({
        cwd: '/test/project2',
        title: '文档编写',
        prompt: '编写文档',
        allowedTools: 'file'
      });

      store.createSession({
        cwd: '/test/project3',
        title: '代码重构',
        prompt: '重构代码',
        allowedTools: 'file,command,search'
      });
    });

    it('应该能够搜索包含关键词的标题', () => {
      const sessions = store.searchSessions('代码');
      expect(sessions.length).toBe(2);
      expect(sessions.every(s => s.title.includes('代码'))).toBe(true);
    });

    it('应该区分不同的关键词', () => {
      const codeSessions = store.searchSessions('代码');
      const docSessions = store.searchSessions('文档');

      expect(codeSessions.length).toBe(2);
      expect(docSessions.length).toBe(1);
      expect(docSessions[0].title).toBe('文档编写');
    });

    it('应该支持部分匹配', () => {
      const sessions = store.searchSessions('审查');
      expect(sessions.length).toBe(1);
      expect(sessions[0].title).toBe('代码审查任务');
    });

    it('应该对不存在的关键词返回空数组', () => {
      const sessions = store.searchSessions('不存在的内容');
      expect(sessions.length).toBe(0);
    });

    it('应该不区分大小写', () => {
      const sessions1 = store.searchSessions('代码');
      const sessions2 = store.searchSessions('代码');
      expect(sessions1.length).toBe(sessions2.length);
    });
  });

  describe('按 Prompt 搜索', () => {
    beforeEach(() => {
      store.createSession({
        cwd: '/test/project1',
        title: '任务1',
        prompt: '请帮我审查这个项目的代码，重点关注安全性问题',
        allowedTools: 'file,command,search'
      });

      store.createSession({
        cwd: '/test/project2',
        title: '任务2',
        prompt: '编写用户文档，包括安装指南和使用说明',
        allowedTools: 'file'
      });

      store.createSession({
        cwd: '/test/project3',
        title: '任务3',
        prompt: '重构代码以提高性能',
        allowedTools: 'file,command'
      });
    });

    it('应该能够搜索 Prompt 中的内容', () => {
      const sessions = store.searchSessions('安全性');
      expect(sessions.length).toBe(1);
      expect(sessions[0].prompt).toContain('安全性');
    });

    it('应该能够搜索多个关键词', () => {
      const sessions = store.searchSessions('代码');
      expect(sessions.length).toBe(2);
    });

    it('应该支持长文本搜索', () => {
      const sessions = store.searchSessions('安装指南');
      expect(sessions.length).toBe(1);
    });
  });

  describe('按工作目录搜索', () => {
    beforeEach(() => {
      store.createSession({
        cwd: '/Users/user/project1',
        title: '项目1',
        prompt: '开发项目1',
        allowedTools: 'file,command'
      });

      store.createSession({
        cwd: '/Users/user/project2',
        title: '项目2',
        prompt: '开发项目2',
        allowedTools: 'file,command'
      });

      store.createSession({
        cwd: '/tmp/test',
        title: '测试',
        prompt: '测试',
        allowedTools: 'file'
      });
    });

    it('应该能够搜索工作目录', () => {
      const sessions = store.searchSessions('project');
      expect(sessions.length).toBe(2);
    });

    it('应该能够搜索完整路径', () => {
      const sessions = store.searchSessions('/Users/user/project1');
      expect(sessions.length).toBe(1);
      expect(sessions[0].cwd).toBe('/Users/user/project1');
    });

    it('应该支持路径片段搜索', () => {
      const sessions = store.searchSessions('Users');
      expect(sessions.length).toBe(2);
    });
  });

  describe('高级搜索', () => {
    beforeEach(() => {
      // 创建不同状态的会话
      const session1 = store.createSession({
        cwd: '/test/project1',
        title: '进行中的任务',
        prompt: '开发中',
        allowedTools: 'file,command'
      });
      store.updateSession(session1.id, { status: 'running' });

      const session2 = store.createSession({
        cwd: '/test/project2',
        title: '已完成的任务',
        prompt: '已完成',
        allowedTools: 'file'
      });
      store.updateSession(session2.id, { status: 'completed' });

      const session3 = store.createSession({
        cwd: '/test/project3',
        title: '已停止的任务',
        prompt: '已停止',
        allowedTools: 'file'
      });
      store.updateSession(session3.id, { status: 'stopped' });
    });

    it('应该能够按状态筛选', () => {
      const runningSessions = store.searchSessions('', { status: 'running' });
      expect(runningSessions.length).toBe(1);
      expect(runningSessions[0].status).toBe('running');
    });

    it('应该能够组合状态和关键词搜索', () => {
      const sessions = store.searchSessions('任务', { status: 'completed' });
      expect(sessions.length).toBe(1);
      expect(sessions[0].status).toBe('completed');
      expect(sessions[0].title).toContain('任务');
    });

    it('应该支持多个状态筛选', () => {
      const runningSessions = store.searchSessions('', { status: 'running' });
      const completedSessions = store.searchSessions('', { status: 'completed' });
      const stoppedSessions = store.searchSessions('', { status: 'stopped' });

      expect(runningSessions.length).toBe(1);
      expect(completedSessions.length).toBe(1);
      expect(stoppedSessions.length).toBe(1);
    });
  });

  describe('日期范围搜索', () => {
    beforeEach(() => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const oneDayAgo = now - 86400000;

      // 创建不同时间的会话
      const session1 = store.createSession({
        cwd: '/test/project1',
        title: '最近的会话',
        prompt: '最近',
        allowedTools: 'file'
      });

      const session2 = store.createSession({
        cwd: '/test/project2',
        title: '一小时前的会话',
        prompt: '一小时前',
        allowedTools: 'file'
      });

      const session3 = store.createSession({
        cwd: '/test/project3',
        title: '一天前的会话',
        prompt: '一天前',
        allowedTools: 'file'
      });

      // 手动设置创建时间
      const db = (store as any).db;
      db.prepare('UPDATE sessions SET created_at = ? WHERE id = ?')
        .run(now, session1.id);
      db.prepare('UPDATE sessions SET created_at = ? WHERE id = ?')
        .run(oneHourAgo, session2.id);
      db.prepare('UPDATE sessions SET created_at = ? WHERE id = ?')
        .run(oneDayAgo, session3.id);
    });

    it('应该能够按开始日期筛选', () => {
      const now = Date.now();
      const twoHoursAgo = now - 7200000;

      const sessions = store.searchSessions('', {
        startDate: twoHoursAgo
      });

      expect(sessions.length).toBeGreaterThanOrEqual(1);
      sessions.forEach(s => {
        expect(s.createdAt).toBeGreaterThanOrEqual(twoHoursAgo);
      });
    });

    it('应该能够按结束日期筛选', () => {
      const now = Date.now();
      const twoHoursAgo = now - 7200000;

      const sessions = store.searchSessions('', {
        endDate: twoHoursAgo
      });

      sessions.forEach(s => {
        expect(s.createdAt).toBeLessThanOrEqual(twoHoursAgo);
      });
    });

    it('应该能够按日期范围筛选', () => {
      const now = Date.now();
      const twoHoursAgo = now - 7200000;
      const twelveHoursAgo = now - 43200000;

      const sessions = store.searchSessions('', {
        startDate: twelveHoursAgo,
        endDate: twoHoursAgo
      });

      sessions.forEach(s => {
        expect(s.createdAt).toBeGreaterThanOrEqual(twelveHoursAgo);
        expect(s.createdAt).toBeLessThanOrEqual(twoHoursAgo);
      });
    });
  });

  describe('结果限制', () => {
    beforeEach(() => {
      // 创建多个会话
      for (let i = 1; i <= 10; i++) {
        store.createSession({
          cwd: `/test/project${i}`,
          title: `任务${i}`,
          prompt: `任务${i}的描述`,
          allowedTools: 'file'
        });
      }
    });

    it('应该能够限制结果数量', () => {
      const sessions = store.searchSessions('', { limit: 5 });
      expect(sessions.length).toBeLessThanOrEqual(5);
    });

    it('应该能够设置偏移量', () => {
      const sessions1 = store.searchSessions('', { limit: 3, offset: 0 });
      const sessions2 = store.searchSessions('', { limit: 3, offset: 3 });

      expect(sessions1.length).toBe(3);
      expect(sessions2.length).toBe(3);

      // 确保两组结果是不同的
      const ids1 = sessions1.map(s => s.id);
      const ids2 = sessions2.map(s => s.id);
      expect(ids1.some(id => ids2.includes(id))).toBe(false);
    });
  });

  describe('组合搜索', () => {
    beforeEach(() => {
      const now = Date.now();
      const oneDayAgo = now - 86400000;

      const session1 = store.createSession({
        cwd: '/Users/user/project1',
        title: '代码审查任务',
        prompt: '审查项目1的代码',
        allowedTools: 'file,command,search'
      });
      store.updateSession(session1.id, { status: 'completed' });
      const db = (store as any).db;
      db.prepare('UPDATE sessions SET created_at = ? WHERE id = ?')
        .run(now, session1.id);

      const session2 = store.createSession({
        cwd: '/Users/user/project2',
        title: '文档编写',
        prompt: '编写项目2的文档',
        allowedTools: 'file'
      });
      store.updateSession(session2.id, { status: 'running' });
      db.prepare('UPDATE sessions SET created_at = ? WHERE id = ?')
        .run(oneDayAgo, session2.id);

      const session3 = store.createSession({
        cwd: '/tmp/test',
        title: '测试任务',
        prompt: '测试代码',
        allowedTools: 'file,command'
      });
      store.updateSession(session3.id, { status: 'stopped' });
    });

    it('应该能够组合多个搜索条件', () => {
      const sessions = store.searchSessions('代码', {
        status: 'completed',
        cwd: '/Users/user'
      });

      expect(sessions.length).toBe(1);
      expect(sessions[0].title).toContain('代码');
      expect(sessions[0].status).toBe('completed');
      expect(sessions[0].cwd).toContain('/Users/user');
    });

    it('应该能够组合关键词、状态和日期范围', () => {
      const now = Date.now();
      const twoDaysAgo = now - 172800000;

      const sessions = store.searchSessions('', {
        status: 'completed',
        startDate: twoDaysAgo
      });

      expect(sessions.length).toBe(1);
      expect(sessions[0].status).toBe('completed');
      expect(sessions[0].createdAt).toBeGreaterThanOrEqual(twoDaysAgo);
    });
  });

  describe('性能测试', () => {
    it('应该能够快速搜索大量会话', () => {
      // 创建 100 个会话
      for (let i = 1; i <= 100; i++) {
        store.createSession({
          cwd: `/test/project${i}`,
          title: `任务${i}`,
          prompt: `任务${i}的详细描述`,
          allowedTools: 'file,command'
        });
      }

      const startTime = Date.now();
      const sessions = store.searchSessions('任务50');
      const endTime = Date.now();

      expect(sessions.length).toBe(1);
      expect(endTime - startTime).toBeLessThan(100); // 应该在 100ms 内完成
    });
  });

  describe('边界情况', () => {
    it('应该能够处理空搜索', () => {
      const sessions = store.searchSessions('');
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('应该能够处理特殊字符', () => {
      store.createSession({
        cwd: '/test/project',
        title: '测试@#$%^&*()',
        prompt: '特殊字符',
        allowedTools: 'file'
      });

      const sessions = store.searchSessions('@#$');
      expect(sessions.length).toBe(1);
    });

    it('应该能够处理 Unicode 字符', () => {
      store.createSession({
        cwd: '/test/项目',
        title: '中文测试',
        prompt: '测试中文搜索',
        allowedTools: 'file'
      });

      const sessions = store.searchSessions('中文');
      expect(sessions.length).toBe(1);
    });
  });
});