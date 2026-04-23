import React, { useState, useEffect, useRef } from 'react';
import { MicrophoneIcon, PhoneXMarkIcon } from '@heroicons/react/24/solid';

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
}

export default function VoiceCallModal({ isOpen, onClose, onSubmit }: VoiceCallModalProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
      }
      setIsListening(false);
      setTranscript('');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Chrome.");
      onClose();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
    };

    recognition.onresult = (event: any) => {
      let currentTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();

  }, [isOpen, onClose]);

  const handleEndCall = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }
    if (transcript.trim()) {
      onSubmit(transcript);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1e1e1e] border border-gray-700 rounded-3xl w-[320px] h-[540px] flex flex-col items-center py-12 relative shadow-2xl overflow-hidden">
        
        <h2 className="text-gray-400 font-semibold tracking-widest uppercase text-sm mb-2">Emergency AI</h2>
        <p className="text-white text-2xl font-bold mb-12">00:{isListening ? '08' : '00'}</p>

        {/* Pulsing Avatar/Mic */}
        <div className="relative flex items-center justify-center mb-16">
          {isListening && (
            <>
              <div className="absolute w-32 h-32 bg-blue-500/20 rounded-full animate-ping"></div>
              <div className="absolute w-40 h-40 bg-blue-500/10 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
            </>
          )}
          <div className={`w-24 h-24 rounded-full flex items-center justify-center z-10 transition-colors duration-500 ${isListening ? 'bg-blue-600' : 'bg-gray-700'}`}>
            <MicrophoneIcon className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* Live Transcript */}
        <div className="px-6 text-center h-20 overflow-hidden flex items-center justify-center mb-auto">
          <p className="text-gray-300 italic text-sm">
            {transcript || (isListening ? "Listening..." : "Connecting...")}
          </p>
        </div>

        {/* End Call Button */}
        <button
          onClick={handleEndCall}
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg transition-transform active:scale-95"
        >
          <PhoneXMarkIcon className="w-8 h-8 text-white" />
        </button>
      </div>
    </div>
  );
}
