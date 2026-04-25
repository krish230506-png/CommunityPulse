import axios from 'axios';
import React, { useEffect, useState, useRef } from 'react';
import type { NeedEntity, VolunteerProfile, Prediction } from './types';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { formatDistanceToNow, differenceInMinutes, format } from 'date-fns';

import { saveOfflineReport, syncOfflineReports, clearOfflineQueue } from './offlineSync';

import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import VolunteersPage from './pages/VolunteersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import HistoryPage from './pages/HistoryPage';
import AiAssistantPage from './pages/AiAssistantPage';
import ReportPage from './pages/ReportPage';
import VoiceAssistant from './components/VoiceAssistant';
import VoiceCallModal from './components/VoiceCallModal';
import PredictionAlertBar from './components/PredictionAlertBar';

import {
  SquaresFourIcon,
  UsersThreeIcon,
  ChartLineUpIcon,
  ClockCounterClockwiseIcon
} from '@phosphor-icons/react';

// Restored Heroicons for general UI elements
import {
  BoltIcon, ExclamationTriangleIcon, PaperAirplaneIcon,
  SignalSlashIcon, MicrophoneIcon, StopCircleIcon, BellAlertIcon,
  PhoneIcon, ChevronLeftIcon, SparklesIcon, CameraIcon,
  XMarkIcon as XMarkMini
} from '@heroicons/react/24/outline';


if (typeof window !== 'undefined') {
  (window as unknown as { L: typeof L }).L = L;
}

const mapContainerStyle = { width: '100%', height: '100%', borderRadius: '0.75rem' };
const center: [number, number] = [20.5937, 78.9629];

// Custom Heatmap Layer using leaflet.heat
const HeatmapOverlay = React.memo(({ data }: { data: { lat: number, lng: number, weight: number }[] }) => {
  const map = useMap();

  useEffect(() => {
    if (!data || data.length === 0) return;

    const points = data.map(p => [p.lat, p.lng, p.weight] as [number, number, number]);

    if (!L.heatLayer) {
      console.warn("Leaflet.heat not loaded yet...");
      return;
    }

    const heatLayer = L.heatLayer(points, {
      radius: 25,
      blur: 15,
      max: 100,
      gradient: {
        0.0: 'rgba(0, 0, 0, 0)',
        0.3: 'rgba(56, 189, 248, 1)', // Sky blue
        0.5: 'rgba(139, 92, 246, 1)', // Violet
        0.8: 'rgba(244, 63, 94, 1)',  // Rose red
        1.0: 'rgba(255, 255, 255, 1)' // White hot center
      }
    }).addTo(map);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [data, map]);

  return null;
});

// Add this component to handle map re-centering
const ChangeView = React.memo(({ center, zoom }: { center: [number, number], zoom: number }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }, [center, zoom, map]);
  return null;
});

const API_BASE = 'http://localhost:3000';

