import { useEffect, useState } from "react";
import type { SafeProviderConfig, ProviderSavePayload } from "../types";

interface ProviderModalProps {
  provider?: SafeProviderConfig | null;
  onSave: (provider: ProviderSavePayload) => void;
  onDelete?: (providerId: string) => void;
  onClose: () => void;
}

export function ProviderModal({ provider, onSave, onDelete, onClose }: ProviderModalProps) {
  const [name, setName] = useState(provider?.name || "");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || "");
  // SECURITY: Token is never received from main process, always empty initially
  // User must enter token when creating new or updating existing provider
  const [authToken, setAuthToken] = useState("");
  const [defaultModel, setDefaultModel] = useState(provider?.defaultModel || "");
  const [opusModel, setOpusModel] = useState(provider?.models?.opus || "");
  const [sonnetModel, setSonnetModel] = useState(provider?.models?.sonnet || "");
  const [haikuModel, setHaikuModel] = useState(provider?.models?.haiku || "");

  // Sync form state when provider prop changes - valid pattern for prop sync
  useEffect(() => {
    if (provider) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setName(provider.name);
      setBaseUrl(provider.baseUrl || "");
      // SECURITY: Never set token from provider - tokens are not sent to renderer
      setAuthToken("");
      setDefaultModel(provider.defaultModel || "");
      setOpusModel(provider.models?.opus || "");
      setSonnetModel(provider.models?.sonnet || "");
      setHaikuModel(provider.models?.haiku || "");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [provider]);

  const handleSave = () => {
    // For new providers, token is required
    // For existing providers with hasToken, token is optional (keeps existing if not provided)
    const isNewProvider = !provider?.id;
    const hasExistingToken = provider?.hasToken;

    if (!name.trim() || !baseUrl.trim()) {
      return;
    }

    // Require token for new providers or if existing provider has no token
    if (isNewProvider && !authToken.trim()) {
      return;
    }
    if (!isNewProvider && !hasExistingToken && !authToken.trim()) {
      return;
    }

    const providerConfig: ProviderSavePayload = {
      id: provider?.id,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      // SECURITY: Only include token if user entered one
      // Empty string means "keep existing token" for existing providers
      authToken: authToken.trim() || undefined,
      defaultModel: defaultModel.trim() || undefined,
      models: {
        opus: opusModel.trim() || undefined,
        sonnet: sonnetModel.trim() || undefined,
        haiku: haikuModel.trim() || undefined
      }
    };

    // Remove empty models object if all are empty
    if (!providerConfig.models?.opus && !providerConfig.models?.sonnet && !providerConfig.models?.haiku) {
      providerConfig.models = undefined;
    }

    onSave(providerConfig);
    onClose();
  };

  const handleDelete = () => {
    if (provider?.id && onDelete) {
      onDelete(provider.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-ink-900/5 bg-surface p-6 shadow-elevated max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-semibold text-ink-800">
            {provider ? "Edit Provider" : "Add Provider"}
          </div>
          <button
            className="rounded-full p-1.5 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-sm text-muted mb-4">
          Configure a custom LLM provider compatible with Anthropic's API format.
        </p>

        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted">Provider Name</span>
            <input
              className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
              placeholder="My Custom Provider"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted">Base URL</span>
            <input
              className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
              placeholder="https://api.anthropic.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              required
            />
            <span className="text-[10px] text-muted-light">
              The API endpoint URL (e.g., https://api.anthropic.com/v1 for Anthropic, or custom provider URL)
            </span>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted">Auth Token</span>
            <input
              className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
              placeholder={provider?.hasToken ? "•••••••• (leave empty to keep current)" : "sk-ant-api03-..."}
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              required={!provider?.hasToken}
            />
            <span className="text-[10px] text-muted-light">
              {provider?.hasToken
                ? "Leave empty to keep current token, or enter new token to update"
                : "API key or auth token for the provider"
              }
            </span>
          </label>

          <div className="border-t border-ink-900/10 pt-4 mt-2">
            <span className="text-xs font-medium text-muted mb-3 block">Model Configuration (Optional)</span>

            <label className="grid gap-1.5 mb-3">
              <span className="text-xs font-medium text-muted-light">Default Model</span>
              <input
                className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                placeholder="claude-sonnet-4-20250514"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-light">Opus Model</span>
                <input
                  className="rounded-xl border border-ink-900/10 bg-surface-secondary px-3 py-2 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                  placeholder="claude-opus-4"
                  value={opusModel}
                  onChange={(e) => setOpusModel(e.target.value)}
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-light">Sonnet Model</span>
                <input
                  className="rounded-xl border border-ink-900/10 bg-surface-secondary px-3 py-2 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                  placeholder="claude-sonnet-4"
                  value={sonnetModel}
                  onChange={(e) => setSonnetModel(e.target.value)}
                />
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-light">Haiku Model</span>
                <input
                  className="rounded-xl border border-ink-900/10 bg-surface-secondary px-3 py-2 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                  placeholder="claude-haiku-4"
                  value={haikuModel}
                  onChange={(e) => setHaikuModel(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            {provider && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || !baseUrl.trim() || (!provider?.hasToken && !authToken.trim())}
              className="flex-1 flex justify-center rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-soft hover:bg-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {provider ? "Save Changes" : "Add Provider"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
