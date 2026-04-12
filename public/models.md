# AI Models Configuration

**Version:** 1.0
**Last Updated:** 2026-02-07
**LLMbench Version:** 0.2.0

Edit this file to customise the available AI models. Each provider section lists models in the format:
- `model-id` - Display Name

The first model in each list is the default.

---

## Anthropic (Claude)

- `claude-sonnet-4-20250514` - Claude Sonnet 4
- `claude-3-5-haiku-20241022` - Claude 3.5 Haiku

## OpenAI

- `gpt-4o` - GPT-4o
- `gpt-4o-mini` - GPT-4o Mini
- `o1` - o1
- `o1-mini` - o1-mini
- `o3-mini` - o3-mini

## Google (Gemini)

- `gemini-2.5-pro` - Gemini 2.5 Pro
- `gemini-2.5-flash` - Gemini 2.5 Flash
- `gemini-2.5-flash-lite` - Gemini 2.5 Flash-Lite
- `gemini-2.0-flash` - Gemini 2.0 Flash (logprobs)

## Ollama (Local)

- `llama3.2` - Llama 3.2
- `llama3.1` - Llama 3.1
- `mistral` - Mistral
- `mixtral` - Mixtral 8x7B
- `deepseek-r1` - DeepSeek R1

---

## Hugging Face

- `meta-llama/Llama-3.3-70B-Instruct` - Llama 3.3 70B Instruct (logprobs)
- `meta-llama/Llama-3.1-8B-Instruct` - Llama 3.1 8B Instruct (logprobs)
- `Qwen/Qwen2.5-72B-Instruct` - Qwen2.5 72B Instruct (logprobs)
- `Qwen/Qwen2.5-7B-Instruct` - Qwen2.5 7B Instruct (logprobs)
- `Qwen/Qwen2.5-Coder-32B-Instruct` - Qwen2.5 Coder 32B (logprobs)
- `Qwen/Qwen3-32B` - Qwen3 32B
- `Qwen/Qwen3.5-27B` - Qwen3.5 27B
- `mistralai/Mixtral-8x7B-Instruct-v0.1` - Mixtral 8x7B Instruct (logprobs)
- `google/gemma-4-31B-it` - Gemma 4 31B
- `deepseek-ai/DeepSeek-R1` - DeepSeek R1
- `deepseek-ai/DeepSeek-V3` - DeepSeek V3

## Custom Models

Each provider includes a **Custom Model** option in the dropdown. When selected, a text field appears where you can enter any model ID your provider supports.

This is useful when:
- A new model is released before this file is updated
- You want to use a model variant (e.g., `llama3.2:latest`)
- You're using a fine-tuned or custom model

## Editing This File

To permanently add a model, add a new line under the appropriate provider:
- `your-model-id` - Your Model Name

The model ID must match what the API expects.
