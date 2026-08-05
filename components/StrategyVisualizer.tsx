/**
 * StrategyVisualizer — Animated trajectory visualization for EXECUTA_ESTRATEGIA.
 *
 * Renders a dark circular sumo dojo with:
 * - Path dots showing the planned trajectory
 * - Numbered waypoint markers (green=start, blue=move, amber=wait)
 * - Animated red triangle representing the robot
 * - Pulse/flash effect during wait steps
 * - Step counter + replay button
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Animated, Easing, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// --- Constants ---
const ARENA = 236;
const CX = ARENA / 2;
const CY = ARENA / 2;
const BOT = 14;
const DOT = 3.5;

// --- Types ---
type WP = {
  x: number;
  y: number;
  a: number;    // angle degrees, 0=up, +clockwise
  ms: number;   // animation duration to reach this point
  lbl: string;  // display label ('' = hidden curve-shaping point)
  wait?: boolean;
};

// --- Waypoint definitions for each strategy ---
function makeWaypoints(id: string, v: number): WP[] {
  const sx = CX;
  const sy = CY + 66;

  switch (id) {
    case '0':
      return [
        { x: sx, y: sy, a: 0, ms: 0, lbl: 'Início' },
        { x: sx, y: sy, a: 0, ms: 800, lbl: 'Direto → Busca PID', wait: true },
      ];

    case 'A': {
      const presets: WP[][] = [
        // var 0 — Curto: spin 100° right, tight curve left
        [
          { x: sx, y: sy, a: 0, ms: 0, lbl: 'Início' },
          { x: sx, y: sy, a: 100, ms: 500, lbl: 'Giro rápido →' },
          { x: sx + 22, y: sy - 32, a: 68, ms: 350, lbl: '' },
          { x: sx - 28, y: CY - 8, a: 22, ms: 450, lbl: 'Curva aberta ←' },
        ],
        // var 1 — Médio: spin 75° right, medium curve
        [
          { x: sx, y: sy, a: 0, ms: 0, lbl: 'Início' },
          { x: sx, y: sy, a: 75, ms: 400, lbl: 'Giro médio →' },
          { x: sx + 16, y: sy - 28, a: 45, ms: 300, lbl: '' },
          { x: sx - 18, y: CY - 3, a: 10, ms: 380, lbl: 'Curva suave ←' },
        ],
        // var 2 — Fundo: spin 75° right, long advance
        [
          { x: sx, y: sy, a: 0, ms: 0, lbl: 'Início' },
          { x: sx, y: sy, a: 75, ms: 400, lbl: 'Giro →' },
          { x: sx + 14, y: sy - 32, a: 40, ms: 350, lbl: '' },
          { x: sx - 14, y: CY - 38, a: 5, ms: 500, lbl: 'Avanço longo ao fundo' },
        ],
      ];
      return presets[v] ?? presets[0];
    }

    case 'B':
      return [
        { x: sx, y: sy, a: 0, ms: 0, lbl: 'Início' },
        { x: sx, y: sy, a: 38, ms: 250, lbl: 'Giro curto →' },
        { x: sx + 10, y: sy - 38, a: 38, ms: 300, lbl: 'Avanço reto' },
        { x: sx - 16, y: CY - 6, a: 8, ms: 350, lbl: 'Diagonal ←' },
        { x: sx - 20, y: CY - 58, a: 4, ms: 500, lbl: 'Sprint final' },
      ];

    case 'C':
      return [
        { x: sx, y: sy, a: 0, ms: 0, lbl: 'Início' },
        { x: sx, y: sy, a: 0, ms: 900, lbl: 'Imóvel · Aguardando', wait: true },
        { x: sx, y: CY - 22, a: 0, ms: 400, lbl: 'Contra-ataque 100%' },
      ];

    case 'D':
      return [
        { x: sx, y: sy, a: 0, ms: 0, lbl: 'Início' },
        { x: sx, y: sy - 40, a: 0, ms: 350, lbl: '1º Impulso' },
        { x: sx, y: sy - 40, a: 0, ms: 700, lbl: 'Parada brusca', wait: true },
        { x: sx, y: CY - 32, a: 0, ms: 350, lbl: '2º Avanço' },
        { x: sx, y: CY - 32, a: 0, ms: 400, lbl: 'Parada final', wait: true },
      ];

    case 'E':
    default:
      return [
        { x: sx, y: sy, a: 0, ms: 0, lbl: 'Início' },
        { x: sx, y: sy, a: 0, ms: 800, lbl: 'Sem rotina definida', wait: true },
      ];
  }
}

// --- Generate path dots between waypoints ---
function buildPathDots(wps: WP[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    if (b.wait) continue; // no dots for wait segments

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 3) continue; // skip zero-length segments (spins)

    const n = Math.max(3, Math.round(dist / 5));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      out.push({ x: a.x + dx * t, y: a.y + dy * t });
    }
  }
  return out;
}

// --- Component ---
type Props = {
  strategyId: string;
  variancia: number;
};

export function StrategyVisualizer({ strategyId, variancia }: Props) {
  // Memoized data
  const wps = useMemo(() => makeWaypoints(strategyId, variancia), [strategyId, variancia]);
  const dots = useMemo(() => buildPathDots(wps), [wps]);

  // Animated values (stable refs)
  const ax = useRef(new Animated.Value(wps[0].x)).current;
  const ay = useRef(new Animated.Value(wps[0].y)).current;
  const aa = useRef(new Animated.Value(wps[0].a)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  // Constant offset values for positioning math
  const botHalf = useRef(new Animated.Value(BOT / 2)).current;
  const ringOffset = useRef(new Animated.Value(15)).current;

  // State
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Stop all animations and timers
  const stopAll = useCallback(() => {
    animRef.current?.stop();
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // Play the full animation sequence
  const play = useCallback(() => {
    stopAll();

    // Reset to start position
    ax.setValue(wps[0].x);
    ay.setValue(wps[0].y);
    aa.setValue(wps[0].a);
    pulse.setValue(0);
    setStep(0);
    setPlaying(true);

    // Schedule step index updates (synced with animation durations)
    let elapsed = 0;
    for (let i = 1; i < wps.length; i++) {
      const capturedIdx = i;
      const delay = elapsed;
      timersRef.current.push(setTimeout(() => setStep(capturedIdx), delay));
      elapsed += wps[i].ms;
    }

    // Build animation sequence
    const seq: Animated.CompositeAnimation[] = [];

    for (let i = 1; i < wps.length; i++) {
      const w = wps[i];

      if (w.wait) {
        // Pulsing effect: cycle pulse value between 0 and 1
        const pulseCount = Math.max(1, Math.floor(w.ms / 400));
        for (let p = 0; p < pulseCount; p++) {
          seq.push(
            Animated.sequence([
              Animated.timing(pulse, {
                toValue: 1,
                duration: 200,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: false,
              }),
              Animated.timing(pulse, {
                toValue: 0,
                duration: 200,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: false,
              }),
            ])
          );
        }
      } else {
        // Movement: animate position and rotation
        seq.push(
          Animated.parallel([
            Animated.timing(ax, {
              toValue: w.x,
              duration: w.ms,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(ay, {
              toValue: w.y,
              duration: w.ms,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(aa, {
              toValue: w.a,
              duration: w.ms,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
          ])
        );
      }
    }

    animRef.current = Animated.sequence(seq);
    animRef.current.start(({ finished }) => {
      if (finished) setPlaying(false);
    });
  }, [wps, stopAll, ax, ay, aa, pulse]);

  // Auto-play on strategy/variancia change + cleanup on unmount
  useEffect(() => {
    play();
    return stopAll;
  }, [play, stopAll]);

  // --- Derived display values ---

  // Walk backward from current step to find the nearest non-empty label
  const currentLabel = useMemo(() => {
    for (let i = step; i >= 0; i--) {
      if (wps[i].lbl) return wps[i].lbl;
    }
    return '';
  }, [step, wps]);

  // Count only labeled waypoints (for step counter display)
  const totalLabeledSteps = useMemo(
    () => wps.filter((w) => w.lbl).length - 1, // -1 to exclude "Início"
    [wps]
  );
  const currentLabeledStep = useMemo(() => {
    let count = 0;
    for (let i = 1; i <= step; i++) {
      if (wps[i].lbl) count++;
    }
    return count;
  }, [step, wps]);

  // Marker numbering map (only for labeled waypoints)
  const markerNumbers = useMemo(() => {
    const map: Record<number, number> = {};
    let n = 0;
    wps.forEach((w, i) => {
      if (w.lbl) {
        map[i] = n;
        n++;
      }
    });
    return map;
  }, [wps]);

  // --- Animated interpolations ---

  const rotation = aa.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 0],
  });
  const robotFlash = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.35, 1],
  });

  // Computed positions (animated nodes, stable via useMemo)
  const robotLeft = useMemo(() => Animated.subtract(ax, botHalf), [ax, botHalf]);
  const robotTop = useMemo(() => Animated.subtract(ay, botHalf), [ay, botHalf]);
  const ringLeft = useMemo(() => Animated.subtract(ax, ringOffset), [ax, ringOffset]);
  const ringTop = useMemo(() => Animated.subtract(ay, ringOffset), [ay, ringOffset]);

  return (
    <View style={st.wrapper}>
      {/* Arena */}
      <View style={st.arenaFrame}>
        <View style={st.arena}>
          {/* Center cross (shikiri-sen starting lines) */}
          <View style={[st.shikiri, { left: CX - 18, top: CY - 1 }]} />
          <View style={[st.shikiri, { left: CX + 6, top: CY - 1 }]} />
          <View style={st.centerDot} />

          {/* Path trajectory dots */}
          {dots.map((d, i) => (
            <View
              key={`d${i}`}
              style={[
                st.pathDot,
                {
                  left: d.x - DOT / 2,
                  top: d.y - DOT / 2,
                  opacity: 0.15 + (i / Math.max(dots.length, 1)) * 0.55,
                },
              ]}
            />
          ))}

          {/* Waypoint markers (numbered, only for labeled ones) */}
          {wps.map((w, i) =>
            w.lbl ? (
              <View
                key={`m${i}`}
                style={[
                  st.marker,
                  {
                    left: w.x - 8,
                    top: w.y - 8,
                    backgroundColor: i === 0 ? '#22c55e' : w.wait ? '#f59e0b' : '#3b82f6',
                    borderColor: i === 0 ? '#15803d' : w.wait ? '#b45309' : '#1d4ed8',
                  },
                ]}>
                <Text style={st.markerText}>{markerNumbers[i] ?? i}</Text>
              </View>
            ) : null
          )}

          {/* Pulse ring behind robot (visible only during wait steps) */}
          <Animated.View
            style={[
              st.pulseRing,
              {
                left: ringLeft,
                top: ringTop,
                opacity: pulseOpacity,
              },
            ]}
          />

          {/* Robot triangle (animated) */}
          <Animated.View
            style={{
              position: 'absolute' as const,
              left: robotLeft,
              top: robotTop,
              width: BOT,
              height: BOT,
              alignItems: 'center' as const,
              justifyContent: 'center' as const,
              zIndex: 20,
              transform: [{ rotate: rotation }],
              opacity: robotFlash,
            }}>
            {/* Glow behind triangle */}
            <View style={st.robotGlow} />
            {/* Triangle pointing UP (0° = forward/up) */}
            <View style={st.triangle} />
          </Animated.View>
        </View>
      </View>

      {/* Step counter & label */}
      <View style={st.stepInfo}>
        <Text style={st.stepCounter}>
          Passo {currentLabeledStep} / {totalLabeledSteps}
        </Text>
        <Text style={st.stepLabel}>{currentLabel}</Text>
      </View>

      {/* Replay button */}
      <TouchableOpacity onPress={play} disabled={playing} activeOpacity={0.7}>
        <View style={[st.replayBtn, playing && { opacity: 0.4 }]}>
          <Text style={st.replayText}>{playing ? '▶  Animando...' : '↻  Repetir Animação'}</Text>
        </View>
      </TouchableOpacity>

      {/* Legend */}
      <View style={st.legend}>
        <LegendDot color="#22c55e" label="Início" />
        <LegendDot color="#3b82f6" label="Movimento" />
        <LegendDot color="#f59e0b" label="Espera" />
        <View style={st.legendItem}>
          <View style={st.legendTriangle} />
          <Text style={st.legendText}>Robô</Text>
        </View>
      </View>
    </View>
  );
}

