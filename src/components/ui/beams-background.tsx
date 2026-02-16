"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

interface Beam {
  x: number;
  y: number;
  width: number;
  length: number;
  speed: number;
  opacity: number;
  tilt: number;
  drift: number;
  colorIndex: number;
  pulse: number;
  pulseSpeed: number;
}

const PALETTE = ["245, 158, 11", "29, 78, 216", "14, 116, 144"];
const TOTAL_BEAMS = 18;

function createBeam(viewWidth: number, viewHeight: number): Beam {
  return {
    x: Math.random() * viewWidth,
    y: Math.random() * (viewHeight * 1.6) - viewHeight * 0.3,
    width: 90 + Math.random() * 130,
    length: viewHeight * (1.8 + Math.random() * 0.9),
    speed: 0.35 + Math.random() * 0.55,
    opacity: 0.12 + Math.random() * 0.2,
    tilt: (-40 + Math.random() * 14) * (Math.PI / 180),
    drift: 0.08 + Math.random() * 0.2,
    colorIndex: Math.floor(Math.random() * PALETTE.length),
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.012 + Math.random() * 0.02,
  };
}

function resetBeam(beam: Beam, viewWidth: number, viewHeight: number) {
  beam.x = Math.random() * viewWidth;
  beam.y = viewHeight + 120;
  beam.width = 90 + Math.random() * 130;
  beam.length = viewHeight * (1.8 + Math.random() * 0.9);
  beam.speed = 0.35 + Math.random() * 0.55;
  beam.opacity = 0.12 + Math.random() * 0.2;
  beam.tilt = (-40 + Math.random() * 14) * (Math.PI / 180);
  beam.drift = 0.08 + Math.random() * 0.2;
  beam.colorIndex = Math.floor(Math.random() * PALETTE.length);
  beam.pulse = Math.random() * Math.PI * 2;
  beam.pulseSpeed = 0.012 + Math.random() * 0.02;
}

export function BeamsBackground({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beamsRef = useRef<Beam[]>([]);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let viewWidth = window.innerWidth;
    let viewHeight = window.innerHeight;

    const resize = () => {
      viewWidth = window.innerWidth;
      viewHeight = window.innerHeight;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewWidth * dpr);
      canvas.height = Math.floor(viewHeight * dpr);
      canvas.style.width = `${viewWidth}px`;
      canvas.style.height = `${viewHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      beamsRef.current = Array.from({ length: TOTAL_BEAMS }, () => createBeam(viewWidth, viewHeight));
    };

    const drawBeam = (beam: Beam) => {
      const pulseFactor = 0.78 + Math.sin(beam.pulse) * 0.22;
      const alpha = beam.opacity * pulseFactor;
      const rgb = PALETTE[beam.colorIndex];

      ctx.save();
      ctx.translate(beam.x, beam.y);
      ctx.rotate(beam.tilt);

      const gradient = ctx.createLinearGradient(0, 0, 0, beam.length);
      gradient.addColorStop(0, `rgba(${rgb}, 0)`);
      gradient.addColorStop(0.24, `rgba(${rgb}, ${alpha * 0.45})`);
      gradient.addColorStop(0.5, `rgba(${rgb}, ${alpha})`);
      gradient.addColorStop(0.76, `rgba(${rgb}, ${alpha * 0.45})`);
      gradient.addColorStop(1, `rgba(${rgb}, 0)`);

      ctx.fillStyle = gradient;
      ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
      ctx.restore();
    };

    const animate = () => {
      ctx.clearRect(0, 0, viewWidth, viewHeight);
      ctx.filter = "blur(22px)";

      for (const beam of beamsRef.current) {
        beam.y -= beam.speed;
        beam.x += Math.sin(beam.pulse) * beam.drift;
        beam.pulse += beam.pulseSpeed;

        if (beam.y + beam.length < -140) {
          resetBeam(beam, viewWidth, viewHeight);
        }

        drawBeam(beam);
      }

      frameRef.current = window.requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.22),transparent_52%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(245,158,11,0.18),transparent_58%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.35),rgba(2,6,23,0.88))]" />
    </div>
  );
}
