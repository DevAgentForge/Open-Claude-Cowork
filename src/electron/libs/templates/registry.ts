/**
 * 模板注册表
 */

import type { SessionTemplate, TemplateFilter, TemplateCategory } from './types.js';
import { builtinTemplates } from './builtin.js';

export class TemplateManager {
  private templates: Map<string, SessionTemplate>;

  constructor() {
    this.templates = new Map();
    this.loadBuiltinTemplates();
  }

  /**
   * 获取所有模板
   */
  getTemplates(): SessionTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 获取单个模板
   */
  getTemplate(id: string): SessionTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * 按分类获取模板
   */
  getTemplatesByCategory(category: TemplateCategory): SessionTemplate[] {
    return Array.from(this.templates.values()).filter(
      template => template.category === category
    );
  }

  /**
   * 搜索模板
   */
  searchTemplates(query: string): SessionTemplate[] {
    if (!query.trim()) {
      return this.getTemplates();
    }

    const lowerQuery = query.toLowerCase();
    return Array.from(this.templates.values()).filter(template =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.description.toLowerCase().includes(lowerQuery) ||
      template.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 过滤模板
   */
  filterTemplates(filter: TemplateFilter): SessionTemplate[] {
    let results = this.getTemplates();

    if (filter.category) {
      results = results.filter(template => template.category === filter.category);
    }

    if (filter.searchQuery) {
      const lowerQuery = filter.searchQuery.toLowerCase();
      results = results.filter(template =>
        template.name.toLowerCase().includes(lowerQuery) ||
        template.description.toLowerCase().includes(lowerQuery)
      );
    }

    if (filter.tags && filter.tags.length > 0) {
      results = results.filter(template =>
        filter.tags!.some(tag => template.tags?.includes(tag))
      );
    }

    return results;
  }

  /**
   * 获取所有分类
   */
  getCategories(): TemplateCategory[] {
    const categories = new Set<TemplateCategory>();
    for (const template of this.templates.values()) {
      categories.add(template.category);
    }
    return Array.from(categories);
  }

  /**
   * 添加自定义模板
   */
  addTemplate(template: SessionTemplate): void {
    if (this.templates.has(template.id)) {
      throw new Error(`Template with id "${template.id}" already exists`);
    }
    this.templates.set(template.id, template);
  }

  /**
   * 删除模板
   */
  removeTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * 更新模板
   */
  updateTemplate(id: string, updates: Partial<SessionTemplate>): boolean {
    const template = this.templates.get(id);
    if (!template) {
      return false;
    }

    // 不允许更新 id
    const { id: _id, ...safeUpdates } = updates as Partial<SessionTemplate>;
    void _id; // 标记为有意未使用
    const updated = { ...template, ...safeUpdates };
    this.templates.set(id, updated);
    return true;
  }

  /**
   * 加载内置模板
   */
  private loadBuiltinTemplates(): void {
    for (const template of builtinTemplates) {
      this.templates.set(template.id, template);
    }
  }
}

// 导出单例实例
export const templateManager = new TemplateManager();