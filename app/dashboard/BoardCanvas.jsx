import React, { useState, useCallback } from 'react';
import { Trash2, SquarePlus } from 'lucide-react';
import katex from 'katex';
import { db } from '../page';
import { ref, update, remove } from 'firebase/database';

export const BoardCanvas = ({ elements, currentBoard, user }) => {
    const [draggedId, setDraggedId] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [resizingId, setResizingId] = useState(null);
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const [zIndexMap, setZIndexMap] = useState({});
    const [maxZIndex, setMaxZIndex] = useState(0);
    const [hoveredFormula, setHoveredFormula] = useState(null);

    const updateElement = async (id, updates) => {
        if (!currentBoard) return;
        await update(ref(db, `boards/${currentBoard.id}/elements/${id}`), updates);
    };

    const deleteElement = async (id) => {
        if (!currentBoard) return;
        await remove(ref(db, `boards/${currentBoard.id}/elements/${id}`));
    };

    const getContrastColor = (bgColor) => {
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#1e293b' : '#f8fafc';
    };

    const renderLatex = (text) => {
        let processed = text;

        // FIRST: Process LaTeX BEFORE bullet points
        // Display math
        processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
            try {
                return `<div class="math-display my-3">${katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false })}</div>`;
            } catch {
                return match;
            }
        });

        // Inline math
        processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, latex) => {
            try {
                return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
            } catch {
                return match;
            }
        });

        // Bold (but NOT if it's part of LaTeX or already processed)
        processed = processed.replace(/\*\*([^\*]+?)\*\*/g, '<strong class="font-bold" style="color: #1f2937;">$1</strong>');

        // Bullet points - ONLY match lines that START with * (not mid-text)
        processed = processed.replace(/^(\*{1,2})\s+(.+)$/gim, (match, stars, content) => {
            const indent = stars.length === 2 ? 'ml-8' : 'ml-4';
            return `<li class="${indent}" style="color: #1f2937;">${content}</li>`;
        });

        processed = processed.replace(/(<li .*?<\/li>\n?)+/gs, '<ul class="list-disc space-y-2 my-3" style="color: #1f2937;">$&</ul>');

        return processed;
    };

    const normalizeZIndexes = (tappedId) => {
        const sortedElements = Object.entries(zIndexMap).sort(([, zA], [, zB]) => zA - zB);
        const newZIndexMap = {};
        sortedElements.forEach(([id], index) => {
            newZIndexMap[id] = index + 1;
        });
        const newMaxZ = sortedElements.length + 1;
        newZIndexMap[tappedId] = newMaxZ;
        setZIndexMap(newZIndexMap);
        setMaxZIndex(newMaxZ);
    };

    const handleDragStart = (e, id) => {
        if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
        setDraggedId(id);
        if (maxZIndex >= 1000) {
            normalizeZIndexes(id);
        } else {
            const newZ = maxZIndex + 1;
            setZIndexMap(p => ({ ...p, [id]: newZ }));
            setMaxZIndex(newZ);
        }
        const el = elements.find(f => f.id === id);
        setDragOffset({ x: e.clientX - el.x, y: e.clientY - el.y });
    };

    const handleGlobalMove = (e) => {
        if (draggedId) {
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
        const addRows = parseInt(prompt('How many additional rows?', '1')) || 0;
        const addCols = parseInt(prompt('How many additional columns?', '1')) || 0;
        if (addRows <= 0 && addCols <= 0) return;

        let newRows = [...el.rows];
        let newCols = [...el.columns];

        if (addCols > 0) {
            newCols = [...newCols, ...Array(addCols).fill('').map((_, i) => `Col ${newCols.length + i + 1}`)];
            newRows = newRows.map(row => ({ ...row, cells: [...row.cells, ...Array(addCols).fill('')] }));
        }
        if (addRows > 0) {
            for (let i = 0; i < addRows; i++) {
                newRows.push({ id: `row${Date.now()}-${i}`, cells: Array(newCols.length).fill('') });
            }
        }
        updateElement(el.id, { columns: newCols, rows: newRows });
    };

    const renderElement = useCallback((el) => {
        const zIndex = zIndexMap[el.id] || 0;
        const bgColor = el.color;
        const textColor = getContrastColor(bgColor);

        return (
            <div
                key={el.id}
                className={`absolute transition-transform duration-150 ease-out rounded-xl shadow-lg hover:shadow-2xl p-3 overflow-hidden ${el.type === 'image' ? 'border-4 border-dashed border-blue-300' : ''}`}
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
                            <button onClick={e => { e.stopPropagation(); addTableRowsCols(el); }} className="p-1 text-gray-600 hover:text-blue-600 rounded hover:bg-blue-100" title="Add rows/columns">
                                <SquarePlus size={14} />
                            </button>
                        )}
                        <button onClick={e => { e.stopPropagation(); deleteElement(el.id); }} className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-red-500 hover:text-white rounded">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>

                {el.type === 'formula' ? (
                    <div className="h-[calc(100%-60px)] flex flex-col">
                        <div className="bg-white/70 backdrop-blur rounded-lg p-2 mb-2 text-center text-sm overflow-hidden flex-grow text-black" style={{ minHeight: '40px', flex: '0 0 auto' }} dangerouslySetInnerHTML={renderLatex(el.latex, true)} />
                        <input type="text" value={el.latex} onChange={e => updateElement(el.id, { latex: e.target.value })} placeholder="LaTeX formula" className="w-full px-2 py-1 text-xs bg-white/50 backdrop-blur rounded border border-white/30 mb-2" />
                        <div className="flex gap-2 mb-2 flex-wrap">
                            <input type="text" value={el.subject} onChange={e => updateElement(el.id, { subject: e.target.value })} className="px-2 py-0.5 text-xs bg-blue-200/50 backdrop-blur rounded-full flex-1 min-w-0" placeholder="Subject" />
                            <input type="text" value={el.topic} onChange={e => updateElement(el.id, { topic: e.target.value })} className="px-2 py-0.5 text-xs bg-green-200/50 backdrop-blur rounded-full flex-1 min-w-0" placeholder="Topic" />
                        </div>
                        {el.height >= 180 && (
                            <textarea value={el.notes || ''} onChange={e => updateElement(el.id, { notes: e.target.value })} placeholder="Notes..." className="w-full px-2 py-1 text-xs bg-white/50 backdrop-blur rounded border border-white/30 resize-none overflow-hidden mt-1" style={{ height: 'auto', minHeight: '1.5rem', maxHeight: '150px', fontFamily: 'Caveat, cursive', lineHeight: '1' }} onInput={e => { const textarea = e.target; textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; }} />
                        )}
                    </div>
                ) : el.type === 'note' ? (
                    <>
                        <textarea style={{ fontFamily: 'Caveat, cursive' }} value={el.content} onChange={e => updateElement(el.id, { content: e.target.value })} className="w-full h-[calc(100%-40px)] px-2 py-1 bg-white/50 backdrop-blur rounded border border-white/30 resize-none text-black" placeholder="Write your note..." />
                        <textarea value={el.notes || ''} onChange={e => updateElement(el.id, { notes: e.target.value })} placeholder="Notes..." className="w-full px-2 py-1 text-xs bg-white/50 backdrop-blur rounded border border-white/30 resize-none overflow-hidden mt-1 text-black" style={{ height: 'auto', minHeight: '1.5rem', maxHeight: '150px', fontFamily: 'Caveat, cursive', lineHeight: '1' }} onInput={e => { const textarea = e.target; textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight}px`; }} />
                    </>
                ) : el.type === 'table' ? (
                    <div className="overflow-x-auto rounded-2xl border border-gray-300 shadow-sm bg-white/70 backdrop-blur-sm">
                        <table className="min-w-full border-collapse">
                            <thead>
                                <tr className="bg-gray-100 text-gray-800 text-sm font-semibold">
                                    {el.columns.map((col, i) => (
                                        <th key={i} className="px-2 py-2 border-b border-gray-300">
                                            <input type="text" value={col} onChange={(e) => { const newCols = [...el.columns]; newCols[i] = e.target.value; updateElement(el.id, { columns: newCols }); }} className="w-full bg-transparent text-center font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded-md px-1 py-1" />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {el.rows.map((row, i) => (
                                    <tr key={i} className={`text-sm ${i % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-indigo-50`}>
                                        {row.cells.map((cell, j) => (
                                            <td key={j} className="px-4 py-2 border-b border-gray-200 text-center">
                                                <input type="text" value={cell} onChange={(e) => { const newRows = [...el.rows]; newRows[i].cells[j] = e.target.value; updateElement(el.id, { rows: newRows }); }} className="w-full bg-transparent text-center focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded-md px-1 py-1" />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : el.type === 'image' && (
                    <div className="h-[calc(100%-40px)] flex flex-col">
                        <img src={el.url} alt={el.title} className="w-full h-full object-contain rounded" />
                        <textarea value={el.notes || ''} onChange={e => updateElement(el.id, { notes: e.target.value })} placeholder="Notes..." className="w-full px-2 py-0 text-xs bg-white/50 backdrop-blur rounded border border-white/30 resize-none mt-2" rows={2} />
                    </div>
                )}

                <div
                    className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize rounded-tl-lg opacity-0 group-hover:opacity-100"
                    onMouseDown={e => {
                        e.stopPropagation();
                        setResizingId(el.id);
                        setResizeStart({ x: e.clientX, y: e.clientY, width: el.width, height: el.height });
                    }}
                />
            </div>
        );
    }, [zIndexMap, updateElement, deleteElement, addTableRowsCols]);

    return (
        <div className="w-full h-full pt-20 overflow-auto" onMouseMove={handleGlobalMove} onMouseUp={() => { setDraggedId(null); setResizingId(null); }}>
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

            {hoveredFormula && (
                <div className="fixed z-100 bg-white rounded-xl shadow-2xl p-6 border-2 border-red-500 max-w-md w-full max-h-[80vh] overflow-auto"
                    style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', maxHeight: '80vh' }}>
                    <div className="text-sm font-bold mb-3 text-gray-700">{hoveredFormula.title}</div>
                    <div className="text-black overflow-auto" dangerouslySetInnerHTML={renderLatex(hoveredFormula.latex)} />
                </div>
            )}
        </div>
    );
};