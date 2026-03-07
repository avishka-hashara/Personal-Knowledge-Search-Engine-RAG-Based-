import os
import shutil
import io
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List, Optional
from langchain_openai import ChatOpenAI

from langchain_community.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

load_dotenv()

os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

app = FastAPI(
    title="Personal Knowledge Engine API",
    description="Backend for the RAG-based personal search engine with memory and Google Drive"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str
    content: str

class QueryRequest(BaseModel):
    query: str
    history: List[Message] = []

# --- NEW: Request model for importing specific files ---
class DriveImportRequest(BaseModel):
    file_ids: List[str]

SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

def get_google_flow():
    client_config = {
        "web": {
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "project_id": "knowledge-engine",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET")
        }
    }
    
    return Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri="http://localhost:8000/auth/google/callback"
    )

@app.get("/auth/google/login")
async def google_login():
    flow = get_google_flow()
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true'
    )
    app.state.oauth_state = state
    app.state.code_verifier = flow.code_verifier
    return RedirectResponse(url=authorization_url)

@app.get("/auth/google/callback")
async def google_callback(request: Request):
    try:
        flow = get_google_flow()
        flow.code_verifier = getattr(app.state, "code_verifier", None)
        
        authorization_response = str(request.url)
        flow.fetch_token(authorization_response=authorization_response)
        credentials = flow.credentials
        
        app.state.credentials = credentials
        
        return {
            "status": "success",
            "message": "Successfully authenticated! You can now close this tab.",
            "token_valid": credentials.valid
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")

# --- NEW: 1. List files from Drive (without downloading) ---
@app.get("/drive/list")
async def list_drive_files():
    credentials = getattr(app.state, "credentials", None)
    if not credentials or not credentials.valid:
        raise HTTPException(status_code=401, detail="Not authenticated. Please go to /auth/google/login first.")

    try:
        service = build('drive', 'v3', credentials=credentials)
        # Fetch up to 15 recent text/doc files to let the user choose
        query = "mimeType='text/plain' or mimeType='application/vnd.google-apps.document'"
        results = service.files().list(q=query, pageSize=15, fields="files(id, name, mimeType)").execute()
        items = results.get('files', [])

        return {"status": "success", "files": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch file list: {str(e)}")


# --- NEW: 2. Download and process ONLY the selected files ---
@app.post("/drive/import")
async def import_selected_drive_files(request_data: DriveImportRequest):
    credentials = getattr(app.state, "credentials", None)
    if not credentials or not credentials.valid:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    if not request_data.file_ids:
        raise HTTPException(status_code=400, detail="No files selected.")

    try:
        service = build('drive', 'v3', credentials=credentials)
        os.makedirs("data", exist_ok=True)
        downloaded_files = []

        # Download each selected file
        for file_id in request_data.file_ids:
            # First, get the file metadata to know its name and type
            file_meta = service.files().get(fileId=file_id, fields="name, mimeType").execute()
            file_name = file_meta['name']
            mime_type = file_meta['mimeType']
            
            safe_name = "".join([c for c in file_name if c.isalpha() or c.isdigit() or c==' ']).rstrip() + ".txt"
            file_path = os.path.join("data", safe_name)

            request = None
            if mime_type == 'application/vnd.google-apps.document':
                request = service.files().export_media(fileId=file_id, mimeType='text/plain')
            else:
                request = service.files().get_media(fileId=file_id)

            fh = io.FileIO(file_path, 'wb')
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while done is False:
                status, done = downloader.next_chunk()
            
            downloaded_files.append(safe_name)

        # Trigger RAG processing
        await process_documents()

        return {
            "status": "success",
            "message": f"Successfully imported and processed {len(downloaded_files)} files!",
            "files": downloaded_files
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import files: {str(e)}")


# --- Existing Endpoints Below ---

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
        
        relevant_docs = vectorstore.similarity_search(request.query, k=3)
        
        if not relevant_docs:
            context_text = "No direct context found in documents."
        else:
            context_text = "\n\n---\n\n".join([doc.page_content for doc in relevant_docs])
            
        history_text = ""
        if request.history:
            recent_history = request.history[-4:] 
            for msg in recent_history:
                role = "Human" if msg.role == "user" else "Assistant"
                history_text += f"{role}: {msg.content}\n"
        else:
            history_text = "No previous conversation."

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