import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import type { NeedEntity, VolunteerProfile } from './types';
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { formatDistanceToNow, differenceInMinutes, format } from 'date-fns';
import { BoltIcon, ExclamationTriangleIcon, PaperAirplaneIcon, SignalIcon, SignalSlashIcon, MicrophoneIcon, StopCircleIcon, BellAlertIcon } from '@heroicons/react/24/outline';
import { saveOfflineReport, syncOfflineReports, clearOfflineQueue } from './offlineSync';

import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import VolunteersPage from './pages/VolunteersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import HistoryPage from './pages/HistoryPage';

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

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      setTimeStr(new Date().toLocaleTimeString());
    }, 60000); // Update every minute for timers
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
    <div className="flex-1 flex flex-col p-6 overflow-hidden box-border h-full relative">
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
        <div className="flex-shrink-0 mb-6 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/15 rounded-xl p-4 flex justify-between items-center relative shadow-xl">
          <h3 className="font-bold text-white tracking-wide ml-2">🚨 CommunityPulse AI is live and monitoring {new Set(needs.filter(n => n?.location?.name).map(n => n.location.name)).size || 4} cities</h3>
          
          <div className="flex space-x-10 mr-8">
             <div className="flex flex-col items-center">
                <span className="text-white text-2xl mono font-bold leading-none">{needs.filter(n => n?.status === 'OPEN').length}</span>
                <span className="text-blue-300/80 text-[10px] uppercase tracking-[0.1em] font-bold mt-1">Active Crises</span>
             </div>
             <div className="flex flex-col items-center">
                <span className="text-white text-2xl mono font-bold leading-none">{(volunteers || []).filter(v => v?.status === 'AVAILABLE').length || 184}</span>
                <span className="text-purple-300/80 text-[10px] uppercase tracking-[0.1em] font-bold mt-1">Volunteers Ready</span>
             </div>
             <div className="flex flex-col items-center">
                <span className="text-white text-2xl mono font-bold leading-none">
                  {needs.length ? (needs.reduce((a, b) => a + (b?.criticalityScore || 0), 0) / needs.length).toFixed(0) : 0}
                </span>
                <span className="text-indigo-300/80 text-[10px] uppercase tracking-[0.1em] font-bold mt-1">Avg Severity Score</span>
             </div>
          </div>

          <button onClick={() => setShowBanner(false)} className="absolute top-2 right-2 text-white/40 hover:text-white bg-transparent p-1 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
      )}

      <main className="flex-1 grid grid-cols-12 gap-6 h-full overflow-hidden box-border min-h-0">
        
        {/* PANEL 1: Live Ingestion Feed */}
        <section className="col-span-3 min-w-[280px] bg-[#1e1e1e] rounded-xl border border-gray-800 flex flex-col shadow-xl h-full overflow-hidden">
          <div className="p-4 border-b border-gray-800 bg-[#252525]">
            <h2 className="text-lg font-semibold flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 mr-2 text-warning" />
              Live Ingestion Feed
            </h2>
            <button 
              onClick={handleClearAll}
              className="text-[10px] bg-red-900/30 text-red-400 border border-red-800/50 px-2 py-1 rounded hover:bg-red-900/50 transition-colors focus:outline-none"
            >
              Clear All
            </button>
          </div>
          
          <div className="p-4 border-b border-gray-800 bg-[#121212]">
             <form onSubmit={handleIngest} className="flex flex-col space-y-2 relative">
                <textarea 
                  value={ingestText}
                  onChange={e => setIngestText(e.target.value)}
                  placeholder="Paste rescue ping... or use Voice Mic" 
                  className="w-full bg-[#2a2a2a] border border-gray-700 rounded p-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 min-h-[80px]"
                />
                
                {/* Voice Record Button — click to start, click again to stop */}
                <button 
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`absolute bottom-[42px] right-2 p-2 rounded-full transition-all ${isRecording ? 'bg-red-600 animate-pulse scale-110' : 'bg-[#1e1e1e] hover:bg-gray-700 border border-gray-600 text-gray-300'}`}
                  title={isRecording ? 'Click to stop recording' : 'Click to start voice input'}
                >
                  {isRecording ? <StopCircleIcon className="w-5 h-5 text-white" /> : <MicrophoneIcon className="w-5 h-5" />}
                </button>

                <button type="submit" disabled={isIngesting} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2 rounded shadow text-sm">
                  {isIngesting ? 'AI Processing...' : 'Submit to Pipeline'}
                </button>
             </form>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {needs.length === 0 && <p className="text-gray-500 text-sm">No recent distress signals.</p>}
            {needs.map(need => {
              const isResolved = need.status === 'RESOLVED';
              const crisisStyle = getCrisisStyle(need.crisisType);
              return (
                <div 
                  key={need.id} 
                  className={`p-4 rounded-lg border transition-all cursor-pointer hover:bg-[#2a2a2a] relative animate-slide-in ${isResolved ? 'opacity-50 grayscale-[0.5] border-green-900/30' : selectedNeed?.id === need.id ? 'border-blue-500 bg-[#252535]' : 'border-gray-700 bg-[#252525]'}`}
                  onClick={() => { setSelectedNeed(need); setDispatchResult(null); }}
                  style={{ borderLeft: `4px solid ${isResolved ? '#10B981' : crisisStyle.borderColor}` }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] mono text-gray-500 font-bold uppercase tracking-widest">{need?.location?.name || 'Unknown Location'}</span>
                    <span className="text-[10px] text-gray-500 mono flex items-center">
                       <BoltIcon className="w-3 h-3 mr-1 text-yellow-500" />
                       {need?.reportedAt ? format(need.reportedAt, 'HH:mm') : '--:--'}
                    </span>
                  </div>
                  <div className="mb-2">
                    <h4 className="text-[13px] font-bold text-white capitalize flex items-center">
                      <span className="mr-2">{getCrisisStyle(need?.crisisType || 'other').icon}</span>
                      {need?.crisisType || 'Report'}
                    </h4>
                  </div>
                  
                  {/* Real-time SLA progress bar */}
                  <div className="h-1 w-full bg-gray-800 rounded-full mb-3 overflow-hidden">
                    <div className={`h-full ${getSlaStatus(need?.reportedAt || Date.now()).color}`} style={{ width: `${Math.min(100, (differenceInMinutes(Date.now(), need?.reportedAt || Date.now()) / 60) * 100)}%`}}></div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] mono">
                     <span className={`font-bold ${getGoldenHourColor(need?.reportedAt || Date.now())}`}>
                        {need?.reportedAt ? formatDistanceToNow(need.reportedAt) : '??'} ago
                     </span>
                     <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${need?.status === 'CRITICAL_VELOCITY' ? 'bg-red-900/50 text-red-400 border border-red-800/50' : 'bg-blue-900/50 text-blue-400 border border-blue-800/50'} ${need?.status === 'OPEN' ? 'animate-pulse-open' : ''}`}>
                        {need?.status || 'OPEN'}
                     </span>
                  </div>
                  
                  <div className="mt-3 flex justify-between items-center border-t border-gray-800/50 pt-2">
                      <span className="text-[11px] text-gray-400">Score: <span className="text-white font-bold">{(need?.criticalityScore || 0).toFixed(0)}</span></span>
                      {need?.status !== 'RESOLVED' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleResolve(need.id); }}
                          className="text-[10px] bg-green-900/30 text-green-400 border border-green-800/50 px-2 py-0.5 rounded hover:bg-green-600/40 transition-all font-bold"
                        >
                          Resolve
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="col-span-6 bg-[#1e1e1e] rounded-xl border border-gray-800 overflow-hidden shadow-xl flex flex-col pt-1 relative h-full">
          <div className="p-4 absolute top-2 left-2 z-[1000] pointer-events-none">
            <div className="inline-block bg-[rgba(7,11,20,0.85)] backdrop-blur-md px-5 py-3 rounded-xl border border-white/10 pointer-events-auto shadow-2xl flex items-center space-x-4">
              <h2 className="text-sm font-bold text-white flex items-center">
                 <span className="flex items-center text-[#EF4444] text-[0.65rem] tracking-widest mr-3 border border-[#EF4444]/30 bg-[#EF4444]/10 px-2 py-0.5 rounded shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                   <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse mr-1.5 font-mono">LIVE</span>
                 </span>
                 48h Crisis Heatmap & Dispatch Engine
              </h2>
              <div className="h-6 w-px bg-white/10"></div>
              <div className="flex bg-[#222] p-1 rounded-full border border-gray-800">
                <button 
                  onClick={() => setMapLayer('dark')}
                  className={`px-3 py-1 text-[10px] rounded-full transition-all font-bold ${mapLayer === 'dark' ? 'bg-[#3B82F6] text-white' : 'text-white/70 hover:text-white bg-transparent'}`}
                >
                  Dark
                </button>
                <button 
                  onClick={() => setMapLayer('satellite')}
                  className={`px-3 py-1 text-[10px] rounded-full transition-all font-bold ${mapLayer === 'satellite' ? 'bg-[#3B82F6] text-white' : 'text-white/70 hover:text-white bg-transparent'}`}
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
              <HeatmapOverlay data={heatmapData} />
            </MapContainer>
          </div>
        </section>

        {/* PANEL 3: Dispatch Queue */}
        <section className="col-span-3 bg-[#1e1e1e] rounded-xl border border-gray-800 overflow-hidden flex flex-col shadow-xl h-full">
          <div className="p-4 border-b border-gray-800 bg-[#252525]">
            <h2 className="text-lg font-semibold flex items-center">
              <PaperAirplaneIcon className="h-5 w-5 mr-2 text-indigo-400" />
              Dispatch Central
            </h2>
          </div>
          <div className="flex-1 p-4 overflow-y-auto w-full">
            {!selectedNeed ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-indigo-900/20 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                </div>
                <h3 className="font-bold text-lg text-gray-200 mb-2">No Crisis Selected</h3>
                <p className="text-sm text-gray-500 max-w-[240px] mb-8 leading-relaxed">Click any crisis card or map pin to begin AI-powered dispatch.</p>
                
                <div className="flex space-x-3 w-full justify-center opacity-80">
                   <div className="bg-[#121212] border border-gray-800 rounded-lg px-3 py-2 flex flex-col items-center flex-1 shadow-inner">
                      <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Volunteers</span>
                      <span className="text-sm font-['JetBrains_Mono'] font-bold text-[#10B981]">Active</span>
                   </div>
                   <div className="bg-[#121212] border border-gray-800 rounded-lg px-3 py-2 flex flex-col items-center flex-1 shadow-inner">
                      <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Avg Score</span>
                      <span className="text-sm font-['JetBrains_Mono'] font-bold text-[#F59E0B]">
                        {needs.length ? (needs.reduce((a, b) => a + (b?.criticalityScore || 0), 0) / needs.length).toFixed(0) : 0}
                      </span>
                   </div>
                   <div className="bg-[#121212] border border-gray-800 rounded-lg px-3 py-2 flex flex-col items-center flex-1 shadow-inner">
                      <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">Monitored</span>
                      <span className="text-sm font-['JetBrains_Mono'] font-bold text-[#3B82F6]">
                        {new Set(needs.filter(n => n?.location?.name).map(n => n.location.name)).size}
                      </span>
                   </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-[#121212] p-4 rounded-lg border border-gray-800 relative shadow-inner">
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Selected Need</h3>
                  <div className="flex justify-between items-center mb-1">
                     <p className="text-lg text-white">{selectedNeed?.location?.name || 'Selected Site'}</p>
                     <span className={`text-[10px] font-bold px-2 py-0.5 rounded shadow ${getScoreColor(selectedNeed?.criticalityScore || 0)}`}>
                        {(selectedNeed?.criticalityScore || 0).toFixed(0)} SCORE
                     </span>
                  </div>
                  <p className="text-sm text-gray-300">Type: <span className="capitalize border-b border-gray-600">{selectedNeed?.crisisType || 'General'}</span></p>
                  
                  {/* Criticality Score UI math breakdown */}
                  <div className="mt-4 pt-4 border-t border-gray-800 bg-[#1a1a1a] -mx-4 -mb-4 px-4 pb-4 rounded-b-lg">
                    <p className="text-[10px] text-uppercase tracking-wider text-gray-500 mb-2">Mathematical Score Breakdown (Max 100)</p>
                    <div className="flex items-center text-xs font-mono text-gray-300">
                      <div className="flex-1 text-center bg-[#222] rounded py-1 px-1">{(((selectedNeed?.reportCount || 1) / (Math.max((Date.now() - (selectedNeed?.reportedAt || Date.now())) / (1000 * 60 * 60), 0.1)) * 5)*0.4).toFixed(0)} <span className="text-[9px] block opacity-50">Velocity</span></div>
                      <span className="mx-1">+</span>
                      <div className="flex-1 text-center bg-[#222] rounded py-1 px-1">{(100 * 0.4).toFixed(0)} <span className="text-[9px] block opacity-50">Severity</span></div>
                      <span className="mx-1">+</span>
                      <div className="flex-1 text-center bg-[#222] rounded py-1 px-1">{(Math.min(100, (selectedNeed?.estimatedScale || 0) * 5) * 0.2).toFixed(0)} <span className="text-[9px] block opacity-50">Vulnerability</span></div>
                      <span className="mx-1">=</span>
                      <div className={`flex-1 text-center font-bold rounded py-1 px-1 ${getScoreColor(selectedNeed?.criticalityScore || 0)}`}>{(selectedNeed?.criticalityScore || 0).toFixed(1)} <span className="text-[9px] block opacity-50 text-white/50">Total</span></div>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button 
                    onClick={() => handleDispatch(selectedNeed.id)}
                    disabled={loadingDispatch || !isOnline || selectedNeed.status === 'RESOLVED'}
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/50 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all shadow-lg active:scale-[0.98] flex justify-center items-center text-sm"
                  >
                    {loadingDispatch ? (
                      <span className="flex items-center"><span className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent mr-2"></span> Dispatching...</span>
                    ) : (
                      selectedNeed.status === 'RESOLVED' ? 'Resolution Complete' : 'Dispatch Volunteer'
                    )}
                  </button>

                  {selectedNeed.status !== 'RESOLVED' && (
                    <button 
                      onClick={() => handleResolve(selectedNeed.id)}
                      className="px-4 py-3 bg-green-900/40 text-green-400 border border-green-800/50 rounded-lg hover:bg-green-900/60 transition-all font-bold text-sm flex items-center"
                      title="Mark as Resolved"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>

                {dispatchResult && (
                  <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-[#252525] p-4 rounded-lg border border-green-800/30 shadow-lg">
                      <h4 className="text-xs text-uppercase text-gray-400 mb-1 tracking-wider uppercase">Assigned To</h4>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-medium text-green-400">{dispatchResult.volunteer.name}</span>
                        <span className="text-xs bg-[#121212] px-2 py-1 rounded text-gray-400 border border-gray-800">{(dispatchResult.volunteer.reliabilityRate * 100).toFixed(1)}% Rating</span>
                      </div>
                      <div className="flex items-center mt-2 text-xs text-gray-500">
                         <span className="bg-blue-900/40 text-blue-300 px-2 rounded mr-2">{dispatchResult.volunteer.preferredLanguage} Speaker</span>
                         Hours: {dispatchResult.volunteer.hoursLast30Days}/20
                      </div>
                    </div>

                    <div className="bg-[#121212] p-4 rounded-lg border border-gray-800 relative shadow-inner">
                      <h4 className="text-[10px] text-gray-400 mb-2 absolute -top-2 left-4 bg-[#121212] px-2 py-0 border border-gray-800 rounded">AI Personalised WhatsApp Text</h4>
                      <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap font-mono relative z-10 leading-relaxed">
                        {dispatchResult.dispatchMessage}
                      </p>
                    </div>
                  </div>
                )}
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
        <div className="p-4 border-t border-white/[0.06] pb-6">
           <p className="font-semibold text-[0.65rem] text-[#8B9CB8] uppercase tracking-wider mb-3">UN SDGs Addressed</p>
           <div className="flex gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded shadow-md bg-[#E5243B] text-white font-bold text-xs" title="SDG 1: No Poverty">1</div>
              <div className="flex items-center justify-center w-7 h-7 rounded shadow-md bg-[#4C9F38] text-white font-bold text-xs" title="SDG 3: Good Health and Well-being">3</div>
              <div className="flex items-center justify-center w-7 h-7 rounded shadow-md bg-[#FD9D24] text-white font-bold text-xs" title="SDG 11: Sustainable Cities and Communities">11</div>
              <div className="flex items-center justify-center w-7 h-7 rounded shadow-md bg-[#3F7E44] text-white font-bold text-xs" title="SDG 13: Climate Action">13</div>
           </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full bg-[#121212] overflow-hidden relative">
         {/* Top Bar inside main */}
         <div className="h-[56px] flex-shrink-0 bg-[#070B14] border-b border-white/[0.06] px-6 flex justify-between items-center z-50">
            <div className="flex items-center space-x-4">
              <h2 className="font-bold text-[1rem] text-white">{getPageTitle()}</h2>
              {/* Added the simulate button back into the top bar! */}
              {!isSimulating ? (
                <button onClick={startSimulation} className="bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center shadow-lg h-7 ml-4">
                  <BoltIcon className="w-3 h-3 mr-1" /> ⚡ Simulate Crisis
                </button>
              ) : (
                <button onClick={stopSimulation} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center animate-pulse h-7 ml-4">
                  <StopCircleIcon className="w-3 h-3 mr-1" /> Stop Sim ({simCount}/5)
                </button>
              )}
            </div>
            <div className="flex items-center space-x-4">
               {isOnline ? (
                 <span className="flex items-center text-green-400 bg-green-500/10 px-2 py-1 rounded-full text-xs font-bold border border-green-500/20"><SignalIcon className="w-3 h-3 mr-1" /> Online Mode</span>
               ) : (
                 <span className="flex items-center text-red-400 bg-red-500/10 px-2 py-1 rounded-full text-xs font-bold border border-red-500/20"><SignalSlashIcon className="w-3 h-3 mr-1" /> Offline</span>
               )}
               <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs text-white shadow shadow-blue-500/20 border border-blue-400/30">AD</div>
            </div>
         </div>
         
         {/* Content Router */}
         <div className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={dashboardContent} />
              <Route path="/volunteers" element={<VolunteersPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
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
    </div>
  );
}


