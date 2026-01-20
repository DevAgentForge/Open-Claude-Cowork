# 功能 2: 会话模板系统

## 2.1 技术方案

### 2.1.1 文件结构
```
src/electron/libs/templates/
├── registry.ts              # 模板注册表
├── builtin.ts               # 内置模板
├── types.ts                 # 类型定义
└── index.ts                 # 导出接口

src/ui/components/
├── TemplateSelector.tsx     # 模板选择器
└── TemplateCard.tsx         # 模板卡片

__tests__/
├── templates/
│   ├── registry.test.ts
│   └── builtin.test.ts
└── components/
    ├── TemplateSelector.test.tsx
    └── TemplateCard.test.tsx
```

### 2.1.2 核心实现

#### 类型定义
```typescript
// src/electron/libs/templates/types.ts

export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: string;
  initialPrompt: string;
  suggestedCwd?: string;
  allowedTools?: string[];
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
  | 'custom';

export interface TemplateFilter {
  category?: TemplateCategory;
  searchQuery?: string;
  tags?: string[];
}
```

#### 内置模板清单
```typescript
// src/electron/libs/templates/builtin.ts

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
```

#### API 设计
```typescript
// src/electron/libs/templates/registry.ts

export class TemplateManager {
  // 获取所有模板
  getTemplates(): SessionTemplate[];
  
  // 获取单个模板
  getTemplate(id: string): SessionTemplate | undefined;
  
  // 按分类获取模板
  getTemplatesByCategory(category: TemplateCategory): SessionTemplate[];
  
  // 搜索模板
  searchTemplates(query: string): SessionTemplate[];
  
  // 过滤模板
  filterTemplates(filter: TemplateFilter): SessionTemplate[];
  
  // 获取所有分类
  getCategories(): TemplateCategory[];
  
  // 添加自定义模板
  addTemplate(template: SessionTemplate): void;
  
  // 删除模板
  removeTemplate(id: string): boolean;
  
  // 更新模板
  updateTemplate(id: string, updates: Partial<SessionTemplate>): boolean;
}
```

### 2.1.3 IPC 接口

```typescript
// src/electron/ipc-handlers.ts

// 获取模板列表
ipcMainHandle("get-templates", () => {
  return templateManager.getTemplates();
});

// 获取单个模板
ipcMainHandle("get-template", (_: any, id: string) => {
  return templateManager.getTemplate(id);
});

// 搜索模板
ipcMainHandle("search-templates", (_: any, query: string) => {
  return templateManager.searchTemplates(query);
});

// 添加自定义模板
ipcMainHandle("add-template", (_: any, template: SessionTemplate) => {
  templateManager.addTemplate(template);
  return { success: true };
});
```

### 2.1.4 UI 组件设计

#### TemplateSelector 组件
```typescript
// src/ui/components/TemplateSelector.tsx

interface TemplateSelectorProps {
  onTemplateSelect: (template: SessionTemplate) => void;
  onClose: () => void;
}

export function TemplateSelector({ onTemplateSelect, onClose }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 加载模板
  useEffect(() => {
    window.electron.getTemplates().then(setTemplates);
  }, []);
  
  // 过滤模板
  const filteredTemplates = templates.filter(template => {
    const matchCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       template.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });
  
  return (
    <div className="template-selector">
      <div className="template-header">
        <h2>选择模板</h2>
        <button onClick={onClose}>✕</button>
      </div>
      
      <div className="template-controls">
        <input
          type="text"
          placeholder="搜索模板..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
          <option value="all">所有分类</option>
          <option value="file-management">文件管理</option>
          <option value="data-processing">数据处理</option>
          <option value="development">开发</option>
          <option value="media">媒体</option>
          <option value="productivity">生产力</option>
        </select>
      </div>
      
      <div className="template-grid">
        {filteredTemplates.map(template => (
          <TemplateCard
            key={template.id}
            template={template}
            onClick={() => {
              onTemplateSelect(template);
              onClose();
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

#### TemplateCard 组件
```typescript
// src/ui/components/TemplateCard.tsx

interface TemplateCardProps {
  template: SessionTemplate;
  onClick: () => void;
}

