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
_PROMPT = PromptTemplate.from_template("""
You are a cyber underwriter assistant. Decide whether to **Quote**, **Decline**,
or **Refer** the account and explain why, *citing section numbers* from the
guidelines.

Submission:
• Business summary: {biz}
• Cyber exposures:  {exp}
• Controls summary: {ctrl}

Return markdown exactly in this form:

## AI Recommendation
**Decision**: <Quote | Decline | Refer>

## Rationale
- <bullet 1>
- <bullet 2>

## Citations
- <filename § section>
""")

_chain = ConversationalRetrievalChain.from_llm(
    llm       = ChatOpenAI(model="gpt-4o-mini", temperature=0),
    retriever = _store.as_retriever(search_kwargs={"k": 4}),
    combine_docs_chain_kwargs={"prompt": _PROMPT},
    return_source_documents=True,
)

def get_ai_decision(biz: str, exp: str, ctrl: str) -> tuple[str, list[str]]:
    res   = _chain(
        {"question": "Provide a recommendation.",
         "biz": biz, "exp": exp, "ctrl": ctrl, "chat_history": []}
    )
    cites = [
        f"{d.metadata.get('filename')} §{d.metadata.get('section')}"
        for d in res["source_documents"]
    ]
    return res["answer"], cites