export default function App() {
  const navItems = [
    { path: '/', label: 'Dashboard', icon: <SquaresFourIcon weight="duotone" size={24} /> },
    { path: '/volunteers', label: 'Volunteers', icon: <UsersThreeIcon weight="duotone" size={24} /> },
    { path: '/analytics', label: 'Analytics', icon: <ChartLineUpIcon weight="duotone" size={24} /> },
    { path: '/history', label: 'History', icon: <ClockCounterClockwiseIcon weight="duotone" size={24} /> },
  ];

  const [needs, setNeeds] = useState<NeedEntity[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<NeedEntity | null>(null);
  const [dispatchResult, setDispatchResult] = useState<{ volunteer: VolunteerProfile, dispatchMessage: string } | null>(null);
  const [loadingDispatch, setLoadingDispatch] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [shake, setShake] = useState(false);

  // Ingest form
  const [ingestText, setIngestText] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [ingestStatusColor, setIngestStatusColor] = useState<string>('text-blue-400');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio Recording
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
  const [mapLayer, setMapLayer] = useState<'dark' | 'light' | 'satellite'>('dark');
  const [bgTheme, setBgTheme] = useState<'white' | 'black' | 'space'>(() => {
    return (localStorage.getItem('bgTheme') as 'white' | 'black' | 'space') || 'black';
  });
  const isDark = bgTheme !== 'white';
  const isSpace = bgTheme === 'space';

  useEffect(() => {
    localStorage.setItem('bgTheme', bgTheme);
  }, [bgTheme]);


  const theme = {
    // Backgrounds
    bg: isSpace ? 'nasa-bg' : (isDark ? 'bg-black' : 'bg-[#F0EEE8]'),

    // CHANGED: Reduced from backdrop-blur-3xl to backdrop-blur-lg
    surface: isSpace ? 'bg-black/40 backdrop-blur-lg' : (isDark ? 'bg-zinc-900/80 backdrop-blur-2xl' : 'bg-white'),
    surfaceSoft: isSpace ? 'bg-white/10' : (isDark ? 'bg-zinc-800/50' : 'bg-[#EEEcE6]'),
    surfaceCard: isSpace ? 'bg-black/60' : (isDark ? 'bg-zinc-900' : 'bg-white'),

    // CHANGED: Reduced from backdrop-blur-xl to backdrop-blur-md
    surfacePanel: isSpace ? 'bg-white/5 backdrop-blur-md' : (isDark ? 'bg-zinc-900/50' : 'bg-[#EEEcE6]'),

    // CHANGED: Reduced from backdrop-blur-2xl to backdrop-blur-md
    sidebar: isSpace ? 'bg-black/60 backdrop-blur-md' : (isDark ? 'bg-black' : 'bg-zinc-100'),
    banner: isSpace ? 'bg-black/60 backdrop-blur-md' : (isDark ? 'bg-zinc-950' : 'bg-zinc-100'),

    // Borders
    border: isSpace ? 'border-white/10' : (isDark ? 'border-white/5' : 'border-black/5'),
    borderBright: isSpace ? 'border-white/20' : (isDark ? 'border-white/10' : 'border-black/10'),

    // Text
    text: isDark ? 'text-zinc-100' : 'text-zinc-900',
    textMuted: isDark ? 'text-zinc-400' : 'text-zinc-600',
    textDim: isDark ? 'text-zinc-500' : 'text-zinc-500',
    accent: isSpace ? 'text-indigo-400' : (isDark ? 'text-sky-400' : 'text-sky-600'),

    // Buttons
    buttonPrimary: isSpace ? 'bg-indigo-600 text-white' : (isDark ? 'bg-white text-black' : 'bg-black text-white'),

    // Hover
    hoverSurface: isSpace ? 'hover:bg-white/10' : (isDark ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-100'),
  };
  const [criticalAlerts, setCriticalAlerts] = useState<NeedEntity[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'score_desc' | 'score_asc' | 'city' | 'sla' | 'type'>('newest');

  // New Layout State
  const [showBanner, setShowBanner] = useState(true);

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

  useEffect(() => {
    const fetchVolunteers = async () => {
      try {
        const response = await axios.get(`${API_BASE}/volunteers`);
        setVolunteers(response.data);
      } catch (e) {
        console.error("Error fetching volunteers:", e);
      }
    };
    void fetchVolunteers();
  }, []);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
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
  };

  const startSimulation = () => {
    setIsSimulating(true);
    let count = 0;

    const triggerSim = async () => {
      const scenario = mockScenarios[Math.floor(Math.random() * mockScenarios.length)];
      try {
        await axios.post(`${API_BASE}/ingest`, { text: scenario });
      } catch (err) {
        console.error("Simulated ingestion failed:", err);
      }
      count++;
      if (count >= 5) stopSimulation();
    };

    triggerSim();
    simTimerRef.current = setInterval(triggerSim, 8000);
  };

  useEffect(() => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }

    const doSync = async () => {
      await syncOfflineReports(API_BASE, (count) => {
        console.log(`Syncing ${count} queued reports...`);
      });
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Chrome and type your report.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
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

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestText.trim() && !selectedImage) return;
    setIsIngesting(true);

    setIngestStatus("📡 Sending to Gemini AI...");
    setIngestStatusColor("text-blue-400");

    const timer1 = setTimeout(() => {
      setIngestStatus("🧠 Extracting location, type and scale...");
    }, 1500);

    const timer2 = setTimeout(() => {
      setIngestStatus("⏳ Almost done...");
    }, 3000);

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

      if (isUnclear) {
        setIngestStatus("⚠️ Could not understand input — add location and crisis type");
        setIngestStatusColor("text-amber-400");
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
      clearTimeout(timer1);
      clearTimeout(timer2);
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
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 z-[3000] bg-amber-600 text-white text-[11px] font-bold py-1.5 px-4 flex items-center justify-center gap-2 shadow-lg animate-pulse">
          <SignalSlashIcon className="w-4 h-4" />
          📶 Offline — reports are being saved locally and will sync when reconnected
        </div>
      )}

      <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar box-border h-full relative">
        {toastMessage && (
          <div className={`absolute bottom-6 right-6 z-[2000] px-4 py-3 rounded shadow-lg animate-slide-in ${toastMessage.includes('⚠️') ? 'bg-amber-500 text-black font-bold border border-amber-400' : 'bg-green-600 text-white'}`}>
            {toastMessage}
          </div>
        )}

        <PredictionAlertBar predictions={predictions} />

        {showBanner && (
          <div className="flex-shrink-0 mb-6 bg-[#27272A] border border-gray-800 rounded-2xl p-4 flex justify-between items-center relative shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden">
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
            <section className={`w-full xl:w-[450px] ${theme.surface} rounded-[2rem] border ${theme.border} flex flex-col shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden h-[750px]`}>
              <div className={`p-5 border-b ${theme.border} ${theme.surface} flex justify-between items-center`}>
                <h2 className={`text-lg font-bold flex items-center ${theme.text}`}>
                  <ExclamationTriangleIcon className="h-5 w-5 mr-3 text-warning" />
                  Signals
                </h2>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest hidden sm:inline-block">Sort</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'newest' | 'score_desc' | 'score_asc' | 'city' | 'sla' | 'type')}
                    className={`${theme.surfaceSoft} border ${theme.border} ${theme.textMuted} text-[0.65rem] rounded-md px-1.5 py-1 cursor-pointer outline-none hover:border-blue-500/50 transition-all focus:border-blue-500/50`}
                  >
                    <option value="newest">Newest First</option>
                    <option value="score_desc">Highest Score</option>
                    <option value="score_asc">Lowest Score</option>
                    <option value="city">By City</option>
                    <option value="sla">SLA Breached</option>
                    <option value="type">By Type</option>
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
                <div className={`p-4 border-b ${theme.border} ${theme.surfaceSoft}`}>
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
                        placeholder="Describe what you see — location, how many people, what's needed..."
                        className={`w-full ${theme.surface} border ${theme.border} rounded-2xl p-3 pb-10 text-xs ${theme.text} focus:outline-none focus:border-blue-500 min-h-[100px] shadow-sm resize-none placeholder-zinc-500 dark:placeholder-zinc-400 ${shake ? 'animate-shake border-red-500' : ''}`}
                      />
                      <div className="absolute bottom-2 left-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`p-2 rounded-xl border transition-all ${selectedImage ? 'bg-blue-600 border-blue-500 text-white' : `${theme.surfaceSoft} ${theme.border} ${theme.textMuted} hover:bg-white/[0.05] hover:text-white`}`}
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
                        className={`absolute bottom-2 right-2 p-2 rounded-xl border transition-all ${isRecording ? 'bg-red-600 border-red-500 animate-pulse text-white' : `${theme.surfaceSoft} ${theme.border} ${theme.textMuted} hover:bg-white/[0.05] hover:text-white`}`}
                      >
                        {isRecording ? <StopCircleIcon className="w-4 h-4 text-white" /> : <MicrophoneIcon className="w-4 h-4" />}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={isIngesting}
                      className={`w-full font-bold py-3 rounded-2xl text-xs shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-white ${isIngesting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
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

                <div className={`flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar ${theme.surfaceSoft}`} style={{ willChange: 'transform', contain: 'content' }}>
                  {selectedNeed && (
                    <button
                      onClick={handleClearSelection}
                      className="w-full text-center py-2 bg-blue-500/10 text-blue-400 text-[0.7rem] rounded-lg border border-blue-500/20 hover:bg-blue-500/20 transition-all font-bold mb-1"
                    >
                      ✕ Clear Active Selection
                    </button>
                  )}
                  {getSortedNeeds().length === 0 && (
                    <div className={`flex flex-col items-center justify-center w-full ${theme.textMuted} py-10 italic text-xs`}>
                      <p>Awaiting signals...</p>
                    </div>
                  )}
                  {getSortedNeeds().map(need => {
                    const isResolved = need.status === 'RESOLVED';
                    const crisisStyle = getCrisisStyle(need.crisisType);
                    return (
                      <div
                        key={need.id}
                        className={`w-full p-4 rounded-2xl border transition-all cursor-pointer hover:translate-x-1 relative shadow-sm ${isResolved ? 'opacity-50 grayscale border-green-200 bg-green-50/30' : selectedNeed?.id === need.id ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/50' : `${theme.border} ${theme.surface} hover:shadow-md`}`}
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
                          <span className={`text-[10px] mono ${theme.accent} font-bold uppercase tracking-widest`}>{need?.location?.name || 'Unknown'}</span>
                          <span className={`text-[9px] ${theme.textMuted} mono ${theme.surfaceSoft} px-1.5 py-0.5 rounded`}>
                            {need?.reportedAt ? format(need.reportedAt, 'HH:mm') : '--:--'}
                          </span>
                        </div>
                        <div className="mb-2">
                          <h4 className={`text-[13px] font-bold ${theme.text} capitalize flex items-center`}>
                            <span className="text-lg mr-2">{getCrisisStyle(need?.crisisType || 'other').icon}</span>
                            {need?.crisisType || 'Report'}
                            {(need as NeedEntity & { isLocal?: boolean }).isLocal && (
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
                          <span className={`text-xs ${theme.textMuted} font-medium`}>Score: <span className={`${theme.text} font-bold`}>{(need?.criticalityScore || 0).toFixed(0)}</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className={`flex-1 ${theme.surface} rounded-[2rem] border ${theme.border} overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col relative h-[750px]`}>
              {/* Map Controls Overlay */}
              <div className="absolute top-4 left-4 z-[1000] pointer-events-none">
                <div className="bg-[#1C2128]/90 backdrop-blur-md p-1.5 rounded-2xl border border-gray-700/50 shadow-[0_8px_30px_rgba(0,0,0,0.4)] pointer-events-auto flex items-center gap-4">

                  {/* Left Side: Title & Live Indicator */}
                  <div className="flex items-center pl-3">
                    <span className="relative flex h-2 w-2 mr-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    <h2 className="text-sm font-bold text-gray-100 tracking-wide mr-3">MAP</h2>
                    <span className="text-[9px] font-black text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 uppercase tracking-widest shadow-sm">
                      Live
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-5 bg-gray-700/80"></div>

                  {/* Right Side: Map Layer Toggles */}
                  <div className="flex bg-[#0B0F14] p-1 rounded-xl border border-gray-800/80 shadow-inner">
                    <button
                      onClick={() => setMapLayer('dark')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${mapLayer === 'dark' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                    >
                      Dark
                    </button>
                    <button
                      onClick={() => setMapLayer('light')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${mapLayer === 'light' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                    >
                      Light
                    </button>
                    <button
                      onClick={() => setMapLayer('satellite')}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${mapLayer === 'satellite' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                    >
                      Satellite
                    </button>
                  </div>

                </div>
              </div>

              <div className="flex-1 relative">
                <MapContainer center={center} zoom={5} style={mapContainerStyle} zoomControl={false} scrollWheelZoom={true} attributionControl={false} preferCanvas={true}>
                  <ChangeView center={selectedNeed ? [selectedNeed.location.lat, selectedNeed.location.lng] : center} zoom={selectedNeed ? 14 : 5} />
                  {mapLayer === 'dark' && (
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>' />
                  )}
                  {mapLayer === 'light' && (
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>' />
                  )}
                  {mapLayer === 'satellite' && (
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

          <section className={`${theme.surface} rounded-[2rem] border ${theme.border} overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col`}>
            <div className={`p-5 border-b ${theme.border} ${theme.surface}`}>
              <h2 className={`text-xl font-bold flex items-center ${theme.text}`}>
                <PaperAirplaneIcon className="h-6 w-6 mr-3 text-indigo-500" />
                Dispatch & Coordination Center
              </h2>
            </div>

            <div className="p-8">
              {!selectedNeed ? (
                <div className={`h-[300px] flex flex-col items-center justify-center text-center p-6 ${theme.surfaceSoft} rounded-[2rem] border border-dashed ${theme.border} animate-fade-in`}>
                  <div className="w-20 h-20 rounded-full bg-indigo-900/20 border border-indigo-500/20 flex items-center justify-center mb-6 text-indigo-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                    </svg>
                  </div>
                  <h3 className={`font-bold text-xl ${theme.text} mb-2`}>Ready for Intelligent Dispatch</h3>
                  <p className={`${theme.textMuted} max-w-[360px] leading-relaxed`}>Select any crisis report from the signals panel or map to activate AI-powered volunteer matching.</p>
                </div>
              ) : (
                <div className="flex flex-col xl:flex-row gap-10 animate-fade-in">
                  <div className="flex-1 space-y-8">
                    <div className={`${theme.surfaceSoft} p-8 rounded-2xl border ${theme.border} shadow-sm relative`}>
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className={`text-xs font-bold ${theme.accent} uppercase tracking-[0.2em] mb-2`}>Selected Incident</h3>
                          <p className={`text-3xl font-bold ${theme.text} tracking-tight`}>{selectedNeed?.location?.name || 'Emergency Site'}</p>
                        </div>
                        <div className={`px-4 py-2 rounded-xl text-xl font-bold shadow-lg ${getScoreColor(selectedNeed?.criticalityScore || 0)}`}>
                          {(selectedNeed?.criticalityScore || 0).toFixed(0)} <span className="text-xs opacity-60">SCORE</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-6">
                        <div className={`${theme.surface} border ${theme.border} rounded-xl p-4 shadow-sm transition-all duration-300`}>
                          <p className={`text-[10px] uppercase font-bold ${theme.textMuted} mb-1`}>Crisis Type</p>
                          <p className={`${theme.text} font-bold capitalize`}>{selectedNeed?.crisisType || 'General'}</p>
                        </div>
                        <div className={`${theme.surface} border ${theme.border} rounded-xl p-4 shadow-sm transition-all duration-300`}>
                          <p className={`text-[10px] uppercase font-bold ${theme.textMuted} mb-1`}>Status</p>
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

                  <div className="flex-1 space-y-6">
                    {dispatchResult ? (
                      <div className="space-y-6 animate-in slide-in-from-right-10 duration-700">
                        <div className="bg-gradient-to-br from-[#10B981]/10 to-[#3B82F6]/10 p-8 rounded-2xl border border-green-500/20 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-4">
                            <span className="bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">Optimized Match</span>
                          </div>
                          <h4 className={`text-xs font-bold ${theme.textMuted} uppercase tracking-widest mb-4`}>Assigned Resource</h4>
                          <div className="flex justify-between items-center mb-6">
                            <span className={`text-4xl font-bold ${theme.text} tracking-tight`}>{dispatchResult.volunteer.name}</span>
                          </div>
                          <div className={`${theme.surface} p-6 rounded-xl border ${theme.border} relative shadow-sm mt-4`}>
                            <p className={`text-sm ${theme.text} italic font-mono leading-relaxed`}>"{dispatchResult.dispatchMessage}"</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`h-full flex flex-col items-center justify-center text-center p-8 ${theme.surfaceSoft} rounded-[2rem] border ${theme.border} italic ${theme.textMuted}`}>
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

  const mainLayout = (
    <div className={`flex h-screen w-screen overflow-hidden ${theme.bg} ${theme.text} font-sans transition-all duration-300`}>
      <aside
        className={`fixed left-4 top-4 bottom-4 z-[2000] flex flex-col transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isSidebarCollapsed ? 'w-[72px]' : 'w-[260px]'}
          } bg-[#0D0F14]/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-visible group`}
      >
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-12 bg-blue-600 border border-blue-400/30 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-500 transition-all z-[2100] active:scale-90 opacity-0 group-hover:opacity-100"
          title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          <ChevronLeftIcon className={`w-3.5 h-3.5 transition-transform duration-500 ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
        </button>

        <div className={`p-8 mb-4 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-4'}`}>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/20 flex-shrink-0">
            <BoltIcon className="w-6 h-6 text-white" />
          </div>
          {!isSidebarCollapsed && (
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tight text-white leading-none">TONIC</span>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-1">Command Center</span>
            </div>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden mt-4">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <div
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`relative group/item cursor-pointer flex items-center transition-all duration-300 ease-out rounded-xl ${isSidebarCollapsed ? 'justify-center h-12 w-12 mx-auto' : 'px-4 py-3 gap-4 h-12'
                  } ${isActive
                    ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-100 border border-transparent'
                  }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-blue-500 rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                )}

                <span className={`flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110 text-blue-400' : 'group-hover/item:scale-110 group-hover/item:-rotate-3 text-gray-400 group-hover/item:text-gray-200'}`}>
                  {item.icon}
                </span>
                {!isSidebarCollapsed && (
                  <span className={`font-bold text-sm tracking-wide transition-all duration-300 ${isActive ? 'text-white' : 'text-inherit'}`}>
                    {item.label}
                  </span>
                )}

                {isSidebarCollapsed && (
                  <div className="absolute left-full ml-4 px-3 py-2 bg-[#0B0F14]/90 backdrop-blur-md text-white text-[11px] font-bold rounded-xl border border-white/10 shadow-2xl opacity-0 group-hover/item:opacity-100 pointer-events-none transition-all translate-x-[-10px] group-hover/item:translate-x-0 z-[7000] whitespace-nowrap">
                    {item.label}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`p-6 border-t border-white/5 mt-auto ${isSidebarCollapsed ? 'items-center' : ''}`}>
          {!isSidebarCollapsed && (
            <div className="mb-4 px-2">
              <button
                onClick={() => window.open('/report', '_blank')}
                className="w-full py-2 px-3 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600/30 transition-all flex items-center justify-center group"
              >
                User Portal
                <PaperAirplaneIcon className="w-3 h-3 ml-2 -rotate-45 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
            </div>
          )}
          {!isSidebarCollapsed && (
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-6 px-2">Global Impact</p>
          )}
          <div className={`flex gap-3 ${isSidebarCollapsed ? 'flex-col items-center' : 'flex-wrap px-2'}`}>
            {[
              { id: 1, color: 'bg-[#E5243B]', name: 'No Poverty' },
              { id: 3, color: 'bg-[#4C9F38]', name: 'Health' },
              { id: 11, color: 'bg-[#FD9D24]', name: 'Cities' },
              { id: 13, color: 'bg-[#3F7E44]', name: 'Climate' }
            ].map(sdg => (
              <div
                key={sdg.id}
                className={`w-8 h-8 rounded-lg ${sdg.color} flex items-center justify-center text-white font-black text-[10px] shadow-lg hover:scale-110 transition-all cursor-default relative group/sdg`}
              >
                {sdg.id}
                <div className={`absolute ${isSidebarCollapsed ? 'left-full ml-4' : 'bottom-full left-1/2 -translate-x-1/2 mb-3'} px-3 py-2 bg-[#0B0F14]/90 backdrop-blur-md text-white text-[10px] font-bold rounded-xl border border-white/10 shadow-2xl opacity-0 group-hover/sdg:opacity-100 pointer-events-none transition-all z-[3000] whitespace-nowrap scale-90 group-hover/sdg:scale-100 origin-bottom`}>
                  {sdg.name}
                  {!isSidebarCollapsed && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0B0F14]/90" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className={`flex-1 flex flex-col h-full ${theme.bg} overflow-hidden relative transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isSidebarCollapsed ? 'pl-[104px]' : 'pl-[292px]'} pr-4 py-4`}>
        <div className={`flex-1 flex flex-col overflow-hidden ${theme.surface} border ${theme.border} rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.1)] relative`}>
          <div className={`h-[64px] flex-shrink-0 ${theme.surface} border-b ${theme.border} px-8 flex justify-between items-center z-50`}>
            <div className="flex items-center space-x-4">
              <h2 className={`font-bold text-lg tracking-tight ${theme.text}`}>{getPageTitle()}</h2>
              <div className={`flex items-center gap-1.5 ml-4 ${theme.surfaceSoft} p-1 rounded-full border ${theme.border}`}>
                <button
                  onClick={() => setBgTheme('white')}
                  className={`w-3.5 h-3.5 rounded-full bg-white border transition-all hover:scale-110 ${bgTheme === 'white' ? 'border-gray-500 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-300'}`}
                  title="Pure White"
                />
                <button
                  onClick={() => setBgTheme('black')}
                  className={`w-3.5 h-3.5 rounded-full bg-black border transition-all hover:scale-110 ${bgTheme === 'black' ? 'border-gray-500 ring-2 ring-offset-1 ring-gray-400' : 'border-gray-300'}`}
                  title="Pure Black"
                />
                <button
                  onClick={() => setBgTheme('space')}
                  className={`w-3.5 h-3.5 rounded-full bg-indigo-600 border transition-all hover:scale-110 ${bgTheme === 'space' ? 'border-indigo-400 ring-2 ring-offset-1 ring-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 'border-indigo-900'}`}
                  title="NASA Space Mode"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsVoiceOpen(true)}
                className="bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/30 w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-lg group relative"
                title="Emergency Call"
              >
                <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20 group-hover:opacity-40"></div>
                <PhoneIcon className="w-4 h-4 z-10" />
              </button>

              {!isSimulating ? (
                <button onClick={startSimulation} className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center shadow-lg h-7">
                  <BoltIcon className="w-3 h-3 mr-1" /> Simulate Crisis
                </button>
              ) : (
                <button onClick={stopSimulation} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center animate-pulse h-7">
                  <BoltIcon className="w-3 h-3 mr-1" /> Stop Simulation
                </button>
              )}

              <div className="flex items-center ml-2">
                <div
                  className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-black text-[10px] text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] border border-blue-400/30 cursor-pointer hover:scale-105 transition-all"
                  title="Administrator Profile"
                >
                  ADMIN
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={dashboardContent} />
              <Route path="/volunteers" element={<VolunteersPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/ai-assistant" element={<AiAssistantPage />} />
              <Route path="/history" element={<HistoryPage />} />
            </Routes>
          </div>
        </div>

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

        {location.pathname === '/' && (
          <>
            <button
              onClick={() => setIsAiChatOpen(!isAiChatOpen)}
              className={`fixed right-0 top-1/2 -translate-y-1/2 z-[2000] flex items-center justify-center gap-2 px-4 py-3 rounded-l-full bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold text-sm shadow-[0_4px_20px_rgba(59,130,246,0.4)] transition-all duration-300 transform ${isAiChatOpen ? 'translate-x-0 w-12' : 'translate-x-0'}`}
            >
              {isAiChatOpen ? <span className="text-lg">✕</span> : <><SparklesIcon className="w-5 h-5" /> AI</>}
            </button>

            <div
              className={`fixed right-0 top-0 h-full bg-[#27272A] text-white border-l border-black/10 shadow-[-10px_0_30px_rgba(0,0,0,0.1)] transition-all duration-300 ease-in-out z-[1900] flex flex-col overflow-hidden ${isAiChatOpen ? 'translate-x-0 w-[360px]' : 'translate-x-full w-[360px]'}`}
            >
              <AiAssistantPage isEmbedded={true} />
            </div>
          </>
        )}

        <VoiceAssistant isOpen={isVoiceOpen} onClose={() => setIsVoiceOpen(false)} apiBase={API_BASE} />

        <VoiceCallModal
          isOpen={isCallModalOpen}
          onClose={() => setIsCallModalOpen(false)}
          onSubmit={(text) => {
            setIngestText(text);
            console.log("Transcribed Emergency Call:", text);
          }}
        />
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/report" element={<ReportPage />} />
      <Route path="/*" element={mainLayout} />
    </Routes>
  );
}
