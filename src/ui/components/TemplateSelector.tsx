import { useEffect, useState } from "react";

export interface SessionTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  initialPrompt: string;
  suggestedCwd?: string;
  allowedTools?: string;
  tags?: string[];
  version: string;
  author?: string;
}

interface TemplateCardProps {
  template: SessionTemplate;
  onSelect: (template: SessionTemplate) => void;
}

function TemplateCard({ template, onSelect }: TemplateCardProps) {
  return (
    <button
      onClick={() => onSelect(template)}
      className="group flex flex-col rounded-xl border border-ink-900/10 bg-surface p-4 text-left hover:border-accent/30 hover:bg-surface-tertiary transition-all duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-2xl">
          {template.icon}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-sm font-semibold text-ink-800 group-hover:text-accent transition-colors">
            {template.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-xs text-muted">
            {template.description}
          </p>
        </div>
      </div>
      {template.tags && template.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-muted-light"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

interface TemplateSelectorProps {
  onSelect: (template: SessionTemplate) => void;
  onClose: () => void;
}

export function TemplateSelector({ onSelect, onClose }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.electron.getTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
      console.error("Failed to load templates:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(
    (template) =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags?.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  // Group templates by category
  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const category = template.category || "custom";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, SessionTemplate[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4 py-8 backdrop-blur-sm">
      <div className="flex h-[600px] w-full max-w-4xl flex-col rounded-2xl border border-ink-900/5 bg-surface shadow-elevated">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-900/5 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-800">Choose a Template</h2>
            <p className="mt-0.5 text-xs text-muted">
              Select a template to quickly start a new session
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-ink-900/5 px-6 py-3">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-ink-900/10 bg-surface-secondary py-2 pl-9 pr-4 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <svg
                aria-hidden="true"
                className="h-8 w-8 animate-spin text-accent"
                viewBox="0 0 100 101"
                fill="none"
              >
                <path
                  d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                  fill="currentColor"
                  opacity="0.3"
                />
                <path
                  d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                  fill="white"
                />
              </svg>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
                  <svg
                    className="h-6 w-6 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-red-600">{error}</p>
                <button
                  onClick={loadTemplates}
                  className="mt-2 text-sm text-accent hover:text-accent-hover"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : Object.keys(groupedTemplates).length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
                  <svg
                    className="h-6 w-6 text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm text-muted">
                  {searchQuery ? "No templates found" : "No templates available"}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                <div key={category}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {category}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {categoryTemplates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}