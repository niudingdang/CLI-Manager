# Command Suggestion Contracts

## Scenario: LLM-backed terminal command suggestions

### 1. Scope / Trigger

- Trigger: terminal input suggestions now cross frontend settings, Tauri commands, and an OpenAI-compatible model endpoint.
- Goal: keep LLM suggestions optional, fast, secret-safe, and unable to execute commands automatically.

### 2. Signatures

- `command_suggestion_test_model(baseUrl: string, apiKey: string, model: string) -> CommandSuggestionModelTestResult`
- `command_suggestion_generate(request: CommandSuggestionGenerateRequest) -> CommandSuggestionResponse`

```typescript
interface CommandSuggestionGenerateRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  input: string;
  cwd: string | null;
  previousCommand: string | null;
  history: string[];
  templates: string[];
}

interface CommandSuggestionResponse {
  command: string | null;
  responseTimeMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}
```

### 3. Contracts

- Backend auto-detects the endpoint from `baseUrl`: a full `/v1/responses` URL uses Responses; a full `/v1/chat/completions`, root, or `/v1` URL uses Chat Completions. It avoids duplicate `/v1`, `/v1/chat/completions`, or `/v1/responses` suffixes.
- API key is used only in the `Authorization: Bearer ...` header and must not be logged, returned, or written to task docs.
- Model test uses a minimal chat request and classifies:
  - `operational`: HTTP 2xx and response time is at or below the fast threshold.
  - `degraded`: HTTP 2xx but response is slow; UI should warn that it is not recommended.
  - `failed`: non-2xx, timeout, connection error, or invalid config.
- Generate returns a single candidate command or `null`; frontend must still require the command to start with the current input before showing a suffix.
- LLM output is never executed. `Tab` / `Ctrl+Space` may insert only the accepted suffix.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Empty `baseUrl` | Return `missing_base_url` |
| Empty `apiKey` | Return `missing_api_key` |
| Empty `model` | Return `missing_model` |
| Empty `input` for generation | Return `missing_input` |
| Oversized prompt/input/cwd/previous command | Return `input_too_large` |
| HTTP non-2xx | Return summarized `HTTP <status>: <body prefix>` without secrets |
| Timeout | Return `Request timeout` |
| Multi-line or very long generated command | Treat as no command and let frontend fall back |

### 5. Good/Base/Bad Cases

- Good: Chat Completions or Responses returns `{"command":"git status"}` for input `git s`; frontend shows only `tatus`.
- Base: model is slow but succeeds; settings test reports degraded and terminal suggestions may still fall back if input-time request exceeds the generation timeout.
- Bad: model returns `rm -rf .\ngit status` or a command that does not start with current input; backend/front-end reject it and local suggestions remain available.

### 6. Tests Required

- Rust unit tests:
  - endpoint URL builder avoids duplicate `/v1`.
  - JSON command content is parsed.
  - Responses `output[].content[].text` command content is parsed.
  - multi-line commands are rejected.
- Frontend checks:
  - `npx tsc --noEmit`.
  - LLM-disabled path still returns local history/template/built-in suggestions.
  - Stale async LLM responses do not overwrite suggestions for newer input.
- Backend checks:
  - `cd src-tauri && cargo check`.
  - `cd src-tauri && cargo test command_suggestion`.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Sends model output straight into the terminal or trusts any returned text.
forwardTerminalInput(modelCommand, "onData");
```

#### Correct

```typescript
const suffix = getSafeSuggestionSuffix(currentInput, modelCommand);
if (suffix) {
  showGhostSuffix(suffix);
}
```

Keep LLM completion as a suggestion source only; the PTY write path is reached only after explicit user acceptance.
