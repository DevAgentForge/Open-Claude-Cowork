# Custom LLM Provider Configuration

This document explains how to configure custom LLM providers in Claude Cowork, allowing you to use your own API subscription or any OpenAI-compatible API provider.

## Overview

Claude Cowork allows you to configure multiple custom LLM providers that are compatible with Anthropic's API format. This means you can use:

- Your personal Anthropic API subscription
- OpenRouter
- Any other provider compatible with the Anthropic API format
- Self-hosted solutions (like LiteLLM proxy)

## Configuration Options

When adding a custom provider, you'll need to configure:

### Required Fields

| Field | Description |
|-------|-------------|
| **Provider Name** | A friendly name to identify this provider |
| **Base URL** | The API endpoint URL |
| **Auth Token** | Your API key or authentication token |

### Optional Fields

| Field | Description |
|-------|-------------|
| **Default Model** | The default model to use if none specified |
| **Opus Model** | Model name for Opus-tier requests |
| **Sonnet Model** | Model name for Sonnet-tier requests |
| **Haiku Model** | Model name for Haiku-tier requests |

## Example Configurations

### 1. Anthropic API (Your Personal Subscription)

```json
{
  "name": "My Anthropic API",
  "baseUrl": "https://api.anthropic.com/v1",
  "authToken": "sk-ant-api03-...",
  "defaultModel": "claude-sonnet-4-20250514",
  "models": {
    "opus": "claude-opus-4-20250514",
    "sonnet": "claude-sonnet-4-20250514",
    "haiku": "claude-haiku-4-20250514"
  }
}
```

### 2. OpenRouter

```json
{
  "name": "OpenRouter",
  "baseUrl": "https://openrouter.ai/api/v1",
  "authToken": "sk-or-...",
  "defaultModel": "anthropic/claude-sonnet-4-20250514",
  "models": {
    "opus": "anthropic/claude-opus-4-20250514",
    "sonnet": "anthropic/claude-sonnet-4-20250514",
    "haiku": "anthropic/claude-haiku-4-20250514"
  }
}
```

### 3. LiteLLM Proxy (Self-hosted)

```json
{
  "name": "LiteLLM Local",
  "baseUrl": "http://localhost:4000/v1",
  "authToken": "sk-1234...",
  "defaultModel": "claude-3-5-sonnet-20241022",
  "models": {
    "opus": "claude-3-opus-20240229",
    "sonnet": "claude-3-5-sonnet-20241022",
    "haiku": "claude-3-haiku-20240307"
  }
}
```

### 4. AWS Bedrock (via boto3/LiteLLM)

```json
{
  "name": "AWS Bedrock",
  "baseUrl": "https://bedrock-runtime.us-west-2.amazonaws.com",
  "authToken": "YOUR_AWS_ACCESS_KEY",
  "defaultModel": "anthropic.claude-sonnet-4-20250514-v1:0"
}
```

Note: For AWS Bedrock, you may need to use AWS credentials differently. Consider using a LiteLLM proxy in front of Bedrock for easier configuration.

## Using Custom Providers

1. Click "Configure" in the sidebar under the Provider dropdown
2. Click "Add Provider"
3. Fill in the provider details
4. Click "Add Provider" to save
5. Select the provider from the dropdown in the sidebar
6. New sessions will now use your custom provider configuration

## Environment Variables Override

When a custom provider is selected, Claude Cowork will override these environment variables:

- `ANTHROPIC_BASE_URL` - The provider's API endpoint
- `ANTHROPIC_AUTH_TOKEN` - Your API key
- `ANTHROPIC_MODEL` - Default model
- `ANTHROPIC_DEFAULT_OPUS_MODEL` - Opus model
- `ANTHROPIC_DEFAULT_SONNET_MODEL` - Sonnet model
- `ANTHROPIC_DEFAULT_HAIKU_MODEL` - Haiku model

This means your custom configuration takes precedence over the default Claude Code settings.

## Security Notes

- API keys are stored locally in `~/Library/Application Support/Agent Cowork/providers.json` (macOS)
- API tokens are encrypted using Electron's `safeStorage` API before being written to disk
- Never share your configuration files containing API keys
- Consider using environment variables or secret management for production use

## Local Development

By default, Claude Cowork blocks localhost and private IP addresses (127.0.0.1, 192.168.x.x, etc.) as provider URLs to prevent SSRF attacks.

For local development with proxies like LiteLLM, enable local providers by setting the environment variable:

```bash
# macOS/Linux
export CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS=true

# Windows (PowerShell)
$env:CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS = "true"

# Or when launching the app
CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS=true ./Claude-Cowork
```

**WARNING:** Only enable this in development environments. Do not use in production.

Once enabled, you can configure local providers like:

```json
{
  "name": "LiteLLM Local",
  "baseUrl": "http://localhost:4000/v1",
  "authToken": "your-local-token"
}
```

## Troubleshooting

### Authentication Errors

1. Verify your API key is correct
2. Check that the Base URL is accessible
3. Ensure your provider supports the Anthropic API format

### Model Not Found

1. Check that the model names are correct for your provider
2. Some providers use different model naming conventions
3. Try setting only the Default Model field if specific tier models are unclear

### Connection Errors

1. Verify network connectivity
2. Check firewall settings
3. Ensure the Base URL is correct and accessible
