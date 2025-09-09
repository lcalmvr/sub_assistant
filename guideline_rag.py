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
from performance_monitor import monitor

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
    # Start performance tracking
    context = monitor.start_tracking('ai_decision', f"Business: {biz[:100]}...")
    
    try:
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
        context_text = query_text  # same text injected into the prompt

        # Mark retrieval start
        monitor.mark_retrieval_start(context)
        
        # Mark generation start (after retrieval)
        monitor.mark_generation_start(context)
        
        # 2) Run the chain
        res = _chain.invoke(
            {
                "question": query_text,   # drives similarity search
                "context":  context_text,      # visible to the LLM
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
            if re.match(r"^\d+\.\d", d.metadata.get("section", ""))  # ← NEW
        ]

        # 4) De-duplicate while preserving order
        seen = set()
        unique_cites = []
        for c in cites:
            key = (c["section"], c["page"])
            if key not in seen:
                seen.add(key)
                unique_cites.append(c)

        # Finish tracking
        metrics = monitor.finish_tracking(
            context, 
            num_documents=len(res["source_documents"]),
            num_tokens_input=len(query_text.split()),  # Rough estimate
            num_tokens_output=len(res["answer"].split())  # Rough estimate
        )

        return {
            "answer": res["answer"],
            "citations": unique_cites,
            "metrics_id": metrics.timestamp  # For feedback collection
        }
        
    except Exception as e:
        # Track errors
        monitor.finish_tracking(context, error=str(e))
        raise e


def get_rag_response(question: str, submission_id: str = None, use_internet: bool = False):
    """
    Get RAG response for chat questions about submissions.
    
    Args:
        question: The user's question
        submission_id: Optional submission ID for context
        use_internet: Whether to use internet search for additional context
    
    Returns:
        String response
    """
    # Start performance tracking
    context = monitor.start_tracking('rag_chat', f"Question: {question[:100]}...")
    
    try:
        # Build query text
        query_text = question
        
        # If we have a submission ID, we could add submission context here
        # For now, just use the question as-is
        
        # Mark retrieval start
        monitor.mark_retrieval_start(context)
        
        # Mark generation start (after retrieval)
        monitor.mark_generation_start(context)
        
        # Run the chain
        res = _chain.invoke(
            {
                "question": query_text,
                "context": query_text,
                "chat_history": [],
            }
        )
        
        # Clean, filtered citations
        cites = [
            {
                "section": d.metadata.get("section", "Untitled"),
                "page": d.metadata.get("page", "?"),
            }
            for d in res["source_documents"]
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
        
        # Finish tracking
        metrics = monitor.finish_tracking(
            context, 
            num_documents=len(res["source_documents"]),
            num_tokens_input=len(query_text.split()),
            num_tokens_output=len(res["answer"].split())
        )
        
        # Format response with citations if available
        response = res["answer"]
        if unique_cites:
            response += "\n\n**Sources:**\n"
            for cite in unique_cites:
                response += f"- {cite['section']} (Page {cite['page']})\n"
        
        return response
        
    except Exception as e:
        # Track errors
        monitor.finish_tracking(context, error=str(e))
        raise e


def get_chat_response(question: str, submission_id: str = None, chat_history: list = None, use_internet: bool = False):
    """
    Get conversational chat response about a specific submission.
    
    Args:
        question: The user's question
        submission_id: Submission ID for context
        chat_history: Previous chat messages
        use_internet: Whether to use internet search for additional context
    
    Returns:
        String response
    """
    from langchain_openai import ChatOpenAI
    from langchain_community.tools import TavilySearchResults
    from langchain.agents import create_openai_tools_agent, AgentExecutor
    from langchain.prompts import ChatPromptTemplate
    from supabase import create_client
    import os
    
    # Start performance tracking
    context = monitor.start_tracking('chat_response', f"Question: {question[:100]}...")
    
    try:
        # Initialize LLM
        llm = ChatOpenAI(model="gpt-4o", temperature=0.7)
        
        # Get submission context if available
        submission_context = ""
        if submission_id:
            try:
                # Only load essential fields to reduce database load
                supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))
                result = supabase.table("submissions").select(
                    "applicant_name,naics_primary_title,business_summary,cyber_exposures,nist_controls_summary,annual_revenue"
                ).eq("id", submission_id).execute()
                if result.data:
                    sub = result.data[0]
                    submission_context = f"""
Submission Context:
- Company: {sub.get('applicant_name', 'Unknown')}
- Industry: {sub.get('naics_primary_title', 'Unknown')}
- Business Summary: {sub.get('business_summary', 'No summary available')}
- Cyber Exposures: {sub.get('cyber_exposures', 'No exposure info available')}
- NIST Controls: {sub.get('nist_controls_summary', 'No controls info available')}
- Revenue: {sub.get('annual_revenue', 'Not specified')}
"""
            except Exception as e:
                print(f"Error loading submission context: {e}")
        
        # Create prompt template
        system_prompt = f"""You are a helpful assistant that can answer questions about cyber insurance submissions. 
You have access to the following submission information:

{submission_context}

Please provide helpful, conversational responses about the submission. Be friendly and informative in your responses."""

        # If internet search is requested, try to get additional context
        additional_context = ""
        if use_internet:
            try:
                search_tool = TavilySearchResults(max_results=3)
                search_results = search_tool.invoke({"query": question})
                
                if search_results:
                    additional_context = f"\n\nAdditional context from internet search:\n{search_results}"
            except Exception as e:
                print(f"Error with internet search: {e}")
                additional_context = "\n\nNote: Internet search was requested but failed."
        
        # Combine all context
        full_prompt = f"{system_prompt}{additional_context}\n\nUser question: {question}"
        
        # Simple LLM call
        messages = [
            {"role": "system", "content": "You are a helpful assistant that provides conversational responses about cyber insurance submissions."},
            {"role": "user", "content": full_prompt}
        ]
        
        response = llm.invoke(messages)
        return response.content
            
    except Exception as e:
        # Track errors
        monitor.finish_tracking(context, error=str(e))
        raise e
