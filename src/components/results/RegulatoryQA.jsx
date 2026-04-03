import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { answerRegulatoryQuestion } from '../../engine/aiAnalysis.js';

const SUGGESTED_QUESTIONS = [
  'Why didn\'t I qualify for SFDR Article 9?',
  'What\'s the fastest way to achieve EU Taxonomy alignment?',
  'What CSRD disclosures do I need to prepare?',
  'How do TCFD requirements apply to my project?'
];

export default function RegulatoryQA({ formData, results }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  if (!import.meta.env.VITE_ANTHROPIC_API_KEY) return null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(q) {
    const text = (q || question).trim();
    if (!text || loading) return;

    setQuestion('');
    const userMsg = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    let answer = '';
    const assistantMsg = { role: 'assistant', text: '' };
    setMessages(prev => [...prev, assistantMsg]);

    const newHistory = [...conversationHistory, { role: 'user', content: text }];

    try {
      for await (const chunk of answerRegulatoryQuestion(text, results, formData, newHistory)) {
        answer += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', text: answer };
          return updated;
        });
      }
      setConversationHistory([...newHistory, { role: 'assistant', content: answer }]);
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: 'Sorry, I couldn\'t answer that right now. Please try again.' };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <button
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-teal-600" />
          <span className="font-semibold text-slate-800">Regulatory Q&A</span>
          <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">Ask Claude</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {messages.length === 0 && (
            <div className="p-4 space-y-2">
              <p className="text-xs text-slate-500 font-medium px-1">Suggested questions:</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(q)}
                    className="text-xs bg-teal-50 hover:bg-teal-100 text-teal-700 px-3 py-1.5 rounded-full transition-colors border border-teal-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="max-h-80 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] text-sm rounded-xl px-3 py-2 leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-teal-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {msg.text || <span className="inline-block w-1 h-3.5 bg-slate-400 animate-pulse align-middle" />}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          <div className="p-3 border-t border-slate-100 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask a regulatory question…"
              disabled={loading}
              className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={!question.trim() || loading}
              className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
