import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import type { NeedEntity, VolunteerProfile, Prediction } from './types';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { formatDistanceToNow, differenceInMinutes, format } from 'date-fns';
import { BoltIcon, ExclamationTriangleIcon, PaperAirplaneIcon, SignalIcon, SignalSlashIcon, MicrophoneIcon, StopCircleIcon, BellAlertIcon, PhoneIcon, ChevronLeftIcon, SparklesIcon, CameraIcon, XMarkIcon as XMarkMini } from '@heroicons/react/24/outline';
import { saveOfflineReport, syncOfflineReports, clearOfflineQueue } from './offlineSync';

import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import VolunteersPage from './pages/VolunteersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import HistoryPage from './pages/HistoryPage';
import AiAssistantPage from './pages/AiAssistantPage';
import VoiceAssistant from './components/VoiceAssistant';
import VoiceCallModal from './components/VoiceCallModal';
import PredictionAlertBar from './components/PredictionAlertBar';

const API_BASE = 'http://localhost:3000';

if (typeof window !== 'undefined') {
  (window as unknown as { L: typeof L }).L = L;
}

const mapContainerStyle = { width: '100%', height: '100%', borderRadius: '0.75rem' };
const center: [number, number] = [20.5937, 78.9629];

// Custom Heatmap Layer using leaflet.heat
function HeatmapOverlay({ data }: { data: { lat: number, lng: number, weight: number }[] }) {
  const map = useMap();

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Heatmap data format: [[lat, lng, intensity], ...]
    const points = data.map(p => [p.lat, p.lng, p.weight]);

    // @ts-expect-error - leaflet.heat is a plugin
    if (!L.heatLayer) {
      console.warn("Leaflet.heat not loaded yet...");
      return;
    }
    // @ts-expect-error - leaflet.heat is a plugin
    const heatLayer = L.heatLayer(points, {
      radius: 25,
      blur: 15,
      max: 100,
      gradient: {
        0.0: 'rgba(0, 255, 0, 0)',
        0.2: 'rgba(0, 255, 0, 1)',
        0.4: 'rgba(173, 255, 47, 1)',
        0.6: 'rgba(255, 215, 0, 1)',
        0.8: 'rgba(255, 140, 0, 1)',
        1.0: 'rgba(255, 0, 0, 1)'
      }
    }).addTo(map);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [data, map]);

  return null;
}

// Add this component to handle map re-centering
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }, [center, zoom, map]);
  return null;
}

