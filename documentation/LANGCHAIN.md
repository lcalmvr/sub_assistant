# LangChain Documentation

This document provides Claude Code context for using LangChain in this project.

## Project Usage

LangChain provides the RAG framework and LLM integrations:

| File | Purpose |
|------|---------|
| `ai/guideline_rag.py` | ConversationalRetrievalChain for underwriting recommendations |

## Dependencies

```
langchain==0.2.16
langchain-community==0.2.16
langchain-openai==0.1.23
```

## Key Imports

```python
from langchain_openai import ChatOpenAI
from langchain_openai.embeddings import OpenAIEmbeddings
from langchain_classic.chains import ConversationalRetrievalChain
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_community.tools.tavily_search import TavilySearchResults
```

## ChatOpenAI

```python
from langchain_openai import ChatOpenAI

# Initialize LLM
llm = ChatOpenAI(
    model="gpt-5.1",
    temperature=0,  # Deterministic for RAG
)

# Simple invocation
response = llm.invoke([
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
])
print(response.content)
```

## OpenAI Embeddings

```python
from langchain_openai.embeddings import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# Embed a query
query_embedding = embeddings.embed_query("What is cyber insurance?")

# Embed multiple documents
doc_embeddings = embeddings.embed_documents([
    "Document 1 text",
    "Document 2 text",
])
```

## Custom Retriever

The project implements a custom retriever for Supabase vector search:

```python
from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from typing import List

class DirectSupabaseRetriever(BaseRetriever):
    """Custom retriever using direct Supabase RPC calls."""

    k: int = 15  # Number of results to return

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun
    ) -> List[Document]:
        """Retrieve documents using Supabase RPC."""

        # Generate embedding for query
        query_embedding = embeddings.embed_query(query)

        # Call Supabase RPC function
        result = supabase.rpc(
            "match_guidelines",
            {
                "query_embedding": query_embedding,
                "match_count": self.k,
            }
        ).execute()

        # Convert to LangChain Documents
        docs = []
        for row in result.data or []:
            docs.append(Document(
                page_content=row.get("content", ""),
                metadata={
                    "section": row.get("section", ""),
                    "page": row.get("page", ""),
                    "similarity": row.get("similarity", 0),
                }
            ))
        return docs

# Usage
retriever = DirectSupabaseRetriever(k=15)
```

## Prompt Templates

```python
from langchain_core.prompts import PromptTemplate

# Simple template
prompt = PromptTemplate.from_template("""
You are a cyber underwriter assistant. Using the excerpts below:

{context}

Provide a recommendation for:
{question}
""")

# Chat prompt template
from langchain_core.prompts import ChatPromptTemplate

chat_prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("human", "{question}"),
])
```

## ConversationalRetrievalChain

Used for RAG with conversation history:

```python
from langchain_classic.chains import ConversationalRetrievalChain

chain = ConversationalRetrievalChain.from_llm(
    llm=ChatOpenAI(model="gpt-5.1", temperature=0),
    retriever=retriever,
    combine_docs_chain_kwargs={
        "prompt": custom_prompt,
        "document_variable_name": "context",
    },
    return_source_documents=True,
)

# Invoke the chain
result = chain.invoke({
    "question": "What are the underwriting guidelines for ransomware coverage?",
    "context": submission_context,
    "chat_history": [],
})

# Access results
answer = result["answer"]
source_docs = result["source_documents"]

for doc in source_docs:
    print(f"Section: {doc.metadata.get('section')}")
    print(f"Content: {doc.page_content[:100]}...")
```

## Vector Store Integration

Using in-memory vector store:

```python
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_openai import OpenAIEmbeddings

# Create vector store from documents
vectorstore = InMemoryVectorStore.from_documents(
    documents=doc_splits,
    embedding=OpenAIEmbeddings()
)

# Convert to retriever
retriever = vectorstore.as_retriever()

# Similarity search
results = vectorstore.similarity_search(
    "What is cyber insurance?",
    k=5
)
```

## RAG Chain with LCEL

Modern approach using LangChain Expression Language:

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

prompt = ChatPromptTemplate.from_template("""
Context: {context}

Question: {question}
""")

chain = (
    RunnablePassthrough.assign(
        context=(lambda x: x["question"]) | retriever
    )
    | prompt
    | ChatOpenAI(model="gpt-4")
    | StrOutputParser()
)

# Invoke
result = chain.invoke({"question": "What is cyber insurance?"})
```

## Tools Integration

Using Tavily search tool:

```python
from langchain_community.tools.tavily_search import TavilySearchResults

# Initialize tool
search_tool = TavilySearchResults(max_results=3)

# Invoke directly
results = search_tool.invoke({"query": "cyber insurance trends 2024"})
```

## Document Processing

```python
from langchain_core.documents import Document

# Create a document
doc = Document(
    page_content="This is the document content",
    metadata={
        "source": "guidelines.pdf",
        "page": 1,
        "section": "Introduction"
    }
)

# Text splitting
from langchain_text_splitters import CharacterTextSplitter

splitter = CharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200
)
splits = splitter.split_documents([doc])
```

## Error Handling

```python
try:
    result = chain.invoke({"question": question, "chat_history": []})
except Exception as e:
    print(f"LangChain error: {e}")
    # Handle gracefully
```

## Best Practices

1. **Temperature** - Use `temperature=0` for RAG to ensure consistent outputs
2. **Custom Retrievers** - Implement `BaseRetriever` for custom vector stores
3. **Source Documents** - Always return source documents for citations
4. **Chunking** - Use appropriate chunk sizes (500-1000 tokens) with overlap
5. **Prompt Engineering** - Be specific about output format in prompts

## Project-Specific Patterns

### Citation Filtering

```python
# Filter citations to numbered sections only
cites = [
    {
        "section": d.metadata.get("section", "Untitled"),
        "page": d.metadata.get("page", "?"),
    }
    for d in result["source_documents"]
    if re.match(r"^\d+\.\d", d.metadata.get("section", ""))
]

# De-duplicate while preserving order
seen = set()
unique_cites = []
for c in cites:
    key = (c["section"], c["page"])
    if key not in seen:
        seen.add(key)
        unique_cites.append(c)
```

## References

- [LangChain Documentation](https://python.langchain.com/docs)
- [LangChain API Reference](https://api.python.langchain.com)
- [LangChain OpenAI Integration](https://python.langchain.com/docs/integrations/llms/openai)
