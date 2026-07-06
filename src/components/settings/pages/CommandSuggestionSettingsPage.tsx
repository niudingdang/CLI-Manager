import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { ActionIcon, Badge, Box, Button, Card, Group, PasswordInput, Progress, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from "@mantine/core";
import { Gauge, RotateCcw, Sparkles } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useI18n, type AppLanguage } from "@/lib/i18n";
import {
  DEFAULT_TERMINAL_INPUT_SUGGESTION_USAGE,
  TERMINAL_INPUT_SUGGESTION_BUILTIN_PROMPT,
  type TerminalInputSuggestionModelStatus,
  type TerminalInputSuggestionModelTestResult,
} from "@/lib/terminalInputSuggestions";

function pickText(language: AppLanguage, zh: string, en: string) {
  return language === "zh-CN" ? zh : en;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatMetricNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString();
}

function commandSuggestionStatusColor(status: TerminalInputSuggestionModelStatus | "fallback" | null | undefined): string {
  if (status === "operational") return "green";
  if (status === "degraded" || status === "fallback") return "yellow";
  if (status === "failed") return "red";
  return "gray";
}

export function CommandSuggestionSettingsPage() {
  const { language } = useI18n();
  const text = (zh: string, en: string) => pickText(language, zh, en);
  const terminalInputSuggestionsEnabled = useSettingsStore((s) => s.terminalInputSuggestionsEnabled);
  const terminalInputSuggestionLlmEnabled = useSettingsStore((s) => s.terminalInputSuggestionLlmEnabled);
  const terminalInputSuggestionBaseUrl = useSettingsStore((s) => s.terminalInputSuggestionBaseUrl);
  const terminalInputSuggestionApiKey = useSettingsStore((s) => s.terminalInputSuggestionApiKey);
  const terminalInputSuggestionModel = useSettingsStore((s) => s.terminalInputSuggestionModel);
  const terminalInputSuggestionUseBuiltinPrompt = useSettingsStore((s) => s.terminalInputSuggestionUseBuiltinPrompt);
  const terminalInputSuggestionCustomPrompt = useSettingsStore((s) => s.terminalInputSuggestionCustomPrompt);
  const terminalInputSuggestionUsage = useSettingsStore((s) => s.terminalInputSuggestionUsage);
  const terminalInputSuggestionLastTest = useSettingsStore((s) => s.terminalInputSuggestionLastTest);
  const updateSetting = useSettingsStore((s) => s.update);
  const [testing, setTesting] = useState(false);
  const [baseUrlDraft, setBaseUrlDraft] = useState(terminalInputSuggestionBaseUrl);
  const [apiKeyDraft, setApiKeyDraft] = useState(terminalInputSuggestionApiKey);
  const [modelDraft, setModelDraft] = useState(terminalInputSuggestionModel);
  const [promptDraft, setPromptDraft] = useState(terminalInputSuggestionCustomPrompt);

  useEffect(() => setBaseUrlDraft(terminalInputSuggestionBaseUrl), [terminalInputSuggestionBaseUrl]);
  useEffect(() => setApiKeyDraft(terminalInputSuggestionApiKey), [terminalInputSuggestionApiKey]);
  useEffect(() => setModelDraft(terminalInputSuggestionModel), [terminalInputSuggestionModel]);
  useEffect(() => setPromptDraft(terminalInputSuggestionCustomPrompt), [terminalInputSuggestionCustomPrompt]);

  const commitConfig = async () => {
    await Promise.all([
      updateSetting("terminalInputSuggestionBaseUrl", baseUrlDraft.trim()),
      updateSetting("terminalInputSuggestionApiKey", apiKeyDraft.trim()),
      updateSetting("terminalInputSuggestionModel", modelDraft.trim()),
      updateSetting("terminalInputSuggestionCustomPrompt", promptDraft.trim()),
    ]);
  };

  const handleLlmToggle = async (enabled: boolean) => {
    await updateSetting("terminalInputSuggestionLlmEnabled", enabled);
    await updateSetting("terminalInputSuggestionProvider", enabled ? "ai" : "local");
  };

  const handleModelTest = async () => {
    const baseUrl = baseUrlDraft.trim();
    const apiKey = apiKeyDraft.trim();
    const model = modelDraft.trim();
    if (!baseUrl || !apiKey || !model) {
      toast.error(text("命令提示模型配置不完整", "Command suggestion model config is incomplete"));
      return;
    }
    setTesting(true);
    try {
      await commitConfig();
      const result = await invoke<TerminalInputSuggestionModelTestResult>("command_suggestion_test_model", {
        baseUrl,
        apiKey,
        model,
      });
      await updateSetting("terminalInputSuggestionLastTest", result);
      const responseTime = result.responseTimeMs ?? 0;
      if (result.status === "operational") {
        toast.success(text("命令提示模型可用", "Command suggestion model is available"), {
          description: `${responseTime}ms`,
        });
      } else if (result.status === "degraded") {
        toast.warning(text("模型可用但响应偏慢，不建议用于命令提示", "Model works but is slow; not recommended for command suggestions"), {
          description: `${responseTime}ms`,
        });
      } else {
        toast.error(text("命令提示模型不可用", "Command suggestion model is unavailable"), {
          description: result.message,
        });
      }
    } catch (error) {
      toast.error(text("命令提示模型检测失败", "Command suggestion model test failed"), {
        description: getErrorMessage(error),
      });
    } finally {
      setTesting(false);
    }
  };

  const resetUsage = () => {
    void updateSetting("terminalInputSuggestionUsage", { ...DEFAULT_TERMINAL_INPUT_SUGGESTION_USAGE });
  };

  const successRate =
    terminalInputSuggestionUsage.requestCount > 0
      ? (terminalInputSuggestionUsage.successCount / terminalInputSuggestionUsage.requestCount) * 100
      : 0;
  const averageMs =
    terminalInputSuggestionUsage.requestCount > 0
      ? Math.round(terminalInputSuggestionUsage.totalResponseTimeMs / terminalInputSuggestionUsage.requestCount)
      : 0;
  const prompt = terminalInputSuggestionUseBuiltinPrompt
    ? TERMINAL_INPUT_SUGGESTION_BUILTIN_PROMPT
    : promptDraft;
  const lastStatus = terminalInputSuggestionLastTest?.status ?? terminalInputSuggestionUsage.lastStatus;
  const statusLabel =
    lastStatus === "operational"
      ? text("可用", "Available")
      : lastStatus === "degraded"
        ? text("偏慢", "Slow")
        : lastStatus === "failed"
          ? text("不可用", "Unavailable")
          : lastStatus === "fallback"
            ? text("已回退", "Fallback")
            : text("未检测", "Not tested");

  return (
    <Stack gap="md">
      <section className="ui-surface-card rounded-2xl border border-border p-4">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" gap="md">
            <Group gap="sm" wrap="nowrap">
              <Box style={{ color: "var(--primary)", marginTop: 2 }}>
                <Sparkles size={18} />
              </Box>
              <Box>
                <Text size="sm" fw={600} c="var(--on-surface)">
                  {text("命令提示", "Command Suggestions")}
                </Text>
                <Text mt={4} size="xs" c="var(--on-surface-variant)">
                  {text("本地历史和模板是第一层；启用大模型后优先用大模型推测，失败或过慢时自动回退本地提示。", "Local history and templates are the first layer. When LLM is enabled, it is tried first and falls back to local suggestions on failure or slow response.")}
                </Text>
              </Box>
            </Group>
            <Badge color={commandSuggestionStatusColor(lastStatus)} variant="light">
              {statusLabel}
            </Badge>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Group justify="space-between" align="center" gap="md" wrap="nowrap">
                <Box>
                  <Text size="xs" fw={600} c="var(--on-surface)">
                    {text("启用命令提示", "Enable Suggestions")}
                  </Text>
                  <Text mt={4} size="xs" c="var(--text-muted)">
                    {text("关闭后不显示任何终端输入 ghost 提示。", "Disables all terminal input ghost suggestions.")}
                  </Text>
                </Box>
                <Switch
                  color="cliPrimary"
                  checked={terminalInputSuggestionsEnabled}
                  onChange={(event) => void updateSetting("terminalInputSuggestionsEnabled", event.currentTarget.checked)}
                  aria-label={text("启用命令提示", "Enable command suggestions")}
                />
              </Group>
            </Card>
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Group justify="space-between" align="center" gap="md" wrap="nowrap">
                <Box>
                  <Text size="xs" fw={600} c="var(--on-surface)">
                    {text("启用大模型推测", "Enable LLM Prediction")}
                  </Text>
                  <Text mt={4} size="xs" c="var(--text-muted)">
                    {text("启用后使用内置提示词；失败时回退本地历史、模板和内置命令。", "Uses the built-in prompt when enabled; falls back to local history, templates, and built-in commands on failure.")}
                  </Text>
                </Box>
                <Switch
                  color="cliPrimary"
                  checked={terminalInputSuggestionLlmEnabled}
                  disabled={!terminalInputSuggestionsEnabled}
                  onChange={(event) => void handleLlmToggle(event.currentTarget.checked)}
                  aria-label={text("启用大模型命令提示", "Enable LLM command suggestions")}
                />
              </Group>
            </Card>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <TextInput
              size="xs"
              label="Base URL"
              placeholder="http://host:port/v1"
              value={baseUrlDraft}
              disabled={!terminalInputSuggestionsEnabled}
              onChange={(event) => setBaseUrlDraft(event.currentTarget.value)}
              onBlur={() => void updateSetting("terminalInputSuggestionBaseUrl", baseUrlDraft.trim())}
            />
            <PasswordInput
              size="xs"
              label="API Key"
              placeholder="sk-..."
              value={apiKeyDraft}
              disabled={!terminalInputSuggestionsEnabled}
              onChange={(event) => setApiKeyDraft(event.currentTarget.value)}
              onBlur={() => void updateSetting("terminalInputSuggestionApiKey", apiKeyDraft.trim())}
            />
            <TextInput
              size="xs"
              label={text("模型", "Model")}
              placeholder="gpt-5.3-codex-spark"
              value={modelDraft}
              disabled={!terminalInputSuggestionsEnabled}
              onChange={(event) => setModelDraft(event.currentTarget.value)}
              onBlur={() => void updateSetting("terminalInputSuggestionModel", modelDraft.trim())}
            />
          </SimpleGrid>
          <Text size="10px" c="var(--text-muted)">
            {text(
              "Base URL 可填根地址、/v1、/v1/chat/completions 或 /v1/responses，系统会自动识别接口。",
              "Base URL accepts root URL, /v1, /v1/chat/completions, or /v1/responses. The endpoint is detected automatically."
            )}
          </Text>

          <Group justify="space-between" align="center" gap="md">
            <Group gap="sm" wrap="nowrap">
              <Gauge size={16} style={{ color: "var(--primary)" }} />
              <Box>
                <Text size="xs" fw={600} c="var(--on-surface)">
                  {text("模型可用性检测", "Model Availability Test")}
                </Text>
                <Text size="xs" c="var(--text-muted)">
                  {terminalInputSuggestionLastTest
                    ? `${statusLabel} · ${terminalInputSuggestionLastTest.responseTimeMs ?? 0}ms`
                    : text("尚未检测；慢模型不建议用于输入时推测。", "Not tested yet; slow models are not recommended for input-time prediction.")}
                </Text>
              </Box>
            </Group>
            <Button
              size="xs"
              color="cliPrimary"
              variant="light"
              loading={testing}
              disabled={!terminalInputSuggestionsEnabled}
              onClick={() => void handleModelTest()}
            >
              {testing ? text("检测中...", "Testing...") : text("检测模型", "Test Model")}
            </Button>
          </Group>

          <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
            <Stack gap="sm">
              <Group justify="space-between" align="center" gap="md">
                <Box>
                  <Text size="xs" fw={600} c="var(--on-surface)">
                    {text("提示词", "Prompt")}
                  </Text>
                  <Text size="xs" c="var(--text-muted)">
                    {text("默认使用内置命令补全提示词；关闭后可自定义。", "Uses the built-in command completion prompt by default; disable to customize.")}
                  </Text>
                </Box>
                <Switch
                  color="cliPrimary"
                  checked={terminalInputSuggestionUseBuiltinPrompt}
                  onChange={(event) => void updateSetting("terminalInputSuggestionUseBuiltinPrompt", event.currentTarget.checked)}
                  aria-label={text("使用内置提示词", "Use built-in prompt")}
                />
              </Group>
              <Textarea
                size="xs"
                minRows={3}
                autosize
                value={prompt}
                readOnly={terminalInputSuggestionUseBuiltinPrompt}
                disabled={!terminalInputSuggestionsEnabled}
                onChange={(event) => setPromptDraft(event.currentTarget.value)}
                onBlur={() => void updateSetting("terminalInputSuggestionCustomPrompt", promptDraft.trim())}
                aria-label={text("命令提示提示词", "Command suggestion prompt")}
              />
            </Stack>
          </Card>

          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Text size="xs" c="var(--text-muted)">{text("请求", "Requests")}</Text>
              <Text size="lg" fw={700} c="var(--on-surface)">{formatMetricNumber(terminalInputSuggestionUsage.requestCount)}</Text>
            </Card>
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Text size="xs" c="var(--text-muted)">{text("成功率", "Success Rate")}</Text>
              <Text size="lg" fw={700} c="var(--success)">{formatPercent(successRate)}</Text>
              <Progress mt={6} size="xs" color="green" value={successRate} />
            </Card>
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Text size="xs" c="var(--text-muted)">{text("平均耗时", "Avg Latency")}</Text>
              <Text size="lg" fw={700} c="var(--on-surface)">{averageMs}ms</Text>
            </Card>
            <Card className="border border-border bg-surface-container-low" p="sm" radius="lg">
              <Group justify="space-between" gap="xs" align="flex-start">
                <Box>
                  <Text size="xs" c="var(--text-muted)">Token</Text>
                  <Text size="lg" fw={700} c="var(--on-surface)">{formatMetricNumber(terminalInputSuggestionUsage.totalTokens)}</Text>
                </Box>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={resetUsage}
                  aria-label={text("重置命令提示统计", "Reset command suggestion stats")}
                  title={text("重置统计", "Reset stats")}
                >
                  <RotateCcw size={14} />
                </ActionIcon>
              </Group>
              <Text mt={4} size="10px" c="var(--text-muted)">
                {text("回退", "Fallback")} {formatMetricNumber(terminalInputSuggestionUsage.fallbackCount)} · {text("采纳", "Accepted")} {formatMetricNumber(terminalInputSuggestionUsage.acceptedCount)}
              </Text>
            </Card>
          </SimpleGrid>
        </Stack>
      </section>
    </Stack>
  );
}
