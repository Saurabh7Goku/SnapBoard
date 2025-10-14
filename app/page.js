"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Wand2, Trash2, LogOut, Users, Share2, Copy, Menu, Upload, Settings, Type, Table, SquarePlus } from 'lucide-react';
import katex from 'katex';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getDatabase, ref, push, set, update, remove, onValue, serverTimestamp, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_API_KEY,
  databaseURL: process.env.NEXT_PUBLIC_DATABASE_URL,
  authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

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
  const [draggedId, setDraggedId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingId, setResizingId] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [apiKey, setApiKey] = useState('');
  const [hoveredFormula, setHoveredFormula] = useState(null);
  const [zIndexMap, setZIndexMap] = useState({});
  const [maxZIndex, setMaxZIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('myBoards');
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);
  const fileInputRef = useRef(null);

  const CARD_COLORS = [
    '#FEF3C7', '#DBEAFE', '#FCE7F3', '#D1FAE5',
    '#FED7D7', '#E2E8F0', '#FEF9C3', '#DCFCE7'
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const savedKey = await get(ref(db, `users/${user.uid}/apiKey`));
        if (savedKey.exists()) {
          setApiKey(savedKey.val());
        } else {
          setShowFirstTimeSetup(true);
        }
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

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Auth error:', error);
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
      setCurrentBoard(null);
      setShowDashboard(true);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const saveApiKey = async () => {
    if (apiKey.trim() && user) {
      await set(ref(db, `users/${user.uid}/apiKey`), apiKey.trim());
      setShowKeyModal(false);
      setShowFirstTimeSetup(false);
    }
  };

  const loadUserBoards = (uid) => {
    const boardsRef = ref(db, `users/${uid}/boards`);
    onValue(boardsRef, async (snap) => {
      const data = snap.val();
      if (data) {
        const boardPromises = Object.keys(data).map(async (boardId) => {
          const boardSnap = await get(ref(db, `boards/${boardId}/meta`));
          return { id: boardId, ...boardSnap.val() };
        });
        const boards = await Promise.all(boardPromises);
        setBoards(boards.filter(b => b.name));
      } else {
        setBoards([]);
      }
    });
  };

  const loadSharedBoards = (email) => {
    const sharedRef = ref(db, 'shared');
    onValue(sharedRef, async (snap) => {
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

  const createBoard = async () => {
    if (!user) return;
    const name = prompt('Board name:');
    if (!name) return;
    const boardRef = push(ref(db, 'boards'));
    const boardId = boardRef.key;
    await set(ref(db, `boards/${boardId}/meta`), { name, owner: user.uid, ownerEmail: user.email, ownerName: user.displayName || user.email, createdAt: serverTimestamp() });
    await set(ref(db, `users/${user.uid}/boards/${boardId}`), true);
    setCurrentBoard({ id: boardId, name, owner: user.uid });
    setShowDashboard(false);
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

  const copyShareLink = () => {
    const link = `${window.location.origin}?board=${currentBoard.id}`;
    navigator.clipboard.writeText(link);
    alert('Link copied!');
  };

  const addFormula = async () => {
    if (!currentBoard) return;
    const newRef = push(ref(db, `boards/${currentBoard.id}/elements`));
    await set(newRef, {
      title: 'New Formula', latex: 'E = mc^2', subject: 'Physics', topic: 'Relativity', notes: '',
      x: Math.random() * (window.innerWidth * 0.5) + 100, y: Math.random() * (window.innerHeight * 0.3) + 100,
      color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)],
      width: 224, height: 200, type: 'formula', createdAt: serverTimestamp()
    });
  };

  const addNote = async () => {
    if (!currentBoard) return;
    const newRef = push(ref(db, `boards/${currentBoard.id}/elements`));
    await set(newRef, {
      title: 'Note',
      content: 'Your note here...',
      x: Math.random() * (window.innerWidth * 0.5) + 100,
      y: Math.random() * (window.innerHeight * 0.3) + 100,
      color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)],
      width: 224,
      height: 200,
      type: 'note',
      createdAt: serverTimestamp()
    });
  };

  const addTable = async () => {
    if (!currentBoard) return;
    const newRef = push(ref(db, `boards/${currentBoard.id}/elements`));
    await set(newRef, {
      title: 'Table',
      columns: ['Col 1', 'Col 2'],
      rows: [
        { id: 'row1', cells: ['Cell 1', 'Cell 2'] }
      ],
      x: Math.random() * (window.innerWidth * 0.5) + 100,
      y: Math.random() * (window.innerHeight * 0.3) + 100,
      color: CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)],
      width: 300,
      height: 200,
      type: 'table',
      createdAt: serverTimestamp()
    });
  };

  const addImage = async (url) => {
    if (!url || !currentBoard) return;
    const newRef = push(ref(db, `boards/${currentBoard.id}/elements`));
    await set(newRef, {
      title: 'Image', url, notes: '', x: Math.random() * (window.innerWidth * 0.5) + 100,
      y: Math.random() * (window.innerHeight * 0.3) + 100, color: '#ffffff',
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

  const updateElement = async (id, updates) => {
    if (!currentBoard) return;
    setElements(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    await update(ref(db, `boards/${currentBoard.id}/elements/${id}`), updates);
  };

  const updateTable = async (id, updates) => {
    if (!currentBoard) return;
    setElements(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    await update(ref(db, `boards/${currentBoard.id}/elements/${id}`), updates);
  };

  const deleteElement = async (id) => {
    if (!currentBoard) return;
    await remove(ref(db, `boards/${currentBoard.id}/elements/${id}`));
  };

  const clearBoard = async () => {
    if (!confirm('Clear all elements?') || !currentBoard) return;
    await remove(ref(db, `boards/${currentBoard.id}/elements`));
    setElements([]);
    setZIndexMap({});
    setMaxZIndex(0);
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
      let text = data.candidates[0].content.parts[0].text.trim();
      text = text.replace(/```(?:json)?/g, '').trim();
      const parsed = JSON.parse(text);
      if (parsed.action === 'add') {
        const newRef = push(ref(db, `boards/${currentBoard.id}/elements`));
        await set(newRef, {
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

  const getContrastColor = (bgColor) => {
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#1e293b' : '#f8fafc';
  };

  const renderLatex = (latex, compact = false) => {
    try {
      return { __html: katex.renderToString(latex, { throwOnError: false, displayMode: !compact, trust: true }) };
    } catch {
      return { __html: latex };
    }
  };

  const handleDragStart = (e, id) => {
    if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
    setDraggedId(id);
    const newZ = maxZIndex + 1;
    setZIndexMap(p => ({ ...p, [id]: newZ }));
    setMaxZIndex(newZ);
    const el = elements.find(f => f.id === id);
    setDragOffset({ x: e.clientX - el.x, y: e.clientY - el.y });
  };

  const handleGlobalMove = (e) => {
    if (draggedId) {
      // Throttle updates for smoother drag
      requestAnimationFrame(() => {
        updateElement(draggedId, { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
      });
    }
    if (resizingId) {
      requestAnimationFrame(() => {
        updateElement(resizingId, {
          width: Math.max(120, resizeStart.width + (e.clientX - resizeStart.x)),
          height: Math.max(100, resizeStart.height + (e.clientY - resizeStart.y))
        });
      });
    }
  };

  const addTableRowsCols = (el) => {
    const rowsInput = prompt('How many additional rows?', '1');
    const colsInput = prompt('How many additional columns?', '1');
    const addRows = parseInt(rowsInput) || 0;
    const addCols = parseInt(colsInput) || 0;

    if (addRows <= 0 && addCols <= 0) return;

    let newRows = [...el.rows];
    let newCols = [...el.columns];

    // Add columns
    if (addCols > 0) {
      newCols = [...newCols, ...Array(addCols).fill('').map((_, i) => `Col ${newCols.length + i + 1}`)];
      newRows = newRows.map(row => ({
        ...row,
        cells: [...row.cells, ...Array(addCols).fill('')]
      }));
    }

    // Add rows
    if (addRows > 0) {
      for (let i = 0; i < addRows; i++) {
        newRows.push({
          id: `row${Date.now()}-${i}`,
          cells: Array(newCols.length).fill('')
        });
      }
    }

    updateTable(el.id, { columns: newCols, rows: newRows });
  };

  const renderElement = useCallback((el) => {
    const zIndex = zIndexMap[el.id] || 0;
    const bgColor = el.color;
    const textColor = getContrastColor(bgColor);

    const cardClasses = `absolute transition-transform duration-150 ease-out rounded-xl shadow-lg hover:shadow-2xl p-3 overflow-hidden ${el.type === 'image' ? 'border-4 border-dashed border-blue-300' : ''
      }`;

    return (
      <div
        key={el.id}
        className={cardClasses}
        style={{
          left: `${el.x}px`,
          top: `${el.y}px`,
          width: `${el.width}px`,
          height: `${el.height}px`,
          zIndex,
          backgroundColor: bgColor,
          color: textColor,
          willChange: 'transform'
        }}
        onMouseDown={e => handleDragStart(e, el.id)}
        onMouseEnter={(e) => {
          if (el.type === 'formula') {
            const latexEl = e.currentTarget.querySelector('.bg-white\\/70');
            if (latexEl && (latexEl.scrollWidth > latexEl.clientWidth || latexEl.scrollHeight > latexEl.clientHeight)) {
              setHoveredFormula(el);
            }
          }
        }}
        onMouseLeave={() => setHoveredFormula(null)}
      >
        <div className="flex justify-between items-center mb-2 [&>*]:mb-0">
          <input
            type="text"
            value={el.title}
            onChange={e => updateElement(el.id, { title: e.target.value })}
            className="text-lg font-bold bg-transparent border-none outline-none w-full"
            style={{ color: textColor, fontFamily: 'Caveat, cursive' }}
          />
          <div className="flex gap-1">
            {el.type === 'table' && (
              <button
                onClick={e => { e.stopPropagation(); addTableRowsCols(el); }}
                className="p-1 text-gray-600 hover:text-blue-600 rounded hover:bg-blue-100 transition"
                title="Add rows/columns"
              >
                <SquarePlus size={14} />
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); deleteElement(el.id); }}
              className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-red-500 hover:text-white rounded"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {el.type === 'formula' ? (
          <div className="h-[calc(100%-60px)] flex flex-col">
            <div
              className="bg-white/70 backdrop-blur rounded-lg p-2 mb-2 text-center text-sm overflow-hidden flex-grow"
              style={{ minHeight: '40px', flex: '0 0 auto' }}
              dangerouslySetInnerHTML={renderLatex(el.latex, true)}
            />
            <input
              type="text"
              value={el.latex}
              onChange={e => updateElement(el.id, { latex: e.target.value })}
              placeholder="LaTeX formula"
              className="w-full px-2 py-1 text-xs bg-white/50 backdrop-blur rounded border border-white/30 mb-2"
            />
            <div className="flex gap-2 mb-2 flex-wrap">
              <input
                type="text"
                value={el.subject}
                onChange={e => updateElement(el.id, { subject: e.target.value })}
                className="px-2 py-0.5 text-xs bg-blue-200/50 backdrop-blur rounded-full flex-1 min-w-0"
                placeholder="Subject"
              />
              <input
                type="text"
                value={el.topic}
                onChange={e => updateElement(el.id, { topic: e.target.value })}
                className="px-2 py-0.5 text-xs bg-green-200/50 backdrop-blur rounded-full flex-1 min-w-0"
                placeholder="Topic"
              />
            </div>
            {el.height >= 180 && (
              <textarea
                value={el.notes || ''}
                onChange={e => updateElement(el.id, { notes: e.target.value })}
                placeholder="Notes..."
                className="w-full px-2 py-1 text-xs bg-white/50 backdrop-blur rounded border border-white/30 resize-none overflow-hidden mt-1"
                style={{
                  height: 'auto',
                  minHeight: '1.5rem',
                  maxHeight: '150px',
                  fontFamily: 'Caveat, cursive',
                  lineHeight: '1',
                }}
                onInput={e => {
                  const textarea = e.target;
                  textarea.style.height = 'auto';
                  textarea.style.height = `${textarea.scrollHeight}px`;
                }}
              />
            )}

          </div>
        ) : el.type === 'note' ? (
          <>
            <textarea
              style={{ fontFamily: 'Caveat, cursive' }}
              value={el.content}
              onChange={e => updateElement(el.id, { content: e.target.value })}
              className="w-full h-[calc(100%-40px)] px-2 py-1 bg-white/50 backdrop-blur rounded border border-white/30 resize-none"
              placeholder="Write your note..."
            />
            <textarea
              value={el.notes || ''}
              onChange={e => updateElement(el.id, { notes: e.target.value })}
              placeholder="Notes..."
              className="w-full px-2 py-1 text-xs bg-white/50 backdrop-blur rounded border border-white/30 resize-none mt-2"
              rows={2}
            />
          </>
        ) : el.type === 'table' ? (
          <div className="h-[calc(100%-40px)] overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  {el.columns.map((col, i) => (
                    <th key={i} className="border bg-gray-100 p-1.5">
                      <input
                        type="text"
                        value={col}
                        onChange={e => {
                          const newCols = [...el.columns];
                          newCols[i] = e.target.value;
                          updateTable(el.id, { columns: newCols });
                        }}
                        className="w-full bg-transparent text-center font-medium"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {el.rows.map((row, i) => (
                  <tr key={row.id}>
                    {row.cells.map((cell, j) => (
                      <td key={j} className="border p-1.5">
                        <input
                          type="text"
                          value={cell}
                          onChange={e => {
                            const newRows = [...el.rows];
                            newRows[i].cells[j] = e.target.value;
                            updateTable(el.id, { rows: newRows });
                          }}
                          className="w-full bg-transparent text-center"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : el.type === 'image' && (
          <div className="h-[calc(100%-40px)] flex flex-col">
            <img
              src={el.url}
              alt={el.title}
              className="w-full h-full object-contain rounded"
            />
            {/* <input
              type="text"
              value={el.url}
              onChange={e => updateElement(el.id, { url: e.target.value })}
              placeholder="Image URL"
              className="w-full px-2 py-1 text-xs bg-white/50 backdrop-blur rounded border border-white/30 mt-2"
            /> */}
            <textarea
              value={el.notes || ''}
              onChange={e => updateElement(el.id, { notes: e.target.value })}
              placeholder="Notes..."
              className="w-full px-2 py-0 text-xs bg-white/50 backdrop-blur rounded border border-white/30 resize-none mt-2"
              rows={2}
            />
          </div>
        )}

        {!['table', 'formula', 'note', 'image'].includes(el.type) && (
          <textarea
            value={el.notes || ''}
            onChange={e => updateElement(el.id, { notes: e.target.value })}
            placeholder="Notes..."
            className="w-full px-2 py-1 text-xs bg-white/50 backdrop-blur rounded border border-white/30 resize-none mt-2"
            rows={2}
          />
        )}

        <div
          className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize rounded-tl-lg opacity-0 group-hover:opacity-100 transition"
          onMouseDown={e => {
            e.stopPropagation();
            setResizingId(el.id);
            setResizeStart({
              x: e.clientX,
              y: e.clientY,
              width: el.width,
              height: el.height
            });
          }}
        />
      </div>
    );
  }, [zIndexMap, getContrastColor, updateElement, deleteElement, updateTable, addTableRowsCols]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-4 text-center">
        {/* 🌟 Header Section */}
        <div className="mb-8">
          <h1 className="text-5xl md:text-6xl font-extrabold text-white tracking-tight drop-shadow-lg">
            SnapBoard ✨
          </h1>
          <p className="text-lg md:text-xl text-white/80 mt-3">
            Your AI-powered Formula & Notes Whiteboard
          </p>
          <p className="text-sm md:text-base text-white/60 mt-2">
            Generate <span className="text-purple-300 font-medium">formulas</span>,{" "}
            <span className="text-purple-300 font-medium">notes</span>, and{" "}
            <span className="text-purple-300 font-medium">tables</span> instantly with AI.
          </p>
        </div>

        {/* 🧠 Sign-in Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 md:p-12 max-w-md w-full shadow-2xl border border-white/20">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Welcome to SnapBoard
          </h2>
          <p className="text-white/70 mb-8">
            Collaborate and create smarter with AI assistance.
          </p>

          <button
            onClick={signIn}
            className="w-full bg-white text-gray-900 px-6 py-3 rounded-xl font-semibold hover:bg-gray-100 transition transform hover:scale-105 flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>
        </div>

        {/* 💬 Subtext */}
        <p className="text-xs text-white/50 mt-6 max-w-md">
          Start creating, collaborating, and visualizing your formulas and notes with AI.
        </p>
      </div>
    );
  }


  if (showDashboard && !currentBoard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="bg-white shadow-sm border-b sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Formula Boards</h1>
            <button onClick={signOutUser} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"><LogOut size={20} /></button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-4 mb-6 border-b">
            <button onClick={() => setActiveTab('myBoards')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'myBoards' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600'}`}>My Boards ({boards.length})</button>
            <button onClick={() => setActiveTab('shared')} className={`px-4 py-2 font-medium transition-all ${activeTab === 'shared' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-600'}`}>Shared ({sharedBoards.length})</button>
          </div>
          {activeTab === 'myBoards' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <button onClick={createBoard} className="h-48 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition flex flex-col items-center justify-center group">
                <Plus size={40} className="text-gray-400 group-hover:text-blue-500 mb-2" />
                <span className="text-gray-600 group-hover:text-blue-600 font-medium">New Board</span>
              </button>
              {boards.map(board => (
                <div key={board.id} onClick={() => openBoard(board)} className="h-48 bg-white rounded-xl shadow-sm hover:shadow-lg transition cursor-pointer p-6 relative group border hover:border-blue-300">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">{board.name}</h3>
                  <p className="text-sm text-gray-500">{new Date(board.createdAt).toLocaleDateString()}</p>
                  <button onClick={(e) => deleteBoard(board.id, e)} className="absolute top-4 right-4 p-2 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
          {activeTab === 'shared' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sharedBoards.length === 0 ? <p className="text-gray-500 col-span-full text-center py-12">No shared boards</p> : sharedBoards.map(board => (
                <div key={board.id} onClick={() => openBoard(board)} className="h-48 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl shadow-sm hover:shadow-lg transition cursor-pointer p-6 border border-purple-200">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">{board.name}</h3>
                  <p className="text-sm text-gray-600">By {board.ownerName}</p>
                  <Users size={16} className="text-purple-500 mt-2" />
                </div>
              ))}
            </div>
          )}
        </div>

        {showFirstTimeSetup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
              <h2 className="text-xl font-bold mb-3 text-gray-800">Set Up Gemini API Key</h2>
              <p className="text-sm text-gray-600 mb-4">Get your key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener" className="text-blue-500 underline">Google AI Studio</a></p>
              <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 text-gray-700" onKeyPress={e => e.key === 'Enter' && saveApiKey()} />
              <div className="flex gap-2">
                <button onClick={saveApiKey} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">Save</button>
                <button onClick={() => setShowFirstTimeSetup(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">Skip</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!currentBoard) return null;

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden relative" onMouseMove={handleGlobalMove} onMouseUp={() => { setDraggedId(null); setResizingId(null); }}>
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-white/90 backdrop-blur-lg rounded-full shadow-lg px-6 py-3 border border-white/20 flex items-center gap-3 flex-wrap justify-center max-w-fit">
        <button onClick={() => { setShowDashboard(true); setCurrentBoard(null); }} className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-full transition">Dashboard</button>
        <div className="w-px h-5 bg-gray-300"></div>
        <button onClick={addFormula} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition"><Plus size={14} /> Formula</button>
        <button onClick={addNote} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-sm rounded-full hover:bg-emerald-600 transition"><Type size={14} /> Note</button>
        <button onClick={addTable} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-sm rounded-full hover:bg-amber-600 transition"><Table size={14} /> Table</button>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white text-sm rounded-full hover:bg-indigo-600 transition"><Upload size={14} /> Image</button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        {currentBoard.owner === user.uid && (
          <button onClick={() => setShowShareModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 text-white text-sm rounded-full hover:bg-purple-600 transition"><Share2 size={14} /> Share</button>
        )}
        <div className="w-px h-5 bg-gray-300"></div>
        <div className="flex items-center gap-1">
          <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAI()} placeholder="Add Linea formula..." className="px-3 py-1.5 text-sm text-gray-600 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 w-36" />
          <button onClick={handleAI} disabled={isProcessing} className="p-1.5 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition disabled:opacity-50"><Wand2 size={14} /></button>
        </div>
        <div className="w-px h-5 bg-gray-300"></div>
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 hover:bg-gray-600 bg-slate-400 rounded-full transition"><Menu size={18} /></button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
              {!apiKey && (<button onClick={() => { setShowKeyModal(true); setMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 border-b"><Settings size={14} /> Set API Key</button>)}
              {apiKey && (<button onClick={() => { setShowKeyModal(true); setMenuOpen(false); }} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 border-b"><Settings size={14} /> Change API Key</button>)}
              {collaborators.length > 0 && (<div className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border-b">Collaborators: {collaborators.map(c => c.email).join(', ')}</div>)}
              <button onClick={clearBoard} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-b"><Trash2 size={14} /> Clear Board</button>
              <button onClick={signOutUser} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"><LogOut size={14} /> Logout</button>
            </div>
          )}
        </div>
      </div>

      <div className="w-full h-full pt-20 overflow-auto">
        <div className="relative w-full h-full min-h-[calc(100vh-80px)]">
          {elements.map(el => (
            <div key={el.id} className="group">
              {renderElement(el)}
            </div>
          ))}
          {elements.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center p-4 bg-white/80 rounded-xl max-w-md">
                <p className="text-xl text-gray-600 font-medium">Add your first element</p>
                <p className="text-gray-500 mt-2">Use the top bar to add formulas, notes, tables or images</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {hoveredFormula && (
        <div className="fixed z-50 bg-white rounded-xl shadow-2xl p-6 border-2 border-red-500 max-w-md w-full max-h-[80vh] overflow-auto"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            maxHeight: '80vh'
          }}>
          <div className="text-sm font-bold mb-3 text-gray-700">{hoveredFormula.title}</div>
          <div className="text-black overflow-auto" dangerouslySetInnerHTML={renderLatex(hoveredFormula.latex)} />
        </div>
      )}

      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4 text-gray-800">Share Board</h2>
            <p className="text-sm text-gray-600 mb-4">Invite collaborators by email or share a link</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
              <input type="email" value={shareEmail} onChange={e => setShareEmail(e.target.value)} placeholder="colleague@example.com" className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-500" onKeyPress={e => e.key === 'Enter' && shareBoard()} />
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={shareBoard} className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition">Send Invite</button>
              <button onClick={copyShareLink} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition flex items-center gap-2"><Copy size={16} /> Link</button>
            </div>
            <button onClick={() => setShowShareModal(false)} className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">Close</button>
          </div>
        </div>
      )}

      {showKeyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h2 className="text-xl font-bold mb-3 text-gray-800">Gemini API Key</h2>
            <p className="text-xs text-gray-600 mb-4">Get your key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener" className="text-blue-500 underline">Google AI Studio</a></p>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4" onKeyPress={e => e.key === 'Enter' && saveApiKey()} />
            <div className="flex gap-2">
              <button onClick={saveApiKey} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">Save</button>
              <button onClick={() => setShowKeyModal(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <link href="https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
    </div>
  );
};

export default FormulaWhiteboard;