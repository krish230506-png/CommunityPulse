import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MicrophoneIcon, XMarkIcon, CheckCircleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { SparklesIcon } from '@heroicons/react/24/solid';

type Timer = ReturnType<typeof setTimeout>;

interface VoiceAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  apiBase: string;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [key: number]: {
      [key: number]: { transcript: string };
      isFinal: boolean;
    };
    length: number;
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

const LOCALIZED_QUESTIONS: Record<string, string[]> = {
  english: [
    "What type of emergency are you facing? For example: flood, fire, medical, food shortage, or water crisis.",
    "How many people are affected approximately?",
    "What is your location? Please say your city and area name.",
    "On a scale of 1 to 10, how urgent is this situation?"
  ],
  hindi: [
    "आप किस प्रकार के आपातकाल का सामना कर रहे हैं? उदाहरण के लिए: बाढ़, आग, चिकित्सा, या पानी का संकट।",
    "लगभग कितने लोग प्रभावित हैं?",
    "आपका स्थान क्या है? कृपया अपने शहर और क्षेत्र का नाम बताएं।",
    "1 से 10 के पैमाने पर, यह स्थिति कितनी जरूरी है?"
  ],
  marathi: [
    "तुम्हाला कोणत्या प्रकारची अडचण येत आहे? उदाहरणार्थ: पूर, आग, मेडिकल इमर्जन्सी, किंवा पाण्याची टंचाई.",
    "अंदाजे किती लोकांना मदतीची गरज आहे?",
    "तुमचं लोकेशन काय आहे? कृपया तुमच्या शहराचं आणि एरियाचं नाव सांगा.",
    "एक ते दहाच्या स्केलवर ही परिस्थिती किती गंभीर आहे?"
  ],
  tamil: [
    "நீங்கள் என்ன வகையான அவசரநிலையை எதிர்கொள்கிறீர்கள்? உதாரணத்திற்கு: வெள்ளம், தீ, மருத்துவம், அல்லது தண்ணீர் தட்டுப்பாடு.",
    "தோராயமாக எத்தனை பேர் பாதிக்கப்பட்டுள்ளனர்?",
    "உங்கள் இருப்பிடம் என்ன? உங்கள் நகரம் மற்றும் பகுதி பெயரைக் கூறவும்.",
    "1 முதல் 10 வரையிலான அளவில், இந்த நிலைமை எவ்வளவு அவசரமானது?"
  ],
  bengali: [
    "আপনি কোন ধরণের জরুরি অবস্থার সম্মুখীন হচ্ছেন? উদাহরণস্বরূপ: বন্যা, আগুন, চিকিৎসা, বা জলের সংকট।",
    "আনুমানিকভাবে কতজন লোক ক্ষতিগ্রস্ত?",
    "আপনার অবস্থান কী? দয়া করে আপনার শহর এবং এলাকার নাম বলুন।",
    "1 থেকে 10 এর স্কেলে, এই পরিস্থিতিটি কতটা জরুরি?"
  ],
  telugu: [
    "మీరు ఎలాంటి అత్యవసర పరిస్థితిని ఎదుర్కొంటున్నారు? ఉదాహరణకు: వరద, అగ్ని, వైద్య, లేదా నీటి సంక్షోభం.",
    "సుమారు ఎంత మంది ప్రభావితమయ్యారు?",
    "మీ స్థానం ఏమిటి? దయచేసి మీ నగరం మరియు ప్రాంతం పేరు చెప్పండి.",
    "1 నుండి 10 స్కేల్‌లో ఈ పరిస్థితి ఎంత అత్యవసరం?"
  ]
};

const LANG_CONFIG: Record<string, { code: string; label: string }> = {
  english: { code: 'en-IN', label: 'English' },
  hindi: { code: 'hi-IN', label: 'Hindi' },
  marathi: { code: 'mr-IN', label: 'Marathi' },
  tamil: { code: 'ta-IN', label: 'Tamil' },
  bengali: { code: 'bn-IN', label: 'Bengali' },
  telugu: { code: 'te-IN', label: 'Telugu' }
};

