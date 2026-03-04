import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

# --- NEW IMPORTS FOR CHUNKING AND EMBEDDING ---
from langchain_community.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

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

# --- NEW: Document Processing Endpoint ---
@app.post("/process")
async def process_documents():
    data_dir = "data"
    
    # 1. Check if we have files
    if not os.path.exists(data_dir) or not os.listdir(data_dir):
        raise HTTPException(status_code=404, detail="No files found in the data folder to process.")
    
    # Let's grab the first .txt file we find for our MVP
    txt_files = [f for f in os.listdir(data_dir) if f.endswith(".txt")]
    if not txt_files:
        raise HTTPException(status_code=404, detail="No .txt files found to process.")
        
    file_path = os.path.join(data_dir, txt_files[0])
    
    try:
        # 2. Load the document
        loader = TextLoader(file_path)
        documents = loader.load()
        
        # 3. Chop it into chunks of 500 characters, with 50 characters of overlap
        # (Overlap ensures we don't accidentally cut a sentence in half and lose meaning)
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = text_splitter.split_documents(documents)
        
        # 4. Embed and store in ChromaDB locally
        # Note: The first time this runs, it will download the small embedding model (about 80MB)
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        
        # Save the vectors to a local folder called 'chroma_db'
        vectorstore = Chroma.from_documents(
            documents=chunks, 
            embedding=embeddings, 
            persist_directory="./chroma_db"
        )
        vectorstore.persist()
        
        return {
            "status": "success", 
            "message": f"Successfully processed {txt_files[0]}",
            "chunks_created": len(chunks)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")