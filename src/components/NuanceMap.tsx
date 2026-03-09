"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Move } from "lucide-react";
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
  isLoading?: boolean;
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
    <div
      className="flex flex-col items-center cursor-pointer group"
      style={{ transform: "translate(-50%, -6px)" }}
    >
      <div
        className={cn(
          "w-3 h-3 rounded-full border border-white/80 shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-transform group-hover:scale-150",
          getColorClass(firstItem.x, firstItem.y),
        )}
      />
      <div className="mt-1 text-white/90 text-[11px] font-medium whitespace-nowrap pointer-events-none select-none px-1.5 py-0.5 bg-black/30 rounded backdrop-blur-md border border-white/10 shadow-lg">
        {firstItem.word}
        {items.length > 1 && (
          <span className="ml-1 opacity-70 border-l border-white/30 pl-1">
            +{items.length - 1}
          </span>
        )}
      </div>
    </div>
  );
};

// Custom Node for the Origin lines
const ORIGIN_SIZE = 2000; // px - size of the origin node container
const ORIGIN_CENTER = ORIGIN_SIZE / 2;

const OriginNode = ({
  data,
}: {
  data: { xAxisLabel: string; yAxisLabel: string };
}) => {
  // Generate tick marks from -10 to 10
  const ticks = Array.from({ length: 21 }, (_, i) => i - 10);

  return (
    <div
      style={{ width: ORIGIN_SIZE, height: ORIGIN_SIZE }}
      className="relative pointer-events-none"
    >
      {/* Center Origin Dot */}
      <div
        className="absolute w-4 h-4 rounded-full border-2 border-white/30 bg-black/50 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
        style={{ left: ORIGIN_CENTER - 8, top: ORIGIN_CENTER - 8 }}
      />

      {/* Horizontal Axis Line */}
      <div
        className="absolute bg-white/20"
        style={{
          left: 0,
          top: ORIGIN_CENTER - 1,
          width: ORIGIN_SIZE,
          height: 2,
        }}
      />
      {/* Vertical Axis Line */}
      <div
        className="absolute bg-white/20"
        style={{
          left: ORIGIN_CENTER - 1,
          top: 0,
          width: 2,
          height: ORIGIN_SIZE,
        }}
      />

      {/* Ticks and Distance Labels */}
      {ticks.map((tick) => {
        if (tick === 0) return null;
        const xTickPos = ORIGIN_CENTER + tick * SCALE;
        const yTickPos = ORIGIN_CENTER - tick * SCALE;
        return (
          <div key={`tick-${tick}`}>
            {/* X-axis tick */}
            <div
              className="absolute flex flex-col items-center"
              style={{ left: xTickPos - 1, top: ORIGIN_CENTER - 6 }}
            >
              <div className="w-[2px] h-3 bg-white/40" />
              <div className="mt-1.5 text-white/50 text-[10px] select-none font-mono bg-black/20 px-1 rounded whitespace-nowrap">
                {tick > 0 ? `+${tick}` : tick}
              </div>
            </div>

            {/* Y-axis tick */}
            <div
              className="absolute flex items-center"
              style={{ left: ORIGIN_CENTER - 6, top: yTickPos - 1 }}
            >
              <div className="h-[2px] w-3 bg-white/40" />
              <div className="ml-1.5 text-white/50 text-[10px] select-none font-mono bg-black/20 px-1 rounded whitespace-nowrap">
                {tick > 0 ? `+${tick}` : tick}
              </div>
            </div>
          </div>
        );
      })}

      {/* Axis Labels */}
      <div
        className="absolute px-4 py-2 bg-black/40 backdrop-blur-md rounded-xl border border-white/20 text-white/90 text-sm font-bold whitespace-nowrap shadow-xl tracking-wider -translate-y-1/2"
        style={{ top: ORIGIN_CENTER, left: ORIGIN_CENTER + 6 * SCALE }}
      >
        {data.xAxisLabel} (+X)
      </div>
      <div
        className="absolute px-4 py-2 bg-black/40 backdrop-blur-md rounded-xl border border-white/20 text-white/90 text-sm font-bold whitespace-nowrap shadow-xl tracking-wider -translate-x-1/2"
        style={{ left: ORIGIN_CENTER, top: ORIGIN_CENTER - 6 * SCALE }}
      >
        {data.yAxisLabel} (+Y)
      </div>
    </div>
  );
};

const nodeTypes = {
  wordNode: WordNode,
  originNode: OriginNode,
};

