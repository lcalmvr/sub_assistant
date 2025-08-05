# guideline_rag.py  (≈ 45 LOC)

import os, json
import re
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
"""
)

# -----------------------------------------------------------
# Retriever: top-15 most similar chunks (no hard threshold)
# -----------------------------------------------------------
retriever = _store.as_retriever(
    search_type   = "similarity",   #  ←  changed
    search_kwargs = {"k": 15},      #  ←  keep 15 best
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

# ────────────────────────────────────────────────────────────────
# Return AI markdown + structured citations
#   * The submission text is now part of the **question**
#     so the retriever can pull guideline chunks about MFA, EDR, etc.
#   * {context} is still passed so the LLM can read the details, too.
# ────────────────────────────────────────────────────────────────
# ───────────────────────────────────────────────────────────
# NEW get_ai_decision  (filters & de-duplicates citations)
# ───────────────────────────────────────────────────────────
def get_ai_decision(biz: str, exp: str, ctrl: str):
    # 1) Build query & context (submission details)
    query_text = f"""
Business Summary:
{biz}

Cyber Exposures:
{exp}

Controls Summary:
{ctrl}

Provide a recommendation.
"""
    context = query_text  # same text injected into the prompt

    # 2) Run the chain
    res = _chain.invoke(
        {
            "question": query_text,   # drives similarity search
            "context":  context,      # visible to the LLM
            "chat_history": [],
        }
    )

    # 3) Clean, filtered citations  (keep headings that start with a digit)
    cites = [
        {
            "section": d.metadata.get("section", "Untitled"),
            "page":    d.metadata.get("page", "?"),
        }
        for d in res["source_documents"]
        if re.match(r"^\d", d.metadata.get("section", ""))
    ]

    # 4) De-duplicate while preserving order
    seen = set()
    unique_cites = []
    for c in cites:
        key = (c["section"], c["page"])
        if key not in seen:
            seen.add(key)
            unique_cites.append(c)

    return res["answer"], unique_cites