const SUCCESS_TRANSLATIONS: Record<string, { lang: string, text: string }> = {
  marathi: { lang: 'mr-IN', text: 'तुमची माहिती आम्हाला मिळाली आहे. लवकरच मदत पोहोचवली जाईल. धन्यवाद.' },
  tamil: { lang: 'ta-IN', text: 'உங்கள் அறிக்கை சமர்ப்பிக்கப்பட்டது. உதவி ஒருங்கிணைக்கப்படுகிறது. நன்றி.' },
  bengali: { lang: 'bn-IN', text: 'আপনার রিপোর্ট জমা দেওয়া হয়েছে। সাহায্যের সমন্বয় করা হচ্ছে। ধন্যবাদ।' },
  telugu: { lang: 'te-IN', text: 'మీ నివేదిక సమర్పించబడింది. సహాయం సమన్వయం చేయబడుతోంది. ధన్యవాదాలు.' },
  hindi: { lang: 'hi-IN', text: 'आपकी रिपोर्ट सबमिट कर दी गई है। सहायता समन्वিত की जा रही है। धन्यवाद।' },
  english: { lang: 'en-US', text: 'Your report has been submitted. Help is being coordinated. Thank you.' }
};

const parseUserLanguage = (text: string): string | null => {
  const lower = text.toLowerCase();
  if (lower.includes('hindi') || lower.includes('indi')) return 'hindi';
  if (lower.includes('marathi') || lower.includes('arati') || lower.includes('mara') || lower.includes('mura') || lower.includes('rati')) return 'marathi';
  if (lower.includes('tamil') || lower.includes('tami')) return 'tamil';
  if (lower.includes('bengali') || lower.includes('bangla') || lower.includes('beng')) return 'bengali';
  if (lower.includes('telugu') || lower.includes('telu')) return 'telugu';
  if (lower.includes('english') || lower.includes('eng')) return 'english';
  return null;
};

