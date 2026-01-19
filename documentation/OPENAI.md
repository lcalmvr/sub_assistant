# OpenAI API Documentation

This document provides Claude Code context for using the OpenAI API in this project.

## Project Usage

The OpenAI API is used throughout the codebase for LLM completions:

| File | Purpose |
|------|---------|
| `ai/tower_intel.py` | Parse natural language tower descriptions into structured JSON |
| `ai/market_news_intel.py` | Generate bullet summaries and tags for market news |
| `ai/guideline_rag.py` | RAG-based underwriting recommendations |
| `ingestion/poll_inbox*.py` | Email processing and summary generation |

## Environment Variables

```
OPENAI_API_KEY=sk-proj-...
TOWER_AI_MODEL=gpt-5.1  # Optional, defaults to gpt-5.1
MARKET_NEWS_AI_MODEL=gpt-5.1  # Optional
```

## Client Initialization

```python
from openai import OpenAI

client = OpenAI()  # Reads OPENAI_API_KEY from environment

# Or explicitly:
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
```

## Chat Completions API

### Basic Usage

```python
response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello!"}
    ]
)

# Access the response
content = response.choices[0].message.content
```

### JSON Response Format

Used in `ai/tower_intel.py` and `ai/market_news_intel.py` for structured outputs:

```python
response = client.chat.completions.create(
    model="gpt-5.1",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ],
    temperature=0,  # Deterministic output for parsing
    response_format={"type": "json_object"},  # Ensures valid JSON
)

content = response.choices[0].message.content or "{}"
data = json.loads(content)
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | Model ID (e.g., "gpt-4", "gpt-5.1") |
| `messages` | array | List of message objects with `role` and `content` |
| `temperature` | number | Sampling temperature 0-2. Lower = more deterministic |
| `max_tokens` | integer | Maximum tokens to generate |
| `response_format` | object | Set to `{"type": "json_object"}` for JSON output |
| `stream` | boolean | Enable streaming responses |

### Streaming Responses

```python
stream = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)

for chunk in stream:
    if not chunk.choices:
        continue
    print(chunk.choices[0].delta.content, end="")
```

### Structured Output with Pydantic

```python
from pydantic import BaseModel
from typing import List

class Layer(BaseModel):
    carrier: str
    limit: float
    attachment: float
    premium: float | None

class TowerResponse(BaseModel):
    layers: List[Layer]

completion = client.chat.completions.parse(
    model="gpt-4o-2024-08-06",
    messages=[...],
    response_format=TowerResponse,
)

message = completion.choices[0].message
if message.parsed:
    layers = message.parsed.layers
```

## Response Structure

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Response text here"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 8,
    "total_tokens": 18
  }
}
```

## Error Handling

```python
from openai import OpenAI, APIError, RateLimitError

client = OpenAI()

try:
    response = client.chat.completions.create(...)
except RateLimitError:
    # Handle rate limiting - implement exponential backoff
    pass
except APIError as e:
    # Handle other API errors
    print(f"OpenAI API error: {e}")
```

## Best Practices

1. **Temperature**: Use `temperature=0` for parsing/structured output, `0.2-0.7` for creative tasks
2. **JSON Mode**: Always use `response_format={"type": "json_object"}` when expecting JSON
3. **System Prompts**: Be specific about output format in system prompts
4. **Error Handling**: Implement retry logic for rate limits and transient errors

## References

- [OpenAI Python SDK](https://github.com/openai/openai-python)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [OpenAI Cookbook](https://github.com/openai/openai-cookbook)
