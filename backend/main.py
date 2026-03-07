import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from langchain_openai import ChatOpenAI

from langchain_community.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

load_dotenv()

app = FastAPI(
    title="Personal Knowledge Engine API",
    description="Backend for the RAG-based personal search engine"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str

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
        # --- NEW: Loop through ALL files and force UTF-8 encoding ---
        for file_name in txt_files:
            file_path = os.path.join(data_dir, file_name)
            loader = TextLoader(file_path, encoding="utf-8") # Forces Python to read special characters correctly
            documents = loader.load()
            all_documents.extend(documents)
        
        # Chop all documents into chunks
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = text_splitter.split_documents(all_documents)
        
        # Embed and save
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
        relevant_docs = vectorstore.similarity_search(request.query, k=3)
        
        if not relevant_docs:
            return {"answer": "I couldn't find any relevant information in your documents.", "sources": []}
            
        context_text = "\n\n---\n\n".join([doc.page_content for doc in relevant_docs])
        
        prompt = f"""
        You are a highly intelligent personal knowledge assistant. 
        Use the following pieces of retrieved context from my personal notes to answer my question.
        If you don't know the answer based on the context, just say "I don't have that in my notes." Do not make things up.

        Context:
        {context_text}

        Question:
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
            "sources": [doc.page_content for doc in relevant_docs]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error querying knowledge base: {str(e)}")