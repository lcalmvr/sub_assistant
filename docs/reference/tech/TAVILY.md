# Tavily API Documentation

This document provides Claude Code context for using the Tavily Search API in this project.

## Project Usage

Tavily is used for internet search in RAG applications:

| File | Purpose |
|------|---------|
| `ai/guideline_rag.py` | Web search for additional context in chat responses |

## Environment Variables

```
TAVILY_API_KEY=tvly-...
```

## Client Initialization

```python
from tavily import TavilyClient

tavily_client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
```

## Basic Search

```python
from tavily import TavilyClient

client = TavilyClient(api_key="tvly-YOUR_API_KEY")

# Basic search
results = client.search(query="What is cyber insurance?")

for result in results['results']:
    print(f"Title: {result['title']}")
    print(f"URL: {result['url']}")
    print(f"Content: {result['content'][:200]}...")
```

## RAG Context Generation

Get pre-formatted context for RAG applications:

```python
# Generate context string for RAG
context = tavily_client.get_search_context(
    query="What happened during the Burning Man floods?"
)

# Use directly in your prompt
prompt = f"""Based on this context:
{context}

Answer the question: ..."""
```

## LangChain Integration

Used in `ai/guideline_rag.py`:

```python
try:
    from langchain_community.tools.tavily_search import TavilySearchResults
except ImportError:
    from langchain_community.tools import TavilySearchResults

# Initialize the search tool
search_tool = TavilySearchResults(max_results=3)

# Execute search
search_results = search_tool.invoke({"query": question})

# Results are returned as a list of dicts with url, content, etc.
if search_results:
    additional_context = f"Additional context from internet search:\n{search_results}"
```

## Search Parameters

```python
results = client.search(
    query="cyber insurance trends 2024",
    search_depth="advanced",  # "basic" or "advanced"
    max_results=10,
    include_domains=["reuters.com", "wsj.com"],  # Optional: limit to domains
    exclude_domains=["wikipedia.org"],  # Optional: exclude domains
    include_answer=True,  # Get AI-generated answer
    include_raw_content=True,  # Get full page content
    include_images=False,
)
```

## Response Structure

```python
{
    "query": "cyber insurance trends",
    "results": [
        {
            "title": "Article Title",
            "url": "https://example.com/article",
            "content": "Snippet of content...",
            "score": 0.95,  # Relevance score
            "raw_content": "Full page content..."  # If include_raw_content=True
        },
        # ... more results
    ],
    "answer": "AI-generated answer..."  # If include_answer=True
}
```

## Hybrid RAG (Local + Web)

Combine local database search with web search:

```python
from tavily import TavilyHybridClient
from pymongo import MongoClient

# Connect to local database
db = MongoClient("mongodb://localhost:27017/")["my_database"]

# Initialize hybrid client
hybrid_rag = TavilyHybridClient(
    api_key=os.environ["TAVILY_API_KEY"],
    db_provider='mongodb',
    collection=db.get_collection('documents'),
    index='vector_search',
    embeddings_field='embeddings',
    content_field='content'
)

# Search combining local + web
results = hybrid_rag.search(
    query="Who is Leo Messi?",
    max_results=10,
    max_local=5,   # Max from local database
    max_foreign=5,  # Max from web search
)

for result in results:
    source = result.get('source', 'unknown')  # 'local' or 'web'
    print(f"Source: {source}")
    print(f"Content: {result['content'][:200]}...")
```

## Error Handling

```python
from tavily import TavilyClient

try:
    client = TavilyClient(api_key=api_key)
    results = client.search(query)
except Exception as e:
    print(f"Tavily search failed: {e}")
    # Fall back to cached results or skip web search
    results = {"results": []}
```

## Best Practices

1. **Rate Limiting** - Implement retry logic for API limits
2. **Caching** - Cache results to reduce API calls for repeated queries
3. **Fallback** - Handle failures gracefully, don't block main functionality
4. **Domain Filtering** - Use `include_domains` for authoritative sources
5. **Search Depth** - Use "basic" for speed, "advanced" for comprehensive results

## Usage in This Project

In `ai/guideline_rag.py`, Tavily is used optionally for chat responses:

```python
def get_chat_response(question, submission_id, use_internet=False):
    # ... setup ...

    if use_internet:
        try:
            search_tool = TavilySearchResults(max_results=3)
            search_results = search_tool.invoke({"query": question})

            if search_results:
                additional_context = f"\n\nAdditional context from internet search:\n{search_results}"
        except Exception as e:
            print(f"Error with internet search: {e}")
            additional_context = "\n\nNote: Internet search was requested but failed."
```

## References

- [Tavily Python SDK](https://github.com/tavily-ai/tavily-python)
- [Tavily Documentation](https://docs.tavily.com)
- [LangChain Tavily Integration](https://python.langchain.com/docs/integrations/tools/tavily_search)
