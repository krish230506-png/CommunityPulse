import React, { useMemo } from 'react';
import { SparklesIcon } from '@heroicons/react/24/solid';
import type { NeedEntity } from '../types';

interface AISummaryPanelProps {
  needs: NeedEntity[];
}

export default function AISummaryPanel({ needs }: AISummaryPanelProps) {
  const summary = useMemo(() => {
    const activeNeeds = needs.filter(n => n.status !== 'RESOLVED');
    if (activeNeeds.length === 0) {
      return "All quiet. No active crises detected by CommunityPulse AI.";
    }

    const highPriority = activeNeeds.filter(n => n.criticalityScore > 70);
    const topCrisis = highPriority.length > 0 
      ? highPriority.sort((a, b) => b.criticalityScore - a.criticalityScore)[0]
      : activeNeeds.sort((a, b) => b.criticalityScore - a.criticalityScore)[0];

    const locationName = topCrisis.location?.name || 'an unknown location';
    const crisisType = topCrisis.crisisType || 'general';
    const scale = topCrisis.estimatedScale || 'several';
    
    let summaryText = `High priority ${crisisType} crisis detected in ${locationName} affecting ~${scale} people. Immediate volunteer dispatch recommended.`;
    
    if (activeNeeds.length > 1) {
      summaryText += ` Monitoring ${activeNeeds.length - 1} other active incidents across the region.`;
    }

    return summaryText;
  }, [needs]);

  return (
    <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/20 border border-indigo-500/30 rounded-xl p-4 shadow-xl flex flex-col mb-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10">
        <SparklesIcon className="w-16 h-16 text-indigo-300" />
      </div>
      <h3 className="text-sm font-bold text-indigo-300 flex items-center mb-3">
        <SparklesIcon className="w-4 h-4 mr-2 text-indigo-400" />
        AI Situation Summary
      </h3>
      <p className="text-gray-200 text-sm leading-relaxed relative z-10 font-medium">
        {summary}
      </p>
    </div>
  );
}
