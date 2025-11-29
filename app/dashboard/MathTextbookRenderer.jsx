import React, { useEffect, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Converts plain text mathematical expressions to LaTeX format
 * Handles common mathematical notations and symbols
 */
const convertToLatex = (text) => {
  if (!text) return text;

  let result = text;

  // Common mathematical symbols and their LaTeX equivalents
  const symbolMap = {
    '∑': '\\sum',
    '∏': '\\prod',
    '∫': '\\int',
    '√': '\\sqrt',
    '±': '\\pm',
    '≈': '\\approx',
    '≠': '\\neq',
    '≤': '\\leq',
    '≥': '\\geq',
    '∞': '\\infty',
    'π': '\\pi',
    'θ': '\\theta',
    'μ': '\\mu',
    'σ': '\\sigma',
    'λ': '\\lambda',
    'α': '\\alpha',
    'β': '\\beta',
    'γ': '\\gamma',
    'δ': '\\delta',
  };

  // Replace symbols
  Object.entries(symbolMap).forEach(([symbol, latex]) => {
    result = result.replace(new RegExp(symbol, 'g'), latex);
  });

  return result;
};

/**
 * Safely renders LaTeX using KaTeX
 */
const renderLatex = (latex) => {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
    });
  } catch (e) {
    return latex;
  }
};

/**
 * Renders LaTeX in display mode (block-level)
 */
const renderLatexDisplay = (latex) => {
  try {
    return katex.renderToString(latex, {
      throwOnError: false,
      displayMode: true,
    });
  } catch (e) {
    return latex;
  }
};

/**
 * Detects and extracts mathematical expressions from text
 * Supports both inline ($...$) and display ($$...$$) formats
 */
