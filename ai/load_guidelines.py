#!/usr/bin/env python3
"""
Load all underwriting guideline docs into Supabase vector store.
Run:  poetry run python scripts/load_guidelines.py
"""
import pathlib, os
from pathlib import Path
from supabase import create_client
from langchain_community.document_loaders import (
    PyPDFLoader,
    UnstructuredWordDocumentLoader,  # DOCX loader
    TextLoader,
)
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai.embeddings import OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")

# after load_dotenv()
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase_client = create_client(supabase_url, supabase_key)

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
splitter = RecursiveCharacterTextSplitter(
    chunk_size=800, chunk_overlap=100
)

GUIDELINE_DIR = pathlib.Path(__file__).resolve().parents[1] / "guidelines"

def loader_for(path):
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return PyPDFLoader(str(path))
    if suffix in {".docx", ".doc"}:
        return UnstructuredWordDocumentLoader(str(path))
    return TextLoader(str(path), encoding="utf-8")

def main():
    docs = []
    for p in GUIDELINE_DIR.glob("*"):
        if p.name.startswith("."):  # skip hidden files
            continue
        print(f"Ingesting {p.name}")
        raw_docs = loader_for(p).load()
        for d in raw_docs:
            d.metadata.update({"filename": p.name})
        docs.extend(raw_docs)

    chunks = splitter.split_documents(docs)
    for c in chunks:
        c.metadata.setdefault("section", c.page_content.split("\n", 1)[0][:120])

    SupabaseVectorStore.from_documents(
        chunks,
        embeddings,
        client=supabase_client,      # 👈 add this
        table_name="guideline_chunks",
        query_name="match_guidelines",
    )
    print(f"✅ Ingested {len(chunks)} chunks")

if __name__ == "__main__":
    main()

