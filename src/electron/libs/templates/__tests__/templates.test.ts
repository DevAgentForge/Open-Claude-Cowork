/**
 * 会话模板系统测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateManager } from '../registry.js';
import { builtinTemplates } from '../builtin.js';
import type { SessionTemplate } from '../types.js';

describe('TemplateManager', () => {
  let manager: TemplateManager;

  beforeEach(() => {
    manager = new TemplateManager();
  });

  describe('初始化', () => {
    it('应该加载所有内置模板', () => {
      const templates = manager.getTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates.length).toBe(builtinTemplates.length);
    });

    it('应该包含所有预定义的模板', () => {
      const templates = manager.getTemplates();
      const templateIds = templates.map(t => t.id);

      expect(templateIds).toContain('organize-downloads');
      expect(templateIds).toContain('convert-images');
      expect(templateIds).toContain('extract-expenses');
      expect(templateIds).toContain('code-review');
      expect(templateIds).toContain('generate-report');
    });
  });

  describe('获取模板', () => {
    it('应该能够通过 ID 获取模板', () => {
      const template = manager.getTemplate('code-review');
      expect(template).toBeDefined();
      expect(template?.id).toBe('code-review');
      expect(template?.name).toBe('代码审查');
    });

    it('应该对不存在的 ID 返回 undefined', () => {
      const template = manager.getTemplate('non-existent-template');
      expect(template).toBeUndefined();
    });
  });

  describe('添加模板', () => {
    it('应该能够添加新模板', () => {
      const newTemplate: SessionTemplate = {
        id: 'test-template',
        name: '测试模板',
        description: '这是一个测试模板',
        category: 'test',
        icon: '🧪',
        initialPrompt: 'Test prompt',
        version: '1.0.0',
        author: 'Test Author'
      };

      manager.addTemplate(newTemplate);

      const retrieved = manager.getTemplate('test-template');
      expect(retrieved).toEqual(newTemplate);
    });

    it('应该防止添加重复的模板', () => {
      const template = manager.getTemplate('code-review');
      if (!template) throw new Error('Template not found');

      expect(() => {
        manager.addTemplate(template);
      }).toThrow('Template with id "code-review" already exists');
    });

    it('应该添加到模板列表中', () => {
      const initialCount = manager.getTemplates().length;

      const newTemplate: SessionTemplate = {
        id: 'another-test',
        name: '另一个测试',
        description: '描述',
        category: 'test',
        icon: '📝',
        initialPrompt: 'Prompt',
        version: '1.0.0'
      };

      manager.addTemplate(newTemplate);
      expect(manager.getTemplates().length).toBe(initialCount + 1);
    });
  });

  describe('更新模板', () => {
    it('应该能够更新现有模板', () => {
      const updated = manager.updateTemplate('code-review', {
        name: '代码审查 (已更新)',
        description: '更新后的描述'
      });

      expect(updated).toBe(true);

      const template = manager.getTemplate('code-review');
      expect(template?.name).toBe('代码审查 (已更新)');
      expect(template?.description).toBe('更新后的描述');
    });

    it('应该忽略模板 ID 的更新（ID 不应被修改）', () => {
      const originalId = 'code-review';
      const updated = manager.updateTemplate(originalId, {
        id: 'new-id',
        name: '代码审查 (ID 不变)'
      });

      expect(updated).toBe(true);

      const template = manager.getTemplate(originalId);
      expect(template).toBeDefined();
      expect(template?.id).toBe(originalId); // ID 应该保持不变
      expect(template?.name).toBe('代码审查 (ID 不变)'); // 其他字段应该被更新
    });

    it('应该对不存在的模板返回 false', () => {
      const updated = manager.updateTemplate('non-existent', {
        name: 'New name'
      });

      expect(updated).toBe(false);
    });
  });

  describe('删除模板', () => {
    it('应该能够删除模板', () => {
      const newTemplate: SessionTemplate = {
        id: 'to-delete',
        name: '待删除',
        description: '将被删除',
        category: 'test',
        icon: '🗑️',
        initialPrompt: 'Prompt',
        version: '1.0.0'
      };

      manager.addTemplate(newTemplate);
      const deleted = manager.removeTemplate('to-delete');
      expect(deleted).toBe(true);

      const template = manager.getTemplate('to-delete');
      expect(template).toBeUndefined();
    });

    it('应该对不存在的模板返回 false', () => {
      const deleted = manager.removeTemplate('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('搜索模板', () => {
    it('应该能够按名称搜索', () => {
      const results = manager.searchTemplates('代码');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.name.includes('代码'))).toBe(true);
    });

    it('应该能够按描述搜索', () => {
      const results = manager.searchTemplates('审查');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.description.includes('审查'))).toBe(true);
    });

    it('应该能够按标签搜索', () => {
      const results = manager.searchTemplates('安全');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.tags?.includes('安全'))).toBe(true);
    });

    it('应该不区分大小写', () => {
      const results1 = manager.searchTemplates('CODE');
      const results2 = manager.searchTemplates('code');
      expect(results1.length).toBe(results2.length);
    });

    it('应该对空搜索返回所有模板', () => {
      const results = manager.searchTemplates('');
      expect(results.length).toBe(manager.getTemplates().length);
    });

    it('应该对无匹配返回空数组', () => {
      const results = manager.searchTemplates('xyz-non-existent-123');
      expect(results.length).toBe(0);
    });
  });

  describe('按类别获取模板', () => {
    it('应该能够按类别获取模板', () => {
      const devTemplates = manager.getTemplatesByCategory('development');
      expect(devTemplates.length).toBeGreaterThan(0);
      expect(devTemplates.every(t => t.category === 'development')).toBe(true);
    });

    it('应该对不存在的类别返回空数组', () => {
      const templates = manager.getTemplatesByCategory('custom' as any);
      expect(templates.length).toBe(0);
    });
  });

  describe('内置模板验证', () => {
    it('所有内置模板都应该有必需的字段', () => {
      const templates = manager.getTemplates();

      templates.forEach(template => {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.category).toBeDefined();
        expect(template.icon).toBeDefined();
        expect(template.initialPrompt).toBeDefined();
        expect(template.version).toBeDefined();
      });
    });

    it('代码审查模板应该有正确的配置', () => {
      const template = manager.getTemplate('code-review');
      expect(template).toBeDefined();
      expect(template?.category).toBe('development');
      expect(template?.allowedTools).toBe('file,command,search');
      expect(template?.tags).toContain('代码审查');
      expect(template?.tags).toContain('安全');
    });

    it('整理下载文件夹模板应该有推荐的工作目录', () => {
      const template = manager.getTemplate('organize-downloads');
      expect(template).toBeDefined();
      expect(template?.suggestedCwd).toContain('Downloads');
    });
  });
});