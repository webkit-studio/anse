import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useToast } from "./Toast";
import { Button } from "./ui";

// Celoobrazovkový podpisový pad: zákazník se podepíše prstem, ideálně na šířku
// (orientaci displeje vynutit nejde — ukazujeme jen nápovědu). Tahy se drží
// v CSS pixelech a překreslují při změně velikosti/otočení; export ořízne
// podpis na obsah a uloží PNG s průhledným pozadím (vlepuje se do PDF).

const INK = "#1b2733";
const STROKE_WIDTH = 2.5;

interface Point {
  x: number;
  y: number;
}

function drawStrokes(canvasCtx: CanvasRenderingContext2D, strokes: Point[][]): void {
  canvasCtx.strokeStyle = INK;
  canvasCtx.lineWidth = STROKE_WIDTH;
  canvasCtx.lineCap = "round";
  canvasCtx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.length === 0) continue;
    canvasCtx.beginPath();
    canvasCtx.moveTo(stroke[0]!.x, stroke[0]!.y);
    if (stroke.length === 1) {
      // tečka — čára s nulovou délkou se nevykreslí
      canvasCtx.lineTo(stroke[0]!.x + 0.1, stroke[0]!.y);
    }
    for (const p of stroke.slice(1)) canvasCtx.lineTo(p.x, p.y);
    canvasCtx.stroke();
  }
}

/** PNG oříznuté na obsah podpisu (padding 12 px, 2× měřítko pro tisk). */
function exportPng(strokes: Point[][]): string | null {
  const points = strokes.flat();
  if (points.length === 0) return null;

  const pad = 12;
  const minX = Math.min(...points.map((p) => p.x)) - pad;
  const minY = Math.min(...points.map((p) => p.y)) - pad;
  const maxX = Math.max(...points.map((p) => p.x)) + pad;
  const maxY = Math.max(...points.map((p) => p.y)) + pad;
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = Math.min(2, 2000 / Math.max(w, h));

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx) return null;
  canvasCtx.scale(scale, scale);
  canvasCtx.translate(-minX, -minY);
  drawStrokes(canvasCtx, strokes);
  return canvas.toDataURL("image/png");
}

export function SignaturePad({
  orderId,
  clientName,
  onClose,
  onSaved,
}: {
  orderId: string;
  clientName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  /** Kreslí vždy jen jeden pointer — dlaň/druhý prst se ignoruje. */
  const activePointerRef = useRef<number | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portrait, setPortrait] = useState(
    typeof window !== "undefined" && window.innerHeight > window.innerWidth,
  );

  // zámek scrollu stránky pod overlay (stejně jako SelectSheet)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const redraw = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const canvasCtx = canvas.getContext("2d");
      if (!canvasCtx) return;
      canvasCtx.scale(dpr, dpr);
      drawStrokes(canvasCtx, strokesRef.current);
    };

    redraw();
    const observer = new ResizeObserver(() => {
      redraw();
      setPortrait(window.innerHeight > window.innerWidth);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  /** Bod v souřadnicích canvasu, oříznutý na jeho plochu — co není vidět,
   *  nesmí být ani v exportu (podpis v PDF = přesně to, co zákazník viděl). */
  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
    };
  }

  function drawSegment(from: Point, to: Point) {
    const canvasCtx = canvasRef.current?.getContext("2d");
    if (!canvasCtx) return;
    canvasCtx.strokeStyle = INK;
    canvasCtx.lineWidth = STROKE_WIDTH;
    canvasCtx.lineCap = "round";
    canvasCtx.lineJoin = "round";
    canvasCtx.beginPath();
    canvasCtx.moveTo(from.x, from.y);
    canvasCtx.lineTo(to.x + (from.x === to.x && from.y === to.y ? 0.1 : 0), to.y);
    canvasCtx.stroke();
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== null) return; // druhý dotyk (dlaň) ignorujeme
    activePointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = pointFromEvent(e);
    strokesRef.current.push([point]);
    setHasStrokes(true);
    drawSegment(point, point); // tečka je vidět hned, ne až po překreslení
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerId !== activePointerRef.current) return;
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (!stroke) return;
    const prev = stroke[stroke.length - 1]!;
    const point = pointFromEvent(e);
    stroke.push(point);
    drawSegment(prev, point);
  }

  function handleUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerId !== activePointerRef.current) return;
    activePointerRef.current = null;
  }

  function clear() {
    strokesRef.current = [];
    setHasStrokes(false);
    const canvas = canvasRef.current;
    const canvasCtx = canvas?.getContext("2d");
    if (canvas && canvasCtx) canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function save() {
    const png = exportPng(strokesRef.current);
    if (!png) return;
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/signature`, {
        method: "POST",
        body: { signature_png: png },
      });
      toast("Podpis uložen.");
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Uložení podpisu se nepodařilo.");
      setBusy(false);
    }
  }

  return (
    <div className="signature-overlay" role="dialog" aria-modal="true" aria-label="Podpis zákazníka">
      <div className="signature-head">
        <span className="signature-title">Podpis zákazníka — {clientName}</span>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Zavřít">
          ✕
        </button>
      </div>
      {portrait && <p className="signature-hint">Otočte telefon na šířku, podepisuje se pohodlněji.</p>}
      <div ref={wrapRef} className="signature-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="signature-canvas"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
        />
        {!hasStrokes && <span className="signature-placeholder">Podepište se prstem…</span>}
      </div>
      <div className="signature-actions">
        <Button variant="ghost" onClick={clear} disabled={!hasStrokes || busy}>
          Znovu
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={!hasStrokes || busy}>
          {busy ? "Ukládám…" : "Uložit podpis"}
        </Button>
      </div>
    </div>
  );
}
