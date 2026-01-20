/**
 * 内置会话模板
 */

import type { SessionTemplate } from './types.js';

export const builtinTemplates: SessionTemplate[] = [
  {
    id: 'organize-downloads',
    name: '整理下载文件夹',
    description: '按文件类型和日期整理下载文件夹，删除重复文件',
    category: 'file-management',
    icon: '📁',
    initialPrompt: `请整理这个文件夹：
1. 按文件类型创建子文件夹（图片、文档、安装包、压缩包等）
2. 将文件移动到对应的子文件夹
3. 重命名通用文件名（如 download、IMG_）
4. 删除重复文件
5. 提供整理摘要报告`,
    suggestedCwd: '~/Downloads',
    allowedTools: 'file,command',
    tags: ['文件管理', '整理', '自动化'],
    version: '1.0.0',
    author: 'Agent Cowork'
  },
  {
    id: 'convert-images',
    name: '批量转换图片',
    description: '将图片批量转换为 WebP 格式，保持质量',
    category: 'media',
    icon: '🖼️',
    initialPrompt: `请将此文件夹中的所有图片转换为 WebP 格式：
1. 保持原始质量（quality: 80-90）
2. 保留原始文件的元数据
3. 创建 converted 子文件夹存放转换后的文件
4. 提供转换统计报告`,
    suggestedCwd: '~/Pictures',
    allowedTools: 'file,command',
    tags: ['图片', '转换', 'WebP'],
    version: '1.0.0',
    author: 'Agent Cowork'
  },
  {
    id: 'extract-expenses',
    name: '提取费用数据',
    description: '从收据截图或 PDF 中提取费用信息',
    category: 'data-processing',
    icon: '📊',
    initialPrompt: `请分析此文件夹中的所有收据文件：
1. 识别文件类型（截图、PDF、图片）
2. 提取关键信息：日期、商家、金额、类别
3. 创建 Excel 表格汇总所有费用
4. 按类别和日期分组统计
5. 提供费用分析报告`,
    suggestedCwd: '~/Documents/Receipts',
    allowedTools: 'file,command',
    tags: ['数据提取', '费用', 'Excel'],
    version: '1.0.0',
    author: 'Agent Cowork'
  },
  {
    id: 'code-review',
    name: '代码审查',
    description: '审查代码库并提供改进建议',
    category: 'development',
    icon: '💻',
    initialPrompt: `请全面审查此代码库：
1. 分析项目结构和架构
2. 识别潜在的安全漏洞
3. 检查代码质量问题（重复代码、复杂度过高）
4. 评估性能瓶颈
5. 检查依赖安全性
6. 提供详细的改进建议和优先级排序`,
    suggestedCwd: process.cwd(),
    allowedTools: 'file,command,search',
    tags: ['代码审查', '安全', '性能'],
    version: '1.0.0',
    author: 'Agent Cowork'
  },
  {
    id: 'generate-report',
    name: '生成报告',
    description: '从分散的笔记和文档生成结构化报告',
    category: 'productivity',
    icon: '📝',
    initialPrompt: `请基于此文件夹中的文档生成报告：
1. 阅读所有文档内容
2. 提取关键信息和要点
3. 组织成逻辑清晰的结构
4. 创建 Markdown 格式的报告
5. 添加目录、摘要和结论
6. 保存为 report.md`,
    suggestedCwd: '~/Documents/Notes',
    allowedTools: 'file',
    tags: ['报告', '文档', 'Markdown'],
    version: '1.0.0',
    author: 'Agent Cowork'
  }
];