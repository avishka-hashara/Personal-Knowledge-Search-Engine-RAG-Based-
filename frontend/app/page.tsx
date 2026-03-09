'use client';

import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  History,
  Upload,
  Settings,
  Plus,
  Search,
  Paperclip,
  Send,
  Circle,
  Trash2,
  RefreshCw,
  Filter,
  MessageSquare,
  PlusCircle,
  AlertTriangle,
  ChevronDown,
  Sun,
  Moon,
  Menu,
  X
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

type DocumentDB = {
  id: string;
  document_name: string;
  source_type: 'local' | 'drive';
  upload_date: string;
  file_size: number;
};

type ChatSession = {
  id: string;
  title: string;
  created_at: string;
};

type DeleteTarget = {
  type: 'document' | 'chat';
  id: string;
  name: string;
};

const MODEL_OPTIONS = [
  { id: 'openai/gpt-oss-120b:free', name: 'GPT OSS (120B Free)' },
  { id: 'qwen/qwen3-coder:free', name: 'Qwen 3 Coder (Free)' },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 (70B Free)' },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 (27B Free)' },
  { id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free', name: 'Dolphin Mistral (24B)' }
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');

  const [driveStatus, setDriveStatus] = useState('');
  const [availableDriveFiles, setAvailableDriveFiles] = useState<DriveFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  const [managedDocs, setManagedDocs] = useState<DocumentDB[]>([]);
  const [isDocsLoading, setIsDocsLoading] = useState(false);
  const [activeQueryDocIds, setActiveQueryDocIds] = useState<Set<string>>(new Set());

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].id);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(true);

  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchDocuments();
    initializeChatSystem();
  }, []);

  const initializeChatSystem = async () => {
    setIsSessionsLoading(true);
    try {
      const res = await fetch('http://localhost:8000/chats');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);

        if (data.sessions.length > 0) {
          loadSession(data.sessions[0].id);
        } else {
          createNewSession();
        }
      }
    } catch (error) {
      console.error("Failed to load chat sessions", error);
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const createNewSession = async () => {
    try {
      const res = await fetch('http://localhost:8000/chats', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActiveSessionId(data.session_id);
        setMessages([{ role: 'assistant', content: 'Hello! I am your Personal Knowledge Engine. What would you like to know about your notes?' }]);

        const fetchRes = await fetch('http://localhost:8000/chats');
        const fetchData = await fetchRes.json();
        setSessions(fetchData.sessions);
        setIsRightSidebarOpen(false);
      }
    } catch (error) {
      console.error("Failed to create new session", error);
    }
  };

  const loadSession = async (id: string) => {
    setActiveSessionId(id);
    setIsRightSidebarOpen(false);
    try {
      const res = await fetch(`http://localhost:8000/chats/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages.length === 0) {
          setMessages([{ role: 'assistant', content: 'Hello! I am your Personal Knowledge Engine. What would you like to know about your notes?' }]);
        } else {
          const mappedMessages = data.messages.map((m: any) => ({
            role: m.role,
            content: m.content,
            sources: m.sources ? JSON.parse(m.sources) : []
          }));
          setMessages(mappedMessages);
        }
      }
    } catch (error) {
      console.error("Failed to load session messages", error);
    }
  };

  const confirmDeleteSession = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget({ type: 'chat', id, name });
  };

  const confirmDeleteDocument = (id: string, name: string) => {
    setDeleteTarget({ type: 'document', id, name });
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'chat') {
        const res = await fetch(`http://localhost:8000/chats/${deleteTarget.id}`, { method: 'DELETE' });
        if (res.ok) {
          if (activeSessionId === deleteTarget.id) {
            initializeChatSystem();
          } else {
            const fetchRes = await fetch('http://localhost:8000/chats');
            const fetchData = await fetchRes.json();
            setSessions(fetchData.sessions);
          }
        }
      } else if (deleteTarget.type === 'document') {
        const res = await fetch(`http://localhost:8000/documents/${deleteTarget.id}`, { method: 'DELETE' });
        if (res.ok) {
          fetchDocuments();
        }
      }
    } catch (error) {
      console.error(`Failed to delete ${deleteTarget.type}`, error);
    } finally {
      setDeleteTarget(null);
    }
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
  };

  const fetchDocuments = async () => {
    setIsDocsLoading(true);
    try {
      const res = await fetch('http://localhost:8000/documents');
      if (res.ok) {
        const data = await res.json();
        setManagedDocs(data.documents);
        setActiveQueryDocIds(new Set(data.documents.map((d: DocumentDB) => d.id)));
      }
    } catch (error) {
      console.error("Failed to fetch documents", error);
    } finally {
      setIsDocsLoading(false);
    }
  };

  const localDocs = managedDocs.filter(d => d.source_type === 'local');
  const driveDocs = managedDocs.filter(d => d.source_type === 'drive');

  const selectAllDocs = () => setActiveQueryDocIds(new Set(managedDocs.map(d => d.id)));
  const selectLocalDocs = () => setActiveQueryDocIds(new Set(localDocs.map(d => d.id)));
  const selectDriveDocs = () => setActiveQueryDocIds(new Set(driveDocs.map(d => d.id)));
  const clearSelection = () => setActiveQueryDocIds(new Set());

  const toggleQueryDoc = (id: string) => {
    const newSet = new Set(activeQueryDocIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setActiveQueryDocIds(newSet);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeSessionId) return;

    const userQuery = input;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userQuery }]);
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:8000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userQuery,
          session_id: activeSessionId,
          selected_doc_ids: Array.from(activeQueryDocIds),
          model: selectedModel
        }),
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data = await res.json();

      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources
      }]);

      const fetchRes = await fetch('http://localhost:8000/chats');
      const fetchData = await fetchRes.json();
      setSessions(fetchData.sessions);

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
      const uploadRes = await fetch('http://localhost:8000/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('Upload Error');

      setUploadStatus('Processing into vector database...');
      const processRes = await fetch('http://localhost:8000/process', { method: 'POST' });
      if (!processRes.ok) throw new Error('Backend Error');

      setUploadStatus('Success! File is now searchable.');
      setFile(null);
      fetchDocuments();
    } catch (error: any) {
      setUploadStatus('Error connecting to backend.');
    }
  };

  const handleFetchDriveFiles = async () => {
    setDriveStatus('Fetching files from Drive...');
    try {
      const res = await fetch('http://localhost:8000/drive/list');
      if (!res.ok) throw new Error(res.status === 401 ? 'Please click "Authenticate" first!' : 'Failed to fetch files.');
      const data = await res.json();
      setAvailableDriveFiles(data.files);
      setDriveStatus('');
    } catch (error: any) {
      setDriveStatus(error.message);
    }
  };

  const toggleFileSelection = (id: string) => {
    const newSelection = new Set(selectedFileIds);
    if (newSelection.has(id)) newSelection.delete(id);
    else newSelection.add(id);
    setSelectedFileIds(newSelection);
  };

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
      setAvailableDriveFiles([]);
      setSelectedFileIds(new Set());
      fetchDocuments();
    } catch (error: any) {
      setDriveStatus('Error importing files.');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const activeSessionTitle = sessions.find(s => s.id === activeSessionId)?.title || "New Thread";

  // Dynamic Theme Classes
  const themeBg = isDarkMode ? 'bg-[#05050A]' : 'bg-[#F4F7FC]';
  const themeText = isDarkMode ? 'text-slate-200' : 'text-slate-800';
  const glassPanelBg = isDarkMode ? 'bg-white/[0.02]' : 'bg-white/50';
  const glassBorder = isDarkMode ? 'border-white/5' : 'border-slate-200/60';
  const glassCardBg = isDarkMode ? 'bg-white/[0.03]' : 'bg-white/80';
  const textMuted = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const textStrong = isDarkMode ? 'text-white' : 'text-slate-900';
  const hoverBg = isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-100/80';
  const inputBg = isDarkMode ? 'bg-[#0a0a12]/80' : 'bg-white/80';

  return (
    <main className={`fixed inset-0 flex w-full ${themeBg} ${themeText} overflow-hidden font-sans transition-colors duration-500`}>

      {/* Ambient Background Glowing Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[-10%] right-[10%] w-[30%] h-[30%] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none z-0"></div>

      {/* --- MOBILE OVERLAY (Left) --- */}
      {isLeftSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsLeftSidebarOpen(false)} />
      )}

      {/* --- LEFT SIDEBAR --- */}
      <aside className={`${isLeftSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative top-0 left-0 h-full w-80 ${glassPanelBg} backdrop-blur-2xl border-r ${glassBorder} flex flex-col z-50 shrink-0 transition-transform duration-300 shadow-2xl md:shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}>

        <div className="p-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.5)]">
              <Search className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className={`text-lg font-bold tracking-tight ${textStrong} leading-tight`}>Knowledge Engine</h1>
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Personal Rag AI</p>
            </div>
          </div>
          <button className="md:hidden p-2 text-slate-400 hover:text-blue-500" onClick={() => setIsLeftSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-4 space-y-2 mb-4 flex-shrink-0">
          <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-600/10 text-blue-500 font-semibold transition-all hover:bg-blue-600/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`}>
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </button>
        </nav>

        <div className="flex-1 overflow-y-auto px-4 space-y-4 custom-scrollbar pb-6 z-10">
          <div className={`${glassCardBg} backdrop-blur-md rounded-2xl p-5 border ${glassBorder} shadow-sm transition-colors duration-500`}>
            <h2 className={`text-[10px] font-bold ${textMuted} uppercase tracking-widest mb-4`}>Local Upload</h2>
            <div
              className={`border-2 border-dashed ${isDarkMode ? 'border-white/10 hover:border-blue-500/50' : 'border-slate-300 hover:border-blue-500/50'} rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group`}
              onClick={() => document.getElementById('fileInput')?.click()}
            >
              <div className={`w-10 h-10 rounded-full ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'} flex items-center justify-center group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-all`}>
                <Upload className={`w-5 h-5 ${textMuted} group-hover:text-blue-500`} />
              </div>
              <p className={`text-[11px] ${textMuted} text-center leading-relaxed`}>Drop PDF, TXT, or DOCX files here</p>
              <input id="fileInput" type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} accept=".txt,.md,.pdf" />
            </div>
            {file && (
              <div className="mt-3 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-between">
                <span className="text-xs text-blue-500 font-medium truncate max-w-[150px]">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-blue-500 hover:text-blue-400"><Plus className="w-4 h-4 rotate-45" /></button>
              </div>
            )}
            <button onClick={handleFileUpload} disabled={!file || uploadStatus.includes('ing')} className="w-full mt-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-bold py-3 rounded-xl transition-all shadow-[0_4px_14px_rgba(37,99,235,0.3)] disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed">
              {uploadStatus.includes('ing') ? 'Processing...' : 'Upload & Process'}
            </button>
            {uploadStatus && !uploadStatus.includes('ing') && <p className="mt-2 text-[10px] text-center text-blue-500 font-medium">{uploadStatus}</p>}
          </div>

          <div className={`${glassCardBg} backdrop-blur-md rounded-2xl p-5 border ${glassBorder} shadow-sm transition-colors duration-500`}>
            <h2 className={`text-[10px] font-bold ${textMuted} uppercase tracking-widest mb-4`}>Google Drive Import</h2>
            <div className="space-y-2">
              <button onClick={() => window.open('http://localhost:8000/auth/google/login', '_blank')} className={`w-full ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'} ${hoverBg} ${textStrong} text-xs font-semibold py-2.5 rounded-lg border transition-all flex items-center justify-center gap-2`}>
                <Plus className={`w-4 h-4 ${textMuted}`} /> Authenticate Account
              </button>
              <button onClick={handleFetchDriveFiles} className={`w-full ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'} ${hoverBg} ${textStrong} text-xs font-semibold py-2.5 rounded-lg border transition-all flex items-center justify-center gap-2`}>
                <History className={`w-4 h-4 ${textMuted}`} /> Fetch My Files
              </button>
            </div>
            {driveStatus && <p className={`mt-2 text-[10px] text-center ${driveStatus.includes('Error') ? 'text-red-500' : 'text-blue-500'} font-medium`}>{driveStatus}</p>}
            {availableDriveFiles.length > 0 && (
              <div className={`mt-4 space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar ${isDarkMode ? 'dark-scroll' : 'light-scroll'}`}>
                {availableDriveFiles.map(f => (
                  <div key={f.id} className={`flex items-center gap-2 p-1.5 ${hoverBg} rounded-lg transition-colors group`}>
                    <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-300 text-blue-500 focus:ring-blue-500 cursor-pointer" checked={selectedFileIds.has(f.id)} onChange={() => toggleFileSelection(f.id)} />
                    <span className={`text-[11px] ${textStrong} truncate`}>{f.name}</span>
                  </div>
                ))}
              </div>
            )}
            {selectedFileIds.size > 0 && (
              <button onClick={handleImportSelected} className="w-full mt-3 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-500 text-[11px] font-bold py-2 rounded-lg transition-all">Import {selectedFileIds.size} Files</button>
            )}
          </div>

          <div className={`${glassCardBg} backdrop-blur-md rounded-2xl p-5 border ${glassBorder} shadow-sm transition-colors duration-500`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`text-[10px] font-bold ${textMuted} uppercase tracking-widest`}>Active Documents</h2>
              <button onClick={fetchDocuments} className={`${textMuted} hover:text-blue-500 transition-colors p-1`} title="Refresh Documents"><RefreshCw className={`w-3 h-3 ${isDocsLoading ? 'animate-spin' : ''}`} /></button>
            </div>
            {managedDocs.length > 0 && (
              <div className={`flex flex-wrap gap-1 mb-4 border-b ${glassBorder} pb-3`}>
                <button onClick={selectAllDocs} className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-600'} hover:text-blue-500 rounded transition-colors`}>All</button>
                <button onClick={selectLocalDocs} className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-600'} hover:text-blue-500 rounded transition-colors`}>Local</button>
                <button onClick={selectDriveDocs} className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-600'} hover:text-blue-500 rounded transition-colors`}>Drive</button>
                <button onClick={clearSelection} className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 ${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-600'} hover:text-blue-500 rounded transition-colors`}>None</button>
              </div>
            )}
            <div className="space-y-4">
              {managedDocs.length === 0 && !isDocsLoading ? (
                <p className={`text-[11px] ${textMuted} italic text-center py-2`}>No documents uploaded.</p>
              ) : (
                <>
                  {localDocs.length > 0 && (
                    <div className="space-y-2">
                      <h3 className={`text-[9px] font-bold ${textMuted} uppercase tracking-wider`}>From Local</h3>
                      {localDocs.map(doc => (
                        <div key={doc.id} className={`flex items-center gap-2 p-2 rounded-xl border transition-all duration-300 group ${activeQueryDocIds.has(doc.id) ? (isDarkMode ? 'bg-white/5 border-white/10 shadow-sm' : 'bg-white border-slate-200 shadow-sm') : 'bg-transparent border-transparent opacity-60 hover:opacity-100'}`}>
                          <input type="checkbox" checked={activeQueryDocIds.has(doc.id)} onChange={() => toggleQueryDoc(doc.id)} className="w-3.5 h-3.5 rounded border-slate-300 text-blue-500 focus:ring-blue-500 cursor-pointer" />
                          <div className="overflow-hidden pr-2 flex-1">
                            <p className={`text-[11px] font-semibold ${textStrong} truncate`} title={doc.document_name}>{doc.document_name}</p>
                            <p className={`text-[9px] ${textMuted}`}>{formatBytes(doc.file_size)}</p>
                          </div>
                          <button onClick={() => confirmDeleteDocument(doc.id, doc.document_name)} className="text-red-500/50 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all" title="Delete Document"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {driveDocs.length > 0 && (
                    <div className="space-y-2">
                      <h3 className={`text-[9px] font-bold ${textMuted} uppercase tracking-wider`}>From Drive</h3>
                      {driveDocs.map(doc => (
                        <div key={doc.id} className={`flex items-center gap-2 p-2 rounded-xl border transition-all duration-300 group ${activeQueryDocIds.has(doc.id) ? 'bg-blue-500/5 border-blue-500/20 shadow-sm' : 'bg-transparent border-transparent opacity-60 hover:opacity-100'}`}>
                          <input type="checkbox" checked={activeQueryDocIds.has(doc.id)} onChange={() => toggleQueryDoc(doc.id)} className="w-3.5 h-3.5 rounded border-blue-500/30 text-blue-500 focus:ring-blue-500 cursor-pointer" />
                          <div className="overflow-hidden pr-2 flex-1">
                            <p className={`text-[11px] font-semibold ${textStrong} truncate`} title={doc.document_name}>{doc.document_name}</p>
                            <p className="text-[9px] text-blue-500/70 font-medium">{formatBytes(doc.file_size)}</p>
                          </div>
                          <button onClick={() => confirmDeleteDocument(doc.id, doc.document_name)} className="text-red-500/50 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all" title="Delete Document"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className={`mt-auto p-6 border-t ${glassBorder} flex items-center gap-3 ${isDarkMode ? 'bg-black/20' : 'bg-slate-100/50'} flex-shrink-0 z-10 backdrop-blur-md`}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-400 to-indigo-500 border-2 border-white/20 overflow-hidden shadow-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">AH</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-bold ${textStrong} truncate`}>Avishka H.</h3>
            <p className={`text-[10px] font-bold ${textMuted} uppercase tracking-wider`}>Enterprise</p>
          </div>
          <button className={`${textMuted} hover:text-blue-500 transition-colors p-2 rounded-lg ${hoverBg}`}><Settings className="w-4 h-4" /></button>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <section className="flex-1 flex flex-col relative z-10 w-full md:w-auto h-full">

        {/* --- HEADER --- */}
        <header className={`h-16 border-b ${glassBorder} flex items-center justify-between px-4 md:px-8 ${glassPanelBg} backdrop-blur-xl z-20 transition-colors duration-500 shrink-0`}>
          <div className="flex items-center gap-3">
            <button className={`md:hidden p-2 ${textMuted} hover:text-blue-500`} onClick={() => setIsLeftSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <span className={`text-sm font-bold ${textStrong} max-w-[150px] md:max-w-[300px] truncate`}>{activeSessionTitle}</span>
            <span className="hidden md:inline-block bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest shadow-[0_0_10px_rgba(37,99,235,0.1)]">
              RAG Engine V3.0
            </span>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-full ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-yellow-400' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'} transition-all`}
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
              <span className={`text-[10px] font-bold ${textStrong} uppercase tracking-wider`}>Ready</span>
            </div>

            <button className={`md:hidden p-2 ${textMuted} hover:text-blue-500`} onClick={() => setIsRightSidebarOpen(true)}>
              <History className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* --- CHAT AREA --- */}
        <div className={`flex-1 overflow-y-auto px-4 md:px-10 py-8 custom-scrollbar ${isDarkMode ? 'dark-scroll' : 'light-scroll'} relative`}>
          {messages.length <= 1 && (
            <div className="flex flex-col items-center justify-center h-full max-h-[60vh] text-center animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center mb-8 shadow-[0_10px_40px_rgba(37,99,235,0.4)] border border-white/10">
                <Search className="w-10 h-10 text-white" />
              </div>
              <h2 className={`text-3xl md:text-4xl font-extrabold ${textStrong} mb-4 tracking-tight drop-shadow-sm`}>What's on your mind?</h2>
              <p className={`max-w-md ${textMuted} text-sm leading-relaxed font-medium px-4`}>
                Select your context from the sidebar, choose your model below, and ask anything about your local or cloud documents.
              </p>
            </div>
          )}

          <div className="max-w-4xl mx-auto space-y-8">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-4 md:gap-6 group ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in duration-500`}>

                <div className="flex-shrink-0 mt-1">
                  {msg.role === 'assistant' ? (
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-xl flex items-center justify-center shadow-[0_4px_15px_rgba(37,99,235,0.4)] border border-white/10">
                      <div className="w-3 h-3 md:w-4 md:h-4 bg-white rounded-sm flex items-center justify-center">
                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-blue-600 rounded-full"></div>
                      </div>
                    </div>
                  ) : (
                    <div className={`w-8 h-8 md:w-10 md:h-10 ${isDarkMode ? 'bg-slate-800 border-white/10' : 'bg-slate-200 border-slate-300'} rounded-xl flex items-center justify-center border shadow-inner`}>
                      <Circle className={`w-4 h-4 md:w-5 md:h-5 ${isDarkMode ? 'fill-slate-600' : 'fill-slate-400'} stroke-none`} />
                    </div>
                  )}
                </div>

                <div className={`flex-1 space-y-4 ${msg.role === 'user' ? 'text-right' : ''} max-w-[90%] md:max-w-[85%]`}>
                  <div className={`inline-block p-4 md:p-6 rounded-3xl text-sm leading-relaxed font-medium shadow-sm transition-all duration-300 ${msg.role === 'assistant'
                      ? `${glassCardBg} backdrop-blur-xl border ${glassBorder} ${textStrong}`
                      : 'bg-gradient-to-br from-blue-600 to-indigo-600 border border-blue-400/30 text-white shadow-[0_4px_20px_rgba(37,99,235,0.3)]'
                    }`}>
                    <p className="whitespace-pre-wrap text-left">{msg.content}</p>
                  </div>

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-col gap-3 mt-4 animate-in fade-in slide-in-from-top-2 duration-500 text-left">
                      <div className={`flex items-center gap-2 text-[10px] font-bold ${textMuted} uppercase tracking-widest`}>
                        <Search className="w-3 h-3 text-blue-500" />
                        Retrieved Context ({msg.sources.length})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {msg.sources.map((source, i) => (
                          <div key={i} className={`flex items-start gap-3 p-4 rounded-2xl ${isDarkMode ? 'bg-blue-500/5 border-blue-500/10 hover:bg-blue-500/10' : 'bg-blue-50 border-blue-100 hover:bg-blue-100'} border transition-colors cursor-pointer group`}>
                            <div className="w-8 h-8 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                              <Paperclip className="w-4 h-4 text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] ${isDarkMode ? 'text-slate-300' : 'text-slate-700'} font-medium line-clamp-3 leading-relaxed`}>
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
              <div className="flex gap-4 md:gap-6 animate-in fade-in duration-500">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-xl flex items-center justify-center shadow-[0_4px_15px_rgba(37,99,235,0.4)] border border-white/10">
                    <div className="w-3 h-3 md:w-4 md:h-4 bg-white rounded-sm flex items-center justify-center animate-pulse">
                      <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-blue-600 rounded-full"></div>
                    </div>
                  </div>
                </div>
                <div className={`max-w-[100px] ${glassCardBg} backdrop-blur-xl border ${glassBorder} p-4 md:p-5 rounded-3xl flex items-center justify-center gap-2 shadow-sm`}>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-150"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-300"></div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="h-32 md:h-40 shrink-0" />
          </div>
        </div>

        {/* --- INPUT BAR AREA --- */}
        <div className="absolute bottom-0 left-0 w-full p-4 md:p-6 z-20 pointer-events-none">
          <div className="max-w-4xl mx-auto relative group pointer-events-auto">
            <div className={`absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[2.5rem] blur-lg ${isDarkMode ? 'opacity-20' : 'opacity-10'} group-focus-within:opacity-40 transition duration-500`}></div>

            <form onSubmit={handleSend} className={`relative ${inputBg} backdrop-blur-2xl rounded-[2.5rem] p-1.5 md:p-2 flex items-center gap-1 md:gap-2 border ${isDarkMode ? 'border-white/10 group-focus-within:border-blue-500/50' : 'border-slate-300 group-focus-within:border-blue-500'} shadow-2xl transition-all duration-300`}>

              <div className="p-2 md:p-3 text-slate-500 flex items-center gap-2 group/tooltip relative cursor-help ml-1 md:ml-2" title={`${activeQueryDocIds.size} of ${managedDocs.length} documents selected`}>
                <Filter className={`w-4 h-4 md:w-5 md:h-5 transition-colors ${activeQueryDocIds.size > 0 ? 'text-blue-500' : textMuted}`} />
                {activeQueryDocIds.size > 0 && (
                  <span className="absolute top-0 right-0 md:top-1 md:right-1 bg-blue-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-md">
                    {activeQueryDocIds.size}
                  </span>
                )}
              </div>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={activeQueryDocIds.size === 0 ? "Ask anything..." : "Ask about your documents..."}
                className={`flex-1 bg-transparent border-none focus:ring-0 ${textStrong} placeholder:text-slate-400 text-xs md:text-sm py-3 md:py-4 outline-none font-medium`}
              />

              <div className="flex items-center gap-1 md:gap-2 pr-1 md:pr-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                    className={`flex items-center gap-2 bg-transparent ${hoverBg} ${textMuted} hover:text-blue-500 text-[9px] md:text-[10px] font-bold px-3 py-2.5 md:px-4 md:py-3 rounded-xl uppercase tracking-wider transition-colors`}
                    title="Select AI Model"
                  >
                    <span className="truncate max-w-[80px] md:max-w-[120px]">
                      {MODEL_OPTIONS.find(m => m.id === selectedModel)?.name}
                    </span>
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {isModelDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsModelDropdownOpen(false)} />
                      <div className={`absolute bottom-full right-0 mb-4 w-60 md:w-64 ${glassCardBg} backdrop-blur-3xl border ${glassBorder} rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.3)] overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200`}>
                        <div className="p-2 space-y-1">
                          {MODEL_OPTIONS.map(model => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setSelectedModel(model.id);
                                setIsModelDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-3 text-[10px] md:text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all ${selectedModel === model.id ? 'text-blue-500 bg-blue-500/10 shadow-sm' : `${textMuted} ${hoverBg}`}`}
                            >
                              {model.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!input.trim() || isLoading || !activeSessionId}
                  className="w-10 h-10 md:w-14 md:h-14 bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-[0_4px_20px_rgba(37,99,235,0.4)] transition-all disabled:opacity-50 disabled:shadow-none disabled:scale-100 active:scale-95 shrink-0"
                >
                  <Send className="w-4 h-4 md:w-5 md:h-5 ml-1" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* --- MOBILE OVERLAY (Right) --- */}
      {isRightSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsRightSidebarOpen(false)} />
      )}

      {/* --- RIGHT SIDEBAR (Chat History) --- */}
      <aside className={`${isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'} md:translate-x-0 fixed md:relative top-0 right-0 h-full w-72 ${glassPanelBg} backdrop-blur-2xl border-l ${glassBorder} flex flex-col z-50 shrink-0 transition-transform duration-300 shadow-2xl md:shadow-[-4px_0_24px_rgba(0,0,0,0.02)]`}>
        <div className="p-6 pb-4 flex gap-3 items-center">
          <button className="md:hidden p-2 text-slate-400 hover:text-blue-500" onClick={() => setIsRightSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={createNewSession}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_15px_rgba(37,99,235,0.3)]"
          >
            <PlusCircle className="w-5 h-5" />
            New Chat
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto px-4 pb-6 custom-scrollbar ${isDarkMode ? 'dark-scroll' : 'light-scroll'}`}>
          <h3 className={`text-[10px] font-bold ${textMuted} uppercase tracking-widest mb-4 px-2`}>History</h3>

          {isSessionsLoading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className={`text-[11px] ${textMuted} italic text-center py-4`}>No history yet.</p>
          ) : (
            <div className="space-y-1">
              {sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => loadSession(session.id)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-300 group ${activeSessionId === session.id
                      ? (isDarkMode ? 'bg-blue-500/10 border border-blue-500/30 shadow-sm' : 'bg-white border border-blue-300 shadow-sm')
                      : `hover:bg-blue-500/5 border border-transparent`
                    }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1 pr-2">
                    <MessageSquare className={`w-4 h-4 shrink-0 ${activeSessionId === session.id ? 'text-blue-500' : textMuted}`} />
                    <div className="flex flex-col overflow-hidden">
                      <span className={`text-xs font-bold truncate ${activeSessionId === session.id ? textStrong : textMuted}`}>
                        {session.title}
                      </span>
                      <span className={`text-[9px] ${textMuted} font-medium mt-0.5`}>
                        {new Date(session.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => confirmDeleteSession(session.id, session.title, e)}
                    className="text-red-500/50 hover:text-red-500 hover:bg-red-500/10 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Delete Chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* --- CUSTOM CONFIRMATION MODAL --- */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className={`${isDarkMode ? 'bg-[#0b0f1a] border-white/10' : 'bg-white border-slate-200'} border p-8 rounded-3xl shadow-2xl max-w-sm w-full mx-4 animate-in zoom-in-95 duration-200`}>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className={`text-xl font-bold ${textStrong}`}>Confirm Deletion</h3>
            </div>
            <p className={`text-sm ${textMuted} mb-8 leading-relaxed`}>
              Are you sure you want to delete <span className={`font-bold ${textStrong}`}>"{deleteTarget.name}"</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold ${textMuted} ${hoverBg} transition-colors`}
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-red-500 hover:bg-red-600 text-white transition-all shadow-[0_4px_14px_rgba(239,68,68,0.4)] hover:shadow-none"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        
        .dark-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        .dark-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
        
        .light-scroll::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.15); border-radius: 10px; }
        .light-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.25); }
      `}</style>
    </main>
  );
}