const parseTextWithMath = (text) => {
  const parts = [];
  let lastIndex = 0;

  // Pattern for display math ($$...$$)
  const displayMathRegex = /\$\$([^\$]+)\$\$/g;
  let match;

  while ((match = displayMathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }
    parts.push({
      type: 'displayMath',
      content: match[1],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex);
    // Now parse inline math in the remaining text
    const inlineParts = parseInlineMath(remaining);
    parts.push(...inlineParts);
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
};

/**
 * Parses inline math ($...$) from text
 */
const parseInlineMath = (text) => {
  const parts = [];
  let lastIndex = 0;
  const inlineMathRegex = /\$([^\$]+)\$/g;
  let match;

  while ((match = inlineMathRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }
    parts.push({
      type: 'inlineMath',
      content: match[1],
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
};

/**
 * Main component for rendering mathematical textbook-style content
 */
export const MathTextbookRenderer = ({ content, isLoading = false }) => {
  const [renderedContent, setRenderedContent] = useState([]);

  useEffect(() => {
    if (!content) return;

    const lines = content.split('\n');
    const processed = [];

    lines.forEach((line, idx) => {
      const trimmedLine = line.trim();

      // Skip empty lines but preserve spacing
      if (!trimmedLine) {
        processed.push({ type: 'spacing', key: `spacing-${idx}` });
        return;
      }

      // Main Section headers (SECTION 1:, SECTION 2:, etc.)
      if (/^SECTION \d+:/.test(trimmedLine)) {
        const sectionNumber = trimmedLine.match(/SECTION (\d+)/)?.[1] || '';
        const sectionTitle = trimmedLine.replace(/SECTION \d+:\s*/, '');

        processed.push({
          type: 'sectionHeader',
          key: `section-${idx}`,
          number: sectionNumber,
          title: sectionTitle,
        });
        return;
      }

      // Section headers with --- prefix
      if (trimmedLine.startsWith('---') && trimmedLine.includes('SECTION')) {
        const sectionText = trimmedLine.replace(/---/g, '').trim();
        const sectionNumber = sectionText.match(/SECTION (\d+)/)?.[1] || '';
        const sectionTitle = sectionText.replace(/SECTION \d+:\s*/, '');

        processed.push({
          type: 'sectionHeader',
          key: `section-${idx}`,
          number: sectionNumber,
          title: sectionTitle,
        });
        return;
      }

      // Regular --- dividers
      if (trimmedLine === '---') {
        processed.push({ type: 'divider', key: `divider-${idx}` });
        return;
      }

      // Problem headers
      if (/^(Problem \d+:|^\d+$)/.test(trimmedLine)) {
        if (/^\d+$/.test(trimmedLine)) {
          processed.push({ type: 'spacing', key: `spacing-${idx}` });
          return;
        }

        const problemMatch = trimmedLine.match(/Problem (\d+):(.*)/);
        const problemNum = problemMatch?.[1] || trimmedLine.match(/\d+/)?.[0] || '';
        const problemText = problemMatch?.[2]?.trim() || '';

        processed.push({
          type: 'problemHeader',
          key: `problem-${idx}`,
          number: problemNum,
          text: problemText,
        });
        return;
      }

      // Solution: label
      if (trimmedLine === 'Solution' || trimmedLine.startsWith('Solution:')) {
        processed.push({
          type: 'solutionLabel',
          key: `solution-${idx}`,
        });
        return;
      }

      // Answer: label
      if (trimmedLine.startsWith('Answer:') || trimmedLine.startsWith('Final Answer:')) {
        const answerText = trimmedLine.replace(/^(Final )?Answer:\s*/, '').trim();
        processed.push({
          type: 'answerLabel',
          key: `answer-${idx}`,
          text: answerText,
        });
        return;
      }

      // Numbered lists
      if (/^\d+\.?\s/.test(trimmedLine)) {
        const number = trimmedLine.match(/^(\d+)/)?.[1];
        const content = trimmedLine.replace(/^\d+\.?\s*/, '');

        processed.push({
          type: 'numberedListItem',
          key: `list-${idx}`,
          number,
          content,
        });
        return;
      }

      // Subsection headers (ends with : and is short)
      if (
        trimmedLine.endsWith(':') &&
        trimmedLine.length < 80 &&
        !trimmedLine.startsWith('Problem') &&
        !trimmedLine.startsWith('Solution') &&
        !trimmedLine.startsWith('Answer')
      ) {
        processed.push({
          type: 'subsectionHeader',
          key: `subsection-${idx}`,
          text: trimmedLine,
        });
        return;
      }

      // Regular paragraphs
      if (trimmedLine) {
        processed.push({
          type: 'paragraph',
          key: `para-${idx}`,
          text: trimmedLine,
        });
        return;
      }
    });

    setRenderedContent(processed);
  }, [content]);

  const renderPart = (part) => {
    switch (part.type) {
      case 'spacing':
        return <div key={part.key} className="h-2"></div>;

      case 'divider':
        return <div key={part.key} className="my-8 border-t-2 border-gray-300"></div>;

      case 'sectionHeader':
        return (
          <div key={part.key} className="mt-10 mb-6 first:mt-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 text-white font-bold text-xl shadow-md">
                {part.number}
              </div>
              <h2 className="text-3xl font-extrabold text-gray-900 uppercase tracking-wider">
                {part.title}
              </h2>
            </div>
            <div className="h-1.5 bg-gradient-to-r from-blue-600 via-blue-400 to-transparent rounded-full"></div>
          </div>
        );

      case 'problemHeader':
        return (
          <div key={part.key} className="mt-8 mb-4">
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 border-l-4 border-purple-600 rounded-r-lg p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-600 text-white font-bold text-lg flex items-center justify-center shadow-md">
                  {part.number}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-purple-900 mb-2">Problem {part.number}</h3>
                  {part.text && (
                    <div className="text-gray-800 leading-relaxed font-medium">
                      {parseTextWithMath(part.text).map((p, i) => (
                        <span key={i}>
                          {p.type === 'text' && p.content}
                          {p.type === 'inlineMath' && (
                            <span
                              className="inline-block mx-1"
                              dangerouslySetInnerHTML={{
                                __html: renderLatex(p.content),
                              }}
                            />
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'solutionLabel':
        return (
          <div key={part.key} className="mt-6 mb-4">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-green-100 to-green-50 border-2 border-green-300 px-5 py-3 rounded-lg shadow-sm">
              <div className="w-3 h-3 bg-green-600 rounded-full"></div>
              <span className="font-bold text-green-800 text-lg uppercase tracking-wide">Solution</span>
            </div>
          </div>
        );

      case 'answerLabel':
        return (
          <div key={part.key} className="mt-6 mb-4">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-green-600 rounded-r-lg p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="font-bold text-green-800 text-lg uppercase tracking-wide flex-shrink-0">
                  Final Answer:
                </span>
                <div className="text-gray-900 font-semibold text-lg">
                  {parseTextWithMath(part.text).map((p, i) => (
                    <span key={i}>
                      {p.type === 'text' && p.content}
                      {p.type === 'inlineMath' && (
                        <span
                          className="inline-block mx-1 katex-text"
                          style={{ color: '#1f2937' }}
                          dangerouslySetInnerHTML={{
                            __html: renderLatex(p.content),
                          }}
                        />
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 'numberedListItem':
        return (
          <div key={part.key} className="flex gap-4 my-4 pl-2">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center mt-0.5 shadow-sm">
              {part.number}
            </div>
            <div className="flex-1 pt-0.5">
              {parseTextWithMath(part.content).map((p, i) => (
                <span key={i}>
                  {p.type === 'text' && (
                    <span className="text-gray-800 leading-relaxed">{p.content}</span>
                  )}
                  {p.type === 'inlineMath' && (
                    <span
                      className="inline-block mx-1 katex-text"
                      style={{ color: '#1f2937' }}
                      dangerouslySetInnerHTML={{
                        __html: renderLatex(p.content),
                      }}
                    />
                  )}
                </span>
              ))}
            </div>
          </div>
        );

      case 'subsectionHeader':
        return (
          <div key={part.key} className="mt-6 mb-3">
            <h4 className="text-lg font-bold text-gray-900 flex items-center gap-3">
              <div className="w-1.5 h-6 bg-gradient-to-b from-blue-600 to-blue-400 rounded-full"></div>
              {part.text}
            </h4>
          </div>
        );

      case 'paragraph':
        // Check if paragraph contains mathematical symbols or formulas
        const hasMath = /[=≈≠<>±∑∏∫√π]|\$/.test(part.text);

        return (
          <div key={part.key} className={hasMath ? 'my-4 pl-6 border-l-3 border-blue-300 bg-blue-50 py-3 px-4 rounded-r-lg' : 'my-4'}>
            <p className={hasMath ? 'text-gray-900 font-mono text-base leading-relaxed' : 'text-gray-800 leading-relaxed text-base'}>
              {parseTextWithMath(part.text).map((p, i) => (
                <span key={i}>
                  {p.type === 'text' && p.content}
                  {p.type === 'inlineMath' && (
                    <span
                      className="inline-block mx-1 align-middle katex-text"
                      style={{ color: '#1f2937' }}
                      dangerouslySetInnerHTML={{
                        __html: renderLatex(p.content),
                      }}
                    />
                  )}
                  {p.type === 'displayMath' && (
                    <div
                      className="my-3 p-4 bg-white rounded-lg border border-blue-200 overflow-x-auto"
                      dangerouslySetInnerHTML={{
                        __html: renderLatexDisplay(p.content),
                      }}
                    />
                  )}
                </span>
              ))}
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 bg-white rounded-xl shadow-lg">
      <div className="prose prose-lg max-w-none">
        {renderedContent.map((part) => renderPart(part))}
        {isLoading && (
          <div className="mt-6 flex items-center gap-2">
            <span className="animate-pulse text-blue-600 text-2xl font-bold">▊</span>
            <span className="text-gray-600 font-medium">Generating content...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MathTextbookRenderer;
