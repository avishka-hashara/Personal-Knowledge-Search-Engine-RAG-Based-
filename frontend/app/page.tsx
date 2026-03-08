'use client';

import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  History,
  Star,
  Upload,
  Settings,
  MoreHorizontal,
  Plus,
  ChevronRight,
  Search,
  Mic,
  Paperclip,
  Send,
  Share2,
  Circle,
  FolderOpen
} from 'lucide-react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am your Personal Knowledge Engine. What would you like to know about your notes?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');

  // NEW: State for the Google Drive file selector
  const [driveStatus, setDriveStatus] = useState('');
  const [availableDriveFiles, setAvailableDriveFiles] = useState<DriveFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

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

      if (!uploadRes.ok) throw new Error('Upload Error');

      setUploadStatus('Processing into vector database...');

      const processRes = await fetch('http://localhost:8000/process', {
        method: 'POST',
      });

      if (!processRes.ok) throw new Error('Backend Error');

      setUploadStatus('Success! File is now searchable.');
      setFile(null);
    } catch (error: any) {
      setUploadStatus('Error connecting to backend.');
    }
  };

  // --- NEW: Step 1 - Fetch the list of files ---
  const handleFetchDriveFiles = async () => {
    setDriveStatus('Fetching files from Drive...');
    try {
      const res = await fetch('http://localhost:8000/drive/list');

      if (!res.ok) {
        if (res.status === 401) throw new Error('Please click "Authenticate" first!');
        throw new Error('Failed to fetch files.');
      }

      const data = await res.json();
      setAvailableDriveFiles(data.files);
      setDriveStatus('');
    } catch (error: any) {
      setDriveStatus(error.message);
    }
  };

  // --- NEW: Step 2 - Toggle Checkboxes ---
  const toggleFileSelection = (id: string) => {
    const newSelection = new Set(selectedFileIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedFileIds(newSelection);
  };

  // --- NEW: Step 3 - Send Selected IDs to Backend ---
  const handleImportSelected = async () => {
    if (selectedFileIds.size === 0) return;

    setDriveStatus(`Importing and processing ${selectedFileIds.size} files...`);
    try {
      const res = await fetch('http://localhost:8000/drive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: Array.from(selectedFileIds) }),
      });

      if (!res.ok) throw new Error('Import failed.');

      const data = await res.json();
      setDriveStatus(`Success! Added ${data.files.length} files to your knowledge base.`);
      setAvailableDriveFiles([]); // Clear list after successful import
      setSelectedFileIds(new Set());
    } catch (error: any) {
      setDriveStatus('Error importing files.');
    }
  };

  return (
    <main className="flex h-screen bg-[#0b0f1a] text-slate-200 overflow-hidden font-sans">
      {/* --- SIDEBAR --- */}
      <aside className="w-80 sidebar-gradient border-r border-white/5 flex flex-col premium-shadow z-20">
        {/* Logo & Header */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center premium-shadow">
            <Search className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-tight">Knowledge Engine</h1>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Personal Rag AI</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600/10 text-blue-400 font-medium transition-all hover:bg-blue-600/20 group">
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 font-medium transition-all hover:bg-white/5 hover:text-slate-200 group">
            <History className="w-5 h-5 text-slate-500 group-hover:text-slate-300 transition-colors" />
            <span>Recent Threads</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 font-medium transition-all hover:bg-white/5 hover:text-slate-200 group">
            <Star className="w-5 h-5 text-slate-500 group-hover:text-slate-300 transition-colors" />
            <span>Favorites</span>
          </button>
        </nav>

        {/* Upload Sections */}
        <div className="p-4 space-y-4">
          {/* Local Upload */}
          <div className="glass-card rounded-2xl p-5 border border-white/5">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Local Upload</h2>
            <div
              className="border-2 border-dashed border-white/10 rounded-xl p-4 flex flex-col items-center justify-center gap-2 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group"
              onClick={() => document.getElementById('fileInput')?.click()}
            >
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-blue-600/20 group-hover:text-blue-400 transition-all">
                <Upload className="w-5 h-5 text-slate-400 group-hover:text-blue-400" />
              </div>
              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                Drop PDF, TXT, or DOCX files here
              </p>
              <input
                id="fileInput"
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                accept=".txt,.md,.pdf"
              />
            </div>

            {file && (
              <div className="mt-3 p-2 bg-blue-600/10 rounded-lg flex items-center justify-between">
                <span className="text-xs text-blue-300 truncate max-w-[150px]">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-blue-400 hover:text-blue-300">
                  <Plus className="w-4 h-4 rotate-45" />
                </button>
              </div>
            )}

            <button
              onClick={handleFileUpload}
              disabled={!file || uploadStatus.includes('ing')}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadStatus.includes('ing') ? 'Processing...' : 'Upload & Process'}
            </button>
            {uploadStatus && !uploadStatus.includes('ing') && (
              <p className="mt-2 text-[10px] text-center text-blue-400 font-medium">{uploadStatus}</p>
            )}
          </div>

          {/* Google Drive Import */}
          <div className="glass-card rounded-2xl p-5 border border-white/5">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Google Drive Import</h2>
            <div className="space-y-2">
              <button
                onClick={() => window.open('http://localhost:8000/auth/google/login', '_blank')}
                className="w-full bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold py-2.5 rounded-lg border border-white/5 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4 text-slate-400" />
                Authenticate Account
              </button>
              <button
                onClick={handleFetchDriveFiles}
                className="w-full bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold py-2.5 rounded-lg border border-white/5 transition-all flex items-center justify-center gap-2"
              >
                <History className="w-4 h-4 text-slate-400" />
                Fetch My Files
              </button>
            </div>

            {driveStatus && (
              <p className="mt-2 text-[10px] text-center text-blue-400 font-medium">{driveStatus}</p>
            )}

            {availableDriveFiles.length > 0 && (
              <div className="mt-4 space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                {availableDriveFiles.map(f => (
                  <div key={f.id} className="flex items-center gap-2 p-1.5 hover:bg-white/5 rounded transition-colors group">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded border-white/20 bg-transparent text-blue-600 focus:ring-blue-600"
                      checked={selectedFileIds.has(f.id)}
                      onChange={() => toggleFileSelection(f.id)}
                    />
                    <span className="text-[11px] text-slate-300 truncate">{f.name}</span>
                  </div>
                ))}
              </div>
            )}

            {selectedFileIds.size > 0 && (
              <button
                onClick={handleImportSelected}
                className="w-full mt-3 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-[11px] font-bold py-2 rounded-lg transition-all"
              >
                Import {selectedFileIds.size} Files
              </button>
            )}
          </div>
        </div>

        {/* Library Footer (User Profile) */}
        <div className="mt-auto p-6 border-t border-white/5 flex items-center gap-3 bg-black/20">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-orange-200 to-orange-400 border-2 border-white/10 overflow-hidden premium-shadow">
            <div className="w-full h-full flex items-center justify-center text-orange-900 font-bold text-xs">AJ</div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white truncate">Alex Johnson</h3>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pro Member</p>
          </div>
          <button className="text-slate-500 hover:text-slate-200 transition-colors p-1">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <section className="flex-1 flex flex-col bg-[#0b0f1a] relative">
        {/* Top Navigation Bar */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0b0f1a]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-slate-200">New Thread</span>
            <span className="bg-blue-600/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest border border-blue-600/20">
              Rag Engine V2.4
            </span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <span className="text-[11px] font-semibold text-slate-300">System Ready</span>
            </div>
            <button className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-all group">
              <Share2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-medium">Share</span>
            </button>
          </div>
        </header>

        {/* Chat / Content Scroll Area */}
        <div className="flex-1 overflow-y-auto px-10 py-8 space-y-10 custom-scrollbar relative">
          {messages.length <= 1 && (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <div className="w-16 h-16 bg-blue-600/10 text-blue-500 rounded-3xl flex items-center justify-center mb-10 premium-shadow border border-blue-500/20">
                <Search className="w-8 h-8" />
              </div>
              <h2 className="text-4xl font-extrabold welcome-gradient mb-6 tracking-tight">What's on your mind?</h2>
              <p className="max-w-md text-slate-400 text-base leading-relaxed font-medium">
                Ask anything about your uploaded documents, notes, or Google Drive files. I'll search through them and provide precise answers.
              </p>
            </div>
          )}

          <div className="max-w-3xl mx-auto space-y-12">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-6 group ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in duration-500`}>
                {/* Avatar / Icon */}
                <div className="flex-shrink-0 mt-1">
                  {msg.role === 'assistant' ? (
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center premium-shadow-blue shadow-blue-900/40">
                      <div className="w-5 h-5 bg-white rounded-sm flex items-center justify-center">
                        <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-10 h-10 bg-slate-800 text-slate-400 rounded-xl flex items-center justify-center border border-white/5">
                      <Circle className="w-5 h-5 fill-slate-700 stroke-none" />
                    </div>
                  )}
                </div>

                {/* Message Content */}
                <div className={`flex-1 space-y-4 ${msg.role === 'user' ? 'text-right' : ''}`}>
                  <div className={`inline-block p-6 rounded-3xl text-sm leading-relaxed font-medium ${msg.role === 'assistant'
                      ? 'glass-card border-white/5'
                      : 'bg-[#1e293b]/70 border border-white/10 text-slate-100'
                    } transition-all duration-300 premium-shadow`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {msg.role === 'assistant' && msg.content.includes('Hello!') && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
                        {['"Summarize the Q3 strategy"', '"Find project deadlines"', '"Key technical challenges"'].map((suggestion, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setInput(suggestion.replace(/"/g, ''));
                              handleSend({ preventDefault: () => { } } as React.FormEvent);
                            }}
                            className="text-[11px] font-semibold text-slate-400 px-4 py-2.5 rounded-xl border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 hover:text-slate-200 transition-all text-left truncate"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-col gap-3 mt-4 animate-in fade-in slide-in-from-top-2 duration-500">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
                        <Search className="w-3 h-3" />
                        Searching {msg.sources.length} sources...
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {msg.sources.map((source, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors cursor-pointer group">
                            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                              <Paperclip className="w-4 h-4 text-orange-500/70" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-slate-400 font-medium truncate italic leading-relaxed">
                                "{source.trim()}"
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-6 animate-in fade-in duration-500">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center premium-shadow-blue">
                    <div className="w-5 h-5 bg-white rounded-sm flex items-center justify-center animate-pulse">
                      <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    </div>
                  </div>
                </div>
                <div className="max-w-[100px] glass-card p-4 rounded-2xl flex items-center justify-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-150"></div>
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-300"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* Input Bar Area */}
        <div className="p-8 bg-[#0b0f1a] relative z-20">
          <div className="max-w-3xl mx-auto relative group">
            {/* Gradient Glow */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[2rem] blur opacity-10 group-focus-within:opacity-20 transition duration-500"></div>

            <form onSubmit={handleSend} className="relative glass-card-hover glass-card rounded-[2rem] p-2 flex items-center gap-3 border-white/10 group-focus-within:border-blue-500/50 group-focus-within:bg-white/5 transition-all duration-300">
              <button type="button" className="p-3 text-slate-500 hover:text-slate-300 transition-colors">
                <Paperclip className="w-5 h-5" />
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your query here..."
                className="flex-1 bg-transparent border-none focus:ring-0 text-slate-200 placeholder-slate-500 text-sm py-4"
              />

              <div className="flex items-center gap-1 pr-2">
                <button type="button" className="p-3 text-slate-500 hover:text-slate-300 transition-colors">
                  <Mic className="w-5 h-5" />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="w-12 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/40 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-95 active:scale-90"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
            <p className="mt-3 text-center text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em]">
              Knowledge Engine Powered by RAG Technology • Privacy Protected
            </p>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .premium-shadow-blue {
          box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.39);
        }
      `}</style>
    </main>
  );
}