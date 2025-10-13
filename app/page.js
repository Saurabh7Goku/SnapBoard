"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Camera, Plus, Wand2, Trash2, LayoutGrid, Table } from 'lucide-react';
import katex from 'katex';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, set, update, remove, onValue, serverTimestamp } from 'firebase/database';

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
const db = getDatabase(app);

// 🔑 Use the shared public board — no user ID!
const PUBLIC_BOARD_PATH = 'publicBoard';

const FormulaWhiteboard = () => {
  const [elements, setElements] = useState([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizingId, setResizingId] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(true);
  const [hoveredFormula, setHoveredFormula] = useState(null);
  const [zIndexMap, setZIndexMap] = useState({});
  const [maxZIndex, setMaxZIndex] = useState(0);
  const elementsUnsub = useRef(null);

  // Load API key
  useEffect(() => {
    const saved = localStorage.getItem('gemini_api_key');
    if (saved) {
      setApiKey(saved);
      setShowKeyInput(false);
    }
  }, []);

  // Listen to PUBLIC board elements
  useEffect(() => {
    const elementsRef = ref(db, `${PUBLIC_BOARD_PATH}/elements`);
    const unsub = onValue(elementsRef, (snap) => {
      const data = snap.val();
      const parsed = data ? Object.entries(data).map(([id, el]) => ({ id, ...el })) : [];
      setElements(parsed);
      setZIndexMap({});
      setMaxZIndex(0);
    });
    elementsUnsub.current = unsub;
    return () => unsub();
  }, []);

  // ... [Helper functions: getContrastColor, renderLatex, etc.] ...

  const getContrastColor = (bgColor) => {
    const rgb = parseInt(bgColor.replace('#', ''), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#1e293b' : '#f8fafc';
  };

  const saveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini_api_key', apiKey.trim());
      setShowKeyInput(false);
    }
  };

  const addFormula = async () => {
    const refEl = ref(db, `${PUBLIC_BOARD_PATH}/elements`);
    const newRef = push(refEl);
    await set(newRef, {
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
    });
    const newZ = maxZIndex + 1;
    setZIndexMap(p => ({ ...p, [newRef.key]: newZ }));
    setMaxZIndex(newZ);
  };

  const addImage = async () => {
    const url = prompt('Enter image URL:');
    if (!url) return;
    const refEl = ref(db, `${PUBLIC_BOARD_PATH}/elements`);
    const newRef = push(refEl);
    await set(newRef, {
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
    });
    const newZ = maxZIndex + 1;
    setZIndexMap(p => ({ ...p, [newRef.key]: newZ }));
    setMaxZIndex(newZ);
  };

  const updateElement = async (id, updates) => {
    setElements(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    await update(ref(db, `${PUBLIC_BOARD_PATH}/elements/${id}`), updates);
  };

  const deleteElement = async (id) => {
    setElements(prev => prev.filter(e => e.id !== id));
    const newZ = { ...zIndexMap };
    delete newZ[id];
    setZIndexMap(newZ);
    await remove(ref(db, `${PUBLIC_BOARD_PATH}/elements/${id}`));
  };

  const clearBoard = async () => {
    if (!confirm('Clear board for everyone?')) return;
    await remove(ref(db, `${PUBLIC_BOARD_PATH}/elements`));
    setElements([]);
    setZIndexMap({});
    setMaxZIndex(0);
  };

  const bringToFront = (id) => {
    const z = maxZIndex + 1;
    setZIndexMap(p => ({ ...p, [id]: z }));
    setMaxZIndex(z);
  };

  const handleDragStart = (e, id) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    setDraggedId(id);
    bringToFront(id);
    const el = elements.find(f => f.id === id);
    setDragOffset({ x: e.clientX - el.x, y: e.clientY - el.y });
  };

  const handleDragMove = (e) => {
    if (draggedId) {
      updateElement(draggedId, { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    }
  };

  const handleDragEnd = () => setDraggedId(null);

  const handleResizeStart = (e, id) => {
    e.stopPropagation();
    const el = elements.find(f => f.id === id);
    setResizingId(id);
    setResizeStart({ x: e.clientX, y: e.clientY, width: el.width || 224, height: el.height || 200 });
    bringToFront(id);
  };

  const handleResizeMove = (e) => {
    if (!resizingId) return;
    updateElement(resizingId, {
      width: Math.max(100, resizeStart.width + (e.clientX - resizeStart.x)),
      height: Math.max(80, resizeStart.height + (e.clientY - resizeStart.y))
    });
  };

  const handleResizeEnd = () => setResizingId(null);

  const handleGlobalMove = (e) => {
    handleDragMove(e);
    if (resizingId) handleResizeMove(e);
  };

  const handleGlobalUp = () => {
    handleDragEnd();
    handleResizeEnd();
  };

  const arrangeInTable = () => {
    const formulas = elements.filter(e => e.type === 'formula');
    if (!formulas.length) return;
    const groups = {};
    formulas.forEach(el => {
      const key = el.subject || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(el);
    });
    let y = 100;
    Object.values(groups).forEach(group => {
      group.forEach((el, i) => updateElement(el.id, { x: 100 + i * 250, y }));
      y += 250;
    });
  };

  const handleAI = async () => {
    if (!aiPrompt.trim() || isProcessing || !apiKey) {
      if (!apiKey) alert('Set your Gemini API key first!');
      return;
    }
    setIsProcessing(true);
    try {
      const current = elements.filter(e => e.type === 'formula').map(f => ({
        id: f.id, title: f.title, latex: f.latex, subject: f.subject, topic: f.topic
      }));
      const prompt = `You are helping organize a formula whiteboard. Current formulas: ${JSON.stringify(current)}
User request: "${aiPrompt}"
Respond ONLY with valid JSON. Actions: "add", "organize", or "filter".`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
          })
        }
      );

      if (!res.ok) throw new Error(`API: ${res.status}`);
      const data = await res.json();
      let text = data.candidates[0].content.parts[0].text.trim();
      text = text.replace(/```(?:json)?/g, '').trim();
      const parsed = JSON.parse(text);

      if (parsed.action === 'add') {
        const newRef = push(ref(db, `${PUBLIC_BOARD_PATH}/elements`));
        await set(newRef, {
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
        });
        const z = maxZIndex + 1;
        setZIndexMap(p => ({ ...p, [newRef.key]: z }));
        setMaxZIndex(z);
      } else if (parsed.action === 'organize') {
        const updates = {};
        parsed.layout.forEach(l => { updates[l.id] = { x: l.x, y: l.y }; });
        await update(ref(db, `${PUBLIC_BOARD_PATH}/elements`), updates);
        setElements(prev => prev.map(e => {
          const l = parsed.layout.find(x => x.id === e.id);
          return l ? { ...e, x: l.x, y: l.y } : e;
        }));
      } else if (parsed.action === 'filter') {
        setElements(prev => prev.map(e => ({ ...e, highlight: parsed.ids.includes(e.id) })));
        setTimeout(() => setElements(prev => prev.map(({ highlight, ...rest }) => rest)), 3000);
      }
      setAiPrompt('');
    } catch (err) {
      console.error(err);
      alert(`AI failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderLatex = (latex, compact = false) => {
    try {
      return { __html: katex.renderToString(latex, { throwOnError: false, displayMode: !compact, trust: true }) };
    } catch {
      return { __html: latex };
    }
  };

  const truncateLatex = (latex) => latex.length > 30 ? latex.slice(0, 30) + '...' : latex;

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden relative"
         onMouseMove={handleGlobalMove} onMouseUp={handleGlobalUp}>
      
      {/* API Key Modal */}
      {showKeyInput && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h2 className="text-xl font-bold mb-3 text-gray-600">Gemini API Key</h2>
            <p className="text-gray-600 mb-3 text-xs">
              Get key from <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener" className="text-blue-500 underline">Google AI Studio</a>
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              onKeyPress={e => e.key === 'Enter' && saveApiKey()}
            />
            <button onClick={saveApiKey} className="w-full px-3 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium">
              Save & Continue
            </button>
          </div>
        </div>
      )}

      {/* Hover Popup */}
      {hoveredFormula?.type === 'formula' && (
        <div className="fixed z-50 bg-white text-gray-600 rounded-lg shadow-2xl p-4 border-2 border-blue-300 max-w-lg pointer-events-none"
             style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
          <div className="text-sm font-bold mb-2">{hoveredFormula.title}</div>
          <div className="overflow-auto" dangerouslySetInnerHTML={renderLatex(hoveredFormula.latex)} />
        </div>
      )}

      {/* Toolbar */}
      <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-40 bg-white/90 backdrop-blur rounded-xl shadow-lg px-4 py-2 flex items-center gap-2 text-sm">
        <span className="font-medium text-gray-700">Shared Whiteboard</span>
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
        <button onClick={() => setShowKeyInput(true)} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">🔑</button>
        <div className="h-6 w-px bg-gray-300" />
        <input
          type="text"
          value={aiPrompt}
          onChange={e => setAiPrompt(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleAI()}
          placeholder="Ask AI: 'Add Pythagorean theorem'"
          className="text-gray-600 px-3 py-1.5 w-64 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button onClick={handleAI} disabled={isProcessing} className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition disabled:opacity-50">
          <Wand2 size={14} /> {isProcessing ? '...' : 'AI'}
        </button>
      </div>

      {/* Canvas */}
      <div className="w-full h-screen overflow-auto pt-16">
        <div className="relative w-full h-full overflow-auto">
          {elements.map(el => (
            <div
              key={el.id}
              className={`absolute transition-transform ${el.highlight ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}
              style={{
                left: `${el.x}px`,
                top: `${el.y}px`,
                width: `${el.width}px`,
                height: `${el.height}px`,
                zIndex: zIndexMap[el.id] || 0,
                transform: draggedId === el.id ? 'scale(1.03) rotate(-1deg)' : 'none'
              }}
              onMouseDown={e => handleDragStart(e, el.id)}
              onMouseEnter={() => el.type === 'formula' && el.latex?.length > 30 && setHoveredFormula(el)}
              onMouseLeave={() => setHoveredFormula(null)}
            >
              <div className="relative w-full h-full rounded-lg shadow-lg hover:shadow-xl transition-shadow p-3 overflow-hidden"
                   style={{ backgroundColor: el.color, color: getContrastColor(el.color), fontFamily: "'Caveat', cursive" }}>
                <div className="flex justify-between items-start mb-2">
                  <input
                    type="text"
                    value={el.title}
                    onChange={e => updateElement(el.id, { title: e.target.value })}
                    className="text-base font-bold bg-transparent border-none outline-none w-full"
                    style={{ fontFamily: "'Caveat', cursive" }}
                  />
                  <button onClick={e => { e.stopPropagation(); deleteElement(el.id); }} className="text-red-500 hover:text-red-700">
                    <Trash2 size={12} />
                  </button>
                </div>

                {el.type === 'formula' ? (
                  <>
                    <div className="bg-white/60 rounded p-2 mb-2 text-center text-xs overflow-hidden"
                         dangerouslySetInnerHTML={renderLatex(truncateLatex(el.latex), true)} />
                    <input
                      type="text"
                      value={el.latex}
                      onChange={e => updateElement(el.id, { latex: e.target.value })}
                      placeholder="LaTeX formula"
                      className="w-full px-2 py-1 text-xs bg-white/40 rounded border border-gray-300 mb-1.5"
                    />
                    <div className="flex gap-1.5 mb-1.5 flex-wrap">
                      <input
                        type="text"
                        value={el.subject}
                        onChange={e => updateElement(el.id, { subject: e.target.value })}
                        className="px-2 py-0.5 text-xs bg-blue-200 rounded-full"
                        placeholder="Subject"
                      />
                      <input
                        type="text"
                        value={el.topic}
                        onChange={e => updateElement(el.id, { topic: e.target.value })}
                        className="px-2 py-0.5 text-xs bg-green-200 rounded-full"
                        placeholder="Topic"
                      />
                    </div>
                  </>
                ) : el.type === 'image' ? (
                  <div className="flex-1 mb-2 min-h-0">
                    <img src={el.url} alt={el.title} className="w-full h-full object-contain rounded" />
                    <input
                      type="text"
                      value={el.url}
                      onChange={e => updateElement(el.id, { url: e.target.value })}
                      placeholder="Image URL"
                      className="w-full px-2 py-1 text-xs bg-white/40 rounded border border-gray-300 mt-1"
                    />
                  </div>
                ) : null}

                <textarea
                  value={el.notes}
                  onChange={e => updateElement(el.id, { notes: e.target.value })}
                  placeholder="Notes..."
                  className="w-full px-2 py-1 text-xs bg-white/40 rounded border border-gray-300 resize-none"
                  rows={1}
                />
              </div>
              <div
                className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 cursor-se-resize rounded-full opacity-0 hover:opacity-100 transition-opacity"
                onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, el.id); }}
              />
            </div>
          ))}
        </div>
      </div>

      {elements.length === 0 && !showKeyInput && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400">
          <div className="text-center">
            <Camera size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-lg font-light">Add your first formula or image</p>
          </div>
        </div>
      )}

      <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
    </div>
  );
};

export default FormulaWhiteboard;