export function TemplateCard({ template, onClick }: TemplateCardProps) {
  return (
    <div className="template-card" onClick={onClick}>
      <div className="template-icon">{template.icon}</div>
      <div className="template-content">
        <h3>{template.name}</h3>
        <p>{template.description}</p>
        <div className="template-tags">
          {template.tags?.map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 2.1.5 集成到 StartSessionModal

```typescript
// src/ui/components/StartSessionModal.tsx

export function StartSessionModal({ ... }) {
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  
  const handleTemplateSelect = (template: SessionTemplate) => {
    setPrompt(template.initialPrompt);
    setCwd(template.suggestedCwd || cwd);
    setShowTemplateSelector(false);
  };
  
  return (
    <div className="start-session-modal">
      {/* 现有表单 */}
      
      <div className="template-section">
        <button onClick={() => setShowTemplateSelector(true)}>
          📋 使用模板
        </button>
      </div>
      
      {showTemplateSelector && (
        <TemplateSelector
          onTemplateSelect={handleTemplateSelect}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}
    </div>
  );
}
```

---

## 2.2 测试计划

### 2.2.1 单元测试

#### 测试组 1: 模板管理
```typescript
describe('TemplateManager', () => {
  let manager: TemplateManager;
  
  beforeEach(() => {
    manager = new TemplateManager();
  });
  
  describe('getTemplates', () => {
    test('should return all templates', () => {
      const templates = manager.getTemplates();
      expect(templates).toHaveLength(5);
      expect(templates[0]).toHaveProperty('id');
      expect(templates[0]).toHaveProperty('name');
    });
    
    test('should return templates in correct order', () => {
      const templates = manager.getTemplates();
      expect(templates[0].id).toBe('organize-downloads');
    });
  });
  
  describe('getTemplate', () => {
    test('should return template by id', () => {
      const template = manager.getTemplate('organize-downloads');
      expect(template).toBeDefined();
      expect(template?.name).toBe('整理下载文件夹');
    });
    
    test('should return undefined for non-existent id', () => {
      const template = manager.getTemplate('non-existent');
      expect(template).toBeUndefined();
    });
  });
  
  describe('getTemplatesByCategory', () => {
    test('should filter by category', () => {
      const templates = manager.getTemplatesByCategory('file-management');
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe('organize-downloads');
    });
    
    test('should return empty array for non-existent category', () => {
      const templates = manager.getTemplatesByCategory('non-existent' as any);
      expect(templates).toHaveLength(0);
    });
  });
  
  describe('searchTemplates', () => {
    test('should search by name', () => {
      const templates = manager.searchTemplates('整理');
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe('organize-downloads');
    });
    
    test('should search by description', () => {
      const templates = manager.searchTemplates('WebP');
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe('convert-images');
    });
    
    test('should be case insensitive', () => {
      const templates = manager.searchTemplates('WEBP');
      expect(templates).toHaveLength(1);
    });
    
    test('should return empty array for no matches', () => {
      const templates = manager.searchTemplates('xyz');
      expect(templates).toHaveLength(0);
    });
  });
  
  describe('filterTemplates', () => {
    test('should filter by category', () => {
      const templates = manager.filterTemplates({ category: 'media' });
      expect(templates).toHaveLength(1);
    });
    
    test('should filter by search query', () => {
      const templates = manager.filterTemplates({ searchQuery: '代码' });
      expect(templates).toHaveLength(1);
    });
    
    test('should combine filters', () => {
      const templates = manager.filterTemplates({
        category: 'development',
        searchQuery: '代码'
      });
      expect(templates).toHaveLength(1);
    });
  });
  
  describe('addTemplate', () => {
    test('should add custom template', () => {
      const customTemplate: SessionTemplate = {
        id: 'custom-1',
        name: '自定义模板',
        description: '测试模板',
        category: 'custom',
        icon: '🎨',
        initialPrompt: '测试 prompt',
        version: '1.0.0'
      };
      
      manager.addTemplate(customTemplate);
      const templates = manager.getTemplates();
      expect(templates).toHaveLength(6);
      expect(templates.find(t => t.id === 'custom-1')).toBeDefined();
    });
    
    test('should throw error for duplicate id', () => {
      const duplicateTemplate: SessionTemplate = {
        id: 'organize-downloads',
        name: '重复模板',
        description: '测试',
        category: 'custom',
        icon: '🎨',
        initialPrompt: '测试',
        version: '1.0.0'
      };
      
      expect(() => manager.addTemplate(duplicateTemplate)).toThrow();
    });
  });
  
  describe('removeTemplate', () => {
    test('should remove template', () => {
      const result = manager.removeTemplate('organize-downloads');
      expect(result).toBe(true);
      expect(manager.getTemplates()).toHaveLength(4);
    });
    
    test('should return false for non-existent template', () => {
      const result = manager.removeTemplate('non-existent');
      expect(result).toBe(false);
    });
  });
  
  describe('updateTemplate', () => {
    test('should update template', () => {
      const result = manager.updateTemplate('organize-downloads', {
        name: '更新后的名称'
      });
      expect(result).toBe(true);
      
      const template = manager.getTemplate('organize-downloads');
      expect(template?.name).toBe('更新后的名称');
    });
    
    test('should not update id', () => {
      manager.updateTemplate('organize-downloads', {
        id: 'new-id' as any
      });
      
      const template = manager.getTemplate('organize-downloads');
      expect(template).toBeDefined();
      expect(template?.id).toBe('organize-downloads');
    });
  });
});
```

#### 测试组 2: 内置模板验证
```typescript
describe('Builtin Templates', () => {
  test('should have all required fields', () => {
    builtinTemplates.forEach(template => {
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('category');
      expect(template).toHaveProperty('icon');
      expect(template).toHaveProperty('initialPrompt');
      expect(template).toHaveProperty('version');
    });
  });
  
  test('should have unique ids', () => {
    const ids = builtinTemplates.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });
  
  test('should have valid categories', () => {
    const validCategories: TemplateCategory[] = [
      'file-management',
      'data-processing',
      'development',
      'media',
      'productivity',
      'custom'
    ];
    
    builtinTemplates.forEach(template => {
      expect(validCategories).toContain(template.category);
    });
  });
  
  test('should have non-empty prompts', () => {
    builtinTemplates.forEach(template => {
      expect(template.initialPrompt.trim()).not.toBe('');
      expect(template.initialPrompt.length).toBeGreaterThan(10);
    });
  });
  
  test('should have valid version format', () => {
    builtinTemplates.forEach(template => {
      expect(template.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
```

### 2.2.2 组件测试

#### TemplateSelector 测试
```typescript
describe('TemplateSelector', () => {
  test('should render template list', () => {
    render(<TemplateSelector onTemplateSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('选择模板')).toBeInTheDocument();
  });
  
  test('should filter templates by category', async () => {
    render(<TemplateSelector onTemplateSelect={jest.fn()} onClose={jest.fn()} />);
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'file-management' } });
    
    await waitFor(() => {
      expect(screen.getByText('整理下载文件夹')).toBeInTheDocument();
    });
  });
  
  test('should search templates', async () => {
    render(<TemplateSelector onTemplateSelect={jest.fn()} onClose={jest.fn()} />);
    
    const input = screen.getByPlaceholderText('搜索模板...');
    fireEvent.change(input, { target: { value: 'WebP' } });
    
    await waitFor(() => {
      expect(screen.getByText('批量转换图片')).toBeInTheDocument();
    });
  });
  
  test('should call onTemplateSelect when template clicked', async () => {
    const onSelect = jest.fn();
    render(<TemplateSelector onTemplateSelect={onSelect} onClose={jest.fn()} />);
    
    await waitFor(() => {
      const templateCard = screen.getByText('整理下载文件夹');
      fireEvent.click(templateCard);
    });
    
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'organize-downloads' })
    );
  });
});
```

#### TemplateCard 测试
```typescript
describe('TemplateCard', () => {
  const mockTemplate: SessionTemplate = {
    id: 'test-1',
    name: '测试模板',
    description: '测试描述',
    category: 'file-management',
    icon: '📁',
    initialPrompt: '测试',
    version: '1.0.0'
  };
  
  test('should render template information', () => {
    render(<TemplateCard template={mockTemplate} onClick={jest.fn()} />);
    
    expect(screen.getByText('测试模板')).toBeInTheDocument();
    expect(screen.getByText('测试描述')).toBeInTheDocument();
    expect(screen.getByText('📁')).toBeInTheDocument();
  });
  
  test('should render tags', () => {
    const templateWithTags = {
      ...mockTemplate,
      tags: ['标签1', '标签2']
    };
    
    render(<TemplateCard template={templateWithTags} onClick={jest.fn()} />);
    
    expect(screen.getByText('标签1')).toBeInTheDocument();
    expect(screen.getByText('标签2')).toBeInTheDocument();
  });
  
  test('should call onClick when clicked', () => {
    const onClick = jest.fn();
    render(<TemplateCard template={mockTemplate} onClick={onClick} />);
    
    fireEvent.click(screen.getByText('测试模板'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

### 2.2.3 集成测试

```typescript
describe('Template Integration', () => {
  test('should get templates via IPC', async () => {
    const templates = await window.electron.getTemplates();
    expect(templates).toHaveLength(5);
  });
  
  test('should get template by id via IPC', async () => {
    const template = await window.electron.getTemplate('organize-downloads');
    expect(template).toBeDefined();
    expect(template.name).toBe('整理下载文件夹');
  });
  
  test('should search templates via IPC', async () => {
    const templates = await window.electron.searchTemplates('整理');
    expect(templates).toHaveLength(1);
  });
});
```

### 2.2.4 端到端测试

**测试场景**：
1. 用户打开新建会话 → 点击"使用模板" → 选择模板 → 表单自动填充
2. 用户搜索模板 → 过滤结果 → 选择模板
3. 用户按分类筛选模板 → 选择模板
4. 用户修改模板内容 → 创建会话

### 2.2.5 性能测试

```typescript
describe('Template Performance', () => {
  test('should load templates in < 100ms', async () => {
    const start = performance.now();
    await window.electron.getTemplates();
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100);
  });
  
  test('should search templates in < 50ms', async () => {
    const start = performance.now();
    await window.electron.searchTemplates('test');
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(50);
  });
});
```

---

## 2.3 验收标准

### 功能验收
- [ ] 所有内置模板可用
- [ ] 模板列表正确显示
- [ ] 模板搜索功能正常
- [ ] 模板分类筛选正常
- [ ] 选择模板后表单自动填充
- [ ] 用户可以修改模板内容
- [ ] 支持添加自定义模板

### UI/UX 验收
- [ ] 模板卡片设计美观
- [ ] 搜索和筛选响应迅速
- [ ] 模板描述清晰易懂
- [ ] 图标和标签显示正确

### 性能验收
- [ ] 模板加载时间 < 100ms
- [ ] 搜索响应时间 < 50ms
- [ ] UI 渲染流畅无卡顿

### 测试覆盖率
- [ ] 单元测试覆盖率 ≥ 85%
- [ ] 组件测试覆盖率 ≥ 80%
- [ ] 集成测试覆盖率 ≥ 70%

---

## 2.4 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 模板 prompt 质量不高 | 中 | 中 | 用户反馈机制，持续优化 |
| 模板数量过多导致选择困难 | 低 | 低 | 分类和搜索功能 |
| 自定义模板格式错误 | 中 | 中 | 模板验证机制 |
| 模板与用户需求不匹配 | 中 | 中 | 提供模板自定义功能 |

---

## 2.5 实施计划

### Phase 1: 核心实现（2小时）
- [ ] 创建 `src/electron/libs/templates/` 目录
- [ ] 实现 `types.ts` 类型定义
- [ ] 实现 `builtin.ts` 内置模板
- [ ] 实现 `registry.ts` 模板注册表
- [ ] 在 IPC handlers 中添加模板接口

### Phase 2: UI 实现（1小时）
- [ ] 创建 `TemplateCard.tsx` 组件
- [ ] 创建 `TemplateSelector.tsx` 组件
- [ ] 在 `StartSessionModal` 中集成模板选择器
- [ ] 添加样式

### Phase 3: 测试和优化（1小时）
- [ ] 编写单元测试
- [ ] 编写组件测试
- [ ] 运行所有测试
- [ ] 优化性能

### Phase 4: 文档和验收（0.5小时）
- [ ] 更新代码注释
- [ ] 编写使用文档
- [ ] 验收测试
- [ ] 代码审查

**总计**: 4-4.5 小时