export default function VoiceAssistant({ isOpen, onClose, apiBase }: VoiceAssistantProps) {
  const [step, setStep] = useState<number>(-2);
  const [answers, setAnswers] = useState<string[]>([]);
  const [userLang, setUserLang] = useState<string>("english");
  const [currentText, setCurrentText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Correct types for Web Speech API
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const silenceTimerRef = useRef<Timer | null>(null);
  const maxDurationTimerRef = useRef<Timer | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stepRef = useRef(step);
  const answersRef = useRef(answers);
  const currentTextRef = useRef(currentText);
  const userLangRef = useRef(userLang);

  useEffect(() => {
    stepRef.current = step;
    answersRef.current = answers;
    currentTextRef.current = currentText;
    userLangRef.current = userLang;
  }, [step, answers, currentText, userLang]);

  const clearAllTimers = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
  };

  const resetFlow = () => {
    setStep(-2);
    setAnswers([]);
    setUserLang("english");
    setCurrentText("");
    setIsListening(false);
    setIsSpeaking(false);
  };

  const executeSpeech = (text: string, lang = 'en-US', onComplete?: () => void) => {
    if (isMuted || !isOpen) {
      if (onComplete) onComplete();
      return;
    }

    setIsSpeaking(true);
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    currentUtteranceRef.current = utterance;
    utterance.lang = lang;
    utterance.rate = 1.0;

    const voices = synthRef.current.getVoices();
    if (voices.length > 0) {
      const premiumVoice = voices.find(v => v.lang.includes(lang) && (v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Natural')));
      if (premiumVoice) {
        utterance.voice = premiumVoice;
      } else {
        let fallbackVoice = voices.find(v => v.lang.includes(lang));
        if (!fallbackVoice && (lang.includes('mr') || lang.includes('ta') || lang.includes('bn') || lang.includes('te') || lang.includes('gu'))) {
          fallbackVoice = voices.find(v => v.lang.includes('hi-IN'));
        }
        if (fallbackVoice) utterance.voice = fallbackVoice;
      }
    }

    let isCanceled = false;
    const timeout = setTimeout(() => {
      if (!isCanceled) {
        setIsSpeaking(false);
        if (onComplete) onComplete();
      }
    }, 12000);

    utterance.onend = () => {
      if (isCanceled) return;
      clearTimeout(timeout);
      setIsSpeaking(false);
      currentUtteranceRef.current = null;
      if (onComplete) onComplete();
    };

    utterance.onerror = (event) => {
      if (event.error === 'canceled') isCanceled = true;
      clearTimeout(timeout);
      currentUtteranceRef.current = null;
    };

    setTimeout(() => {
      if (!isCanceled) synthRef.current.speak(utterance);
    }, 50);
  };

  const startListening = () => {
    if (!isOpen) return;
    if (recognitionRef.current) {
      setCurrentText("");
      currentTextRef.current = "";
      setIsListening(true);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.debug('Recognition start failed:', e);
      }
    }
  };

  const askLanguage = () => {
    setCurrentText("");
    executeSpeech(
      "Which language are you comfortable in answering? Please say English, Hindi, Marathi, Tamil, Bengali, or Telugu.",
      'en-IN',
      () => {
        if (recognitionRef.current) recognitionRef.current.lang = 'en-IN';
        startListening();
      }
    );
  };

  const speakGreeting = () => {
    const fallback = setTimeout(() => {
      if (stepRef.current === -2) {
        setStep(-1);
        askLanguage();
      }
    }, 5000);

    executeSpeech(
      "Namaste. Welcome to CommunityPulse Emergency Reporter.",
      'en-IN',
      () => {
        clearTimeout(fallback);
        if (stepRef.current === -2) {
          setStep(-1);
          askLanguage();
        }
      }
    );
  };

  const askQuestion = (idx: number) => {
    setCurrentText("");
    const langKey = userLangRef.current || 'english';
    const questionText = LOCALIZED_QUESTIONS[langKey][idx];
    const synthLang = LANG_CONFIG[langKey].code;

    if (recognitionRef.current) {
      recognitionRef.current.lang = (idx === 2) ? 'en-IN' : synthLang;
    }

    executeSpeech(questionText, synthLang, () => {
      startListening();
    });
  };

  const submitReport = async (finalAnswers: string[]) => {
    setStep(4);
    setIsListening(false);

    const combinedReport = `Voice Report Transcript:
Language Setup: ${userLangRef.current}
Type of emergency: ${finalAnswers[0]}
People affected: ${finalAnswers[1]}
Location: ${finalAnswers[2]}
Urgency (1-10): ${finalAnswers[3]}
Note: Parse intelligently considering the user spoke in ${userLangRef.current}.`;

    try {
      await axios.post(`${apiBase}/ingest`, { text: combinedReport });
      setStep(5);
      const langKey = userLangRef.current || 'english';
      const targetLang = SUCCESS_TRANSLATIONS[langKey];

      executeSpeech(targetLang.text, targetLang.lang, () => {
        setTimeout(onClose, 3000);
      });
    } catch (e) {
      console.error("Voice report submission failed", e);
      executeSpeech("Sorry, there was an error submitting your report. Please try again.", 'en-US');
      setTimeout(onClose, 4000);
    }
  };

  const handleNext = async (explicitLang?: string) => {
    const finalAnswer = explicitLang || currentTextRef.current;
    if (recognitionRef.current) recognitionRef.current.abort();

    const currentStep = stepRef.current;

    if (currentStep === -1) {
      const detectedLang = parseUserLanguage(finalAnswer);
      if (!detectedLang) {
        setCurrentText("Language not caught clearly. Please click a button below.");
        setIsListening(false);
        return;
      }
      setUserLang(detectedLang);
      userLangRef.current = detectedLang;
      setStep(0);
      stepRef.current = 0;
      askQuestion(0);
      return;
    }

    if (currentStep >= 0 && currentStep < 4) {
      const newAnswers = [...answersRef.current];
      newAnswers[currentStep] = finalAnswer || "No answer provided";
      setAnswers(newAnswers);
      answersRef.current = newAnswers;
      const nextStep = currentStep + 1;
      setStep(nextStep);
      stepRef.current = nextStep;

      if (nextStep < 4) {
        askQuestion(nextStep);
      } else {
        submitReport(newAnswers);
      }
    }
  };

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        const recognition = new SpeechRec();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          if (final) {
            setCurrentText(final);
            currentTextRef.current = final;
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            handleNext(final);
          } else {
            setCurrentText(interim);
            currentTextRef.current = interim;
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            if (interim.trim().length > 0) {
              silenceTimerRef.current = setTimeout(() => {
                handleNext(interim);
              }, 2500);
            }
          }
        };

        recognition.onstart = () => {
          setIsListening(true);
          if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
          maxDurationTimerRef.current = setTimeout(() => {
            if (currentTextRef.current === "" || !currentTextRef.current) {
              handleNext();
            }
          }, 15000);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error("Speech Recognition Error", event.error);
          setIsListening(false);
          clearAllTimers();
        };

        recognition.onend = () => {
          setIsListening(false);
          clearAllTimers();
        };

        recognitionRef.current = recognition;
      }
    }

    const currentSynth = synthRef.current;
    return () => {
      currentSynth.cancel();
      if (recognitionRef.current) recognitionRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle flow when opened
  useEffect(() => {
    if (isOpen) {
      synthRef.current.cancel();
      synthRef.current.resume();
      // eslint-disable-next-line 
      resetFlow();
      speakGreeting();
    } else {
      synthRef.current.cancel();
      if (recognitionRef.current) recognitionRef.current.abort();
      clearAllTimers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[4000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0b1120] border border-blue-500/30 rounded-2xl w-full max-w-lg shadow-[0_0_50px_rgba(59,130,246,0.15)] overflow-hidden flex flex-col relative animate-slide-in">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.05]">
          <div className="flex items-center gap-3 text-indigo-400 font-bold">
            <SparklesIcon className="w-5 h-5" />
            <span className="tracking-wide">Emergency AI Reporter</span>
            {step >= 0 && (
              <span className="px-2 py-0.5 ml-2 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30 text-[10px] uppercase font-bold tracking-widest">
                Lang: {LANG_CONFIG[userLang]?.label || 'English'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newMuted = !isMuted;
                setIsMuted(newMuted);
                if (newMuted) {
                  synthRef.current.cancel();
                  setIsSpeaking(false);
                }
              }}
              className={`p-2 rounded-lg border transition-all ${isMuted ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
              title={isMuted ? "Unmute AI Voice" : "Mute AI Voice"}
            >
              {isMuted ? <span className="text-xs">🔇</span> : <span className="text-xs">🔊</span>}
            </button>
            <button onClick={() => {
              synthRef.current.cancel();
              if (recognitionRef.current) recognitionRef.current.abort();
              clearAllTimers();
              onClose();
            }} className="text-white/40 hover:text-white transition-colors">
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-8 flex flex-col items-center justify-center min-h-[300px] text-center relative">

          {/* Circular Animation Area */}
          <div className="relative flex justify-center items-center w-32 h-32 mb-8">
            {isListening && (
              <>
                <div className="absolute inset-0 border-[4px] border-blue-500/20 rounded-full animate-pulse-ring"></div>
                <div className="absolute inset-0 border-[4px] border-blue-500/10 rounded-full animate-pulse-ring" style={{ animationDelay: '0.4s' }}></div>
              </>
            )}
            <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${isListening ? 'bg-blue-600 shadow-[0_0_30px_rgba(37,99,235,0.6)] scale-110' : isSpeaking ? 'bg-indigo-600 animate-pulse' : 'bg-slate-800'}`}>
              {step === 5 ? <CheckCircleIcon className="w-10 h-10 text-white" /> : <MicrophoneIcon className={`w-10 h-10 text-white ${isListening ? 'animate-bounce' : ''}`} />}
            </div>
          </div>

          {/* Text Outputs */}
          {step === -2 && (
            <p className="text-xl font-medium text-white/90">Initializing Reporter...</p>
          )}

          {step === -1 && (
            <div className="w-full flex justify-center flex-col items-center">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">Language Selection</span>
              <p className="text-lg font-medium text-white mb-6 leading-relaxed">
                Which language are you comfortable in answering? Please say English, Hindi, Marathi, Tamil, Bengali, or Telugu.
              </p>
              <div className="h-16 w-full flex items-center justify-center italic text-blue-300 font-medium bg-blue-500/5 rounded-lg border border-blue-500/10 px-4 mb-4">
                {isListening ? (currentText || "Listening...") : (isSpeaking ? "Speaking..." : "Please wait...")}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                {['English', 'Hindi', 'Marathi', 'Tamil', 'Bengali', 'Telugu'].map(lang => (
                  <button
                    key={lang}
                    onClick={() => handleNext(lang)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600/20 hover:bg-blue-500/40 border border-blue-500/30 text-blue-200 transition-colors"
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step >= 0 && step < 4 && (
            <div className="w-full flex justify-center flex-col items-center">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">Question {step + 1} of 4</span>
              <p className="text-lg font-medium text-white mb-6 leading-relaxed">
                {LOCALIZED_QUESTIONS[userLang][step]}
              </p>
              <div className="h-16 w-full flex items-center justify-center italic text-blue-300 font-medium bg-blue-500/5 rounded-lg border border-blue-500/10 px-4">
                {isListening ? (currentText || "Listening...") : (isSpeaking ? "Speaking..." : "Please wait...")}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center">
              <span className="text-indigo-400 mb-2 font-medium">Processing Audio...</span>
              <p className="text-gray-400 text-sm">Transmitting to AI engine</p>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col items-center animate-fade-in">
              <p className="text-2xl font-bold text-green-400 mb-2">Report Submitted</p>
              <p className="text-gray-400 leading-relaxed max-w-[280px]">Help is being coordinated. Stay safe.</p>
            </div>
          )}

        </div>

        {step >= -1 && step < 4 && (
          <div className="p-4 bg-white/[0.02] border-t border-white/[0.05] flex justify-between items-center">
            <div className="text-[10px] text-white/20 italic">
              Tip: You can click the language buttons directly if audio is muted.
            </div>
            <button onClick={() => { synthRef.current.cancel(); setIsSpeaking(false); handleNext(); }} className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors">
              Skip / Next <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}