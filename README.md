# Personal Knowledge Search Engine (RAG-Based)

A sophisticated, Retrieval-Augmented Generation (RAG) based search engine designed to interface with your personal notes and Google Drive. This project provides a seamless conversational interface to query your own knowledge base with memory of past interactions.

## 🚀 Key Features

- **Conversational RAG**: High-quality answers derived from your personal documents using state-of-the-art LLMs via OpenRouter.
- **Google Drive Integration**: Authenticate and import documents directly from your Google Drive.
- **Local File Upload**: Support for `.txt`, `.pdf`, and `.md` file uploads.
- **Persistent Vector Store**: Uses FAISS for efficient similarity search of your document embeddings.
- **Modern UI**: A responsive, premium frontend built with Next.js 16 and Tailwind CSS 4.
- **Dockerized Architecture**: Easy deployment and development using Docker and Docker Compose.

## 🛠 Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11)
- **AI/LLM**: LangChain, OpenAI (via OpenRouter), HuggingFace Embeddings (`all-MiniLM-L6-v2`)
- **Vector Database**: FAISS
- **Authentication**: Google OAuth 2.0
- **Server**: Uvicorn

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **Runtime**: Node.js 20

## 📦 Project Structure

```text
.
├── backend/            # FastAPI application logic and RAG engine
├── frontend/           # Next.js web interface
├── docker-compose.yml  # Multi-container orchestration
└── .env                # Environment variables (required)
```

## ⚙️ Setup & Installation

### Prerequisites
- Docker and Docker Compose
- [OpenRouter API Key](https://openrouter.ai/)
- Google Cloud Console Credentials (for Drive integration)

### Configuration
Create a `.env` file in the root directory with the following variables:

```env
OPENROUTER_API_KEY=your_key_here
GOOGLE_CLIENT_ID=your_google_id
GOOGLE_CLIENT_SECRET=your_google_secret
OAUTHLIB_INSECURE_TRANSPORT=1
```

### Running the Application

The simplest way to run the entire stack is using Docker Compose:

```bash
docker-compose up --build
```

- **Frontend**: Accessible at [http://localhost:3040](http://localhost:3040)
- **Backend API Docs**: Accessible at [http://localhost:8000/docs](http://localhost:8000/docs)

## 📖 Usage

1. **Upload Documents**: Use the frontend to upload local text/PDF files or connect your Google Drive.
2. **Process**: Click the process button to index your documents into the FAISS vector store.
3. **Chat**: Start asking questions about your notes in the conversational interface!

## 💻 Development Workflow

Since the project uses Docker Volumes, most changes are reflected instantly without needing a full rebuild.

| Change Type | Action | Why? |
| :--- | :--- | :--- |
| **Code Changes** (`.py`, `.ts`, `.css`) | **Do Nothing** | Hot-reloading and `--reload` (backend) handle this automatically. |
| **New Libraries** (`npm install`, `pip install`) | **`docker-compose up --build`** | Docker needs to update its image layers for new dependencies. |
| **Env Variables** (`.env`, `docker-compose.yml`) | **`docker-compose up`** | A container restart is required to pull in the new environment state. |
| **New Data** (Adding files to `backend/data`) | **Click "Process" in UI** | The FAISS index needs to be manually regenerated via the app. |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
