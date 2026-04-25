import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { PaperAirplaneIcon, TrashIcon, SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { NeedEntity, VolunteerProfile } from '../types';

const API_BASE = 'http://localhost:3000';

interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

const QUICK_CHIPS = [
  "Which area needs help most urgently?",
  "Summarize all open crises",
  "How many volunteers are available?",
  "What resources are missing right now?"
];

export default function AiAssistantPage({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // Initialize with welcome message on mount
    setMessages([{
      role: 'model',
      content: 'Namaste! I am CommunityPulse AI. I can analyze real-time live data of crises and volunteers. How can I help you coordinate today?',
      timestamp: new Date().getTime()
    }]);
  }, []);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickChips, setShowQuickChips] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (textToUse: string) => {
    if (!textToUse.trim()) return;

    const newMsg: Message = { role: 'user', content: textToUse.trim(), timestamp: new Date().getTime() };
    const updatedMessages = [...messages, newMsg];
    
    setMessages(updatedMessages);
    setInputText("");
    setIsTyping(true);

    try {
      // Fetch Live Context
      const [needsRes, volunteersRes] = await Promise.all([
        axios.get(`${API_BASE}/needs`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/volunteers`).catch(() => ({ data: [] }))
      ]);

      const contextData = {
        // TOP PRIORITY FIX: Only send the most critical items to ensure we NEVER hit 413 limits 
        // and keep the AI focused on the actual emergencies.
        activeIncidents: (needsRes.data || [])
          .filter((n: NeedEntity) => n.status !== 'RESOLVED')
          .sort((a: NeedEntity, b: NeedEntity) => (b.criticalityScore || 0) - (a.criticalityScore || 0))
          .slice(0, 15) // Only top 15 most urgent
          .map((n: NeedEntity) => ({
            loc: n.location.name,
            type: n.crisisType,
            score: Math.round(n.criticalityScore || 0),
            scale: n.estimatedScale
          })),
        
        resolvedIncidentsCount: (needsRes.data || []).filter((n: NeedEntity) => n.status === 'RESOLVED').length,
        
        // Only send top 25 volunteers
        volunteers: (volunteersRes.data || [])
          .slice(0, 25) 
          .map((v: VolunteerProfile) => ({
            name: v.name,
            skills: v.skills,
            available: v.status === 'AVAILABLE'
          })),
      };

      const res = await axios.post(`${API_BASE}/chat`, {
        messages: updatedMessages,
        contextData
      });

      // Directly use the server response even if it contains an error emoji
      setMessages(prev => [...prev, {
        role: 'model',
        content: res.data.text || "⚠️ Received empty response from intelligence server.",
        timestamp: new Date().getTime()
      }]);
    } catch (err: unknown) {
      console.error("Chat error:", err);
      let serverError = "Connection failed";
      if (axios.isAxiosError(err)) {
        serverError = err.response?.data?.error || err.message;
      } else if (err instanceof Error) {
        serverError = err.message;
      }
      
      setMessages(prev => [...prev, {
        role: 'model',
        content: `⚠️ Technical Connection Failed: ${serverError}`,
        timestamp: new Date().getTime()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend(inputText);
    }
  };

  const handleClear = () => {
    if (window.confirm("Clear all chat history?")) {
      setMessages([{
        role: 'model',
        content: 'Chat cleared. How can I assist you?',
        timestamp: new Date().getTime()
      }]);
    }
  };

  return (
    <div className="h-full flex flex-col bg-transparent relative">
      {/* Header - Hidden when embedded in dashboard */}
      {!isEmbedded && (
        <div className="flex-shrink-0 p-6 border-b border-white/[0.06] flex justify-between items-center bg-[#0B1120]">
          <div>
            <h1 className="text-[1.6rem] font-bold text-white flex items-center gap-3">
              <SparklesIcon className="w-8 h-8 text-[#00bcd4]" /> 
              CommunityPulse AI Assistant
            </h1>
            <p className="text-[#8B9CB8] text-sm mt-1 mb-0">Ask anything about current crises, volunteers, and resource gaps</p>
          </div>
          <button 
            onClick={handleClear}
            className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
          >
            <TrashIcon className="w-4 h-4" /> Clear Chat
          </button>
        </div>
      )}

      {isEmbedded && (
        <div className="flex-shrink-0 p-4 border-b border-white/[0.06] flex justify-between items-center bg-[#0B1120]">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-[#00bcd4]" /> AI Assistant
          </h2>
          <button onClick={handleClear} className="text-[10px] text-red-400 font-bold hover:text-red-300 transition-colors uppercase tracking-widest">Clear</button>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {messages.map((msg, i) => (
          <div key={i} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              className={`max-w-[75%] rounded-2xl p-4 shadow-lg flex flex-col relative ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-sm' 
                  : 'bg-[#121927] border border-[#00bcd4]/30 text-gray-200 rounded-tl-sm'
              }`}
            >
              {msg.role === 'model' && (
                <div className="absolute -top-3 -left-2 bg-[#0B1120] rounded-full p-1 border border-[#00bcd4]/50 shadow-md">
                  <SparklesIcon className="w-4 h-4 text-[#00bcd4]" />
                </div>
              )}
              
              <div className="text-[0.95rem] leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>
              
              <span className={`text-[10px] mt-2 font-mono font-medium opacity-60 text-right`}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex w-full justify-start">
            <div className="bg-[#121927] border border-[#00bcd4]/30 rounded-2xl rounded-tl-sm p-4 shadow-lg flex items-center gap-2">
               <span className="text-sm font-medium text-[#00bcd4]">CommunityPulse AI is thinking</span>
               <div className="flex gap-1 ml-1">
                 <div className="w-1.5 h-1.5 bg-[#00bcd4] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                 <div className="w-1.5 h-1.5 bg-[#00bcd4] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                 <div className="w-1.5 h-1.5 bg-[#00bcd4] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
               </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-6 bg-[#0B1120] border-t border-white/[0.06]">
        {/* Chips */}
        {showQuickChips && (
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            {QUICK_CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => handleSend(chip)}
                className="bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors"
              >
                {chip}
              </button>
            ))}
            <button 
              onClick={() => setShowQuickChips(false)}
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-all"
              title="Hide suggestions"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="relative flex items-center">
          <input 
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about live crises, volunteer availability, or dispatch recommendations..."
            className="w-full bg-[#16202E] border border-white/10 rounded-xl py-4 pl-5 pr-14 text-white text-sm focus:outline-none focus:border-[#00bcd4]/50 focus:shadow-[0_0_15px_rgba(0,188,212,0.15)] transition-all"
            disabled={isTyping}
          />
          <button 
            onClick={() => handleSend(inputText)}
            disabled={!inputText.trim() || isTyping}
            className="absolute right-3 bg-[#00bcd4] hover:bg-[#26c6da] disabled:bg-gray-600 disabled:cursor-not-allowed text-[#0B1120] p-2 rounded-lg transition-colors"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-500 mt-3 font-medium tracking-wide font-mono">
          AI generated responses may be inaccurate. Verify critical data before dispatching resources.
        </p>
      </div>
    </div>
  );
}
