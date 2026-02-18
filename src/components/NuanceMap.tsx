"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

export interface NuanceData {
  word: string;
  x: number;
  y: number;
  nuance: string;
}

interface NuanceMapProps {
  data: NuanceData[];
  xAxisLabel: string;
  yAxisLabel: string;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-2xl border border-indigo-100 max-w-[200px]">
        <p className="font-bold text-lg text-indigo-900 mb-1">{data.word}</p>
        <p className="text-xs text-slate-600 leading-relaxed">{data.nuance}</p>
        <div className="mt-2 flex gap-2 text-[10px] text-slate-400 font-mono">
          <span>X: {data.x}</span>
          <span>Y: {data.y}</span>
        </div>
      </div>
    );
  }
  return null;
};

export function NuanceMap({ data, xAxisLabel, yAxisLabel }: NuanceMapProps) {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center text-white/30 border-2 border-dashed border-white/10 rounded-3xl bg-white/5 backdrop-blur-sm">
        <p>言葉を入力してマッピングを開始してください</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[500px] relative bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl p-4 md:p-8">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart
          margin={{
            top: 20,
            right: 20,
            bottom: 40,
            left: 20,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            type="number"
            dataKey="x"
            name={xAxisLabel}
            domain={[-10, 10]}
            tickCount={5}
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
            label={{
              value: xAxisLabel,
              position: "insideBottom",
              offset: -20,
              fill: "rgba(255,255,255,0.8)",
              fontSize: 12,
              fontWeight: 500,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={yAxisLabel}
            domain={[-10, 10]}
            tickCount={5}
            stroke="rgba(255,255,255,0.5)"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
            label={{
              value: yAxisLabel,
              angle: -90,
              position: "insideLeft",
              fill: "rgba(255,255,255,0.8)",
              fontSize: 12,
              fontWeight: 500,
              style: { textAnchor: 'middle' }
            }}
          />
          <ZAxis type="number" range={[100, 400]} /> {/* Control bubble size */}
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.3)" }} />
          <Scatter name="Nuance" data={data} fill="#8884d8">
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.x > 0 ? (entry.y > 0 ? "#F472B6" : "#A78BFA") : (entry.y > 0 ? "#34D399" : "#60A5FA")} 
                fillOpacity={0.8}
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      
      {/* Decorative center lines */}
      <div className="absolute top-8 bottom-12 left-1/2 w-px bg-white/10 pointer-events-none" />
      <div className="absolute left-10 right-8 top-1/2 h-px bg-white/10 pointer-events-none" />
    </div>
  );
}
