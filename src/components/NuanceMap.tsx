"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Node,
  useReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ZoomIn, ZoomOut, Maximize, Move } from "lucide-react";

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

const SCALE = 50;

// Custom Node for displaying words
const WordNode = ({ data }: { data: { items: NuanceData[] } }) => {
    const items = data.items;
    const firstItem = items[0];

    const getColorClass = (x: number, y: number) => {
        if (x > 0) {
            return y > 0 ? "bg-pink-400" : "bg-violet-400";
        } else {
            return y > 0 ? "bg-emerald-400" : "bg-blue-400";
        }
    };

    return (
        <div className="flex flex-col items-center justify-center cursor-pointer group">
            <div className={cn("w-3 h-3 rounded-full border border-white/80 shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-transform group-hover:scale-150", getColorClass(firstItem.x, firstItem.y))} />
            <div className="mt-1 text-white/90 text-[11px] font-medium whitespace-nowrap pointer-events-none select-none px-1.5 py-0.5 bg-black/30 rounded backdrop-blur-md border border-white/10 shadow-lg">
                {firstItem.word}
                {items.length > 1 && <span className="ml-1 opacity-70 border-l border-white/30 pl-1">+{items.length - 1}</span>}
            </div>
        </div>
    );
};

// Custom Node for the Origin lines
const OriginNode = ({ data }: { data: { xAxisLabel: string, yAxisLabel: string } }) => {
    return (
        <div className="w-0 h-0 flex items-center justify-center pointer-events-none relative z-[-1]">
            <div className="absolute w-[8000px] h-px bg-white/20" />
            <div className="absolute h-[8000px] w-px bg-white/20" />
            
            <div className="absolute px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 right-[-300px] top-3 text-white/80 text-sm font-bold whitespace-nowrap shadow-lg">
                {data.xAxisLabel} (+X)
            </div>
            <div className="absolute px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-lg border border-white/20 top-[-300px] left-3 text-white/80 text-sm font-bold whitespace-nowrap shadow-lg">
                {data.yAxisLabel} (+Y)
            </div>
        </div>
    );
};

const nodeTypes = {
    wordNode: WordNode,
    originNode: OriginNode
};

