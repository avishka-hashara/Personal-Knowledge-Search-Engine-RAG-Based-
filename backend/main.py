import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List, Optional
from langchain_openai import ChatOpenAI

from langchain_community.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

load_dotenv()

app = FastAPI(
    title="Personal Knowledge Engine API",
    description="Backend for the RAG-based personal search engine with memory"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- NEW: Data Models for Conversation History ---
class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class QueryRequest(BaseModel):
    query: str
    history: List[Message] = []  # Defaults to an empty list for the first question

@app.get("/")
async def root():
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return {"status": "error", "message": "OPENROUTER_API_KEY is missing!"}
    
    try:
        llm = ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            model="openai/gpt-oss-120b",
        )
        response = llm.invoke("Say 'Connection successful!' in a brief sentence.")
        return {"status": "success", "openrouter_status": "Connected", "llm": response.content}
    except Exception as e:
         return {"status": "error", "message": str(e)}

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    allowed_extensions = [".txt", ".pdf", ".md"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {allowed_extensions}")
    
    file_location = f"data/{file.filename}"
    
    try:
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {str(e)}")
    finally:
        file.file.close()

    return {
        "status": "success", 
        "filename": file.filename, 
        "message": "File uploaded successfully and is ready for processing!"
    }

@app.post("/process")
async def process_documents():
    data_dir = "data"
    
    if not os.path.exists(data_dir) or not os.listdir(data_dir):
        raise HTTPException(status_code=404, detail="No files found in the data folder to process.")
    
    txt_files = [f for f in os.listdir(data_dir) if f.endswith(".txt")]
    if not txt_files:
        raise HTTPException(status_code=404, detail="No .txt files found to process.")
        
    all_documents = []
    
    try:
        for file_name in txt_files:
            file_path = os.path.join(data_dir, file_name)
            loader = TextLoader(file_path, encoding="utf-8")
            documents = loader.load()
            all_documents.extend(documents)
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = text_splitter.split_documents(all_documents)
        
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        vectorstore = FAISS.from_documents(documents=chunks, embedding=embeddings)
        vectorstore.save_local("./faiss_db")
        
        return {
            "status": "success", 
            "message": f"Successfully processed {len(txt_files)} file(s)",
            "chunks_created": len(chunks)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")

@app.post("/query")
async def query_knowledge(request: QueryRequest):
    try:
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        vectorstore = FAISS.load_local("./faiss_db", embeddings, allow_dangerous_deserialization=True)
        
        # 1. Search the database
        relevant_docs = vectorstore.similarity_search(request.query, k=3)
        
        if not relevant_docs:
             # Even if no docs are found, we still want to answer based on history if possible
            context_text = "No direct context found in documents."
        else:
            context_text = "\n\n---\n\n".join([doc.page_content for doc in relevant_docs])
            
        # 2. Format the conversation history (grabbing only the last 4 messages so we don't overload the prompt)
        history_text = ""
        if request.history:
            recent_history = request.history[-4:] 
            for msg in recent_history:
                role = "Human" if msg.role == "user" else "Assistant"
                history_text += f"{role}: {msg.content}\n"
        else:
            history_text = "No previous conversation."

        # 3. Inject BOTH Context AND History into the Prompt
        prompt = f"""
        You are a highly intelligent personal knowledge assistant. 
        Use the following pieces of retrieved context from my personal notes AND our recent conversation history to answer my question.
        If you don't know the answer based on the context or history, just say "I don't have that in my notes." Do not make things up.

        Conversation History:
        {history_text}

        Retrieved Context:
        {context_text}

        Current Question:
        {request.query}

        Answer:
        """
        
        api_key = os.getenv("OPENROUTER_API_KEY")
        llm = ChatOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            model="openai/gpt-oss-120b",
        )
        
        response = llm.invoke(prompt)
        
        return {
            "query": request.query,
            "answer": response.content,
            "sources": [doc.page_content for doc in relevant_docs] if relevant_docs else []
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error querying knowledge base: {str(e)}")