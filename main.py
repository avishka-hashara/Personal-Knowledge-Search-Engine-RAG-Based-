from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize the FastAPI app
app = FastAPI(
    title="Personal Knowledge Engine API",
    description="Backend for the RAG-based personal search engine"
)

# Set up CORS (Cross-Origin Resource Sharing)
# This allows our future Next.js frontend to communicate with this backend securely
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Note: We use "*" for local development, but will lock this down later!
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Our first endpoint to verify the server is alive
@app.get("/")
async def root():
    return {"status": "success", "message": "Personal Knowledge Engine API is running!"}