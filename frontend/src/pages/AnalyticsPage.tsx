import { useState, useEffect } from 'react';
import axios from 'axios';

export default function AnalyticsPage() {
  const [crises, setCrises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('http://localhost:3000/needs')
      .then(res => {
        setCrises(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-6 text-white animate-pulse">Loading Analytics Dashboard...</div>;

  const validCrises = crises || [];
  const extractCity = (name: string) => name.split(' (')[0] || name;

  const uniqueCities = new Set(validCrises.map(c => extractCity(c.location.name))).size;
  const openCrises = validCrises.filter(c => c.status !== "RESOLVED").length;
  const resolvedCrises = validCrises.filter(c => c.status === "RESOLVED").length;

  const typeCounts = validCrises.reduce((acc, c) => {
    const type = c.crisisType.charAt(0).toUpperCase() + c.crisisType.slice(1).toLowerCase();
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const scoreRanges = [
    { label: "0-30", count: validCrises.filter(c => c.criticalityScore <= 30).length, color: "#10B981" },
    { label: "31-60", count: validCrises.filter(c => c.criticalityScore > 30 && c.criticalityScore <= 60).length, color: "#F59E0B" },
    { label: "61-80", count: validCrises.filter(c => c.criticalityScore > 60 && c.criticalityScore <= 80).length, color: "#F97316" },
    { label: "81-100", count: validCrises.filter(c => c.criticalityScore > 80).length, color: "#EF4444" },
  ];

  const typeColors: Record<string, string> = {
    Medical: "#EF4444",
    Infrastructure: "#F59E0B",
    Food: "#10B981",
    Flood: "#3B82F6",
    Water: "#3B82F6",
    Fire: "#F97316"
  };

  const maxTypeCount = Math.max(1, ...Object.values(typeCounts));

  // Calculate Avg Response time by City
  const cityResponseTimes: Record<string, { totalTime: number, count: number }> = {};
  validCrises.filter(c => c.status === 'RESOLVED' && c.resolvedAt).forEach(c => {
    const city = extractCity(c.location.name);
    const timeMs = c.resolvedAt - c.reportedAt;
    if (!cityResponseTimes[city]) cityResponseTimes[city] = { totalTime: 0, count: 0 };
    cityResponseTimes[city].totalTime += timeMs;
    cityResponseTimes[city].count += 1;
  });

  const responseTimeData = Object.entries(cityResponseTimes).map(([city, data]) => ({
    city,
    avgTimeMins: Math.round(data.totalTime / data.count / 60000)
  })).sort((a, b) => b.avgTimeMins - a.avgTimeMins);

  const maxResponseTime = Math.max(1, ...responseTimeData.map(d => d.avgTimeMins));

  return (
    <div className="h-full bg-[#070B14] p-6 overflow-y-auto custom-scrollbar">
      <h1 className="text-[1.6rem] font-bold text-white mb-8">Analytics Overview</h1>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: "Total Crises", value: validCrises.length, color: "#EF4444" },
          { label: "Open Now", value: openCrises, color: "#F59E0B" },
          { label: "Resolved", value: resolvedCrises, color: "#10B981" },
          { label: "Cities Covered", value: uniqueCities, color: "#3B82F6" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-[#16202E] border border-white/[0.08] border-t-[3px] rounded-xl p-5" style={{ borderTopColor: kpi.color }}>
            <p className="text-[0.65rem] text-[#8B9CB8] font-semibold uppercase tracking-[0.1em] mb-2">{kpi.label}</p>
            <p className="text-[2.2rem] text-white mono font-bold leading-none">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Crisis Types */}
        <div className="bg-[#16202E] border border-white/[0.08] rounded-xl p-6 lg:col-span-1">
          <h3 className="text-sm font-semibold text-white mb-6 uppercase tracking-wider">Crisis Distribution</h3>
          <div className="space-y-6">
            {Object.entries(typeCounts).length === 0 ? <p className="text-gray-500 text-sm">No data available.</p> : Object.entries(typeCounts).map(([type, count]) => (
              <div key={type} className="flex items-center group">
                <span className="w-24 text-[0.8rem] text-white font-semibold">{type}</span>
                <div className="flex-1 h-2 bg-[#0D1421] rounded-full mx-4 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${(count as number / maxTypeCount) * 100}%`, backgroundColor: typeColors[type] || '#8B9CB8' }}
                  ></div>
                </div>
                <span className="w-8 text-[0.75rem] text-[#8B9CB8] mono font-bold text-right">{count as number}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Avg Response Time */}
        <div className="bg-[#16202E] border border-white/[0.08] rounded-xl p-6 lg:col-span-1">
          <h3 className="text-sm font-semibold text-white mb-6 uppercase tracking-wider">Avg Response Time</h3>
          <div className="space-y-6">
            {responseTimeData.length === 0 ? <p className="text-gray-500 text-sm mt-8 text-center italic">Resolve an incident to compute AI dispatch metrics.</p> : responseTimeData.map((data) => (
              <div key={data.city} className="flex items-center group">
                <span className="w-24 text-[0.8rem] text-white font-semibold truncate pr-2" title={data.city}>{data.city}</span>
                <div className="flex-1 h-2 bg-[#0D1421] rounded-full mx-4 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${(data.avgTimeMins / maxResponseTime) * 100}%`, backgroundColor: data.avgTimeMins > 120 ? '#EF4444' : data.avgTimeMins > 60 ? '#F59E0B' : '#10B981' }}
                  ></div>
                </div>
                <span className="w-12 text-[0.75rem] text-[#8B9CB8] mono font-bold text-right">{data.avgTimeMins}m</span>
              </div>
            ))}
          </div>
        </div>

        {/* Score Ranges */}
        <div className="bg-[#16202E] border border-white/[0.08] rounded-xl p-6 lg:col-span-1">
          <h3 className="text-sm font-semibold text-white mb-6 uppercase tracking-wider">Severity Segments</h3>
          <div className="flex items-end justify-between h-[160px] pt-4 px-4">
            {scoreRanges.map(range => (
              <div key={range.label} className="flex flex-col items-center flex-1 space-y-4">
                <div className="relative w-10 group">
                  <div 
                    className="w-full rounded-t-lg transition-all duration-1000 ease-out"
                    style={{ height: `${validCrises.length ? (range.count / validCrises.length) * 150 : 0}px`, backgroundColor: range.color }}
                  ></div>
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[0.7rem] mono text-white font-bold bg-black/50 px-1.5 py-0.5 rounded">
                    {range.count}
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[0.7rem] text-white mono font-bold">{range.label}</p>
                  <p className="text-[0.6rem] text-[#8B9CB8] mono">{range.count} Cases</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity Timeline */}
      <div className="bg-[#16202E] border border-white/[0.08] rounded-xl p-6 mb-8">
        <h3 className="text-sm font-semibold text-white mb-6 uppercase tracking-wider">System Activity Log</h3>
        <div className="space-y-4">
          {validCrises.sort((a, b) => b.reportedAt - a.reportedAt).map((crisis) => (
            <div key={crisis.id} className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] px-2 rounded-lg transition-colors">
              <div className="flex items-center space-x-6 shrink-0 md:shrink">
                <span className="text-[0.75rem] text-[#8B9CB8] mono font-bold w-20 shrink-0">
                  {Math.floor((Date.now() - crisis.reportedAt) / 60000)}m ago
                </span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: typeColors[crisis.crisisType.charAt(0).toUpperCase() + crisis.crisisType.slice(1).toLowerCase()] || '#8B9CB8' }}></div>
                <div className="flex flex-col truncate pr-4">
                  <span className="text-[0.85rem] text-white font-semibold truncate capitalize">{crisis.crisisType} Signal detected in {extractCity(crisis.location.name)}</span>
                  <span className="text-[0.7rem] text-[#8B9CB8] mono uppercase tracking-wider">Criticality Score: {Math.round(crisis.criticalityScore)}</span>
                </div>
              </div>
              <div className={`px-2.5 py-0.5 w-24 text-center rounded-full text-[0.65rem] font-semibold uppercase tracking-widest ${crisis.status === 'OPEN' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : crisis.status === 'CRITICAL_VELOCITY' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                {crisis.status}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
