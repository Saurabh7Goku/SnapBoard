import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, RotateCw, BookOpen, Sparkles } from 'lucide-react';
import { MathTextbookRenderer } from './MathTextbookRenderer';

export const QAResponseEnhanced = ({
    qaResponse,
    qaLoading,
    onGenerateMore,
    onGenerateFlashcards,
    apiKey,
    currentTopic
}) => {
    const [showFlashcards, setShowFlashcards] = useState(false);
    const [flashcards, setFlashcards] = useState([]);
    const [currentCard, setCurrentCard] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [answeredCards, setAnsweredCards] = useState([]);
    const [showResults, setShowResults] = useState(false);
    const [loadingFlashcards, setLoadingFlashcards] = useState(false);
    const [wrongAnswersExplanation, setWrongAnswersExplanation] = useState('');
    const [loadingExplanations, setLoadingExplanations] = useState(false);

    const generateFlashcards = async () => {
        if (!apiKey) {
            alert('Set API key first!');
            return;
        }

        setLoadingFlashcards(true);
        setShowFlashcards(true);

        let retries = 0;
        const maxRetries = 3;
        const retryDelay = 2000; // 2 seconds

        const attemptGeneration = async () => {
            try {
                const prompt = `Based on the topic "${currentTopic}", create exactly 5 multiple-choice questions for GATE DA exam preparation.

CRITICAL: Respond ONLY with valid JSON in this EXACT format (no markdown, no extra text):
{
  "flashcards": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation why this is correct"
    }
  ]
}

Make questions progressively challenging. correctAnswer is the index (0-3) of the correct option.`;

                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { temperature: 0.8, maxOutputTokens: 3000 }
                        })
                    }
                );

                // Handle rate limiting (429 error)
                if (res.status === 429) {
                    if (retries < maxRetries) {
                        retries++;
                        console.log(`Rate limited. Retrying in ${retryDelay}ms... (Attempt ${retries}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                        return attemptGeneration();
                    } else {
                        throw new Error('API rate limit exceeded. Please try again in a few moments.');
                    }
                }

                if (!res.ok) throw new Error(`API Error: ${res.status}`);

                const data = await res.json();
                let text = data.candidates[0].content.parts[0].text.trim();
                text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

                const parsed = JSON.parse(text);
                setFlashcards(parsed.flashcards || []);
                setCurrentCard(0);
                setSelectedAnswer(null);
                setAnsweredCards([]);
                setShowResults(false);
                setWrongAnswersExplanation('');
            } catch (err) {
                alert(`Error generating flashcards: ${err.message}`);
                setShowFlashcards(false);
            } finally {
                setLoadingFlashcards(false);
            }
        };

        await attemptGeneration();
    };

    const handleAnswerSelect = (index) => {
        if (selectedAnswer !== null) return;

        setSelectedAnswer(index);
        const isCorrect = index === flashcards[currentCard].correctAnswer;

        setAnsweredCards([...answeredCards, {
            question: flashcards[currentCard].question,
            userAnswer: index,
            correctAnswer: flashcards[currentCard].correctAnswer,
            isCorrect,
            options: flashcards[currentCard].options
        }]);
    };

    const nextCard = () => {
        if (currentCard < flashcards.length - 1) {
            setCurrentCard(currentCard + 1);
            setSelectedAnswer(null);
        } else {
            setShowResults(true);
        }
    };

    const resetFlashcards = () => {
        setCurrentCard(0);
        setSelectedAnswer(null);
        setAnsweredCards([]);
        setShowResults(false);
        setWrongAnswersExplanation('');
    };

    const explainWrongAnswers = async () => {
        const wrongCards = answeredCards.filter(card => !card.isCorrect);
        if (wrongCards.length === 0) return;

        setLoadingExplanations(true);

        try {
            const questionsText = wrongCards.map((card, i) =>
                `Question ${i + 1}: ${card.question}\nYour answer: ${card.options[card.userAnswer]}\nCorrect answer: ${card.options[card.correctAnswer]}`
            ).join('\n\n');

            const prompt = `You are a patient GATE DA tutor. Explain these incorrect answers in the simplest way possible (like explaining to a beginner).

${questionsText}

For each question:
1. Explain why the correct answer is right (in simple terms)
2. Explain the concept step-by-step
3. Give a real-world analogy if possible
4. Point out common mistakes

Keep explanations clear, friendly, and easy to understand. Use plain English, avoid jargon.`;

            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent?key=${apiKey}&alt=sse`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
                    })
                }
            );

            if (!res.ok) throw new Error(`API Error: ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonStr = line.slice(6);
                            if (jsonStr.trim() === '[DONE]') continue;

                            const data = JSON.parse(jsonStr);
                            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

                            if (text) {
                                fullResponse += text;
                                setWrongAnswersExplanation(fullResponse);
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        } catch (err) {
            alert(`Error getting explanations: ${err.message}`);
        } finally {
            setLoadingExplanations(false);
        }
    };

    const correctCount = answeredCards.filter(c => c.isCorrect).length;
    const totalCount = answeredCards.length;

    return (
        <div>
            {/* Loading Modal Popup */}
            {loadingFlashcards && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
                        <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-6"></div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Generating Flashcards</h3>
                        <p className="text-gray-600">Creating practice questions for you...</p>
                    </div>
                </div>
            )}

            {/* Action Buttons - Only show when response is complete */}
            {qaResponse && !qaLoading && !showFlashcards && (
                <div className="flex gap-3 mb-6 pb-6 border-b border-gray-200 flex-wrap">
                    <button
                        onClick={onGenerateMore}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm hover:shadow-md font-medium"
                    >
                        <Sparkles size={18} />
                        <span>Generate More Questions</span>
                    </button>
                    <button
                        onClick={generateFlashcards}
                        data-action="generate-flashcards"
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 transition-all shadow-sm hover:shadow-md font-medium"
                    >
                        <BookOpen size={18} />
                        <span>Practice with Flashcards</span>
                    </button>
                </div>
            )}

            {/* Flashcards Interface - Modal Popup */}
            {showFlashcards && !loadingFlashcards && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        {showResults ? (
                            <div className="p-6">
                                <div className="text-center mb-6">
                                    <div className={`text-5xl font-bold mb-2 ${correctCount === totalCount ? 'text-green-600' : correctCount >= totalCount / 2 ? 'text-blue-600' : 'text-orange-600'}`}>
                                        {correctCount}/{totalCount}
                                    </div>
                                <p className="text-gray-700 text-lg font-medium">
                                    {correctCount === totalCount ? 'Perfect Score! 🎉' :
                                        correctCount >= totalCount / 2 ? 'Good Job! 👍' :
                                            'Keep Practicing! 💪'}
                                </p>
                            </div>

                            <div className="space-y-3 mb-6">
                                {answeredCards.map((card, i) => (
                                    <div key={i} className={`p-4 rounded-lg border-2 ${card.isCorrect ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                                        <div className="flex items-start gap-3">
                                            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${card.isCorrect ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                                                {i + 1}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-gray-900 font-medium mb-2">{card.question}</p>
                                                <div className="text-sm">
                                                    <span className={card.isCorrect ? 'text-green-700' : 'text-red-700'}>
                                                        Your answer: {card.options[card.userAnswer]}
                                                    </span>
                                                    {!card.isCorrect && (
                                                        <span className="block text-green-700 mt-1">
                                                            Correct: {card.options[card.correctAnswer]}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-3 flex-wrap">
                                <button
                                    onClick={resetFlashcards}
                                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-medium"
                                >
                                    <RotateCw size={18} />
                                    Try Again
                                </button>
                                {answeredCards.some(c => !c.isCorrect) && (
                                    <button
                                        onClick={explainWrongAnswers}
                                        disabled={loadingExplanations}
                                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium disabled:bg-gray-400"
                                    >
                                        <BookOpen size={18} />
                                        {loadingExplanations ? 'Loading...' : 'Explain Wrong Answers'}
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowFlashcards(false)}
                                    className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all font-medium"
                                >
                                    Close
                                </button>
                            </div>

                            {/* Wrong Answers Explanation */}
                            {wrongAnswersExplanation && (
                                <div className="mt-6 p-6 bg-blue-50 rounded-xl border-2 border-blue-200">
                                    <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                                        <BookOpen size={20} />
                                        Detailed Explanations
                                    </h3>
                                    <div className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">
                                        {wrongAnswersExplanation.split('\n').map((line, idx) => {
                                            // Convert **text** to bold
                                            const formatted = line.replace(/\*\*([^\*]+?)\*\*/g, '<strong style="font-weight: bold;">$1</strong>');
                                            // Convert *text* to italic
                                            const formatted2 = formatted.replace(/\*([^\*]+?)\*/g, '<em style="font-style: italic;">$1</em>');

                                            return <div key={idx} dangerouslySetInnerHTML={{ __html: formatted2 }} className="mb-2" />;
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : flashcards.length > 0 ? (
                        <div className="bg-white rounded-xl border-2 border-purple-200 p-6">
                            <div className="flex justify-between items-center mb-6">
                                <div className="text-sm font-medium text-gray-600">
                                    Question {currentCard + 1} of {flashcards.length}
                                </div>
                                <div className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                                    {correctCount} correct
                                </div>
                            </div>

                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-4">
                                    {flashcards[currentCard].question}
                                </h3>

                                <div className="space-y-3">
                                    {flashcards[currentCard].options.map((option, index) => {
                                        const isSelected = selectedAnswer === index;
                                        const isCorrect = index === flashcards[currentCard].correctAnswer;
                                        const showResult = selectedAnswer !== null;

                                        return (
                                            <button
                                                key={index}
                                                onClick={() => handleAnswerSelect(index)}
                                                disabled={selectedAnswer !== null}
                                                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${showResult
                                                    ? isCorrect
                                                        ? 'bg-green-50 border-green-500 text-green-900'
                                                        : isSelected
                                                            ? 'bg-red-50 border-red-500 text-red-900'
                                                            : 'bg-gray-50 border-gray-200 text-gray-600'
                                                    : 'bg-white border-gray-300 hover:border-purple-400 hover:bg-purple-50 text-gray-900'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${showResult
                                                        ? isCorrect
                                                            ? 'bg-green-500 text-white'
                                                            : isSelected
                                                                ? 'bg-red-500 text-white'
                                                                : 'bg-gray-300 text-gray-600'
                                                        : 'bg-purple-100 text-purple-700'
                                                        }`}>
                                                        {String.fromCharCode(65 + index)}
                                                    </div>
                                                    <span className="flex-1 font-medium">{option}</span>
                                                    {showResult && isCorrect && <span className="text-green-600 font-bold">✓</span>}
                                                    {showResult && isSelected && !isCorrect && <span className="text-red-600 font-bold">✗</span>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {selectedAnswer !== null && (
                                    <div className={`mt-4 p-4 rounded-lg ${selectedAnswer === flashcards[currentCard].correctAnswer
                                        ? 'bg-green-50 border-2 border-green-300'
                                        : 'bg-blue-50 border-2 border-blue-300'
                                        }`}>
                                        <p className="text-gray-800 leading-relaxed text-sm">
                                            {flashcards[currentCard].explanation}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center gap-3">
                                <button
                                    onClick={() => setShowFlashcards(false)}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                                >
                                    Exit
                                </button>
                                <button
                                    onClick={nextCard}
                                    disabled={selectedAnswer === null}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
                                >
                                    {currentCard < flashcards.length - 1 ? (
                                        <>
                                            Next <ChevronRight size={18} />
                                        </>
                                    ) : (
                                        'Show Results'
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
                </div>
            )}
        </div>
    );
};