function NuanceMapContent({ data, xAxisLabel, yAxisLabel }: NuanceMapProps) {
    const { fitView, zoomIn, zoomOut } = useReactFlow();
    const [hoverInfo, setHoverInfo] = useState<{ x: number, y: number, items: NuanceData[] } | null>(null);

    const nodes = useMemo(() => {
        const outNodes: Node[] = [];
        
        // Add Origin
        outNodes.push({
            id: 'origin',
            position: { x: 0, y: 0 },
            data: { xAxisLabel, yAxisLabel },
            type: 'originNode',
            selectable: false,
            draggable: false,
            origin: [0.5, 0.5],
            zIndex: -1
        });

        if (!data || data.length === 0) return outNodes;

        // Group data by exact coordinates
        const groups = new Map<string, { x: number, y: number, items: NuanceData[] }>();
        data.forEach(d => {
            const key = `${Math.round(d.x * 1000) / 1000},${Math.round(d.y * 1000) / 1000}`;
            if (!groups.has(key)) {
                groups.set(key, { x: d.x, y: d.y, items: [] });
            }
            groups.get(key)!.items.push(d);
        });

        // Create word nodes
        Array.from(groups.values()).forEach((group, i) => {
            outNodes.push({
                id: `word-${i}`,
                // -y because React Flow's canvas is Y-down, but cartesian data coordinates are Y-up
                position: { x: group.x * SCALE, y: -group.y * SCALE },
                data: { items: group.items },
                type: 'wordNode',
                origin: [0.5, 0.5],
                draggable: false,
                selectable: false,
                zIndex: 10
            });
        });

        return outNodes;
    }, [data, xAxisLabel, yAxisLabel]);

    // Initial fitView when nodes load
    useEffect(() => {
        const wordNodes = nodes.filter(n => n.type === 'wordNode');
        if (wordNodes.length > 0) {
            // timeout allows nodes to be registered correctly before fitting view
            setTimeout(() => {
                fitView({ nodes: wordNodes, duration: 800, padding: 0.2 });
            }, 50);
        }
    }, [nodes, fitView]);

    const handleResetView = () => {
        const wordNodes = nodes.filter(n => n.type === 'wordNode');
        if (wordNodes.length > 0) {
             fitView({ nodes: wordNodes, duration: 800, padding: 0.2 });
        } else {
             fitView({ duration: 800 });
        }
    };

    const onNodeMouseEnter = useCallback((event: React.MouseEvent, node: Node) => {
        if (node.type === 'wordNode') {
            setHoverInfo({ x: event.clientX, y: event.clientY, items: node.data.items as NuanceData[] });
        }
    }, []);

    const onNodeMouseMove = useCallback((event: React.MouseEvent, node: Node) => {
        if (node.type === 'wordNode') {
            setHoverInfo(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
        }
    }, []);

    const onNodeMouseLeave = useCallback(() => {
        setHoverInfo(null);
    }, []);

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-[400px] flex items-center justify-center text-white/30 border-2 border-dashed border-white/10 rounded-3xl bg-white/5 backdrop-blur-sm">
                <p>言葉を入力してマッピングを開始してください</p>
            </div>
        );
    }

    return (
        <div className="relative group w-full h-[700px] bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl overflow-hidden">
            <ReactFlow
                nodes={nodes}
                nodeTypes={nodeTypes}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseMove={onNodeMouseMove}
                onNodeMouseLeave={onNodeMouseLeave}
                onPaneMouseEnter={() => setHoverInfo(null)}
                onMoveStart={() => setHoverInfo(null)}
                minZoom={0.1}
                maxZoom={4}
                proOptions={{ hideAttribution: true }}
                className="transition-cursor cursor-grab active:cursor-grabbing"
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
            >
                <Background 
                    gap={SCALE} 
                    color="rgba(255,255,255,0.5)" 
                    variant={BackgroundVariant.Dots} 
                />
                <Controls className="bg-white/10! backdrop-blur-md! border-white/20! [&>button]:bg-transparent! [&>button]:border-b-white/20! [&>button]:text-white! hover:[&>button]:bg-white/20!" />
                <MiniMap 
                    className="bg-black/20! backdrop-blur-md! border-white/10! rounded-xl!" 
                    maskColor="rgba(0,0,0,0.4)" 
                    nodeColor={(node) => {
                        const d = (node.data as any).items?.[0];
                        if (!d) return '#94a3b8';
                        const isPink = d.x > 0 && d.y > 0;
                        const isViolet = d.x > 0 && d.y <= 0;
                        const isEmerald = d.x <= 0 && d.y > 0;
                        return isPink ? "#F472B6" : isViolet ? "#A78BFA" : isEmerald ? "#34D399" : "#60A5FA";
                    }}
                />
            </ReactFlow>

            {/* Custom Tooltip */}
            <AnimatePresence>
                {hoverInfo && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className="fixed bg-white/95 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-white/40 min-w-[200px] max-w-[280px] z-100 pointer-events-none"
                        style={{ 
                            left: hoverInfo.x + 15 > (typeof window !== 'undefined' ? window.innerWidth - 300 : 1000) ? hoverInfo.x - 300 : hoverInfo.x + 15,
                            top: hoverInfo.y + 15 > (typeof window !== 'undefined' ? window.innerHeight - 300 : 1000) ? hoverInfo.y - 300 : hoverInfo.y + 15,
                        }}
                    >
                        <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {hoverInfo.items.map((item, idx) => {
                                const isPink = item.x > 0 && item.y > 0;
                                const isViolet = item.x > 0 && item.y <= 0;
                                const isEmerald = item.x <= 0 && item.y > 0;
                                const colorClass = isPink ? "bg-pink-400" : isViolet ? "bg-violet-400" : isEmerald ? "bg-emerald-400" : "bg-blue-400";
                                
                                return (
                                <div key={`${item.word}-${idx}`} className={cn("flex flex-col gap-1", idx !== 0 && "pt-3 border-t border-slate-100")}>
                                    <div className="flex items-center gap-2">
                                        <span className={cn("w-2 h-2 rounded-full shrink-0", colorClass)} />
                                        <p className="font-bold text-lg text-slate-800 leading-none wrap-break-word">{item.word}</p>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed font-medium pl-4">{item.nuance}</p>
                                </div>
                            )})}
                        </div>
                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-mono">X: {hoverInfo.items[0].x.toFixed(1)}</span>
                            <span className="text-[10px] text-slate-400 font-mono">Y: {hoverInfo.items[0].y.toFixed(1)}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            


            {/* Help text */}
            <div className="absolute top-4 right-4 text-white/40 text-xs pointer-events-none flex items-center gap-1.5 px-3 py-1.5 bg-black/20 rounded-full backdrop-blur-sm border border-white/10">
                <Move size={12} />
                <span>Drag to pan, Scroll to zoom</span>
            </div>
        </div>
    );
}

export function NuanceMap(props: NuanceMapProps) {
    return (
        <ReactFlowProvider>
            <NuanceMapContent {...props} />
        </ReactFlowProvider>
    );
}
