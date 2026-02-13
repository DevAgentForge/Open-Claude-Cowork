/**
 * Prompt 注入检测模块
 * 用于检测和防止恶意 prompt 注入攻击
 */

export interface InjectionDetectionResult {
  detected: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  matchedPattern?: string;
  sanitizedPrompt?: string;
}

export class PromptInjectionDetector {
  private patterns: Array<{ pattern: RegExp; severity: InjectionDetectionResult['severity'] }>;

  constructor() {
    this.patterns = this.getDefaultPatterns();
  }

  /**
   * 检测 prompt 是否包含注入攻击
   */
  detect(prompt: string | null | undefined): InjectionDetectionResult {
    if (!prompt || typeof prompt !== 'string') {
      return {
        detected: false,
        severity: 'low',
        reason: 'Empty or invalid prompt'
      };
    }

    const lowerPrompt = prompt.toLowerCase();

    for (const { pattern, severity } of this.patterns) {
      const match = prompt.match(pattern) || lowerPrompt.match(pattern);
      if (match) {
        return {
          detected: true,
          severity,
          reason: `Suspicious pattern detected: ${match[0]}`,
          matchedPattern: match[0],
          sanitizedPrompt: this.sanitize(prompt)
        };
      }
    }

    return {
      detected: false,
      severity: 'low',
      reason: 'No injection detected'
    };
  }

  /**
   * 清理和净化 prompt，移除潜在的恶意内容
   */
  sanitize(prompt: string): string {
    let sanitized = prompt;

    // 移除 HTML 标签（包括自闭合标签）
    sanitized = sanitized.replace(/<[^>]+>/gi, '');

    // 移除危险的协议
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/data:/gi, '');
    sanitized = sanitized.replace(/vbscript:/gi, '');

    // 移除事件处理器属性
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    // 移除 HTML 实体解码
    sanitized = sanitized.replace(/&#\d+;/g, '');
    sanitized = sanitized.replace(/&\w+;/g, '');

    return sanitized.trim();
  }

  /**
   * 添加自定义检测模式
   */
  addCustomPattern(pattern: RegExp, severity: InjectionDetectionResult['severity']): void {
    this.patterns.push({ pattern, severity });
  }

  /**
   * 移除自定义检测模式
   */
  removeCustomPattern(pattern: RegExp): void {
    const index = this.patterns.findIndex(p => p.pattern.source === pattern.source);
    if (index !== -1) {
      this.patterns.splice(index, 1);
    }
  }

  /**
   * 获取默认的检测模式
   */
  private getDefaultPatterns(): Array<{ pattern: RegExp; severity: InjectionDetectionResult['severity'] }> {
    return [
      // 指令覆盖攻击
      { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, severity: 'high' },
      { pattern: /forget\s+everything/i, severity: 'high' },
      { pattern: /disregard\s+all\s+above/i, severity: 'high' },
      { pattern: /override\s+all\s+previous/i, severity: 'high' },

      // 角色扮演攻击
      { pattern: /act\s+as\s+(admin|administrator|root|superuser|system)/i, severity: 'critical' },
      { pattern: /you\s+are\s+now\s+(a\s+)?(admin|administrator|root|superuser|system\s+administrator)/i, severity: 'critical' },
      { pattern: /pretend\s+to\s+be\s+(admin|administrator|root|superuser|system)/i, severity: 'critical' },
      { pattern: /become\s+(admin|administrator|root|superuser|system)/i, severity: 'critical' },

      // 命令注入攻击
      { pattern: /eval\s*\(/i, severity: 'critical' },
      { pattern: /exec\s*\(/i, severity: 'critical' },
      { pattern: /system\s*\(/i, severity: 'critical' },
      { pattern: /;\s*rm\s+-rf/i, severity: 'critical' },
      { pattern: /\|\s*(cat|ls|rm|chmod|chown)/i, severity: 'critical' },
      { pattern: /&&\s*(rm|del|format)/i, severity: 'critical' },

      // 代码注入攻击
      { pattern: /<script[^>]*>.*?<\/script>/gis, severity: 'critical' },
      { pattern: /javascript:/gi, severity: 'critical' },
      { pattern: /on\w+\s*=/gi, severity: 'high' },
      { pattern: /data:\s*text\/html/i, severity: 'critical' },

      // 权限绕过攻击
      { pattern: /override\s+security/i, severity: 'high' },
      { pattern: /bypass\s+(all\s+)?restrictions/i, severity: 'high' },
      { pattern: /disable\s+safety/i, severity: 'high' },
      { pattern: /skip\s+(all\s+)?permissions/i, severity: 'high' },
      { pattern: /ignore\s+security/i, severity: 'high' },

      // SQL 注入
      { pattern: /';\s*drop\s+table/i, severity: 'critical' },
      { pattern: /union\s+select/i, severity: 'high' },
      { pattern: /'?\s*or\s+1\s*=\s*1/i, severity: 'high' },
      { pattern: /or\s+1\s*=\s*1/i, severity: 'high' },

      // 路径遍历
      { pattern: /\.\.\/\.\.\//i, severity: 'high' },
      { pattern: /%2e%2e%2f/i, severity: 'high' },
      { pattern: /etc\/passwd/i, severity: 'high' },
    ];
  }
}

// 导出单例实例
export const promptInjectionDetector = new PromptInjectionDetector();