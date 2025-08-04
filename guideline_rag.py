# guideline_rag.py  (≈ 45 LOC)

import os, json
from supabase import create_client
from langchain_openai.embeddings import OpenAIEmbeddings
from langchain_openai import ChatOpenAI
from langchain_community.vectorstores import SupabaseVectorStore
from langchain.chains import ConversationalRetrievalChain
from langchain.prompts import PromptTemplate

from pathlib import Path
from dotenv import load_dotenv          # ⬅️ add this

load_dotenv(Path(__file__).resolve().parents[0] / ".env")  # ⬅️ and this

# 1) Supabase vec-store pointing at guideline_chunks
_supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
_store    = SupabaseVectorStore(
    client     = _supabase,
    embedding  = OpenAIEmbeddings(model="text-embedding-3-small"),
    table_name = "guideline_chunks",
    query_name = "match_guidelines",
)

# 2) Prompt: Quote / Decline / Refer  + citations
_PROMPT = PromptTemplate.from_template(
    """
You are a cyber underwriter assistant.  Using the excerpts below from the
underwriting guidelines, decide whether to **Quote**, **Decline**, or
**Refer** the account and explain why (cite the section numbers).

{context}

Return markdown exactly in this form:

## AI Recommendation
**Decision**: <Quote | Decline | Refer>

## Rationale
- <bullet 1>
- <bullet 2>

## Citations
- <section heading> (p.<page>)
"""
)

# 3) Retriever with relevance threshold  (k = 8, keep only ≥ 0.85 similarity)
retriever = _store.as_retriever(
    search_type   = "similarity_score_threshold",
    search_kwargs = {"k": 8, "score_threshold": 0.85},
)

# 4) Single, final chain
_chain = ConversationalRetrievalChain.from_llm(
    llm       = ChatOpenAI(model="gpt-4o-mini", temperature=0),
    retriever = retriever,
    combine_docs_chain_kwargs={
        "prompt": _PROMPT,
        "document_variable_name": "context",
    },
    return_source_documents=True,
)


def get_ai_decision(biz: str, exp: str, ctrl: str):
    user_q = (
        f"Business Summary:\n{biz}\n\n"
        f"Cyber Exposures:\n{exp}\n\n"
        f"Controls Summary:\n{ctrl}\n\n"
        "Provide your recommendation."
    )
    res = _chain({"question": user_q, "chat_history": []})
    
    # guideline_rag.py  – inside get_ai_decision()
    cites = [
        {"section": d.metadata.get("section", "Untitled"),
         "page":    d.metadata.get("page", "?")}
        for d in res["source_documents"]
    ]

    return res["answer"], cites
