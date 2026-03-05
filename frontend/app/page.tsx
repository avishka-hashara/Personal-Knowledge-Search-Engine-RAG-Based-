'use client';

import { useState } from 'react';

export default function Home() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');

  // Handle asking the AI a question
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setAnswer('');
    setSources([]);

    try {
      // UPDATED to localhost
      const res = await fetch('http://localhost:8000/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setAnswer(data.answer);
      setSources(data.sources || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      setAnswer("Failed to connect to the knowledge engine. Make sure your FastAPI backend is running!");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle uploading and processing a new document
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploadStatus('Uploading...');
    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Upload to backend (UPDATED to localhost)
      const uploadRes = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Upload failed');

      setUploadStatus('Processing into vector database...');

      // 2. Trigger the embedding process (UPDATED to localhost)
      const processRes = await fetch('http://localhost:8000/process', {
        method: 'POST',
      });
      if (!processRes.ok) throw new Error('Processing failed');

      setUploadStatus('Success! File is now searchable.');
      setFile(null); // Clear the file input
    } catch (error) {
      console.error(error);
      setUploadStatus('Error connecting to backend. Is your FastAPI server running?');
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <header className="text-center">
          <h1 className="text-4xl font-bold text-blue-600">Personal Knowledge Engine</h1>
          <p className="text-gray-500 mt-2">Upload your notes and ask anything.</p>
        </header>

        {/* Upload Section */}
        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">1. Add Knowledge</h2>
          <form onSubmit={handleFileUpload} className="flex items-center gap-4">
            <input
              type="file"
              accept=".txt,.md,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <button
              type="submit"
              disabled={!file}
              className="bg-green-600 text-white px-6 py-2 rounded-full font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Upload & Process
            </button>
          </form>
          {uploadStatus && <p className="mt-3 text-sm font-medium text-gray-600">{uploadStatus}</p>}
        </section>

        {/* Search Section */}
        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">2. Search Knowledge</h2>
          <form onSubmit={handleSearch} className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., What is the fake project about?"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading || !query}
              className="bg-blue-600 text-white px-8 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Searching...' : 'Ask AI'}
            </button>
          </form>
        </section>

        {/* Results Section */}
        {answer && (
          <section className="bg-white p-6 rounded-lg shadow-sm border border-blue-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Answer</h2>
            <div className="prose text-gray-700 mb-6 whitespace-pre-wrap">
              {answer}
            </div>

            {sources.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Sources Used</h3>
                <div className="space-y-3">
                  {sources.map((source, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded text-sm text-gray-600 italic border-l-4 border-blue-300">
                      "{source}"
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

      </div>
    </main>
  );
}