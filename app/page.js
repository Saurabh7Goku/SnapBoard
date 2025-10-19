"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Wand2, Trash2, LogOut, Users, Share2, Copy, Menu, Upload, Settings, Type, Table, FolderOpen, X, Lock, MessageSquare } from 'lucide-react';
import katex from 'katex';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getDatabase, ref, push, set, update, remove, onValue, serverTimestamp, get } from 'firebase/database';
import { BoardCanvas } from './dashboard/BoardCanvas';

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_API_KEY,
  databaseURL: process.env.NEXT_PUBLIC_DATABASE_URL,
  authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_APP_ID,
});

export const auth = getAuth(app);
export const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

const CARD_COLORS = ['#FEF3C7', '#DBEAFE', '#eec1f0ff', '#D1FAE5', '#eebebeff', '#d6d1f0ff', '#FEF9C3', '#cbf8f6ff'];

const FormulaWhiteboard = () => {
  const [user, setUser] = useState(null);
  const [boards, setBoards] = useState([]);
  const [sharedBoards, setSharedBoards] = useState([]);
  const [currentBoard, setCurrentBoard] = useState(null);
  const [elements, setElements] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('myBoards');
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [showQABoard, setShowQABoard] = useState(false);
  const [showQAModal, setShowQAModal] = useState(false);
  const [qaQuery, setQaQuery] = useState('');
  const [qaResponse, setQaResponse] = useState('');
  const [qaLoading, setQaLoading] = useState(false);
  const [qaHistory, setQaHistory] = useState([]);
  const fileInputRef = useRef(null);
  const responseRef = useRef(null);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('qaHistory') || '[]');
    const filtered = stored.filter(item => Date.now() - item.timestamp < 2 * 24 * 60 * 60 * 1000);
    setQaHistory(filtered);
    localStorage.setItem('qaHistory', JSON.stringify(filtered));
  }, []);

  const saveQaHistory = (newItem) => {
    const updated = [...qaHistory, newItem];
    setQaHistory(updated);
    localStorage.setItem('qaHistory', JSON.stringify(updated));
  };

  const deleteQaItem = (index) => {
    const updated = qaHistory.filter((_, i) => i !== index);
    setQaHistory(updated);
    localStorage.setItem('qaHistory', JSON.stringify(updated));
  };

  const clearQaHistory = () => {
    setQaHistory([]);
    localStorage.removeItem('qaHistory');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const savedKey = await get(ref(db, `users/${user.uid}/apiKey`));
        if (savedKey.exists()) setApiKey(savedKey.val());
        else setShowFirstTimeSetup(true);
        loadUserBoards(user.uid);
        loadSharedBoards(user.email);
        setShowDashboard(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentBoard || !user) return;
    const elementsRef = ref(db, `boards/${currentBoard.id}/elements`);
    const elementsUnsub = onValue(elementsRef, (snap) => {
      const data = snap.val();
      setElements(data ? Object.entries(data).map(([id, el]) => ({ id, ...el })) : []);
    });
    const collabRef = ref(db, `boards/${currentBoard.id}/collaborators`);
    const collabUnsub = onValue(collabRef, (snap) => {
      const data = snap.val();
      setCollaborators(data ? Object.values(data) : []);
    });
    return () => { elementsUnsub(); collabUnsub(); };
  }, [currentBoard, user]);

  const signIn = () => signInWithPopup(auth, googleProvider).catch(console.error);
  const signOutUser = async () => {
    await signOut(auth);
    setCurrentBoard(null);
    setShowDashboard(true);
  };

  const saveApiKey = async () => {
    if (apiKey.trim() && user) {
      await set(ref(db, `users/${user.uid}/apiKey`), apiKey.trim());
      setShowKeyModal(false);
      setShowFirstTimeSetup(false);
    }
  };

  const loadUserBoards = (uid) => {
    onValue(ref(db, `users/${uid}/boards`), async (snap) => {
      const data = snap.val();
      if (data) {
        const boardPromises = Object.keys(data).map(async (boardId) => {
          const boardSnap = await get(ref(db, `boards/${boardId}/meta`));
          return { id: boardId, ...boardSnap.val() };
        });
        const boards = await Promise.all(boardPromises);
        setBoards(boards.filter(b => b.name));
      } else setBoards([]);
    });
  };

  const loadSharedBoards = (email) => {
    onValue(ref(db, 'shared'), async (snap) => {
      const data = snap.val();
      const shared = [];
      if (data) {
        for (const [boardId, collabs] of Object.entries(data)) {
          if (collabs[email?.replace(/\./g, ',')]) {
            const boardSnap = await get(ref(db, `boards/${boardId}/meta`));
            if (boardSnap.exists()) shared.push({ id: boardId, ...boardSnap.val(), isShared: true });
          }
        }
      }
      setSharedBoards(shared);
    });
  };

  const handleCreateBoard = async () => {
    if (!user || !newBoardName.trim()) return;
    const boardRef = push(ref(db, 'boards'));
    const boardId = boardRef.key;
    await set(ref(db, `boards/${boardId}/meta`), {
      name: newBoardName.trim(),
      owner: user.uid,
      ownerEmail: user.email,
      ownerName: user.displayName || user.email,
      createdAt: serverTimestamp()
    });
    await set(ref(db, `users/${user.uid}/boards/${boardId}`), true);
    setCurrentBoard({ id: boardId, name: newBoardName.trim(), owner: user.uid });
    setShowDashboard(false);
    setShowCreateModal(false);
    setNewBoardName('');
  };

  const openBoard = (board) => {
    setCurrentBoard(board);
    setShowDashboard(false);
  };

  const deleteBoard = async (boardId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this board?')) return;
    await remove(ref(db, `boards/${boardId}`));
    await remove(ref(db, `users/${user.uid}/boards/${boardId}`));
    if (currentBoard?.id === boardId) { setCurrentBoard(null); setShowDashboard(true); }
  };

  const shareBoard = async () => {
    if (!shareEmail.trim() || !currentBoard) return;
    const sanitizedEmail = shareEmail.replace(/\./g, ',');
    await set(ref(db, `shared/${currentBoard.id}/${sanitizedEmail}`), true);
    await set(ref(db, `boards/${currentBoard.id}/collaborators/${sanitizedEmail}`), { email: shareEmail, addedAt: serverTimestamp() });
    setShareEmail('');
    setShowShareModal(false);
    alert('Board shared!');
  };

  const addElement = async (type) => {
    if (!currentBoard) return;
    const newRef = push(ref(db, `boards/${currentBoard.id}/elements`));
    const baseProps = {
      x: Math.random() * 400 + 100,
      y: Math.random() * 300 + 100,
      color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)],
      width: type === 'table' ? 300 : 224,
      height: 200,
      type,
      createdAt: serverTimestamp()
    };

    const typeProps = {
      formula: { title: 'New Formula', latex: 'E = mc^2', subject: 'Physics', topic: 'Relativity', notes: '' },
      note: { title: 'Note', content: 'Your note here...' },
      table: { title: 'Table', columns: ['Col 1', 'Col 2'], rows: [{ id: 'row1', cells: ['Cell 1', 'Cell 2'] }] }
    };

    await set(newRef, { ...baseProps, ...typeProps[type] });
  };

  const addImage = async (url) => {
    if (!url || !currentBoard) return;
    await set(push(ref(db, `boards/${currentBoard.id}/elements`)), {
      title: 'Image', url, notes: '', x: Math.random() * 400 + 100,
      y: Math.random() * 300 + 100, color: '#ffffff',
      width: 200, height: 150, type: 'image', createdAt: serverTimestamp()
    });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => addImage(event.target?.result);
      reader.readAsDataURL(file);
    }
  };

  const handleAI = async () => {
    if (!aiPrompt.trim() || isProcessing || !apiKey || !currentBoard) {
      if (!apiKey) alert('Set API key first!');
      return;
    }
    setIsProcessing(true);
    try {
      const current = elements.filter(e => e.type === 'formula').map(f => ({ id: f.id, title: f.title, latex: f.latex, subject: f.subject, topic: f.topic }));
      const prompt = `You are helping organize a formula whiteboard. Current formulas: ${JSON.stringify(current)}\nUser request: "${aiPrompt}"\nRespond ONLY with valid JSON. Actions: "add", "organize", or "filter".\nFor add: {"action":"add","title":"...","latex":"...","subject":"...","topic":"..."}\nFor organize: {"action":"organize","layout":[{"id":"...","x":100,"y":100},...]}`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 2000 } })
      });
      if (!res.ok) throw new Error(`API: ${res.status}`);
      const data = await res.json();
      let text = data.candidates[0].content.parts[0].text.trim().replace(/```(?:json)?/g, '').trim();
      const parsed = JSON.parse(text);
      if (parsed.action === 'add') {
        await set(push(ref(db, `boards/${currentBoard.id}/elements`)), {
          title: parsed.title, latex: parsed.latex, subject: parsed.subject, topic: parsed.topic, notes: '',
          x: Math.random() * 300 + 100, y: Math.random() * 200 + 100,
          color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)],
          width: 224, height: 200, type: 'formula', createdAt: serverTimestamp()
        });
      }
      setAiPrompt('');
    } catch (err) {
      alert(`AI error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGateDA = async () => {
    if (!qaQuery.trim() || qaLoading || !apiKey) {
      if (!apiKey) alert('Set API key first!');
      return;
    }
    setQaLoading(true);
    setQaResponse('');

    const systemPrompt = `You are an expert GATE Data Science and AI (DA) instructor.

IMPORTANT: Format your response EXACTLY as follows with clear sections. Do not use any markdown styling, bullet points, or asterisks. Use plain text only.

---
SECTION 1: CONCEPT EXPLANATION
[Provide a clear, structured explanation of the topic in 3-4 paragraphs. Number key points if needed.]

---
SECTION 2: KEY FORMULAS AND DEFINITIONS
[List formulas in the format: Name: formula using text notation. For example, Linear Regression Slope: m = sum((xi - mean_x)(yi - mean_y)) / sum((xi - mean_x)^2)]

---
SECTION 3: SOLVED GATE DA LEVEL PROBLEMS

Problem 1: [Problem statement]
Solution:
[Step-by-step solution with clear numbered steps]
Answer: [Final answer]

Problem 2: [Problem statement]
Solution:
[Step-by-step solution with clear numbered steps]
Answer: [Final answer]

Problem 3: [Problem statement]
Solution:
[Step-by-step solution with clear numbered steps]
Answer: [Final answer]

---
SECTION 4: COMMON MISTAKES AND TIPS
[List 4-5 common mistakes students make with explanations. Number them.]

---`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${systemPrompt}\n\nUser Topic: "${qaQuery}"\n\nProvide detailed, exam-focused content on this topic.`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 5000,
            },
          }),
        }
      );

      if (!res.ok) throw new Error(`API Error: ${res.status}`);

      const data = await res.json();
      const fullResponse = data.candidates[0].content.parts[0].text;

      // Streaming effect
      let currentIndex = 0;
      const streamInterval = setInterval(() => {
        if (currentIndex < fullResponse.length) {
          setQaResponse(fullResponse.slice(0, currentIndex + 1));
          currentIndex++;

          if (responseRef.current) {
            responseRef.current.scrollTop = responseRef.current.scrollHeight;
          }
        } else {
          clearInterval(streamInterval);
          setQaLoading(false);
        }
      }, 2);

      saveQaHistory({ query: qaQuery, response: fullResponse, timestamp: Date.now() });
      setQaQuery('');
    } catch (err) {
      setQaResponse(`Error: ${err.message}`);
      setQaLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-4 text-center">
        <div className="mb-8">
          <h1 className="text-5xl md:text-6xl font-extrabold text-white tracking-tight drop-shadow-lg">SnapBoard ✨</h1>
          <p className="text-lg md:text-xl text-white/80 mt-3">Your AI-powered Formula & Notes Whiteboard</p>
          <p className="text-sm md:text-base text-white/60 mt-2">Generate formulas, notes, and GATE DA problems instantly with AI.</p>
        </div>
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 md:p-12 max-w-md w-full shadow-2xl border border-white/20">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">Welcome to SnapBoard</h2>
          <p className="text-white/70 mb-8">Collaborate and create smarter with AI assistance.</p>
          <button onClick={signIn} className="w-full bg-white text-gray-900 px-6 py-3 rounded-xl font-semibold hover:bg-gray-100 transition transform hover:scale-105 flex items-center justify-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // Replace the entire "if (showQABoard)" section with this code:

  if (showQABoard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        {/* Header */}
        <div className="border-b border-blue-200 sticky top-0 z-40 bg-white/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                  <MessageSquare size={20} className="text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">GATE DA Helper</h1>
                  <p className="text-xs text-indigo-600">Exam preparation</p>
                </div>
              </div>
              <button
                onClick={() => { setShowQABoard(false); setQaResponse(''); }}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={qaQuery}
                  onChange={e => setQaQuery(e.target.value)}
                  placeholder="Search GATE DA topics..."
                  className="w-full px-4 py-2.5 text-sm bg-white border border-blue-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-gray-900 placeholder-gray-400 transition-all"
                  onKeyPress={e => e.key === 'Enter' && handleGateDA()}
                  disabled={qaLoading}
                />
              </div>
              <button
                onClick={handleGateDA}
                disabled={qaLoading || !qaQuery.trim()}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-blue-500/30 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all"
              >
                {qaLoading ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Response Section - Full Width */}
            <div className="lg:col-span-3">
              {qaResponse ? (
                <div className="animate-fadeIn">
                  <div className="flex items-center gap-2 mb-4 pb-4 border-b border-indigo-200">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                    <h2 className="text-sm font-semibold text-gray-900">Response</h2>
                  </div>
                  <div
                    ref={responseRef}
                    className="text-sm text-gray-800 leading-relaxed font-mono whitespace-pre-wrap break-words"
                  >
                    {qaResponse}
                    {qaLoading && <span className="animate-pulse text-indigo-600">▊</span>}
                  </div>
                </div>
              ) : qaLoading ? (
                <div className="flex items-center justify-center h-80">
                  <div className="text-center">
                    <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-sm text-gray-600">Generating comprehensive response...</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageSquare size={32} className="text-indigo-600" />
                  </div>
                  <p className="text-sm text-gray-700">Enter a topic to begin</p>
                  <p className="text-xs text-gray-500 mt-2">Get detailed explanations with formulas and practice problems</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-5">
              {/* Quick Topics */}
              <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-sm">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Quick Topics</h3>
                <div className="space-y-2">
                  {['Probability', 'Regression', 'Hypothesis Testing', 'Bayes Theorem'].map((topic) => (
                    <button
                      key={topic}
                      onClick={() => {
                        setQaQuery(topic);
                        setTimeout(handleGateDA, 0);
                      }}
                      className="w-full text-left px-3 py-2 text-xs bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 text-gray-900 rounded-lg border border-blue-200 hover:border-indigo-400 transition-all font-medium"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>

              {/* History */}
              <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Recent</h3>
                  {qaHistory.length > 0 && (
                    <button
                      onClick={() => { if (confirm('Clear all history?')) clearQaHistory(); }}
                      className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 size={12} />
                      Clear
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                  {qaHistory.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-3">No history</p>
                  ) : (
                    qaHistory
                      .slice()
                      .reverse()
                      .map((item, i) => {
                        const actualIndex = qaHistory.length - 1 - i;
                        return (
                          <div
                            key={actualIndex}
                            className="p-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg hover:border-indigo-400 hover:bg-gradient-to-r hover:from-indigo-100 hover:to-purple-100 cursor-pointer group transition-all"
                            onClick={() => setQaResponse(item.response)}
                          >
                            <p className="text-xs font-medium text-gray-900 line-clamp-2 group-hover:text-indigo-700 transition-colors">{item.query}</p>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-xs text-gray-600">
                                {new Date(item.timestamp).toLocaleDateString()}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteQaItem(actualIndex);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showDashboard && !currentBoard) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b sticky top-0 z-[100]">
          <div className="max-w-7xl mx-auto px-6 lg:px-8 flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <FolderOpen size={18} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Formula Boards</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowQABoard(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg transition-all">
                <MessageSquare size={18} />
                <span className="text-sm font-medium hidden sm:inline">GATE DA Helper</span>
              </button>
              <button onClick={signOutUser} className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <LogOut size={18} />
                <span className="text-sm font-medium hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
          <div className="flex gap-1 mb-8 bg-white p-1 rounded-lg shadow-sm border w-fit">
            <button onClick={() => setActiveTab('myBoards')} className={`px-6 py-2.5 font-medium rounded-md transition-all ${activeTab === 'myBoards' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              My Boards <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'myBoards' ? 'bg-blue-500' : 'bg-gray-200 text-gray-600'}`}>{boards.length}</span>
            </button>
            <button onClick={() => setActiveTab('shared')} className={`px-6 py-2.5 font-medium rounded-md transition-all ${activeTab === 'shared' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              Shared <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activeTab === 'shared' ? 'bg-purple-500' : 'bg-gray-200 text-gray-600'}`}>{sharedBoards.length}</span>
            </button>
          </div>

          {activeTab === 'myBoards' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              <button onClick={() => setShowCreateModal(true)} className="h-52 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all flex flex-col items-center justify-center group">
                <div className="w-14 h-14 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                  <Plus size={24} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
                </div>
                <span className="text-gray-600 group-hover:text-blue-600 font-semibold transition-colors">Create New Board</span>
              </button>
              {boards.map(board => (
                <div key={board.id} onClick={() => openBoard(board)} className="h-52 bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer p-5 relative group border border-gray-200 hover:border-blue-400">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <FolderOpen size={20} className="text-blue-600" />
                    </div>
                    <button onClick={(e) => deleteBoard(board.id, e)} className="p-2 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2 line-clamp-2">{board.name}</h3>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'shared' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {sharedBoards.length === 0 ? (
                <div className="col-span-full">
                  <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                      <Users size={28} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No shared boards yet</h3>
                    <p className="text-gray-500 text-sm">Boards shared with you will appear here</p>
                  </div>
                </div>
              ) : (
                sharedBoards.map(board => (
                  <div key={board.id} onClick={() => openBoard(board)} className="h-52 bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer p-5 border border-purple-200 hover:border-purple-400 relative group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <Users size={20} className="text-purple-600" />
                      </div>
                      <div className="px-2.5 py-1 bg-purple-100 rounded-full">
                        <Lock size={12} className="text-purple-600" />
                      </div>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 mb-2 line-clamp-2">{board.name}</h3>
                    <div className="absolute bottom-5 left-5 right-5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center">
                          <span className="text-xs font-medium text-purple-700">{board.ownerName.charAt(0)}</span>
                        </div>
                        <span className="text-sm text-gray-600 font-medium">{board.ownerName}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-4">Create New Board</h2>
              <input type="text" value={newBoardName} onChange={e => setNewBoardName(e.target.value)} placeholder="Board name" className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 mb-4" onKeyPress={e => e.key === 'Enter' && handleCreateBoard()} autoFocus />
              <div className="flex gap-2">
                <button onClick={handleCreateBoard} disabled={!newBoardName.trim()} className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300">Create</button>
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-3 border rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {showFirstTimeSetup && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-4">Set Up Gemini API Key</h2>
              <p className="text-sm text-gray-600 mb-4">Get your API key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener" className="text-blue-500 underline">Google AI Studio</a></p>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 mb-4" onKeyPress={e => e.key === 'Enter' && saveApiKey()} />
              <div className="flex gap-2">
                <button onClick={saveApiKey} className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
                <button onClick={() => setShowFirstTimeSetup(false)} className="px-4 py-3 border rounded-lg hover:bg-gray-50">Skip</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!currentBoard) return null;

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden relative">
      <div className="fixed top-3 left-1/2 transform -translate-x-1/2 z-50 bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg px-4 py-2 border border-gray-200/50 flex items-center gap-2">
        <button onClick={() => { setShowDashboard(true); setCurrentBoard(null); }} className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Dashboard</button>
        <div className="w-px h-6 bg-gray-200"></div>

        <div className="flex items-center gap-1">
          <button onClick={() => addElement('formula')} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600" title="Add Formula">
            <Plus size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">Formula</span>
          </button>
          <button onClick={() => addElement('note')} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600" title="Add Note">
            <Type size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">Note</span>
          </button>
          <button onClick={() => addElement('table')} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600" title="Add Table">
            <Table size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">Table</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white text-sm font-medium rounded-lg hover:bg-indigo-600" title="Add Image">
            <Upload size={16} strokeWidth={2.5} />
            <span className="hidden sm:inline">Image</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          {currentBoard.owner === user.uid && (
            <button onClick={() => setShowShareModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600" title="Share Board">
              <Share2 size={16} strokeWidth={2.5} />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}
        </div>

        <div className="w-px h-6 bg-gray-200"></div>

        <div className="flex items-center gap-1.5 bg-gradient-to-r from-purple-50 to-pink-50 px-3 py-1.5 rounded-lg border border-purple-200/50">
          <Wand2 size={16} className="text-purple-600" strokeWidth={2.5} />
          <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAI()} placeholder="Ask AI..." className="bg-transparent text-sm text-gray-700 placeholder:text-purple-400/60 focus:outline-none w-32 lg:w-40" />
          <button onClick={handleAI} disabled={isProcessing} className="p-1 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50" title="Generate with AI">
            <Wand2 size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="w-px h-6 bg-gray-200"></div>

        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 hover:bg-gray-100 rounded-lg" title="More Options">
            <Menu size={18} strokeWidth={2.5} className="text-gray-600" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
              <button onClick={() => { setShowKeyModal(true); setMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 border-b">
                <Settings size={16} />
                <span>{apiKey ? 'Change' : 'Set'} API Key</span>
              </button>
              {collaborators.length > 0 && (
                <div className="px-4 py-2.5 text-xs text-gray-500 bg-gray-50 border-b">
                  <div className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
                    <Users size={14} />
                    Collaborators
                  </div>
                  <div className="space-y-1">
                    {collaborators.map((c, i) => <div key={i} className="text-gray-600">{c.email}</div>)}
                  </div>
                </div>
              )}
              <button onClick={() => { if (confirm('Clear all?')) { remove(ref(db, `boards/${currentBoard.id}/elements`)); setElements([]); } setMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 border-b">
                <Trash2 size={16} />
                <span>Clear Board</span>
              </button>
              <button onClick={signOutUser} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3">
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <BoardCanvas elements={elements} currentBoard={currentBoard} user={user} />

      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Share Board</h2>
            <input type="email" value={shareEmail} onChange={e => setShareEmail(e.target.value)} placeholder="colleague@example.com" className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 mb-4" onKeyPress={e => e.key === 'Enter' && shareBoard()} />
            <div className="flex gap-2 mb-4">
              <button onClick={shareBoard} className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600">Send Invite</button>
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}?board=${currentBoard.id}`); alert('Link copied!'); }} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 flex items-center gap-2"><Copy size={16} /> Link</button>
            </div>
            <button onClick={() => setShowShareModal(false)} className="w-full px-4 py-2 border rounded-lg hover:bg-gray-50">Close</button>
          </div>
        </div>
      )}

      {showKeyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h2 className="text-xl font-bold mb-3">Gemini API Key</h2>
            <p className="text-xs text-gray-600 mb-4">Get your key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener" className="text-blue-500 underline">Google AI Studio</a></p>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 mb-4" onKeyPress={e => e.key === 'Enter' && saveApiKey()} />
            <div className="flex gap-2">
              <button onClick={saveApiKey} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Save</button>
              <button onClick={() => setShowKeyModal(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
        .math-display {
          overflow-x: auto;
          padding: 1rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          color: white;
        }
        .math-display .katex {
          color: white;
        }
      `}</style>
    </div>
  );
};

export default FormulaWhiteboard;