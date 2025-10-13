"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, Wand2, Trash2, LayoutGrid, Save, Table } from 'lucide-react';
import katex from 'katex';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, set, update, remove, onValue, serverTimestamp } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_API_KEY || "AIzaSyBdYOUR_API_KEY_HERE",
  databaseURL: process.env.NEXT_PUBLIC_DATABASE_URL,
  authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN || "your-project.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID || "your-project",
  storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET || "your-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID || "123",
  appId: process.env.NEXT_PUBLIC_APP_ID || "1:123:web:abc"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const FormulaWhiteboard = () => {
  const [boards, setBoards] = useState([]);
  const [currentBoardId, setCurrentBoardId] = useState(null);
  const [elements, setElements] = useState([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingId, setResizingId] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(true);
  const [showBoardSelector, setShowBoardSelector] = useState(false);
  const [hoveredFormula, setHoveredFormula] = useState(null);
  const [zIndexMap, setZIndexMap] = useState({});
  const [maxZIndex, setMaxZIndex] = useState(0);
  const [userId, setUserId] = useState('');
  const boardsUnsub = useRef(null);
  const elementsUnsub = useRef(null);
  const canvasRef = useRef(null);

  // Initialize API key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setShowKeyInput(false);
    }
  }, []);

  // Auth
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        signInAnonymously(auth).catch(console.error);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Boards listener
  useEffect(() => {
    if (!userId) return;
    const boardsRef = ref(db, `users/${userId}/boards`);
    const unsub = onValue(boardsRef, (snap) => {
      const data = snap.val();
      if (data) {
        const parsedBoards = Object.entries(data).map(([id, board]) => ({ id, ...board }));
        setBoards(parsedBoards);
      } else {
        setBoards([]);
      }
    });
    boardsUnsub.current = unsub;
    return () => {
      if (boardsUnsub.current) boardsUnsub.current();
    };
  }, [userId]);

  // Create default board if none
  useEffect(() => {
    if (boards.length === 0 && userId) {
      createDefaultBoard();
    }
  }, [boards.length, userId]);

  const createDefaultBoard = async () => {
    if (!userId) return;
    const boardsRef = ref(db, `users/${userId}/boards`);
    const newBoardRef = push(boardsRef);
    const boardData = {
      name: 'My First Board',
      createdAt: serverTimestamp(),
      numElements: 0
    };
    await set(newBoardRef, boardData);
    setCurrentBoardId(newBoardRef.key);
  };

  // Elements listener
  useEffect(() => {
    if (!currentBoardId || !userId) {
      setElements([]);
      return;
    }
    const elementsRef = ref(db, `users/${userId}/boards/${currentBoardId}/elements`);
    const unsub = onValue(elementsRef, (snap) => {
      const data = snap.val();
      if (data) {
        const parsed = Object.entries(data).map(([id, el]) => ({ id, ...el }));
        setElements(parsed);
        setZIndexMap({});
        setMaxZIndex(0);
      } else {
        setElements([]);
      }
    });
    elementsUnsub.current = unsub;
    return () => {
      if (elementsUnsub.current) elementsUnsub.current();
    };
  }, [currentBoardId, userId]);

  const getContrastColor = (bgColor) => {
    const rgb = parseInt(bgColor.replace('#', ''), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#1e293b' : '#f8fafc';
  };

  const loadBoard = (boardId) => {
    setCurrentBoardId(boardId);
  };

  const createNewBoard = async () => {
    const boardName = prompt('Enter board name:') || 'New Board';
    if (!userId) return;
    const boardsRef = ref(db, `users/${userId}/boards`);
    const newBoardRef = push(boardsRef);
    const boardData = {
      name: boardName,
      createdAt: serverTimestamp(),
      numElements: 0
    };
    await set(newBoardRef, boardData);
    loadBoard(newBoardRef.key);
  };

  const deleteBoard = async (boardId) => {
    if (boards.length === 1) {
      alert('Cannot delete the last board!');
      return;
    }
    if (!confirm('Delete this board?')) return;
    if (!userId) return;
    try {
      await remove(ref(db, `users/${userId}/boards/${boardId}`));
      if (currentBoardId === boardId) {
        const nextBoard = boards.find((b) => b.id !== boardId);
        loadBoard(nextBoard.id);
      }
    } catch (error) {
      alert('Failed to delete board');
    }
  };

  const renameBoard = async (boardId) => {
    const board = boards.find((b) => b.id === boardId);
    const newName = prompt('Rename board:', board.name);
    if (!newName || newName === board.name) return;
    if (!userId) return;
    try {
      await update(ref(db, `users/${userId}/boards/${boardId}`), { name: newName });
    } catch (error) {
      alert('Failed to rename');
    }
  };

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini_api_key', apiKey.trim());
      setShowKeyInput(false);
    }
  };

  const addFormula = async () => {
    if (!currentBoardId || !userId) return;
    const elementsRef = ref(db, `users/${userId}/boards/${currentBoardId}/elements`);
    const newFormulaRef = push(elementsRef);
    const newFormulaData = {
      title: 'New Formula',
      latex: 'F = ma',
      subject: 'Physics',
      topic: 'Mechanics',
      notes: '',
      x: Math.random() * 300 + 100,
      y: Math.random() * 200 + 100,
      color: ['#FEF3C7', '#DBEAFE', '#FCE7F3', '#D1FAE5'][Math.floor(Math.random() * 4)],
      width: 224,
      height: 200,
      type: 'formula',
      createdAt: serverTimestamp()
    };
    await set(newFormulaRef, newFormulaData);
    const newZ = maxZIndex + 1;
    setZIndexMap((prev) => ({ ...prev, [newFormulaRef.key]: newZ }));
    setMaxZIndex(newZ);
    await update(ref(db, `users/${userId}/boards/${currentBoardId}`), {
      numElements: (boards.find(b => b.id === currentBoardId)?.numElements || 0) + 1
    });
  };

  const addImage = async () => {
    const url = prompt('Enter image URL:');
    if (!url || !currentBoardId || !userId) return;
    const elementsRef = ref(db, `users/${userId}/boards/${currentBoardId}/elements`);
    const newImageRef = push(elementsRef);
    const newImageData = {
      title: 'New Image',
      url,
      notes: '',
      x: Math.random() * 300 + 100,
      y: Math.random() * 200 + 100,
      color: '#ffffff',
      width: 200,
      height: 150,
      type: 'image',
      createdAt: serverTimestamp()
    };
    await set(newImageRef, newImageData);
    const newZ = maxZIndex + 1;
    setZIndexMap((prev) => ({ ...prev, [newImageRef.key]: newZ }));
    setMaxZIndex(newZ);
    await update(ref(db, `users/${userId}/boards/${currentBoardId}`), {
      numElements: (boards.find(b => b.id === currentBoardId)?.numElements || 0) + 1
    });
  };

  const updateElement = async (id, updates) => {
    if (!currentBoardId || !userId) return;
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const newEl = { ...el, ...updates };
    setElements(elements.map((e) => (e.id === id ? newEl : e)));
    try {
      await update(ref(db, `users/${userId}/boards/${currentBoardId}/elements/${id}`), updates);
    } catch (error) {
      console.error('Failed to update:', error);
    }
  };

  const deleteElement = async (id) => {
    if (!currentBoardId || !userId) return;
    setElements(elements.filter((e) => e.id !== id));
    const newZMap = { ...zIndexMap };
    delete newZMap[id];
    setZIndexMap(newZMap);
    try {
      await remove(ref(db, `users/${userId}/boards/${currentBoardId}/elements/${id}`));
      await update(ref(db, `users/${userId}/boards/${currentBoardId}`), {
        numElements: (boards.find(b => b.id === currentBoardId)?.numElements || 0) - 1
      });
    } catch (error) {
      alert('Failed to delete');
    }
  };

  const clearBoard = async () => {
    if (!currentBoardId || !userId || elements.length === 0) return;
    if (!confirm('Clear all elements?')) return;
    try {
      await remove(ref(db, `users/${userId}/boards/${currentBoardId}/elements`));
      await update(ref(db, `users/${userId}/boards/${currentBoardId}`), { numElements: 0 });
      setElements([]);
      setZIndexMap({});
      setMaxZIndex(0);
    } catch (error) {
      alert('Failed to clear');
    }
  };

  const bringToFront = (id) => {
    const newZIndex = maxZIndex + 1;
    setZIndexMap((prev) => ({ ...prev, [id]: newZIndex }));
    setMaxZIndex(newZIndex);
  };

  const handleDragStart = (e, id) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    setDraggedId(id);
    bringToFront(id);
    const el = elements.find((f) => f.id === id);
    setDragOffset({
      x: e.clientX - el.x,
      y: e.clientY - el.y
    });
  };

  const handleDragMove = (e) => {
    if (draggedId) {
      updateElement(draggedId, {
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const handleResizeStart = (e, id) => {
    e.stopPropagation();
    const el = elements.find((f) => f.id === id);
    setResizingId(id);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: el.width || 224,
      height: el.height || 200
    });
    bringToFront(id);
  };

  const handleResizeMove = (e) => {
    if (!resizingId) return;
    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;
    updateElement(resizingId, {
      width: Math.max(100, resizeStart.width + deltaX),
      height: Math.max(80, resizeStart.height + deltaY)
    });
  };

  const handleResizeEnd = () => {
    setResizingId(null);
  };

  const handleGlobalMove = (e) => {
    handleDragMove(e);
    if (resizingId) {
      handleResizeMove(e);
    }
  };

  const handleGlobalUp = () => {
    handleDragEnd();
    handleResizeEnd();
  };

  const arrangeInTable = () => {
    const formulaElements = elements.filter((e) => e.type === 'formula');
    if (formulaElements.length === 0) return;
    const groups = {};
    formulaElements.forEach((el) => {
      const sub = el.subject || 'Other';
      if (!groups[sub]) groups[sub] = [];
      groups[sub].push(el);
    });
    let currentY = 100;
    Object.entries(groups).forEach(([sub, group]) => {
      const rowY = currentY;
      group.forEach((el, i) => {
        updateElement(el.id, { x: 100 + i * 250, y: rowY });
      });
      currentY += 250;
    });
  };

  const handleAI = async () => {
    if (!aiPrompt.trim() || isProcessing || !apiKey) {
      if (!apiKey) alert('Please set your Gemini API key first!');
      return;
    }
    setIsProcessing(true);
    try {
      const currentFormulas = elements
        .filter((e) => e.type === 'formula')
        .map((f) => ({ id: f.id, title: f.title, latex: f.latex, subject: f.subject, topic: f.topic }));
      const prompt = `You are helping organize a formula whiteboard. Current formulas: ${JSON.stringify(currentFormulas)}

User request: "${aiPrompt}"

If the user wants to:
1. ADD a formula: Respond with JSON: {"action": "add", "title": "...", "latex": "...", "subject": "...", "topic": "..."}
2. ORGANIZE formulas: Respond with JSON: {"action": "organize", "layout": [{"id": formula_id, "x": number, "y": number}]} - arrange formulas in a grid grouped by subject (x between 50-800, y between 100-600)
3. FILTER/SEARCH: Respond with JSON: {"action": "filter", "ids": [id1, id2, ...]}

CRITICAL: Respond with ONLY valid JSON. No markdown, no code blocks, no other text. Just pure JSON.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
          })
        }
      );

      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = await response.json();
      let result = data.candidates[0].content.parts[0].text.trim();
      result = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(result);

      const elementsRef = ref(db, `users/${userId}/boards/${currentBoardId}/elements`);
      const boardRef = ref(db, `users/${userId}/boards/${currentBoardId}`);

      if (parsed.action === 'add') {
        const newFormulaRef = push(elementsRef);
        const newFormulaData = {
          title: parsed.title,
          latex: parsed.latex,
          subject: parsed.subject,
          topic: parsed.topic,
          notes: '',
          x: Math.random() * 300 + 100,
          y: Math.random() * 200 + 100,
          color: ['#FEF3C7', '#DBEAFE', '#FCE7F3', '#D1FAE5'][Math.floor(Math.random() * 4)],
          width: 224,
          height: 200,
          type: 'formula',
          createdAt: serverTimestamp()
        };
        await set(newFormulaRef, newFormulaData);
        const newZ = maxZIndex + 1;
        setZIndexMap((prev) => ({ ...prev, [newFormulaRef.key]: newZ }));
        setMaxZIndex(newZ);
        await update(boardRef, { numElements: (boards.find(b => b.id === currentBoardId)?.numElements || 0) + 1 });
      } else if (parsed.action === 'organize') {
        const batchUpdates = {};
        parsed.layout.forEach((l) => {
          batchUpdates[`elements/${l.id}`] = { x: l.x, y: l.y };
        });
        await update(ref(db, `users/${userId}/boards/${currentBoardId}`), batchUpdates);
        setElements((prev) =>
          prev.map((e) => {
            const layout = parsed.layout.find(l => l.id === e.id);
            return layout ? { ...e, x: layout.x, y: layout.y } : e;
          })
        );
      } else if (parsed.action === 'filter') {
        setElements((prev) =>
          prev.map((e) => ({ ...e, highlight: parsed.ids.includes(e.id) }))
        );
        setTimeout(() => {
          setElements((prev) =>
            prev.map((e) => {
              const { highlight, ...rest } = e;
              return rest;
            })
          );
        }, 3000);
      }

      setAiPrompt('');
    } catch (error) {
      console.error('AI Error:', error);
      alert(`AI processing failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderLatex = (latex, compact = false) => {
    try {
      return { __html: katex.renderToString(latex, {
        throwOnError: false,
        displayMode: !compact,
        trust: true
      }) };
    } catch {
      return { __html: latex };
    }
  };

  const truncateLatex = (latex) => {
    return latex.length > 30 ? latex.substring(0, 30) + '...' : latex;
  };

  const currentBoard = boards.find((b) => b.id === currentBoardId);

  return (
    <div
      className="w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden relative"
      onMouseMove={handleGlobalMove}
      onMouseUp={handleGlobalUp}
    >
      {/* API Key Modal */}
      {showKeyInput && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-xl font-bold mb-3 text-gray-600">Setup Gemini API Key</h2>
            <p className="text-gray-600 mb-3 text-xs">
              Get your free API key from{' '}
              <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                Google AI Studio
              </a>
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 text-sm text-gray-600 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              onKeyPress={(e) => e.key === 'Enter' && saveApiKey()}
            />
            <button onClick={saveApiKey} className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium">
              Save & Continue
            </button>
          </div>
        </div>
      )}

      {/* Board Selector Modal */}
      {showBoardSelector && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowBoardSelector(false)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 max-h-96 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-700">My Boards</h2>
              <button onClick={createNewBoard} className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                + New Board
              </button>
            </div>
            <div className="space-y-2">
              {boards.map((board) => (
                <div key={board.id} className={`p-3 rounded-lg border-2 cursor-pointer transition ${currentBoardId === board.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex justify-between items-center" onClick={() => { loadBoard(board.id); setShowBoardSelector(false); }}>
                    <div>
                      <div className="font-medium text-sm text-blue-400">{board.name}</div>
                      <div className="text-xs text-gray-500">{board.numElements || 0} elements</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); renameBoard(board.id); }} className="text-xs px-2 py-1 bg-gray-600 rounded hover:bg-gray-200">
                        Rename
                      </button>
                      {boards.length > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); deleteBoard(board.id); }} className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hover Formula Popup */}
      {hoveredFormula && hoveredFormula.type === 'formula' && (
        <div
          className="fixed z-50 bg-white text-gray-600 rounded-lg shadow-2xl p-4 border-2 border-blue-300 max-w-lg pointer-events-none"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div className="text-sm font-bold mb-2">{hoveredFormula.title}</div>
          <div className="overflow-auto" dangerouslySetInnerHTML={renderLatex(hoveredFormula.latex, false)} />
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-40 bg-white/90 backdrop-blur rounded-xl shadow-lg px-4 py-2 flex items-center gap-2 text-sm">
        <button onClick={() => setShowBoardSelector(true)} className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
          <LayoutGrid size={14} /> {currentBoard?.name || 'Boards'}
        </button>
        <div className="h-6 w-px bg-gray-300" />
        <button onClick={addFormula} className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition">
          <Plus size={14} /> Formula
        </button>
        <button onClick={addImage} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition">
          <Camera size={14} /> Image
        </button>
        <button onClick={clearBoard} className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition">
          <Trash2 size={14} /> Clear
        </button>
        <button onClick={arrangeInTable} className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition">
          <Table size={14} /> Table
        </button>
        <button onClick={() => setShowKeyInput(true)} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
          🔑
        </button>
        <div className="h-6 w-px bg-gray-300" />
        <input
          type="text"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAI()}
          placeholder="Ask AI: 'Add Pythagorean theorem' or 'Organize'"
          className="text-gray-600 px-3 py-1.5 w-72 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button onClick={handleAI} disabled={isProcessing} className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50">
          <Wand2 size={14} /> {isProcessing ? '...' : 'AI'}
        </button>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} className="w-full h-full relative pt-16">
        {elements.map((el) => (
          <div
            key={el.id}
            className={`absolute transition-transform duration-75 ${el.highlight ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}
            style={{
              left: `${el.x}px`,
              top: `${el.y}px`,
              width: `${el.width}px`,
              height: `${el.height}px`,
              zIndex: zIndexMap[el.id] || 0,
              transform: draggedId === el.id ? 'scale(1.03) rotate(-1deg)' : 'none'
            }}
            onMouseDown={(e) => handleDragStart(e, el.id)}
            onMouseEnter={() =>
              el.type === 'formula' && el.latex && el.latex.length > 30 ? setHoveredFormula(el) : null
            }
            onMouseLeave={() => setHoveredFormula(null)}
          >
            <div
              className={`relative w-full h-full rounded-lg shadow-lg hover:shadow-xl transition-shadow p-3 overflow-hidden`}
              style={{
                backgroundColor: el.color,
                color: getContrastColor(el.color),
                fontFamily: "'Caveat', cursive"
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <input
                  type="text"
                  value={el.title}
                  onChange={(e) => updateElement(el.id, { title: e.target.value })}
                  className="text-base font-bold bg-transparent border-none outline-none w-full"
                  style={{ fontFamily: "'Caveat', cursive" }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteElement(el.id);
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {el.type === 'formula' ? (
                <>
                  <div
                    className="bg-white/60 rounded p-2 mb-2 text-center text-xs overflow-hidden"
                    dangerouslySetInnerHTML={renderLatex(truncateLatex(el.latex), true)}
                  />
                  <input
                    type="text"
                    value={el.latex}
                    onChange={(e) => updateElement(el.id, { latex: e.target.value })}
                    placeholder="LaTeX formula"
                    className="w-full px-2 py-1 text-xs bg-white/40 rounded border border-gray-300 mb-1.5"
                  />
                  <div className="flex gap-1.5 mb-1.5 flex-wrap">
                    <input
                      type="text"
                      value={el.subject}
                      onChange={(e) => updateElement(el.id, { subject: e.target.value })}
                      className="px-2 py-0.5 text-xs bg-blue-200 rounded-full border-none outline-none"
                      placeholder="Subject"
                    />
                    <input
                      type="text"
                      value={el.topic}
                      onChange={(e) => updateElement(el.id, { topic: e.target.value })}
                      className="px-2 py-0.5 text-xs bg-green-200 rounded-full border-none outline-none"
                      placeholder="Topic"
                    />
                  </div>
                </>
              ) : el.type === 'image' ? (
                <>
                  <div className="flex-1 mb-2 min-h-0">
                    <img
                      src={el.url}
                      alt={el.title}
                      className="w-full h-full object-contain rounded"
                    />
                  </div>
                  <input
                    type="text"
                    value={el.url}
                    onChange={(e) => updateElement(el.id, { url: e.target.value })}
                    placeholder="Image URL"
                    className="w-full px-2 py-1 text-xs bg-white/40 rounded border border-gray-300 mb-1.5"
                  />
                </>
              ) : null}

              <textarea
                value={el.notes}
                onChange={(e) => updateElement(el.id, { notes: e.target.value })}
                placeholder="Notes..."
                className="w-full px-2 py-1 text-xs bg-white/40 rounded border border-gray-300 resize-none"
                rows={1}
              />
            </div>
            <div
              className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 cursor-se-resize rounded-full opacity-0 hover:opacity-100 transition-opacity"
              onMouseDown={(e) => handleResizeStart(e, el.id)}
            />
          </div>
        ))}
      </div>

      {/* Help Text */}
      {elements.length === 0 && !showKeyInput && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-gray-400">
            <Camera size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-lg font-light">Click "Add Formula" or "Add Image" to start</p>
            <p className="text-xs mt-2">Or ask AI: "Add Einstein's E=mc²"</p>
          </div>
        </div>
      )}

      <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
    </div>
  );
};

export default FormulaWhiteboard;