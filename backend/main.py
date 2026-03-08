import os
import shutil
import io
import uuid
import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import List, Optional

# --- NEW: SQLAlchemy Database Imports ---
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from langchain_openai import ChatOpenAI
from langchain_community.document_loaders import TextLoader, PyPDFLoader, UnstructuredMarkdownLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

load_dotenv()
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

# --- NEW: SQLite Database Setup ---
os.makedirs("data", exist_ok=True)
SQLALCHEMY_DATABASE_URL = "sqlite:///./data/knowledge.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class DocumentDB(Base):
    __tablename__ = "documents"
    id = Column(String, primary_key=True, index=True)
    document_name = Column(String)
    source_type = Column(String) # "local" or "drive"
    upload_date = Column(DateTime, default=datetime.datetime.utcnow)
    file_size = Column(Integer)
    file_path = Column(String)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- FastAPI App Setup ---
app = FastAPI(title="Personal Knowledge Engine API")

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

# --- Google OAuth Routes ---
@app.get("/auth/google/login")
async def google_login():
    flow = get_google_flow()
    authorization_url, state = flow.authorization_url(access_type='offline', include_granted_scopes='true')
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
        app.state.credentials = flow.credentials
        return {"status": "success", "message": "Successfully authenticated! You can now close this tab."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")

@app.get("/drive/list")
async def list_drive_files():
    credentials = getattr(app.state, "credentials", None)
    if not credentials or not credentials.valid:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    try:
        service = build('drive', 'v3', credentials=credentials)
        query = "mimeType='text/plain' or mimeType='application/vnd.google-apps.document'"
        results = service.files().list(q=query, pageSize=15, fields="files(id, name, mimeType)").execute()
        return {"status": "success", "files": results.get('files', [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/drive/import")
async def import_selected_drive_files(request_data: DriveImportRequest, db: Session = Depends(get_db)):
    credentials = getattr(app.state, "credentials", None)
    if not credentials or not credentials.valid:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    if not request_data.file_ids:
        raise HTTPException(status_code=400, detail="No files selected.")

    try:
        service = build('drive', 'v3', credentials=credentials)
        downloaded_files = []

        for file_id in request_data.file_ids:
            file_meta = service.files().get(fileId=file_id, fields="name, mimeType").execute()
            safe_name = "".join([c for c in file_meta['name'] if c.isalpha() or c.isdigit() or c==' ']).rstrip() + ".txt"
            file_path = os.path.join("data", safe_name)

            request = service.files().export_media(fileId=file_id, mimeType='text/plain') if file_meta['mimeType'] == 'application/vnd.google-apps.document' else service.files().get_media(fileId=file_id)
            
            fh = io.FileIO(file_path, 'wb')
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                status, done = downloader.next_chunk()
            
            # Save to Database
            new_doc = DocumentDB(
                id=str(uuid.uuid4()),
                document_name=safe_name,
                source_type="drive",
                file_size=os.path.getsize(file_path),
                file_path=file_path
            )
            db.add(new_doc)
            downloaded_files.append(safe_name)

        db.commit()
        await process_documents(db)
        return {"status": "success", "message": f"Imported {len(downloaded_files)} files!", "files": downloaded_files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Document Management Routes ---
@app.post("/upload")
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith((".txt", ".md", ".pdf")):
        raise HTTPException(status_code=400, detail="Unsupported file type.")
    
    file_path = f"data/{file.filename}"
    with open(file_path, "wb+") as f:
        shutil.copyfileobj(file.file, f)

    new_doc = DocumentDB(
        id=str(uuid.uuid4()),
        document_name=file.filename,
        source_type="local",
        file_size=os.path.getsize(file_path),
        file_path=file_path
    )
    db.add(new_doc)
    db.commit()
    
    await process_documents(db)
    return {"status": "success", "filename": file.filename}

@app.get("/documents")
async def get_documents(db: Session = Depends(get_db)):
    docs = db.query(DocumentDB).all()
    return {"status": "success", "documents": docs}

@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(DocumentDB).filter(DocumentDB.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
        
    db.delete(doc)
    db.commit()
    
    await process_documents(db)
    return {"status": "success", "message": f"Deleted {doc.document_name} and rebuilt index."}

# --- Core RAG Routes ---
@app.post("/process")
async def process_documents_route(db: Session = Depends(get_db)):
    return await process_documents(db)

async def process_documents(db: Session):
    docs = db.query(DocumentDB).all()
    if not docs:
        # If no documents exist, clear the vector DB
        if os.path.exists("./faiss_db"):
            shutil.rmtree("./faiss_db")
        return {"status": "success", "message": "All documents deleted. Vector DB cleared."}
        
    all_documents = []
    try:
        for doc in docs:
            if os.path.exists(doc.file_path):
                file_ext = os.path.splitext(doc.file_path)[1].lower()
                
                try:
                    if file_ext == ".pdf":
                        loader = PyPDFLoader(doc.file_path)
                    elif file_ext == ".md":
                        loader = UnstructuredMarkdownLoader(doc.file_path)
                    else:
                        loader = TextLoader(doc.file_path, encoding="utf-8")
                    
                    loaded_docs = loader.load()
                    
                    # Inject Metadata
                    for d in loaded_docs:
                        d.metadata["document_id"] = doc.id
                        d.metadata["source_type"] = doc.source_type
                    all_documents.extend(loaded_docs)
                except Exception as e:
                    print(f"Error loading document {doc.document_name}: {str(e)}")
                    continue
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = text_splitter.split_documents(all_documents)
        
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        vectorstore = FAISS.from_documents(documents=chunks, embedding=embeddings)
        vectorstore.save_local("./faiss_db")
        return {"status": "success", "chunks_created": len(chunks)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query")
async def query_knowledge(request: QueryRequest):
    if not os.path.exists("./faiss_db"):
        return {"query": request.query, "answer": "I have no documents in my knowledge base. Please upload some files!", "sources": []}

    try:
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        vectorstore = FAISS.load_local("./faiss_db", embeddings, allow_dangerous_deserialization=True)
        relevant_docs = vectorstore.similarity_search(request.query, k=3)
        
        context_text = "\n\n---\n\n".join([doc.page_content for doc in relevant_docs]) if relevant_docs else "No direct context found."
        history_text = "".join([f"{'Human' if msg.role == 'user' else 'Assistant'}: {msg.content}\n" for msg in request.history[-4:]]) if request.history else "No previous conversation."

        prompt = f"""
        You are a highly intelligent personal knowledge assistant. 
        Use the following pieces of retrieved context from my personal notes AND our recent conversation history to answer my question.
        If you don't know the answer based on the context or history, just say "I don't have that in my notes." Do not make things up.

        Conversation History:\n{history_text}\n
        Retrieved Context:\n{context_text}\n
        Current Question:\n{request.query}\nAnswer:
        """
        
        llm = ChatOpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.getenv("OPENROUTER_API_KEY"), model="openai/gpt-oss-120b")
        response = llm.invoke(prompt)
        return {"query": request.query, "answer": response.content, "sources": [doc.page_content for doc in relevant_docs] if relevant_docs else []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))