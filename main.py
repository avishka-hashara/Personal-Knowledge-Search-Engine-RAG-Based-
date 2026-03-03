import os
import shutil
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

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

# Our existing test endpoint
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

# --- NEW: Document Upload Endpoint ---
@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    # 1. Validate the file type (let's stick to text and PDFs for now)
    allowed_extensions = [".txt", ".pdf", ".md"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {allowed_extensions}")
    
    # 2. Save the file to our 'data' directory
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