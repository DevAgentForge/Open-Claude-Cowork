/**
 * 会话模板类型定义
 */

export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: string;
  initialPrompt: string;
  suggestedCwd?: string;
  allowedTools?: string;
  tags?: string[];
  version: string;
  author?: string;
}

export type TemplateCategory = 
  | 'file-management'
  | 'data-processing'
  | 'development'
  | 'media'
  | 'productivity'
  | 'custom'
  | 'test';

export interface TemplateFilter {
  category?: TemplateCategory;
  searchQuery?: string;
  tags?: string[];
}