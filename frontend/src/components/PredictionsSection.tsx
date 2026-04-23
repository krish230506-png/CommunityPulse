import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Prediction {
  city: string;
  predictedCrisisType: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidenceScore: number;
  reasoning: string;
  recommendedPreventiveAction: string;
}

const PredictionsSection: React.FC = () => {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchPredictions = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/predictions');
      setPredictions(res.data.predictions);
      setLastUpdated(res.data.lastUpdated);
    } catch (error) {
      console.error('Error fetching predictions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
    const refreshInterval = setInterval(fetchPredictions, 90000);
    const counterInterval = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
      }
    }, 1000);
    return () => {
      clearInterval(refreshInterval);
      clearInterval(counterInterval);
    };
  }, [lastUpdated]);

  const getRiskStyles = (level: string) => {
    switch (level) {
      case 'CRITICAL': return { border: '#ef4444', text: '#f87171', bg: 'rgba(239,68,68,0.12)', borderBadge: 'rgba(239,68,68,0.25)', dot: 'bg-red-500 animate-pulse-red' };
      case 'HIGH': return { border: '#f97316', text: '#fb923c', bg: 'rgba(249,115,22,0.12)', borderBadge: 'rgba(249,115,22,0.25)', dot: 'bg-orange-500 animate-pulse-orange' };
      case 'MEDIUM': return { border: '#eab308', text: '#fbbf24', bg: 'rgba(234,179,8,0.1)', borderBadge: 'rgba(234,179,8,0.25)', dot: '' };
      case 'LOW': return { border: '#22c55e', text: '#4ade80', bg: 'rgba(34,197,94,0.1)', borderBadge: 'rgba(34,197,94,0.25)', dot: '' };
      default: return { border: '#4b5563', text: '#9ca3af', bg: 'rgba(75,85,99,0.1)', borderBadge: 'rgba(75,85,99,0.25)', dot: '' };
    }
  };

  const getIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'flood': return '🌊';
      case 'fire': return '🔥';
      case 'medical': return '🏥';
      case 'storm': return '🌪';
      case 'power': return '⚡';
      case 'traffic': return '🚗';
      default: return '⚠️';
    }
  };

  if (loading) return <div className="p-8 text-center text-[#4b5563]">Analyzing patterns...</div>;

  return (
    <div className="bg-[#0f1117] rounded-xl p-6 mb-8 border border-[#1e2130]">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mr-4" style={{ background: 'linear-gradient(135deg, #f97316, #fb923c)', boxShadow: '0 0 10px rgba(249,115,22,0.4)' }}>
            <span className="text-white text-xl">⚡</span>
          </div>
          <div>
            <h2 className="text-[1.2rem] font-semibold text-[#e2e8f0] leading-none mb-2">
              AI Predictive Intelligence — Next 6 Hours
            </h2>
            <p className="text-[0.75rem] text-[#6b7280] italic">
              Predictions based on incident patterns and regional data analysis
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-[0.75rem] text-[#4b5563] font-mono">
            Last predicted: {secondsAgo}s ago
          </span>
          <button 
            onClick={fetchPredictions}
            className="w-8 h-8 flex items-center justify-center bg-[#131823] border border-[#1e2130] rounded-md hover:bg-[#1a2236] transition-colors text-[#e2e8f0]"
          >
            🔄
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[10px]">
        {predictions.map((p, idx) => {
          const styles = getRiskStyles(p.riskLevel);
          return (
            <div key={idx} className="bg-[#131823] border border-[#1e2130] rounded-[10px] p-5 relative overflow-hidden flex flex-col" style={{ borderTop: `2px solid ${styles.border}` }}>
              {/* Top Accent Glow */}
              <div className="absolute top-0 left-0 w-full h-16 pointer-events-none" style={{ background: `linear-gradient(to bottom, ${styles.border}0F, transparent)` }}></div>
              
              <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col">
                  <h3 className="text-[16px] font-bold text-[#f1f5f9] mb-1">{p.city}</h3>
                  <p className="text-[11.5px] text-[#6b7280] flex items-center">
                    <span className="mr-1.5">{getIcon(p.predictedCrisisType)}</span>
                    <span className="capitalize">{p.predictedCrisisType} Risk</span>
                  </p>
                </div>
                <div className={`px-2 py-0.5 rounded text-[9.5px] font-bold border flex items-center uppercase tracking-wider`} style={{ backgroundColor: styles.bg, color: styles.text, borderColor: styles.borderBadge }}>
                  {styles.dot && <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${styles.dot}`}></span>}
                  {p.riskLevel}
                </div>
              </div>

              {/* Confidence Ring Section */}
              <div className="bg-[rgba(255,255,255,0.02)] border border-[#1a2236] rounded-[7px] p-3 flex items-center mb-5">
                <div className="relative w-[40px] h-[40px] mr-3">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="20"
                      cy="20"
                      r="18"
                      stroke="#1a2236"
                      strokeWidth="3"
                      fill="transparent"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="18"
                      stroke={styles.border}
                      strokeWidth="3"
                      fill="transparent"
                      strokeDasharray={113.1}
                      strokeDashoffset={113.1 - (113.1 * p.confidenceScore) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-[#f1f5f9]">
                    {p.confidenceScore}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-[#4b5563] uppercase font-bold tracking-tight">Confidence Score</span>
                  <span className="text-[12px] font-mono text-[#f1f5f9]">{p.confidenceScore} / 100</span>
                </div>
              </div>

              <p className="text-[11px] italic text-[#4b5563] leading-relaxed mb-6 border-l-2 border-[#1e2a3a] pl-[9px]">
                "{p.reasoning}"
              </p>

              <div className="bg-[rgba(255,255,255,0.025)] border border-[#1e2a3a] rounded-[7px] p-3 mt-auto">
                <p className="text-[9.5px] font-bold text-[#374151] uppercase mb-2 flex items-center">
                  <span className="text-[#22c55e] mr-1.5">●</span>
                  Recommended Action
                </p>
                <p className="text-[11px] text-[#6b7280] leading-snug">{p.recommendedPreventiveAction}</p>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-8 pt-4 border-t border-[#111827] text-[10.5px] text-[#1f2937] text-center font-medium">
        These are AI-generated predictions, not confirmed incident reports. Use for pre-emptive resource staging only.
      </div>
    </div>
  );
};

export default PredictionsSection;
