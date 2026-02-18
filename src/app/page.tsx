"use client";

import { useState } from "react";
import { InputArea } from "@/components/InputArea";
import { NuanceMap, NuanceData } from "@/components/NuanceMap";

export default function Home() {
  const [data, setData] = useState<NuanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [xAxisLabel, setXAxisLabel] = useState("フォーマル度");
  const [yAxisLabel, setYAxisLabel] = useState("文学的・情緒度");

  const handleSearch = async (word: string, xAxis: string, yAxis: string) => {
    setLoading(true);
    setXAxisLabel(xAxis);
    setYAxisLabel(yAxis);
    setData([]); // Clear previous results

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ word, xAxis, yAxis }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch data");
      }

      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error fetching data:", error);
      alert("エラーが発生しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#0f172a] text-white selection:bg-indigo-500/30">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/30 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/30 blur-[120px] animate-pulse delay-1000" />
      
      <div className="relative z-10 container mx-auto px-4 py-8 md:py-16 flex flex-col items-center gap-8 md:gap-12">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/50">
            Nuance Mapper
          </h1>
          <p className="text-white/60 text-lg md:text-xl font-light tracking-wide max-w-lg mx-auto">
            言葉の機微を、地図のように探索する。
          </p>
        </div>

        {/* Input Section */}
        <div className="w-full">
          <InputArea onSearch={handleSearch} isLoading={loading} />
        </div>

        {/* Visualization Section */}
        <div className="w-full max-w-4xl animate-in fade-in slide-in-from-bottom-8 duration-700">
          <NuanceMap 
            data={data} 
            xAxisLabel={xAxisLabel} 
            yAxisLabel={yAxisLabel} 
          />
        </div>

        {/* Footer */}
        <footer className="w-full text-center text-white/20 text-sm mt-8">
          <p>© 2026 Nuance Mapper. Powered by Gemini.</p>
        </footer>
      </div>
    </main>
  );
}