export default function App() {
  const [needs, setNeeds] = useState<NeedEntity[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<NeedEntity | null>(null);
  const [dispatchResult, setDispatchResult] = useState<{ volunteer: VolunteerProfile, dispatchMessage: string } | null>(null);
  const [loadingDispatch, setLoadingDispatch] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [shake, setShake] = useState(false);

  // Offline UI
  const [offlineSyncMessage, setOfflineSyncMessage] = useState<string | null>(null);

  // Ingest form
  const [ingestText, setIngestText] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [ingestStatusColor, setIngestStatusColor] = useState<string>('text-blue-400');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio Recording — now uses Web Speech API (SpeechRecognition)
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Sidebar State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });

  // Time state for pure rendering of 'time ago' strings
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // AI Chat Panel State
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);

  // Predictions State
  const [predictions, setPredictions] = useState<Prediction[]>([]);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', isSidebarCollapsed.toString());
  }, [isSidebarCollapsed]);

  // UI State
  const [mapLayer, setMapLayer] = useState<'dark' | 'satellite'>('dark');
  const [criticalAlerts, setCriticalAlerts] = useState<NeedEntity[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'score_desc' | 'score_asc' | 'city' | 'sla' | 'type'>('newest');

  // New Layout State
  const [showBanner, setShowBanner] = useState(true);
  const [timeStr, setTimeStr] = useState(new Date().toLocaleTimeString());

  const location = useLocation();
  const navigate = useNavigate();



  useEffect(() => {
    const fetchPredictions = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/predictions`);
        setPredictions(res.data.predictions || []);
      } catch (err) {
        console.error('Error fetching predictions for map:', err);
      }
    };
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString());
    }, 1000); // Update every second for live timers
    return () => clearInterval(timer);
  }, []);

  const handleClearSelection = () => {
    setSelectedNeed(null);
    setDispatchResult(null);
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClearSelection();
        setIsAiChatOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const fetchVolunteers = async () => {
    try {
      const response = await axios.get(`${API_BASE}/volunteers`);
      setVolunteers(response.data);
    } catch (e) {
      console.error("Error fetching volunteers:", e);
    }
  };

  useEffect(() => {
    void fetchVolunteers();
  }, []);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [simCount, setSimCount] = useState(0);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mockScenarios = [
    "Severe earthquake in Gujarat near Kutch. Buildings damaged, people need shelter.",
    "Major train derailment in Odisha near Balasore. Many passengers injured, need urgent medical help.",
    "Cyclonic storm hitting Vizag beach area. Trees uprooted, power lines down, need rescue teams.",
    "Landslide in Shimla near Mall Road. Road blocked, 2 buses stuck, need infrastructure support.",
    "Heatwave alert in Rajasthan. Water scarcity in rural villages, need water distribution."
  ];

  const stopSimulation = () => {
    if (simTimerRef.current) clearInterval(simTimerRef.current);
    setIsSimulating(false);
    setSimCount(0);
  };

  const startSimulation = () => {
    setIsSimulating(true);
    setSimCount(0);

    let count = 0;
    const triggerSim = async () => {
      const scenario = mockScenarios[Math.floor(Math.random() * mockScenarios.length)];
      try {
        await axios.post(`${API_BASE}/ingest`, { text: scenario });
      } catch (err) {
        console.error("Simulated ingestion failed:", err);
      }
      count++;
      setSimCount(count);
      if (count >= 5) stopSimulation();
    };

    triggerSim();
    simTimerRef.current = setInterval(triggerSim, 8000);
  };

  useEffect(() => {
    // Request notification permission for simulated FCM
    if ("Notification" in window) {
      Notification.requestPermission();
    }

    const doSync = async () => {
      await syncOfflineReports(API_BASE, (count) => {
        setOfflineSyncMessage(`Syncing ${count} queued reports...`);
      });
      setTimeout(() => setOfflineSyncMessage(null), 3000);
    };

    const handleOnline = () => { setIsOnline(true); doSync(); };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) doSync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const fetchNeeds = async () => {
      if (!isOnline) return;
      try {
        const response = await axios.get(`${API_BASE}/needs`);
        const fetchedNeeds: NeedEntity[] = response.data;

        // Auto-Alert Logic (Priority > 80 or unassigned > 30mins)
        // Find the most critical actionable incident that hasn't been assigned
        const actionableAlert = fetchedNeeds.find(n =>
          n.status !== 'RESOLVED' &&
          (n.criticalityScore > 80 || (now - n.reportedAt > 30 * 60 * 1000))
        );

        if (actionableAlert && !criticalAlerts.some(a => a.id === actionableAlert.id) && !dismissedAlertIds.includes(actionableAlert.id)) {
          setCriticalAlerts(prev => [...prev, actionableAlert]);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`Urgent Crisis at ${actionableAlert.location.name}`, {
              body: `Score: ${actionableAlert.criticalityScore.toFixed(1)}. Please assign a volunteer.`,
              icon: '/favicon.svg'
            });
          }
        }

        setNeeds(fetchedNeeds);
      } catch (error) {
        console.error("Error fetching needs:", error);
      }
    };
    fetchNeeds();
    const interval = setInterval(fetchNeeds, 3000);
    return () => clearInterval(interval);
  }, [isOnline, criticalAlerts, dismissedAlertIds, now]);
  // Auto-dismiss critical alerts
  useEffect(() => {
    if (criticalAlerts.length === 0) return;
    const timer = setTimeout(() => {
      setCriticalAlerts(prev => prev.slice(1));
    }, 10000);
    return () => clearTimeout(timer);
  }, [criticalAlerts]);

  const handleDispatch = async (needId: string) => {
    if (!isOnline) return alert("Must be online to dispatch resources.");
    setLoadingDispatch(true);
    setDispatchResult(null);
    try {
      const response = await axios.post(`${API_BASE}/dispatch`, { needId });
      setDispatchResult(response.data);
      setCriticalAlerts(prev => prev.filter(a => a.id !== needId));
      setToastMessage(`✓ ${response.data.volunteer.name} notified via WhatsApp`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.error || error.message)
        : (error instanceof Error ? error.message : "Unknown error");
      alert("Dispatch error: " + message);
    } finally {
      setLoadingDispatch(false);
    }
  };

  const startRecording = async () => {
    interface SpeechRecognitionEvent {
      results: { transcript: string }[][];
    }
    interface SpeechRecognitionError {
      error: string;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Chrome and type your report.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Supports Indian English, Hindi accents
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setIngestText(transcript);
      setIsRecording(false);
    };

    recognition.onerror = (event: SpeechRecognitionError) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings.');
      } else {
        setIngestText('[Voice input failed. Please type your report below.]');
      }
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    mediaRecorderRef.current = recognition as unknown as MediaRecorder;
    recognition.start();

    // Auto-stop after 15 seconds
    setTimeout(() => {
      try {
        recognition.stop();
      } catch (err) {
        console.debug('Recognition auto-stop failed or already stopped:', err);
      }
    }, 15000);
  };

  const stopRecording = () => {
    const recognition = mediaRecorderRef.current as unknown as { stop: () => void };
    if (recognition) {
      try {
        recognition.stop();
      } catch (err) {
        console.debug('Manual recognition stop failed:', err);
      }
      setIsRecording(false);
    }
  };

  // processAudio kept for compatibility but no longer used with Web Speech API




  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to clear all rescue signals and the offline queue?")) return;
    try {
      await axios.delete(`${API_BASE}/needs`);
      await clearOfflineQueue();
      setNeeds([]);
      setSelectedNeed(null);
      setDispatchResult(null);
      setCriticalAlerts([]);
    } catch (e) {
      console.error('Failed to clear:', e);
      alert("Failed to clear history.");
    }
  };



  useEffect(() => {
    let timer1: NodeJS.Timeout;
    let timer2: NodeJS.Timeout;
    let timer3: NodeJS.Timeout;

    if (isIngesting) {
      setIngestStatus("📡 Sending to Gemini AI...");
      setIngestStatusColor("text-blue-400");

      timer1 = setTimeout(() => {
        setIngestStatus("🧠 Extracting location, type and scale...");
      }, 1500);

      timer2 = setTimeout(() => {
        setIngestStatus("⏳ Almost done...");
      }, 3000);
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [isIngesting]);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestText.trim() && !selectedImage) return;
    setIsIngesting(true);

    try {
      if (!isOnline) {
        if (selectedImage) {
          alert("Offline Mode: Images cannot be saved offline in this demo. Sending text only.");
        }
        await saveOfflineReport({ text: ingestText });
        setIngestStatus("✅ Crisis signal saved locally!");
        setIngestStatusColor("text-green-400");
        setTimeout(() => setIngestStatus(null), 3000);
        setIngestText('');
        setSelectedImage(null);
        setImagePreview(null);
      } else {
        const formData = new FormData();
        formData.append('text', ingestText);
        if (selectedImage) {
          formData.append('image', selectedImage);
        }

        const res = await axios.post(`${API_BASE}/ingest`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (res.data.isLocal) {
          setIngestStatus("⚡ AI unavailable — processed locally");
          setIngestStatusColor("text-amber-400");
        } else {
          setIngestStatus("✅ Crisis signal ingested successfully!");
          setIngestStatusColor("text-green-400");
        }
        setTimeout(() => setIngestStatus(null), 3000);

        setIngestText('');
        setSelectedImage(null);
        setImagePreview(null);
      }
    } catch (error: unknown) {
      console.error("Submission failed:", error);
      const isUnclear = axios.isAxiosError(error) && error.response?.status === 422;
      const errorMsg = axios.isAxiosError(error)
        ? (error.response?.data?.error || error.message)
        : (error instanceof Error ? error.message : "Unknown error");

      if (isUnclear) {
        setIngestStatus("⚠️ Could not understand input — add location and crisis type");
        setIngestStatusColor("text-amber-400");

        // 🔴 ADD THIS
        setShake(true);
        setTimeout(() => setShake(false), 400);
      } else {
        setIngestStatus("❌ Submission failed — check connection");
        setIngestStatusColor("text-red-500");
        setTimeout(() => setIngestStatus(null), 5000);
        setIngestText('');
        setSelectedImage(null);
        setImagePreview(null);
      }
    } finally {
      setIsIngesting(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };



  const getScoreColor = (score: number) => {
    if (score > 70) return 'bg-red-600 text-white';
    if (score > 40) return 'bg-yellow-500 text-gray-900';
    return 'bg-green-500 text-white';
  };

  const getCrisisStyle = (type: string) => {
    const safeType = (type || 'other').toLowerCase();
    switch (safeType) {
      case 'medical': return { borderColor: '#EF4444', icon: '🏥' };
      case 'infrastructure': return { borderColor: '#F59E0B', icon: '🏗' };
      case 'food': return { borderColor: '#10B981', icon: '🍛' };
      case 'water':
      case 'flood': return { borderColor: '#3B82F6', icon: '🌊' };
      case 'fire': return { borderColor: '#F97316', icon: '🔥' };
      default: return { borderColor: '#8B9CB8', icon: '🚨' };
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await axios.post(`${API_BASE}/needs/${id}/resolve`);
      setNeeds(prev => prev.map(n => n.id === id ? { ...n, status: 'RESOLVED' } : n));
      if (selectedNeed?.id === id) setSelectedNeed(prev => prev ? { ...prev, status: 'RESOLVED' } : null);
      setToastMessage("Crisis marked as Resolved. Database updated.");
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err) {
      console.error("Failed to resolve crisis:", err);
    }
  };

  const getGoldenHourColor = (timestamp: number) => {
    const mins = (now - timestamp) / (1000 * 60);
    if (mins < 30) return 'text-green-400';
    if (mins < 60) return 'text-yellow-400';
    return 'text-red-500 font-bold animate-pulse';
  };

  const heatmapData = (needs || []).filter(n => n?.location?.lat && n?.location?.lng).map(n => ({
    lat: n.location.lat,
    lng: n.location.lng,
    weight: n.criticalityScore || 0
  }));

  const getSortedNeeds = () => {
    const sorted = [...needs];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => b.reportedAt - a.reportedAt);
      case 'score_desc':
        return sorted.sort((a, b) => (b.criticalityScore || 0) - (a.criticalityScore || 0));
      case 'score_asc':
        return sorted.sort((a, b) => (a.criticalityScore || 0) - (b.criticalityScore || 0));
      case 'city':
        return sorted.sort((a, b) => (a.location?.name || '').localeCompare(b.location?.name || ''));
      case 'sla':
        return sorted.sort((a, b) => {
          const aMins = differenceInMinutes(now, a.reportedAt);
          const bMins = differenceInMinutes(now, b.reportedAt);
          const aBreached = aMins >= 60 && a.status !== 'RESOLVED';
          const bBreached = bMins >= 60 && b.status !== 'RESOLVED';
          if (aBreached && !bBreached) return -1;
          if (!aBreached && bBreached) return 1;
          return b.reportedAt - a.reportedAt;
        });
      case 'type':
        return sorted.sort((a, b) => (a.crisisType || '').localeCompare(b.crisisType || ''));
      default:
        return sorted;
    }
  };

  const dashboardContent = (
    <div className={`flex-1 flex flex-row overflow-hidden relative h-full transition-all duration-300 ease-in-out ${isAiChatOpen ? 'pr-[360px]' : 'pr-0'}`}>
      {/* Offline Banner */}
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 z-[3000] bg-amber-600 text-white text-[11px] font-bold py-1.5 px-4 flex items-center justify-center gap-2 shadow-lg animate-pulse">
          <SignalSlashIcon className="w-4 h-4" />
          📶 Offline — reports are being saved locally and will sync when reconnected
        </div>
      )}

      <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar box-border h-full relative">
        {/* Toast Notification */}
        {toastMessage && (
          <div className={`absolute bottom-6 right-6 z-[2000] px-4 py-3 rounded shadow-lg animate-slide-in ${toastMessage.includes('⚠️') ? 'bg-amber-500 text-black font-bold border border-amber-400' : 'bg-green-600 text-white'}`}>
            {toastMessage}
          </div>
        )}

        {/* Prediction Engine Alert Bar */}
        <PredictionAlertBar predictions={predictions} />

        {/* Top Banner */}
        {showBanner && (
          <div className="flex-shrink-0 mb-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/15 rounded-xl p-4 flex justify-between items-center relative shadow-xl overflow-hidden">
            <div className="flex items-center space-x-6">
              <h3 className="font-bold text-white tracking-wide ml-2 whitespace-nowrap">🚨 CommunityPulse AI is live and monitoring {new Set(needs.filter(n => n?.location?.name).map(n => n.location.name)).size || 4} cities</h3>

              <div className="hidden lg:flex space-x-8">
                <div className="flex flex-col items-center">
                  <span className="text-white text-xl mono font-bold leading-none">{needs.filter(n => n?.status === 'OPEN').length}</span>
                  <span className="text-blue-300/80 text-[9px] uppercase tracking-[0.1em] font-bold mt-1">Active Crises</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-white text-xl mono font-bold leading-none">{(volunteers || []).filter(v => v?.status === 'AVAILABLE').length || 184}</span>
                  <span className="text-purple-300/80 text-[9px] uppercase tracking-[0.1em] font-bold mt-1">Volunteers Ready</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4 mr-10">
              <button
                onClick={() => setIsVoiceOpen(true)}
                className="bg-[#16a34a] hover:bg-[#15803d] text-white px-4 py-1.5 rounded-full text-[12px] font-bold transition-all duration-300 flex items-center h-9 shadow-[0_4px_12px_rgba(22,163,74,0.3)] active:scale-95 z-[100]"
              >
                <span className="mr-2 text-lg">📞</span>
                Emergency Call
              </button>

              <button
                onClick={() => setIsAiChatOpen(!isAiChatOpen)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-full text-[12px] font-bold transition-all duration-300 flex items-center h-9 shadow-[0_4px_12px_rgba(37,99,235,0.3)] active:scale-95 z-[100]"
              >
                <SparklesIcon className="w-4 h-4 mr-2" />
                Ask AI Assistant
              </button>

              <button onClick={() => setShowBanner(false)} className="text-white/40 hover:text-white bg-transparent p-1 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col gap-10 box-border pb-20">
          <div className="flex flex-col xl:flex-row gap-6 items-start">
            {/* PANEL 1: Live Ingestion Feed (Vertical Sideways) - Moved to Left */}
            <section className="w-full xl:w-[450px] bg-[#1e1e1e] rounded-2xl border border-gray-800 flex flex-col shadow-2xl overflow-hidden h-[750px]">
              <div className="p-5 border-b border-gray-800 bg-[#252525] flex justify-between items-center">
                <h2 className="text-lg font-bold flex items-center text-white">
                  <ExclamationTriangleIcon className="h-5 w-5 mr-3 text-warning" />
                  Signals
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest hidden sm:inline-block">Sort</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'newest' | 'score_desc' | 'score_asc' | 'city' | 'sla' | 'type')}
                    className="bg-[#16202E] border border-white/10 text-[#8B9CB8] text-[0.65rem] rounded-md px-1.5 py-1 cursor-pointer outline-none hover:border-white/20 transition-all focus:border-blue-500/50"
                  >
                    <option value="newest">🕐 Newest First</option>
                    <option value="score_desc">🔴 Highest Score</option>
                    <option value="score_asc">🟡 Lowest Score</option>
                    <option value="city">🏙 By City</option>
                    <option value="sla">⚠️ SLA Breached</option>
                    <option value="type">🏥 By Type</option>
                  </select>
                  <button
                    onClick={handleClearAll}
                    className="text-[10px] bg-red-900/20 text-red-400 border border-red-800/40 px-2 py-1 rounded hover:bg-red-900/40 transition-all font-bold"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-col h-full overflow-hidden">
                {/* Input Form Area */}
                <div className="p-4 border-b border-gray-800 bg-[#121212]/50">
                  <form onSubmit={handleIngest} className="flex flex-col space-y-3 relative">
                    {imagePreview && (
                      <div className="relative w-20 h-20 mb-2 group">
                        <img src={imagePreview} alt="Preview" className="w-20 h-20 object-cover rounded-md border border-blue-500/50 shadow-lg" />
                        <button
                          type="button"
                          onClick={removeImage}
                          className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5 shadow-md hover:bg-red-500 transition-colors"
                        >
                          <XMarkMini className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="relative">
                      <textarea
                        value={ingestText}
                        onChange={e => setIngestText(e.target.value)}
                        placeholder="Paste rescue ping or describe disaster imagery..."
                        className={`w-full bg-[#1a1a1a] border border-gray-700 rounded-xl p-3 pb-10 text-xs text-gray-200 focus:outline-none focus:border-blue-500 min-h-[100px] shadow-inner resize-none ${shake ? 'animate-shake border-red-500' : ''}`}
                      />
                      <div className="absolute bottom-2 left-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`p-2 rounded-lg border transition-all ${selectedImage ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#2a2a2a] border-gray-600 text-gray-400 hover:text-white hover:border-gray-500'}`}
                          title="Attach image for AI analysis"
                        >
                          <CameraIcon className="w-4 h-4" />
                        </button>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageChange}
                          accept="image/*"
                          className="hidden"
                        />
                        {selectedImage && (
                          <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 animate-pulse">
                            📸 Image Ready
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`absolute bottom-2 right-2 p-2 rounded-lg border transition-all ${isRecording ? 'bg-red-600 border-red-500 animate-pulse' : 'bg-[#2a2a2a] border-gray-600 text-gray-400 hover:text-white hover:border-gray-500'}`}
                      >
                        {isRecording ? <StopCircleIcon className="w-4 h-4 text-white" /> : <MicrophoneIcon className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={isIngesting}
                      className={`w-full font-bold py-3 rounded-xl text-xs shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${isIngesting ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}
                    >
                      {isIngesting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <PaperAirplaneIcon className="w-4 h-4" />
                          Ingest Signal
                        </>
                      )}
                    </button>
                    <div className="h-5 flex items-center justify-center">
                      {ingestStatus && (
                        <p className={`text-[0.75rem] font-bold text-center animate-fade-in ${ingestStatusColor}`}>
                          {ingestStatus}
                        </p>
                      )}
                    </div>
                    {/* Progress Bar Container */}
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5 overflow-hidden">
                      {isIngesting && (
                        <div className="h-full bg-blue-500 animate-progress-indeterminate"></div>
                      )}
                      {!isIngesting && ingestStatus && (
                        <div className={`h-full transition-all duration-500 ${ingestStatusColor.replace('text-', 'bg-')} w-full`}></div>
                      )}
                    </div>
                  </form>
                </div>

                {/* Vertical Scroll Area */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar bg-[#0f172a]/20">
                  {selectedNeed && (
                    <button
                      onClick={handleClearSelection}
                      className="w-full text-center py-2 bg-blue-500/10 text-blue-400 text-[0.7rem] rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-all font-bold mb-1"
                    >
                      ✕ Clear Active Selection
                    </button>
                  )}
                  {getSortedNeeds().length === 0 && (
                    <div className="flex flex-col items-center justify-center w-full text-gray-600 py-10 italic text-xs">
                      <p>Awaiting signals...</p>
                    </div>
                  )}
                  {getSortedNeeds().map(need => {
                    const isResolved = need.status === 'RESOLVED';
                    const crisisStyle = getCrisisStyle(need.crisisType);
                    return (
                      <div
                        key={need.id}
                        className={`w-full p-4 rounded-xl border transition-all cursor-pointer hover:translate-x-1 relative shadow-md ${isResolved ? 'opacity-50 grayscale-[0.5] border-green-900/30' : selectedNeed?.id === need.id ? 'border-blue-500 ring-2 ring-blue-500/20 bg-[#252535]' : 'border-gray-800 bg-[#1a1a1a] hover:border-gray-600'}`}
                        onClick={() => {
                          if (selectedNeed?.id === need.id) {
                            handleClearSelection();
                          } else {
                            setSelectedNeed(need);
                            setDispatchResult(null);
                          }
                        }}
                        style={{ borderLeft: `4px solid ${isResolved ? '#10B981' : crisisStyle.borderColor}` }}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] mono text-blue-400 font-bold uppercase tracking-widest">{need?.location?.name || 'Unknown'}</span>
                          <span className="text-[9px] text-gray-500 mono bg-gray-900 px-1.5 py-0.5 rounded">
                            {need?.reportedAt ? format(need.reportedAt, 'HH:mm') : '--:--'}
                          </span>
                        </div>
                        <div className="mb-2">
                          <h4 className="text-[13px] font-bold text-white capitalize flex items-center">
                            <span className="text-lg mr-2">{getCrisisStyle(need?.crisisType || 'other').icon}</span>
                            {need?.crisisType || 'Report'}
                            {need.isLocal && (
                              <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-500 text-[8px] font-black uppercase rounded border border-amber-500/30 tracking-tighter">
                                ⚡ Local Parse
                              </span>
                            )}
                          </h4>
                        </div>
                        <div className="flex justify-between items-center text-[10px] mono">
                          <span className={`font-bold ${getGoldenHourColor(need?.reportedAt || now)}`}>
                            {need?.reportedAt ? formatDistanceToNow(need.reportedAt) : '??'} ago
                          </span>
                          <span className="text-xs text-gray-400 font-medium">Score: <span className="text-white font-bold">{(need?.criticalityScore || 0).toFixed(0)}</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* PANEL 2: Global Heatmap - Moved to Right */}
            <section className="flex-1 bg-[#1e1e1e] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl flex flex-col relative h-[750px]">
              <div className="p-3 absolute top-3 left-4 z-[1000] pointer-events-none">
                <div className="inline-block bg-[rgba(7,11,20,0.85)] backdrop-blur-xl px-3.5 py-2 rounded-xl border border-white/10 pointer-events-auto shadow-2xl flex items-center space-x-4">
                  <h2 className="text-[13px] font-bold text-white flex items-center">
                    <span className="flex items-center text-[#EF4444] text-[0.55rem] font-black tracking-widest mr-3 border border-[#EF4444]/30 bg-[#EF4444]/10 px-1.5 py-0.5 rounded shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse mr-1.5">LIVE</span>
                    </span>
                    Heatmap
                  </h2>
                  <div className="h-6 w-px bg-white/10"></div>
                  <div className="flex bg-[#222]/50 p-1 rounded-lg border border-gray-800/50 shadow-inner">
                    <button
                      onClick={() => setMapLayer('dark')}
                      className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${mapLayer === 'dark' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                      Dark
                    </button>
                    <button
                      onClick={() => setMapLayer('satellite')}
                      className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${mapLayer === 'satellite' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                      Satellite
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 relative">
                <MapContainer center={center} zoom={5} style={mapContainerStyle} zoomControl={false} scrollWheelZoom={true} attributionControl={false}>
                  <ChangeView center={selectedNeed ? [selectedNeed.location.lat, selectedNeed.location.lng] : center} zoom={selectedNeed ? 14 : 5} />
                  {mapLayer === 'dark' ? (
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>' />
                  ) : (
                    <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community' />
                  )}
                  <HeatmapOverlay data={heatmapData} />
                  {needs.filter(n => n.status !== 'RESOLVED' && n.location?.lat && n.location?.lng).map(need => (
                    <Circle
                      key={need.id}
                      center={[need.location.lat, need.location.lng]}
                      radius={30000}
                      pathOptions={{
                        color: getCrisisStyle(need.crisisType).borderColor,
                        fillColor: getCrisisStyle(need.crisisType).borderColor,
                        fillOpacity: 0.4,
                        weight: 2,
                        dashArray: need.status === 'CRITICAL_VELOCITY' ? '5, 10' : undefined
                      }}
                      eventHandlers={{
                        click: () => setSelectedNeed(need)
                      }}
                    />
                  ))}
                </MapContainer>
              </div>
              {/* Map Legend */}
              <div className="absolute bottom-4 left-4 z-[1000] bg-[rgba(7,11,20,0.85)] backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 shadow-2xl flex items-center space-x-4 text-[10px] font-bold uppercase tracking-wider">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-[#EF4444] mr-2"></span>
                  <span className="text-white/80">🔴 Active Crisis</span>
                </div>
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-[#f97316] mr-2 animate-pulse"></span>
                  <span className="text-white/80">🟠 Predicted Risk</span>
                </div>
              </div>
            </section>
          </div>

          {/* PANEL 3: Dispatch Central */}
          <section className="bg-[#1e1e1e] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl flex flex-col">
            <div className="p-5 border-b border-gray-800 bg-[#252525]">
              <h2 className="text-xl font-bold flex items-center text-white">
                <PaperAirplaneIcon className="h-6 w-6 mr-3 text-indigo-400" />
                Dispatch & Coordination Center
              </h2>
            </div>

            <div className="p-8">
              {!selectedNeed ? (
                <div className="h-[300px] flex flex-col items-center justify-center text-center p-6 bg-[#121212]/30 rounded-2xl border border-dashed border-gray-700 animate-fade-in">
                  <div className="w-20 h-20 rounded-full bg-indigo-900/20 border border-indigo-500/20 flex items-center justify-center mb-6 text-indigo-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-xl text-gray-200 mb-2">Ready for Intelligent Dispatch</h3>
                  <p className="text-gray-500 max-w-[360px] leading-relaxed">Select any crisis report from the signals panel or map to activate AI-powered volunteer matching.</p>
                </div>
              ) : (
                <div className="flex flex-col xl:flex-row gap-10 animate-fade-in">
                  {/* Need Overview */}
                  <div className="flex-1 space-y-8">
                    <div className="bg-[#121212] p-8 rounded-2xl border border-gray-800 shadow-2xl relative">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-xs font-bold text-blue-400 uppercase tracking-[0.2em] mb-2">Selected Incident</h3>
                          <p className="text-3xl font-bold text-white tracking-tight">{selectedNeed?.location?.name || 'Emergency Site'}</p>
                        </div>
                        <div className={`px-4 py-2 rounded-xl text-xl font-bold shadow-lg ${getScoreColor(selectedNeed?.criticalityScore || 0)}`}>
                          {(selectedNeed?.criticalityScore || 0).toFixed(0)} <span className="text-xs opacity-60">SCORE</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white/5 p-4 rounded-xl">
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Crisis Type</p>
                          <p className="text-white font-bold capitalize">{selectedNeed?.crisisType || 'General'}</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-xl">
                          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Status</p>
                          <p className="text-indigo-400 font-bold">{selectedNeed?.status || 'OPEN'}</p>
                        </div>
                      </div>

                      <div className="mt-8 flex gap-4">
                        <button
                          onClick={() => handleDispatch(selectedNeed.id)}
                          disabled={loadingDispatch || !isOnline || selectedNeed.status === 'RESOLVED'}
                          className="flex-1 py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/50 disabled:cursor-not-allowed rounded-xl font-bold text-white transition-all shadow-xl active:scale-[0.98] flex justify-center items-center text-base"
                        >
                          {loadingDispatch ? (
                            <span className="flex items-center"><span className="animate-spin h-5 w-5 border-2 border-white rounded-full border-t-transparent mr-3"></span> Negotiating with AI...</span>
                          ) : (
                            selectedNeed.status === 'RESOLVED' ? 'Resolution Complete ✅' : 'Trigger AI Dispatch 🚀'
                          )}
                        </button>

                        {selectedNeed.status !== 'RESOLVED' && (
                          <button
                            onClick={() => handleResolve(selectedNeed.id)}
                            className="px-6 py-4 bg-green-900/30 text-green-400 border border-green-800/50 rounded-xl hover:bg-green-600/20 transition-all font-bold text-sm flex items-center"
                            title="Mark as Resolved"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dispatch Results Section */}
                  <div className="flex-1 space-y-6">
                    {dispatchResult ? (
                      <div className="space-y-6 animate-in slide-in-from-right-10 duration-700">
                        <div className="bg-gradient-to-br from-[#10B981]/10 to-[#3B82F6]/10 p-8 rounded-2xl border border-green-500/20 shadow-2xl relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4">
                            <span className="bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">Optimized Match</span>
                          </div>
                          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Assigned Resource</h4>
                          <div className="flex justify-between items-center mb-6">
                            <span className="text-4xl font-bold text-white tracking-tight">{dispatchResult.volunteer.name}</span>
                          </div>
                          <div className="bg-[#121212] p-6 rounded-xl border border-gray-800 relative shadow-2xl mt-4">
                            <p className="text-sm text-gray-300 italic font-mono leading-relaxed">"{dispatchResult.dispatchMessage}"</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[#121212]/20 rounded-2xl border border-gray-800 italic text-gray-600">
                        <p>Awaiting AI Match calculation...</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  const getPageTitle = () => {
    if (location.pathname === '/') return 'Live Dashboard';
    if (location.pathname === '/volunteers') return 'Volunteers';
    if (location.pathname === '/analytics') return 'Analytics';
    if (location.pathname === '/history') return 'Crisis History';
    return '';
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '⚡' },
    { path: '/volunteers', label: 'Volunteers', icon: '👥' },
    { path: '/analytics', label: 'Analytics', icon: '📊' },
    { path: '/history', label: 'History', icon: '📋' },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0D1421] text-white font-sans">
      {/* SIDEBAR */}
      <div
        className={`flex-shrink-0 h-full bg-[#0D1421] border-r border-white/[0.06] flex flex-col transition-all duration-300 ease-in-out relative z-[2000] ${isSidebarCollapsed ? 'w-[60px] overflow-visible' : 'w-[240px] overflow-hidden'}`}
      >
        {/* Toggle Button - Floating on the right border */}
        <div className="absolute -right-3.5 top-1/2 -translate-y-1/2 z-[1000]">
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-7 h-7 rounded-full bg-[#0D1421] border border-white/10 flex items-center justify-center hover:bg-[#1e293b] hover:border-blue-500/50 transition-all shadow-[0_0_15px_rgba(0,0,0,0.5)] active:scale-90 group"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            <ChevronLeftIcon className={`w-3.5 h-3.5 text-gray-400 group-hover:text-white transition-transform duration-300 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Logo */}
        <div className={`p-6 border-b border-white/[0.06] flex flex-col ${isSidebarCollapsed ? 'items-center px-2' : ''}`}>
          <div className="flex items-center space-x-2">
            <BoltIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="font-bold text-[1rem] tracking-tight whitespace-nowrap">CommunityPulse</span>}
          </div>
          {!isSidebarCollapsed && (
            <div className="flex items-center mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse mr-2"></span>
              <span className="text-[#10B981] text-[0.65rem] uppercase tracking-wider font-bold">Live</span>
            </div>
          )}
        </div>

        {/* Nav Links */}
        <div className={`flex-1 flex flex-col gap-2 p-3 ${isSidebarCollapsed ? 'items-center overflow-y-visible' : 'overflow-y-auto custom-scrollbar'}`}>
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <div
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`group relative rounded-lg cursor-pointer transition-all duration-150 flex items-center ${isSidebarCollapsed ? 'w-10 h-10 justify-center' : 'w-full px-[14px] py-[10px] gap-2.5'} ${isActive ? 'bg-blue-500/12 border border-blue-500/25 text-white' : 'text-[#8B9CB8] border border-transparent hover:bg-white/[0.04] hover:text-white'}`}
              >
                <span className="text-sm flex-shrink-0">{item.icon}</span>
                {!isSidebarCollapsed && <span className="font-medium text-[0.85rem] whitespace-nowrap">{item.label}</span>}

                {/* Collapsed Tooltip */}
                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-5 px-3 py-2 bg-[#1e293b] text-white text-[11px] font-bold rounded-xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.7)] opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-[-10px] group-hover:translate-x-0 z-[7000] whitespace-nowrap">
                    {item.label}
                    <div className="absolute top-1/2 -translate-y-1/2 right-full border-[5px] border-transparent border-r-[#1e293b]"></div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Status Card - Hide text when collapsed */}
        <div className={`p-4 border-t border-white/[0.06] ${isSidebarCollapsed ? 'flex justify-center' : ''}`}>
          {isSidebarCollapsed ? (
            <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" title="System Operational"></div>
          ) : (
            <div className="bg-[#121927] rounded border border-white/[0.04] p-3 shadow-inner">
              <p className="font-semibold text-[0.65rem] text-[#8B9CB8] uppercase tracking-wider mb-2">System Status</p>
              <div className="flex items-center mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] mr-1.5"></span>
                <p className="font-bold text-[0.75rem] text-[#10B981] uppercase tracking-wider">All systems operational</p>
              </div>
              <p className="text-[0.8rem] text-[#8B9CB8] font-mono font-bold">{timeStr}</p>
            </div>
          )}
        </div>

        {/* UN SDGs Addressed - Compact when collapsed */}
        <div className={`p-4 border-t border-white/[0.06] pb-8 ${isSidebarCollapsed ? 'flex flex-col items-center gap-4 overflow-visible' : 'overflow-hidden'}`}>
          {!isSidebarCollapsed && <p className="font-semibold text-[0.65rem] text-[#8B9CB8] uppercase tracking-[0.15em] mb-4">Humanitarian Impact</p>}
          <div className={`flex gap-3 overflow-visible ${isSidebarCollapsed ? 'flex-col items-center' : 'flex-wrap'}`}>
            {[
              { id: 1, name: "No Poverty", color: "#E5243B" },
              { id: 3, name: "Health & Well-being", color: "#4C9F38" },
              { id: 11, name: "Sustainable Cities", color: "#FD9D24" },
              { id: 13, name: "Climate Action", color: "#3F7E44" }
            ].map(sdg => (
              <div
                key={sdg.id}
                className="relative group flex items-center justify-center w-8 h-8 rounded-lg shadow-lg text-white font-black text-[10px] transition-all duration-300 hover:scale-110 cursor-default flex-shrink-0"
                style={{ backgroundColor: sdg.color }}
              >
                {sdg.id}

                {/* Tooltip */}
                <div className={`absolute opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-[7000] whitespace-nowrap ${isSidebarCollapsed ? 'left-full ml-5 top-1/2 -translate-y-1/2 -translate-x-2 group-hover:translate-x-0' : 'bottom-12 left-1/2 -translate-x-1/2 translate-y-2 group-hover:translate-y-0'}`}>
                  <div className="bg-[#1e293b] text-white text-[11px] font-bold px-3 py-2 rounded-xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.7)] flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sdg.color }}></div>
                    {sdg.name}
                  </div>
                  {/* Tooltip Arrow */}
                  <div className={`absolute border-[6px] border-transparent ${isSidebarCollapsed ? 'right-full top-1/2 -translate-y-1/2 border-r-[#1e293b]' : 'top-full left-1/2 -translate-x-1/2 border-t-[#1e293b]'}`}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full bg-[#121212] overflow-hidden relative transition-all duration-300 ease-in-out">
        {/* Top Bar inside main */}
        <div className="h-[56px] flex-shrink-0 bg-[#070B14] border-b border-white/[0.06] px-6 flex justify-between items-center z-50">
          <div className="flex items-center space-x-4">
            <h2 className="font-bold text-[1rem] text-white">{getPageTitle()}</h2>
            <div className="flex items-center gap-3 ml-4">
              {/* Compact Emergency Call in Header */}
              <button
                onClick={() => setIsVoiceOpen(true)}
                className="bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/30 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-lg group relative"
                title="Emergency Call"
              >
                <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20 group-hover:opacity-40"></div>
                <PhoneIcon className="w-4 h-4 z-10" />
              </button>

              {/* Simulate Crisis Trigger */}
              {!isSimulating ? (
                <button onClick={startSimulation} className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center shadow-lg h-7">
                  <BoltIcon className="w-3 h-3 mr-1" /> Simulate Crisis
                </button>
              ) : (
                <button onClick={stopSimulation} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center animate-pulse h-7">
                  <StopCircleIcon className="w-3 h-3 mr-1" /> Stop Sim ({simCount}/5)
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {offlineSyncMessage && (
              <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-full animate-pulse font-bold uppercase tracking-wider">
                {offlineSyncMessage}
              </span>
            )}
            {isOnline ? (
              <span className="flex items-center text-green-400 bg-green-500/10 px-2 py-1 rounded-full text-xs font-bold border border-green-500/20"><SignalIcon className="w-3 h-3 mr-1" /> Online Mode</span>
            ) : (
              <span className="flex items-center text-red-400 bg-red-500/10 px-2 py-1 rounded-full text-xs font-bold border border-red-500/20"><SignalSlashIcon className="w-3 h-3 mr-1" /> Offline</span>
            )}
            <div
              className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-black text-[10px] text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] border border-blue-400/30 cursor-pointer hover:scale-105 transition-all"
              title="Administrator Profile"
            >
              ADMIN
            </div>
          </div>
        </div>

        {/* Content Router */}
        <div className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={dashboardContent} />
            <Route path="/volunteers" element={<VolunteersPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/ai-assistant" element={<AiAssistantPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Routes>
        </div>

        {/* Critical Alerts Toast Stack */}
        <div className="fixed top-6 right-6 z-[3000] flex flex-col gap-2 pointer-events-none">
          {criticalAlerts.map(alert => (
            <div key={alert.id} className="pointer-events-auto w-[320px] bg-[#1a0a0a] border border-[#EF4444] rounded-xl p-4 shadow-[0_8px_32px_rgba(239,68,68,0.2)] animate-slide-in relative overflow-hidden">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BellAlertIcon className="w-4 h-4 text-[#EF4444] animate-pulse" />
                  <span className="font-bold text-[0.85rem] text-[#EF4444]">Critical Alert</span>
                </div>
                <button onClick={() => {
                  setDismissedAlertIds(prev => [...prev, alert.id]);
                  setCriticalAlerts(prev => prev.filter(a => a.id !== alert.id));
                }} className="text-white/40 hover:text-white transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-[0.75rem] text-[#8B9CB8] mb-3 leading-tight">
                <span className="text-white font-bold">{alert.location.name}</span> • {alert.crisisType} Crisis<br />
                Severity Score: {alert.criticalityScore.toFixed(1)}
              </p>
              <button
                onClick={() => {
                  setSelectedNeed(alert);
                  setDispatchResult(null);
                  setDismissedAlertIds(prev => [...prev, alert.id]);
                  setCriticalAlerts(prev => prev.filter(a => a.id !== alert.id));
                }}
                className="w-full py-1.5 border border-[#EF4444] text-[#EF4444] bg-transparent rounded-lg text-[0.75rem] font-bold hover:bg-[#EF4444]/10 transition-all"
              >
                Assign Now
              </button>
              <div className="absolute bottom-0 left-0 h-[3px] bg-[#EF4444] animate-shrink-width" style={{ animationDuration: '10s' }}></div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Assistant Floating Toggle & Panel (Dashboard Only) */}
      {location.pathname === '/' && (
        <>
          {/* Floating Pill Toggle Button */}
          <button
            onClick={() => setIsAiChatOpen(!isAiChatOpen)}
            className={`fixed right-0 top-1/2 -translate-y-1/2 z-[2000] flex items-center justify-center gap-2 px-4 py-3 rounded-l-full bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold text-sm shadow-[0_4px_20px_rgba(59,130,246,0.4)] transition-all duration-300 transform ${isAiChatOpen ? 'translate-x-0 w-12' : 'translate-x-0'}`}
          >
            {isAiChatOpen ? <span className="text-lg">✕</span> : <><SparklesIcon className="w-5 h-5" /> AI</>}
          </button>

          {/* Sliding AI Panel */}
          <div
            className={`fixed right-0 top-0 h-full bg-[#0D1421] border-l border-white/[0.08] shadow-2xl transition-all duration-300 ease-in-out z-[1900] flex flex-col overflow-hidden ${isAiChatOpen ? 'translate-x-0 w-[360px]' : 'translate-x-full w-[360px]'}`}
          >
            <AiAssistantPage isEmbedded={true} />
          </div>
        </>
      )}

      {/* AI Voice Assistant */}
      <VoiceAssistant isOpen={isVoiceOpen} onClose={() => setIsVoiceOpen(false)} apiBase={API_BASE} />

      <VoiceCallModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        onSubmit={(text) => {
          setIngestText(text);
          // Auto-submit or just let user see it in the text box
          console.log("Transcribed Emergency Call:", text);
        }}
      />
    </div>
  );
}


