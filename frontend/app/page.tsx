'use client';

import { useState, useRef, useEffect } from 'react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your Personal Knowledge Engine. What would you like to know about your notes?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');

  // NEW: State for Google Drive
  const [driveStatus, setDriveStatus] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userQuery = input;
    setInput('');

    setMessages((prev) => [...prev, { role: 'user', content: userQuery }]);
    setIsLoading(true);

    try {
      const historyForBackend = messages
        .filter(m => m.content !== 'Hello! I am your Personal Knowledge Engine. What would you like to know about your notes?')
        .map((m) => ({
          role: m.role,
          content: m.content
        }));

      const res = await fetch('http://localhost:8000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userQuery,
          history: historyForBackend
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();

      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources
      }]);

    } catch (error) {
      console.error("Error fetching data:", error);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: "Failed to connect to the knowledge engine. Make sure your FastAPI backend is running!"
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploadStatus('Uploading...');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(`Upload Error: ${errData.detail || uploadRes.statusText}`);
      }

      setUploadStatus('Processing into vector database...');

      const processRes = await fetch('http://localhost:8000/process', {
        method: 'POST',
      });

      if (!processRes.ok) {
        const errData = await processRes.json().catch(() => ({}));
        throw new Error(`Backend Error: ${errData.detail || processRes.statusText}`);
      }

      setUploadStatus('Success! File is now searchable.');
      setFile(null);
    } catch (error: any) {
      console.error(error);
      setUploadStatus(error.message || 'Error connecting to backend.');
    }
  };

  // --- NEW: Handle Google Drive Sync ---
  const handleDriveSync = async () => {
    setDriveStatus('Connecting to Google Drive and downloading files...');
    try {
      const res = await fetch('http://localhost:8000/drive/ingest');

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Please click "Authenticate" first!');
        }
        const errData = await res.json().catch(() => ({}));
        throw new Error(`Sync Error: ${errData.detail || res.statusText}`);
      }

      const data = await res.json();
      setDriveStatus(`Success! Synced ${data.files?.length || 0} files to your knowledge base.`);
    } catch (error: any) {
      console.error(error);
      setDriveStatus(error.message || 'Error syncing from Drive.');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-4 md:p-8 text-gray-900">
      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6 h-[90vh]">

        {/* Left Sidebar */}
        <div className="w-full md:w-1/3 flex flex-col gap-6 overflow-y-auto pr-2">
          <header>
            <h1 className="text-3xl font-bold text-blue-600">Knowledge Engine</h1>
            <p className="text-gray-500 mt-1 text-sm">Conversational RAG Search</p>
          </header>

          {/* Local Upload Section */}
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold mb-4">Local Upload</h2>
            <form onSubmit={handleFileUpload} className="flex flex-col gap-4">
              <input
                type="file"
                accept=".txt,.md,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer w-full text-sm text-gray-500"
              />
              <button
                type="submit"
                disabled={!file || uploadStatus === 'Uploading...' || uploadStatus === 'Processing into vector database...'}
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors w-full"
              >
                Upload & Process
              </button>
            </form>
            {uploadStatus && (
              <p className={`mt-3 text-sm font-medium ${uploadStatus.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {uploadStatus}
              </p>
            )}
          </section>

          {/* NEW: Google Drive Section */}
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M10.3 3.1 3 15.8h7.4l7.3-12.7H10.3Z" /><path d="m14 3.1-7.4 12.7 3.7 6.3 7.4-12.7L14 3.1Z" /><path d="m17.7 9.5-3.7-6.4H3l3.7 6.4h11Z" /></svg>
              Google Drive Integration
            </h2>
            <p className="text-sm text-gray-500 mb-4">Sync your latest 5 text documents directly from the cloud.</p>

            <div className="flex flex-col gap-3">
              {/* This opens a new tab so we don't lose our chat state! */}
              <a
                href="http://localhost:8000/auth/google/login"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white border-2 border-blue-600 text-blue-600 px-6 py-2 rounded-lg font-medium hover:bg-blue-50 transition-colors w-full text-center"
              >
                1. Authenticate Account
              </a>

              <button
                onClick={handleDriveSync}
                disabled={driveStatus.includes('Connecting')}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors w-full"
              >
                2. Sync Drive Files
              </button>
            </div>

            {driveStatus && (
              <p className={`mt-3 text-sm font-medium ${driveStatus.includes('Error') || driveStatus.includes('Please click') ? 'text-red-600' : 'text-green-600'}`}>
                {driveStatus}
              </p>
            )}
          </section>

        </div>

        {/* Right Area: Chat Interface */}
        <div className="w-full md:w-2/3 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/50">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl ${msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                  }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Sources</p>
                      <div className="space-y-2">
                        {msg.sources.map((source, i) => (
                          <div key={i} className="bg-gray-50 p-2 rounded text-xs text-gray-500 border-l-2 border-blue-300 line-clamp-2 hover:line-clamp-none transition-all cursor-pointer">
                            "{source.trim()}"
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-gray-200">
            <form onSubmit={handleSend} className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask your knowledge engine..."
                className="flex-1 border border-gray-300 rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 text-white px-8 py-3 rounded-full font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center min-w-[100px]"
              >
                {isLoading ? '...' : 'Send'}
              </button>
            </form>
          </div>

        </div>
      </div>
    </main>
  );
}