function NuanceMapContent({ data, xAxisLabel, yAxisLabel, isLoading }: NuanceMapProps) {
  const { fitView } = useReactFlow();
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    items: NuanceData[];
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const nodes = useMemo(() => {
    const outNodes: Node[] = [];

    // Add Origin
    outNodes.push({
      id: "origin",
      position: { x: 0, y: 0 },
      data: { xAxisLabel, yAxisLabel },
      type: "originNode",
      selectable: false,
      draggable: false,
      origin: [0.5, 0.5],
      zIndex: 0,
    });

    if (!data || data.length === 0) return outNodes;

    // Group data by exact coordinates
    const groups = new Map<
      string,
      { x: number; y: number; items: NuanceData[] }
    >();
    data.forEach((d) => {
      const key = `${Math.round(d.x * 1000) / 1000},${Math.round(d.y * 1000) / 1000}`;
      if (!groups.has(key)) {
        groups.set(key, { x: d.x, y: d.y, items: [] });
      }
      groups.get(key)?.items.push(d);
    });

    // Create word nodes
    Array.from(groups.values()).forEach((group, i) => {
      outNodes.push({
        id: `word-${i}`,
        // -y because React Flow's canvas is Y-down, but cartesian data coordinates are Y-up
        position: { x: group.x * SCALE, y: -group.y * SCALE },
        data: { items: group.items },
        type: "wordNode",
        draggable: false,
        selectable: false,
        zIndex: 10,
      });
    });

    return outNodes;
  }, [data, xAxisLabel, yAxisLabel]);

  // Debounced fitView — settles after items stop arriving (streaming)
  useEffect(() => {
    const wordNodes = nodes.filter((n) => n.type === "wordNode");
    if (wordNodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ nodes: wordNodes, duration: 800, padding: 0.2 });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [nodes, fitView]);

  const onNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type === "wordNode" && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        // Get the HTML element of the node that was hovered
        const nodeElement = (event.target as HTMLElement).closest(
          ".react-flow__node",
        );

        let x = event.clientX - containerRect.left;
        let y = event.clientY - containerRect.top;

        // If we found the node's DOM element, use its bounds to perfectly center the tooltip above it
        if (nodeElement) {
          const nodeRect = nodeElement.getBoundingClientRect();
          x = nodeRect.left + nodeRect.width / 2 - containerRect.left;
          y = nodeRect.top - containerRect.top;
        }

        setHoverInfo({ x, y, items: node.data.items as NuanceData[] });
      }
    },
    [],
  );

  const onNodeMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center text-white/30 border-2 border-dashed border-white/10 rounded-3xl bg-white/5 backdrop-blur-sm">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-white/40" />
            <p>ニュアンスを生成中...</p>
          </div>
        ) : (
          <p>言葉を入力してマッピングを開始してください</p>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[700px] bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl overflow-hidden"
    >
      <ReactFlow
        width={12}
        height={12}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onPaneMouseEnter={() => setHoverInfo(null)}
        onMoveStart={() => setHoverInfo(null)}
        minZoom={0.5}
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
            const d = (node.data as { items?: NuanceData[] }).items?.[0];
            if (!d) return "#94a3b8";
            const isPink = d.x > 0 && d.y > 0;
            const isViolet = d.x > 0 && d.y <= 0;
            const isEmerald = d.x <= 0 && d.y > 0;
            return isPink
              ? "#F472B6"
              : isViolet
                ? "#A78BFA"
                : isEmerald
                  ? "#34D399"
                  : "#60A5FA";
          }}
        />
      </ReactFlow>

      {/* Custom Tooltip */}
      <AnimatePresence>
        {hoverInfo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: "-80%", x: "-50%" }}
            animate={{
              opacity: 1,
              scale: 1,
              y: "calc(-100% - 15px)",
              x: "-50%",
            }}
            exit={{ opacity: 0, scale: 0.9, y: "-80%", x: "-50%" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute bg-white/95 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-white/40 min-w-[200px] max-w-[280px] z-100 pointer-events-none"
            style={{
              left: hoverInfo.x,
              top: hoverInfo.y,
            }}
          >
            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar">
              {hoverInfo.items.map((item, idx) => {
                const isPink = item.x > 0 && item.y > 0;
                const isViolet = item.x > 0 && item.y <= 0;
                const isEmerald = item.x <= 0 && item.y > 0;
                const colorClass = isPink
                  ? "bg-pink-400"
                  : isViolet
                    ? "bg-violet-400"
                    : isEmerald
                      ? "bg-emerald-400"
                      : "bg-blue-400";

                return (
                  <div
                    key={`${item.word}-${idx}`}
                    className={cn(
                      "flex flex-col gap-1",
                      idx !== 0 && "pt-3 border-t border-slate-100",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          colorClass,
                        )}
                      />
                      <p className="font-bold text-lg text-slate-800 leading-none wrap-break-word">
                        {item.word}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium pl-4">
                      {item.nuance}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-mono">
                X: {hoverInfo.items[0].x.toFixed(1)}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Y: {hoverInfo.items[0].y.toFixed(1)}
              </span>
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
