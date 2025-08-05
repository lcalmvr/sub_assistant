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
def get_ai_decision(biz: str, exp: str, ctrl: str):
    # 1️⃣ Build one long question string that contains the submission details
    query_text = f"""
Business Summary:
{biz}

Cyber Exposures:
{exp}

Controls Summary:
{ctrl}

Provide a recommendation.
"""

    # 2️⃣ Provide the same details to the LLM as separate context
    context = query_text  # re-use the same block

    # 3️⃣ Ask the chain
    res = _chain.invoke(
        {
            "question": query_text,   # used for embedding / retrieval
            "context":  context,      # injected into the prompt
            "chat_history": [],
        }
    )
    
    print(">>> RETRIEVED HEADINGS:",
      [d.metadata["section"] for d in res["source_documents"]])

    # 4️⃣ Extract clean citations (dict format)
    cites = [
        {
            "section": d.metadata.get("section", "Untitled"),
            "page":    d.metadata.get("page", "?"),
        }
        for d in res["source_documents"]
    ]

    return res["answer"], cites