// --- Legend helper ---
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={st.legendItem}>
      <View style={[st.legendDot, { backgroundColor: color }]} />
      <Text style={st.legendText}>{label}</Text>
    </View>
  );
}

// --- Styles ---
const st = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  arenaFrame: {
    padding: 5,
    borderRadius: (ARENA + 18) / 2,
    borderWidth: 2,
    borderColor: '#475569',
    backgroundColor: '#0f172a',
  },
  arena: {
    width: ARENA,
    height: ARENA,
    borderRadius: ARENA / 2,
    backgroundColor: '#1e293b',
    borderWidth: 3,
    borderColor: '#64748b',
  },
  shikiri: {
    position: 'absolute',
    width: 12,
    height: 2.5,
    backgroundColor: '#475569',
    borderRadius: 1,
    zIndex: 1,
  },
  centerDot: {
    position: 'absolute',
    left: CX - 3,
    top: CY - 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#334155',
    zIndex: 1,
  },
  pathDot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: '#38bdf8',
    zIndex: 2,
  },
  marker: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    zIndex: 10,
  },
  markerText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
  },
  pulseRing: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#fbbf24',
    zIndex: 15,
  },
  robotGlow: {
    position: 'absolute',
    width: BOT + 6,
    height: BOT + 6,
    borderRadius: (BOT + 6) / 2,
    backgroundColor: 'rgba(244, 63, 94, 0.2)',
  },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: BOT / 2,
    borderRightWidth: BOT / 2,
    borderBottomWidth: BOT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f43f5e',
  },
  stepInfo: {
    alignItems: 'center',
    gap: 2,
    minHeight: 36,
  },
  stepCounter: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  stepLabel: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  replayBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#334155',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  replayText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f43f5e',
  },
  legendText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '500',
  },
});
