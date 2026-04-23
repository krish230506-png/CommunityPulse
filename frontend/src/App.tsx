import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import type { NeedEntity, VolunteerProfile } from './types';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { formatDistanceToNow, differenceInMinutes, format } from 'date-fns';
import { BoltIcon, ExclamationTriangleIcon, PaperAirplaneIcon, SignalIcon, SignalSlashIcon, MicrophoneIcon, StopCircleIcon, BellAlertIcon, PhoneIcon } from '@heroicons/react/24/outline';
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
  (window as any).L = L;
}

const mapContainerStyle = { width: '100%', height: '100%', borderRadius: '0.75rem' };
const center: [number, number] = [19.0760, 72.8777];

// Custom Heatmap Layer using leaflet.heat
function HeatmapOverlay({ data }: { data: any[] }) {
  const map = useMap();

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Heatmap data format: [[lat, lng, intensity], ...]
    const points = data.map(p => [p.lat, p.lng, p.weight]);
    
    // @ts-ignore - leaflet.heat is a plugin
    if (!(L as any).heatLayer) {
      console.warn("Leaflet.heat not loaded yet...");
      return;
    }
    const heatLayer = (L as any).heatLayer(points, {
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
  
  // Offline UI
  const [offlineSyncMessage, setOfflineSyncMessage] = useState<string | null>(null);

  // Ingest form
  const [ingestText, setIngestText] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);

  // Audio Recording — now uses Web Speech API (SpeechRecognition)
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<any>(null);

  // UI State
  const [mapLayer, setMapLayer] = useState<'dark' | 'satellite'>('dark');
  const [criticalAlerts, setCriticalAlerts] = useState<NeedEntity[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Layout State
  const [showBanner, setShowBanner] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [timeStr, setTimeStr] = useState(new Date().toLocaleTimeString());

  const location = useLocation();
  const navigate = useNavigate();

  // Prediction State
  const [predictions, setPredictions] = useState<any[]>([]);

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
      setNow(Date.now());
      setTimeStr(new Date().toLocaleTimeString());
    }, 1000); // Update every second for live timers
    return () => clearInterval(timer);
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
    fetchVolunteers();
  }, []);

  // Simulation State
  const [isSimulating, setIsSimulating] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [simCount, setSimCount] = useState(0);
  const simTimerRef = useRef<any>(null);

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
           (n.criticalityScore > 80 || (Date.now() - n.reportedAt > 30 * 60 * 1000))
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
  }, [isOnline, criticalAlerts.length]);
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
    } catch (error: any) {
      alert("Dispatch error: " + (error.response?.data?.error || error.message));
    } finally {
      setLoadingDispatch(false);
    }
  };

  const startRecording = async () => {
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

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIngestText(transcript);
      setIsRecording(false);
    };

    recognition.onerror = (event: any) => {
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

    (mediaRecorderRef.current as any) = recognition;
    recognition.start();

    // Auto-stop after 15 seconds
    setTimeout(() => {
      try { recognition.stop(); } catch {}
    }, 15000);
  };

  const stopRecording = () => {
    const recognition = mediaRecorderRef.current as any;
    if (recognition) {
      try { recognition.stop(); } catch {}
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

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestText.trim()) return;
    setIsIngesting(true);
    
    try {
      if (!isOnline) {
        await saveOfflineReport({ text: ingestText });
        alert("Offline Mode: Report saved locally. It will sync automatically when your internet returns.");
        setIngestText('');
      } else {
        const res = await axios.post(`${API_BASE}/ingest`, { text: ingestText });
        console.log("Ingest response:", res.data);
        setIngestText('');
      }
    } catch (error: any) {
      console.error("Submission failed:", error);
      const errorMsg = error.response?.data?.error || error.message;
      alert(`Submission Error: ${errorMsg}. Don't worry, saving to offline storage instead.`);
      await saveOfflineReport({ text: ingestText });
      setIngestText('');
    } finally {
      setIsIngesting(false);
    }
  };

  const getSlaStatus = (reportedAt: number) => {
    if (!reportedAt) return { color: 'bg-gray-500', text: 'Unknown SLA' };
    const mins = differenceInMinutes(Date.now(), reportedAt);
    if (mins < 30) return { color: 'bg-green-500', text: 'Response on time ✓' };
    if (mins < 60) return { color: 'bg-yellow-500', text: 'Approaching SLA' };
    return { color: 'bg-red-500', text: 'SLA Breached' };
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
    } catch (e) {
      console.error("Failed to resolve crisis:", e);
    }
  };

  const getGoldenHourColor = (timestamp: number) => {
    const mins = (Date.now() - timestamp) / (1000 * 60);
    if (mins < 30) return 'text-green-400';
    if (mins < 60) return 'text-yellow-400';
    return 'text-red-500 font-bold animate-pulse';
  };

  const heatmapData = (needs || []).filter(n => n?.location?.lat && n?.location?.lng).map(n => ({
    lat: n.location.lat,
    lng: n.location.lng,
    weight: n.criticalityScore || 0
  }));

  const dashboardContent = (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar box-border h-full relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute bottom-6 right-6 z-[2000] bg-green-600 text-white px-4 py-3 rounded shadow-lg animate-slide-in">
          {toastMessage}
        </div>
      )}

      {/* FCM Simulated Global Alert Banner */}
      {/* FCM Simulated Global Alert removed from here */}

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

            <button onClick={() => setShowBanner(false)} className="text-white/40 hover:text-white bg-transparent p-1 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        </div>
      )}

        <main className="flex-1 flex flex-col gap-10 box-border pb-20">
        
        {/* PANEL 1: Live Ingestion Feed (Horizontal) */}
        <section className="bg-[#1e1e1e] rounded-2xl border border-gray-800 flex flex-col shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-gray-800 bg-[#252525] flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center text-white">
              <ExclamationTriangleIcon className="h-6 w-6 mr-3 text-warning" />
              Live Ingestion Feed
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{needs.length} Active Signals</span>
              <button 
                onClick={handleClearAll}
                className="text-[11px] bg-red-900/20 text-red-400 border border-red-800/40 px-3 py-1.5 rounded-lg hover:bg-red-900/40 transition-all font-bold"
              >
                Clear All
              </button>
            </div>
          </div>
          
          <div className="flex flex-col lg:flex-row">
            {/* Input Form Area */}
            <div className="w-full lg:w-[400px] p-6 border-r border-gray-800 bg-[#121212]/50">
               <form onSubmit={handleIngest} className="flex flex-col space-y-4 relative">
                  <div className="relative">
                    <textarea 
                      value={ingestText}
                      onChange={e => setIngestText(e.target.value)}
                      placeholder="Paste rescue ping... or use Voice Mic" 
                      className="w-full bg-[#1a1a1a] border border-gray-700 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-blue-500 min-h-[120px] shadow-inner"
                    />
                    <button 
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`absolute bottom-3 right-3 p-3 rounded-full transition-all ${isRecording ? 'bg-red-600 animate-pulse scale-110 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-[#2a2a2a] hover:bg-gray-700 border border-gray-600 text-gray-300'}`}
                    >
                      {isRecording ? <StopCircleIcon className="w-5 h-5 text-white" /> : <MicrophoneIcon className="w-5 h-5" />}
                    </button>
                  </div>
                  
                  <button type="submit" disabled={isIngesting} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg transition-all active:scale-[0.98]">
                    {isIngesting ? 'AI Analyzing...' : 'Process Ingestion'}
                  </button>
               </form>
            </div>

            {/* Horizontal Scroll Area */}
            <div className="flex-1 overflow-x-auto p-6 flex gap-5 custom-scrollbar bg-[#0f172a]/20">
              {needs.length === 0 && (
                <div className="flex flex-col items-center justify-center w-full text-gray-600 py-10 italic">
                  <p>Awaiting distress signals...</p>
                </div>
              )}
              {needs.map(need => {
                const isResolved = need.status === 'RESOLVED';
                const crisisStyle = getCrisisStyle(need.crisisType);
                return (
                  <div 
                    key={need.id} 
                    className={`min-w-[320px] max-w-[320px] p-5 rounded-2xl border transition-all cursor-pointer hover:translate-y-[-4px] relative shadow-lg ${isResolved ? 'opacity-50 grayscale-[0.5] border-green-900/30' : selectedNeed?.id === need.id ? 'border-blue-500 ring-2 ring-blue-500/20 bg-[#252535]' : 'border-gray-800 bg-[#1a1a1a] hover:border-gray-600'}`}
                    onClick={() => { setSelectedNeed(need); setDispatchResult(null); }}
                    style={{ borderTop: `6px solid ${isResolved ? '#10B981' : crisisStyle.borderColor}` }}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[11px] mono text-blue-400 font-bold uppercase tracking-widest">{need?.location?.name || 'Unknown'}</span>
                      <span className="text-[11px] text-gray-500 mono flex items-center bg-gray-900 px-2 py-1 rounded">
                         {need?.reportedAt ? format(need.reportedAt, 'HH:mm') : '--:--'}
                      </span>
                    </div>
                    
                    <div className="mb-4">
                      <h4 className="text-[15px] font-bold text-white capitalize flex items-center">
                        <span className="text-xl mr-3">{getCrisisStyle(need?.crisisType || 'other').icon}</span>
                        {need?.crisisType || 'Report'}
                      </h4>
                    </div>
                    
                    <div className="h-1.5 w-full bg-gray-800 rounded-full mb-4 overflow-hidden">
                      <div className={`h-full ${getSlaStatus(need?.reportedAt || Date.now()).color}`} style={{ width: `${Math.min(100, (differenceInMinutes(Date.now(), need?.reportedAt || Date.now()) / 60) * 100)}%`}}></div>
                    </div>

                    <div className="flex justify-between items-center text-[11px] mono mb-4">
                       <span className={`font-bold ${getGoldenHourColor(need?.reportedAt || Date.now())}`}>
                          {need?.reportedAt ? formatDistanceToNow(need.reportedAt) : '??'} ago
                       </span>
                       <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${need?.status === 'CRITICAL_VELOCITY' ? 'bg-red-900/50 text-red-400 border border-red-800/50' : 'bg-blue-900/50 text-blue-400 border border-blue-800/50'}`}>
                          {need?.status || 'OPEN'}
                       </span>
                    </div>
                    
                    <div className="flex justify-between items-center border-t border-gray-800 pt-4">
                        <span className="text-xs text-gray-400 font-medium">Criticality: <span className="text-white font-bold">{(need?.criticalityScore || 0).toFixed(0)}</span></span>
                        {!isResolved && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleResolve(need.id); }}
                            className="text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 px-3 py-1 rounded-lg hover:bg-green-500/20 transition-all font-bold"
                          >
                            Resolve
                          </button>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* PANEL 2: Global Heatmap (Expanded) */}
        <section className="w-full bg-[#1e1e1e] rounded-2xl border border-gray-800 overflow-hidden shadow-2xl flex flex-col relative h-[650px]">
          <div className="p-4 absolute top-4 left-6 z-[1000] pointer-events-none">
            <div className="inline-block bg-[rgba(7,11,20,0.8)] backdrop-blur-xl px-6 py-4 rounded-2xl border border-white/10 pointer-events-auto shadow-2xl flex items-center space-x-6">
              <h2 className="text-base font-bold text-white flex items-center">
                 <span className="flex items-center text-[#EF4444] text-[0.7rem] tracking-widest mr-4 border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-1 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                   <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse mr-2">LIVE</span>
                 </span>
                 Crisis Heatmap & Prediction Engine
              </h2>
              <div className="h-8 w-px bg-white/10"></div>
              <div className="flex bg-[#222] p-1.5 rounded-xl border border-gray-800 shadow-inner">
                <button 
                  onClick={() => setMapLayer('dark')}
                  className={`px-4 py-1.5 text-[11px] rounded-lg transition-all font-bold ${mapLayer === 'dark' ? 'bg-[#3B82F6] text-white shadow-lg' : 'text-white/70 hover:text-white bg-transparent'}`}
                >
                  Dark
                </button>
                <button 
                  onClick={() => setMapLayer('satellite')}
                  className={`px-4 py-1.5 text-[11px] rounded-lg transition-all font-bold ${mapLayer === 'satellite' ? 'bg-[#3B82F6] text-white shadow-lg' : 'text-white/70 hover:text-white bg-transparent'}`}
                >
                  Satellite
                </button>
            </div>
          </div>
        </div>
        <div className="flex-1 relative z-10">
            <MapContainer center={center} zoom={12} style={mapContainerStyle} zoomControl={false}>
              <ChangeView 
                center={selectedNeed ? [selectedNeed.location.lat, selectedNeed.location.lng] : center} 
                zoom={selectedNeed ? 14 : 12} 
              />
              <TileLayer
                url={mapLayer === 'dark' 
                  ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                }
                attribution={mapLayer === 'dark'
                  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  : 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                }
              />
              {(needs || []).filter(n => n?.location?.lat && n?.location?.lng).map(need => (
                <Circle
                  key={need.id}
                  center={[need.location.lat, need.location.lng]}
                  radius={500}
                  pathOptions={{ 
                    color: need.status === 'RESOLVED' ? '#10B981' : (need.criticalityScore > 75 ? '#EF4444' : '#F59E0B'),
                    fillOpacity: 0.2
                  }}
                  eventHandlers={{
                    click: () => setSelectedNeed(need)
                  }}
                />
              ))}

              {/* Predicted Risk Zones */}
              {predictions.map((p, idx) => {
                const cityMap: Record<string, [number, number]> = {
                  'Mumbai': [19.0760, 72.8777],
                  'Delhi': [28.6139, 77.2090],
                  'Bengaluru': [12.9716, 77.5946],
                  'Chennai': [13.0827, 80.2707],
                  'Kolkata': [22.5726, 88.3639],
                  'Hyderabad': [17.3850, 78.4867]
                };
                const coords = cityMap[p.city] || center;
                return (
                  <Circle
                    key={`pred-${idx}`}
                    center={coords}
                    radius={1500}
                    pathOptions={{ 
                      color: '#f97316', 
                      fillColor: '#f97316',
                      fillOpacity: 0.1,
                      dashArray: '5, 10',
                      weight: 1
                    }}
                    className="animate-pulse-prediction"
                  />
                );
              })}
              <HeatmapOverlay data={heatmapData} />
            </MapContainer>

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
              <div className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-[#6B7280] mr-2"></span>
                <span className="text-white/80">⚫ Resolved</span>
              </div>
            </div>
          </div>
        </section>

        {/* PANEL 3: Dispatch Central (Bottom Full Width) */}
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
                <p className="text-gray-500 max-w-[360px] leading-relaxed">Select any crisis report from the feed above or map to activate AI-powered volunteer matching.</p>
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
                    
                    {/* Criticality Score UI math breakdown */}
                    <div className="mt-8 pt-6 border-t border-gray-800">
                      <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-4 font-bold">AI Analytical Engine Breakdown</p>
                      <div className="flex items-center gap-3 font-mono">
                        <div className="flex-1 text-center bg-[#1a1a1a] rounded-xl py-4 px-2 border border-gray-800">
                          <span className="text-lg font-bold text-white">{(((selectedNeed?.reportCount || 1) / (Math.max((Date.now() - (selectedNeed?.reportedAt || Date.now())) / (1000 * 60 * 60), 0.1)) * 5)*0.4).toFixed(0)}</span>
                          <span className="text-[9px] block uppercase text-gray-600 mt-1">Velocity</span>
                        </div>
                        <div className="text-gray-700 font-bold">+</div>
                        <div className="flex-1 text-center bg-[#1a1a1a] rounded-xl py-4 px-2 border border-gray-800">
                          <span className="text-lg font-bold text-white">{(100 * 0.4).toFixed(0)}</span>
                          <span className="text-[9px] block uppercase text-gray-600 mt-1">Severity</span>
                        </div>
                        <div className="text-gray-700 font-bold">+</div>
                        <div className="flex-1 text-center bg-[#1a1a1a] rounded-xl py-4 px-2 border border-gray-800">
                          <span className="text-lg font-bold text-white">{(Math.min(100, (selectedNeed?.estimatedScale || 0) * 5) * 0.2).toFixed(0)}</span>
                          <span className="text-[9px] block uppercase text-gray-600 mt-1">Vulnera.</span>
                        </div>
                        <div className="text-gray-700 font-bold">=</div>
                        <div className={`flex-1 text-center font-bold rounded-xl py-4 px-2 shadow-lg border border-white/5 ${getScoreColor(selectedNeed?.criticalityScore || 0)}`}>
                          <span className="text-lg">{(selectedNeed?.criticalityScore || 0).toFixed(1)}</span>
                          <span className="text-[9px] block uppercase text-white/50 mt-1">Total</span>
                        </div>
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
                          <div className="text-right">
                             <p className="text-2xl font-bold text-[#10B981]">{(dispatchResult.volunteer.reliabilityRate * 100).toFixed(0)}%</p>
                             <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Reliability Score</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                           <span className="bg-blue-600/20 text-blue-400 px-4 py-1.5 rounded-lg text-xs font-bold border border-blue-500/20">{dispatchResult.volunteer.preferredLanguage} Specialist</span>
                           <span className="bg-purple-600/20 text-purple-400 px-4 py-1.5 rounded-lg text-xs font-bold border border-purple-500/20">{dispatchResult.volunteer.hoursLast30Days}h Contributed</span>
                        </div>
                      </div>

                      <div className="bg-[#121212] p-8 rounded-2xl border border-gray-800 relative shadow-2xl">
                        <h4 className="text-[10px] font-bold text-indigo-400 mb-2 absolute -top-2.5 left-8 bg-[#0D1421] px-4 py-0.5 border border-indigo-500/30 rounded-full uppercase tracking-widest">AI Generated Coordination Message</h4>
                        <p className="text-sm text-gray-300 mt-4 whitespace-pre-wrap font-mono relative z-10 leading-[1.8] italic">
                          "{dispatchResult.dispatchMessage}"
                        </p>
                        <div className="mt-8 flex gap-4">
                           <button className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.417-.003 6.557-5.338 11.892-11.893 11.892-1.997 0-3.951-.5-5.688-1.448l-6.305 1.652zm6.599-3.835c1.474.875 3.129 1.336 4.815 1.336 4.903 0 8.895-3.991 8.897-8.895 0-2.378-.926-4.613-2.607-6.294-1.681-1.682-3.916-2.607-6.292-2.608-4.902 0-8.893 3.992-8.895 8.895-.001 1.705.452 3.37 1.312 4.83l-.443 1.617 1.657-.434zm10.741-6.19c-.274-.137-1.62-.799-1.87-.891-.25-.091-.432-.137-.613.137-.182.274-.705.891-.864 1.073-.159.182-.318.205-.591.068-.273-.136-1.152-.424-2.196-1.356-.812-.724-1.36-1.618-1.52-1.891-.159-.274-.017-.422.12-.558.123-.122.273-.318.41-.478.136-.159.182-.273.273-.455.091-.182.046-.341-.023-.478-.068-.137-.613-1.478-.841-2.024-.221-.534-.442-.461-.613-.47h-.523c-.182 0-.477.068-.727.341s-.954.932-.954 2.273.977 2.636 1.114 2.819c.136.182 1.922 2.935 4.655 4.116.65.281 1.157.448 1.552.574.653.208 1.248.178 1.717.108.524-.078 1.62-.663 1.848-1.301.227-.638.227-1.185.159-1.301-.069-.116-.25-.182-.524-.319z"/></svg>
                             Send WhatsApp
                           </button>
                           <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                             <PaperAirplaneIcon className="h-5 w-5" />
                             Push Notification
                           </button>
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
      </main>
    </div>
  );

  const getPageTitle = () => {
    if (location.pathname === '/') return 'Live Dashboard';
    if (location.pathname === '/volunteers') return 'Volunteers';
    if (location.pathname === '/analytics') return 'Analytics';
    if (location.pathname === '/ai-assistant') return 'AI Assistant';
    if (location.pathname === '/history') return 'Crisis History';
    return '';
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: '⚡' },
    { path: '/volunteers', label: 'Volunteers', icon: '👥' },
    { path: '/analytics', label: 'Analytics', icon: '📊' },
    { path: '/ai-assistant', label: 'AI Assistant', icon: '🤖' },
    { path: '/history', label: 'History', icon: '📋' },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0D1421] text-white font-sans">
      {/* SIDEBAR */}
      <div className="w-[240px] flex-shrink-0 h-full bg-[#0D1421] border-r border-white/[0.06] flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-white/[0.06]">
           <div className="flex items-center space-x-2">
              <BoltIcon className="w-5 h-5 text-blue-500" />
              <span className="font-bold text-[1rem] tracking-tight">CommunityPulse</span>
           </div>
           <div className="flex items-center mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse mr-2"></span>
              <span className="text-[#10B981] text-[0.65rem] uppercase tracking-wider font-bold">Live</span>
           </div>
        </div>
        
        {/* Nav Links */}
        <div className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto">
           {navItems.map(item => {
             const isActive = location.pathname === item.path;
             return (
               <div 
                 key={item.path}
                 onClick={() => navigate(item.path)}
                 className={`w-full rounded-lg px-[14px] py-[10px] flex items-center gap-2.5 cursor-pointer transition-all duration-150 ${isActive ? 'bg-blue-500/12 border border-blue-500/25 text-white' : 'text-[#8B9CB8] border border-transparent hover:bg-white/[0.04] hover:text-white'}`}
               >
                 <span className="text-sm">{item.icon}</span>
                 <span className="font-medium text-[0.85rem]">{item.label}</span>
               </div>
             )
           })}
        </div>

        {/* Status Card */}
        <div className="p-4 border-t border-white/[0.06]">
           <div className="bg-[#121927] rounded border border-white/[0.04] p-3 shadow-inner">
              <p className="font-semibold text-[0.65rem] text-[#8B9CB8] uppercase tracking-wider mb-2">System Status</p>
              <div className="flex items-center mb-1">
                 <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] mr-1.5"></span>
                 <p className="font-bold text-[0.75rem] text-[#10B981] uppercase tracking-wider">All systems operational</p>
              </div>
              <p className="text-[0.8rem] text-[#8B9CB8] font-mono font-bold">{timeStr}</p>
           </div>
        </div>

        {/* UN SDGs Addressed */}
        <div className="p-4 border-t border-white/[0.06] pb-8">
           <p className="font-semibold text-[0.65rem] text-[#8B9CB8] uppercase tracking-[0.15em] mb-4">Humanitarian Impact</p>
           <div className="flex flex-wrap gap-3">
              {[
                { id: 1, name: "No Poverty", color: "#E5243B" },
                { id: 3, name: "Health & Well-being", color: "#4C9F38" },
                { id: 11, name: "Sustainable Cities", color: "#FD9D24" },
                { id: 13, name: "Climate Action", color: "#3F7E44" }
              ].map(sdg => (
                <div 
                  key={sdg.id}
                  className="relative group flex items-center justify-center w-9 h-9 rounded-lg shadow-lg text-white font-black text-sm transition-all duration-300 hover:scale-110 cursor-default"
                  style={{ backgroundColor: sdg.color }}
                >
                  {sdg.id}
                  
                  {/* Premium Styled Tooltip - Positioned TOP to avoid overlap */}
                  <div className="absolute bottom-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 translate-y-2 group-hover:translate-y-0 z-[5000] whitespace-nowrap">
                    <div className="bg-[#1e293b] text-white text-[11px] font-bold px-3 py-2 rounded-xl border border-white/20 shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sdg.color }}></div>
                       {sdg.name}
                    </div>
                    {/* Tooltip Arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#1e293b]"></div>
                  </div>
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full bg-[#121212] overflow-hidden relative">
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
                  <span className="text-white font-bold">{alert.location.name}</span> • {alert.crisisType} Crisis<br/>
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


