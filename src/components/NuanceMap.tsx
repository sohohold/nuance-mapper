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
  useStore,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, Move } from "lucide-react";
import { useDictionary } from "@/lib/i18n";
import type { NuanceData } from "@/lib/types";
import { cn } from "@/lib/utils";

export type { NuanceData };

interface NuanceMapProps {
  data: NuanceData[];
  xAxisLabel: string;
  yAxisLabel: string;
  isLoading?: boolean;
}

// px per coordinate unit — compressed on mobile so labels render larger
// relative to the point spread after fitView
const SCALE_DESKTOP = 50;
const SCALE_MOBILE = 20;

// Quadrant color, shared by nodes, minimap and tooltip:
// 0 = x>0,y>0  1 = x>0,y<=0  2 = x<=0,y>0  3 = x<=0,y<=0
const QUADRANT_BG = [
  "bg-pink-400",
  "bg-violet-400",
  "bg-emerald-400",
  "bg-blue-400",
];
const QUADRANT_HEX = ["#F472B6", "#A78BFA", "#34D399", "#60A5FA"];

function quadrantIndex(x: number, y: number): number {
  return x > 0 ? (y > 0 ? 0 : 1) : y > 0 ? 2 : 3;
}

// Counter-scale for zooming in past 1:1 — markers, labels and ticks keep a
// constant on-screen size while positions spread apart, instead of scaling
// up until they overlap and crush each other. Below 1:1 (overview) nothing
// changes: content zooms out naturally.
function useCounterScale(): number {
  return useStore((s) => 1 / Math.max(s.transform[2], 1));
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

// Custom Node for displaying words
const WordNode = ({ data }: { data: { items: NuanceData[] } }) => {
  const items = data.items;
  const firstItem = items[0];
  const counterScale = useCounterScale();

  return (
    <div
      className="flex flex-col items-center cursor-pointer group"
      style={{
        transform: `translate(-50%, -6px) scale(${counterScale})`,
        transformOrigin: "top center",
      }}
    >
      <div
        className={cn(
          "w-4 h-4 sm:w-3 sm:h-3 rounded-full border border-white/80 shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-transform group-hover:scale-150",
          QUADRANT_BG[quadrantIndex(firstItem.x, firstItem.y)],
        )}
      />
      <div className="mt-1 text-white/90 text-[16px] sm:text-[11px] font-medium whitespace-nowrap pointer-events-none select-none px-2 py-1 sm:px-1.5 sm:py-0.5 bg-black/30 rounded backdrop-blur-md border border-white/10 shadow-lg">
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

const OriginNode = ({ data }: { data: { scale: number } }) => {
  const scale = data.scale;
  const counterScale = useCounterScale();
  // Lines/ticks must stay visible after fitView zooms out — thicker when
  // the coordinate scale is compressed (mobile) since zoom shrinks them.
  // Counter-scaled so the lines don't turn into thick bars when zoomed in.
  const lineWidth = (scale < 30 ? 5 : 3) * counterScale;
  const tickCls = scale < 30 ? "w-[3px] h-4" : "w-[2px] h-3";
  const tickClsY = scale < 30 ? "h-[3px] w-4" : "h-[2px] w-3";
  const tickLabelCls =
    "text-white/50 text-[14px] sm:text-[10px] select-none font-mono bg-black/20 px-1 rounded whitespace-nowrap";
  // Even tick marks only (-10, -8, … +10) so labels don't crowd each other
  const ticks = Array.from({ length: 11 }, (_, i) => (i - 5) * 2).filter(
    (t) => t !== 0,
  );

  return (
    <div
      style={{ width: ORIGIN_SIZE, height: ORIGIN_SIZE }}
      className="relative pointer-events-none"
    >
      {/* Center Origin Dot */}
      <div
        className="absolute w-4 h-4 rounded-full border-2 border-white/30 bg-black/50 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
        style={{
          left: ORIGIN_CENTER - 8,
          top: ORIGIN_CENTER - 8,
          transform: `scale(${counterScale})`,
        }}
      />

      {/* Horizontal Axis Line */}
      <div
        className="absolute bg-white/40"
        style={{
          left: 0,
          top: ORIGIN_CENTER - lineWidth / 2,
          width: ORIGIN_SIZE,
          height: lineWidth,
        }}
      />
      {/* Vertical Axis Line */}
      <div
        className="absolute bg-white/40"
        style={{
          left: ORIGIN_CENTER - lineWidth / 2,
          top: 0,
          width: lineWidth,
          height: ORIGIN_SIZE,
        }}
      />

      {/* Ticks and Distance Labels */}
      {ticks.map((tick) => {
        const xTickPos = ORIGIN_CENTER + tick * scale;
        const yTickPos = ORIGIN_CENTER - tick * scale;
        return (
          <div key={`tick-${tick}`}>
            {/* X-axis tick */}
            <div
              className="absolute flex flex-col items-center"
              style={{
                left: xTickPos - 1,
                top: ORIGIN_CENTER - 6,
                transform: `scale(${counterScale})`,
                transformOrigin: "top center",
              }}
            >
              <div className={cn(tickCls, "bg-white/50")} />
              <div className={cn("mt-1.5", tickLabelCls)}>
                {tick > 0 ? `+${tick}` : tick}
              </div>
            </div>

            {/* Y-axis tick */}
            <div
              className="absolute flex items-center"
              style={{
                left: ORIGIN_CENTER - 6,
                top: yTickPos - 1,
                transform: `scale(${counterScale})`,
                transformOrigin: "left center",
              }}
            >
              <div className={cn(tickClsY, "bg-white/50")} />
              <div className={cn("ml-1.5", tickLabelCls)}>
                {tick > 0 ? `+${tick}` : tick}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const nodeTypes = {
  wordNode: WordNode,
  originNode: OriginNode,
};

function NuanceMapContent({
  data,
  xAxisLabel,
  yAxisLabel,
  isLoading,
}: NuanceMapProps) {
  const { t } = useDictionary();
  const { fitView } = useReactFlow();
  const isMobile = useIsMobile();
  const scale = isMobile ? SCALE_MOBILE : SCALE_DESKTOP;
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    // Flipped below the node when it sits near the container top, so the
    // (interactive) tooltip isn't clipped by overflow-hidden
    below: boolean;
    items: NuanceData[];
  } | null>(null);
  const [copiedWord, setCopiedWord] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The tooltip is interactive (copy button), so hide it with a short
  // delay — long enough for the pointer to travel from node to tooltip
  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => setHoverInfo(null), 200);
  }, [cancelHide]);

  const hideNow = useCallback(() => {
    cancelHide();
    setHoverInfo(null);
  }, [cancelHide]);

  useEffect(() => {
    return () => {
      cancelHide();
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, [cancelHide]);

  const copyWord = useCallback(async (word: string) => {
    try {
      await navigator.clipboard.writeText(word);
      setCopiedWord(word);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedWord(null), 1500);
    } catch {
      // Clipboard unavailable (permission denied / insecure context)
    }
  }, []);

  const nodes = useMemo(() => {
    const outNodes: Node[] = [];

    // Add Origin
    outNodes.push({
      id: "origin",
      position: { x: 0, y: 0 },
      data: { scale },
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
        position: { x: group.x * scale, y: -group.y * scale },
        data: { items: group.items },
        type: "wordNode",
        draggable: false,
        selectable: false,
        zIndex: 10,
      });
    });

    return outNodes;
  }, [data, scale]);

  // Debounced fitView — settles after items stop arriving (streaming)
  useEffect(() => {
    const wordNodes = nodes.filter((n) => n.type === "wordNode");
    if (wordNodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({
          nodes: wordNodes,
          duration: 800,
          padding: isMobile ? 0.1 : 0.2,
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [nodes, fitView, isMobile]);

  const onNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: Node) => {
      cancelHide();
      if (node.type === "wordNode" && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        // Get the HTML element of the node that was hovered
        const nodeElement = (event.target as HTMLElement).closest(
          ".react-flow__node",
        );

        let x = event.clientX - containerRect.left;
        let y = event.clientY - containerRect.top;
        let below = y < containerRect.height * 0.4;

        // If we found the node's DOM element, use its bounds to perfectly
        // center the tooltip above (or below) it
        if (nodeElement) {
          const nodeRect = nodeElement.getBoundingClientRect();
          x = nodeRect.left + nodeRect.width / 2 - containerRect.left;
          below = nodeRect.top - containerRect.top < containerRect.height * 0.4;
          y = below
            ? nodeRect.bottom - containerRect.top
            : nodeRect.top - containerRect.top;
        }

        setHoverInfo({ x, y, below, items: node.data.items as NuanceData[] });
      }
    },
    [cancelHide],
  );

  if (!data || data.length === 0) {
    return (
      <div className="w-full flex-1 min-h-0 sm:flex-none sm:h-[400px] flex items-center justify-center text-white/30 border-2 border-dashed border-white/10 rounded-3xl bg-white/5 backdrop-blur-sm">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-white/40" />
            <p>{t.generating}</p>
          </div>
        ) : (
          <p>{t.emptyState}</p>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 min-h-0 sm:flex-none sm:h-[700px] bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 shadow-2xl overflow-hidden"
    >
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={scheduleHide}
        onPaneMouseEnter={scheduleHide}
        onMoveStart={hideNow}
        minZoom={isMobile ? 0.25 : 0.5}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        className="transition-cursor cursor-grab active:cursor-grabbing"
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background
          gap={scale}
          color="rgba(255,255,255,0.5)"
          variant={BackgroundVariant.Dots}
        />
        <Controls className="bg-white/10! backdrop-blur-md! border-white/20! [&>button]:bg-transparent! [&>button]:border-b-white/20! [&>button]:text-white! hover:[&>button]:bg-white/20!" />
        <MiniMap
          className="hidden! sm:block! bg-black/20! backdrop-blur-md! border-white/10! rounded-xl!"
          maskColor="rgba(0,0,0,0.4)"
          nodeColor={(node) => {
            const d = (node.data as { items?: NuanceData[] }).items?.[0];
            return d ? QUADRANT_HEX[quadrantIndex(d.x, d.y)] : "#94a3b8";
          }}
        />
      </ReactFlow>

      {/* Axis labels pinned to the container edges — always legible on any
          pan/zoom, instead of drifting/burying inside the canvas */}
      <div className="absolute top-2 sm:top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-[85%] truncate px-2.5 py-1 sm:px-4 sm:py-1.5 bg-black/50 backdrop-blur-md rounded-full border border-white/20 text-white/90 text-[11px] sm:text-sm font-bold whitespace-nowrap shadow-xl tracking-wider">
        ↑ {yAxisLabel} (+Y)
      </div>
      <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none max-w-[85%] truncate px-2.5 py-1 sm:px-4 sm:py-1.5 bg-black/50 backdrop-blur-md rounded-full border border-white/20 text-white/90 text-[11px] sm:text-sm font-bold whitespace-nowrap shadow-xl tracking-wider">
        {xAxisLabel} (+X) →
      </div>

      {/* Custom Tooltip */}
      <AnimatePresence>
        {hoverInfo && (
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.9,
              y: hoverInfo.below ? "0%" : "-80%",
              x: "-50%",
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: hoverInfo.below ? "15px" : "calc(-100% - 15px)",
              x: "-50%",
            }}
            exit={{
              opacity: 0,
              scale: 0.9,
              y: hoverInfo.below ? "0%" : "-80%",
              x: "-50%",
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute bg-white/95 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-white/40 min-w-[200px] max-w-[280px] z-100 pointer-events-auto"
            style={{
              left: hoverInfo.x,
              top: hoverInfo.y,
            }}
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar">
              {hoverInfo.items.map((item, idx) => (
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
                        QUADRANT_BG[quadrantIndex(item.x, item.y)],
                      )}
                    />
                    <p className="font-bold text-lg text-slate-800 leading-none wrap-break-word">
                      {item.word}
                    </p>
                    <button
                      type="button"
                      title={copiedWord === item.word ? t.copied : t.copy}
                      aria-label={`${t.copy}: ${item.word}`}
                      // stopPropagation: the click must not bubble into the
                      // canvas (pan start / tooltip dismissal)
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyWord(item.word);
                      }}
                      className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    >
                      {copiedWord === item.word ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium pl-4">
                    {item.nuance}
                  </p>
                </div>
              ))}
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

      {/* Help text — hidden on touch-sized screens (wrong hint + clutter) */}
      <div className="absolute top-4 right-4 text-white/40 text-xs pointer-events-none hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-black/20 rounded-full backdrop-blur-sm border border-white/10">
        <Move size={12} />
        <span>{t.helpText}</span>
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
