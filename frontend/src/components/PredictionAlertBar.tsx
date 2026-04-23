import React, { useEffect, useState } from 'react';
import type { Prediction } from '../types';

interface PredictionAlertBarProps {
  predictions: Prediction[];
}

const PredictionAlertBar: React.FC<PredictionAlertBarProps> = ({ predictions }) => {
  const [highRiskPrediction, setHighRiskPrediction] = useState<Prediction | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!predictions || predictions.length === 0) {
      Promise.resolve().then(() => setHighRiskPrediction(null));
      return;
    }
    const highRisk = predictions.find(
      (p: Prediction) => p.riskLevel === 'HIGH' || p.riskLevel === 'CRITICAL'
    );
    // Push to next tick to avoid synchronous cascading render warning
    Promise.resolve().then(() => setHighRiskPrediction(highRisk || null));
  }, [predictions]);

  if (!highRiskPrediction || dismissed) return null;

  return (
    <div className="mx-4 mt-2 mb-4 p-3 rounded-lg border flex items-center justify-between transition-all bg-[rgba(234,179,8,0.08)] border-[rgba(234,179,8,0.25)]">
      <div className="flex items-center space-x-3 overflow-hidden">
        <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24] animate-pulse-orange shrink-0"></span>
        <div className="text-[12px] text-[#fbbf24] font-medium truncate">
          AI prediction: <span className="font-bold uppercase">{highRiskPrediction.riskLevel}</span> {highRiskPrediction.predictedCrisisType} risk in {highRiskPrediction.city} in the next 6 hours — {highRiskPrediction.recommendedPreventiveAction}
        </div>
      </div>
      <button 
        onClick={() => setDismissed(true)}
        className="ml-4 p-1 hover:bg-[#fbbf24]/10 rounded text-[#fbbf24]/60 hover:text-[#fbbf24] transition-colors"
      >
        ✕
      </button>
    </div>
  );
};

export default PredictionAlertBar;
