import traceback
import sys

try:
    from langchain_community.embeddings import HuggingFaceEmbeddings
    from langchain_community.vectorstores import Chroma
    from langchain_core.documents import Document

    print("Imports successful")
    
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    doc = Document(page_content="Hello world")
    
    vectorstore = Chroma.from_documents(
        documents=[doc], 
        embedding=embeddings, 
        persist_directory="./test_chroma_db"
    )
    print("Success")
except Exception as e:
    print("Error:", str(e))
    traceback.print_exc(file=sys.stdout)
