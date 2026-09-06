import type { ReactNode, SVGAttributes } from "react";

// Stroke-only line icons, one weight per family, no filled joints - approved
// design (round two: equipment, not figures). Keyed by Activity.sport, which
// is free text, so an unrecognized sport just renders nothing rather than a
// broken/missing icon.
const S: SVGAttributes<SVGElement> = { fill: "none", stroke: "currentColor", strokeWidth: 5.4, strokeLinecap: "round", strokeLinejoin: "round" };
const BOLD: SVGAttributes<SVGElement> = { ...S, strokeWidth: 8.5 };
const THIN: SVGAttributes<SVGElement> = { ...S, strokeWidth: 3.2 };

const PATHS: Record<string, () => ReactNode> = {
  Volleyball: () => (
    <>
      <circle cx={32} cy={30} r={20} {...S} />
      <path d="M32,30 Q27,19 32,10" {...S} />
      <path d="M32,30 Q19,35 14.7,40" {...S} />
      <path d="M32,30 Q45,35 49.3,40" {...S} />
      <path d="M14.7,40 Q32,46 49.3,40" {...S} />
      <rect x={16} y={49} width={80} height={6} fill="currentColor" />
      <path d="M16,44 L16,95" {...S} />
      <path d="M96,44 L96,95" {...S} />
      <path d="M34,55 L34,82" {...S} />
      <path d="M52,55 L52,82" {...S} />
      <path d="M70,55 L70,82" {...S} />
      <path d="M88,55 L88,82" {...S} />
      <path d="M16,68 L96,68" {...S} />
      <path d="M16,82 L96,82" {...S} />
    </>
  ),
  Basketball: () => (
    <>
      <rect x={28} y={6} width={44} height={26} {...S} />
      <ellipse cx={50} cy={38} rx={24} ry={7} {...S} />
      <rect x={42} y={30} width={16} height={5} fill="currentColor" />
      <path d="M30,41 L38,82" {...S} />
      <path d="M40,41.5 L44,82" {...S} />
      <path d="M50,42 L50,82" {...S} />
      <path d="M60,41.5 L56,82" {...S} />
      <path d="M70,41 L62,82" {...S} />
      <path d="M38,82 L62,82" {...S} />
      <path d="M35,55 L65,55" {...S} />
      <path d="M37,68 L63,68" {...S} />
      <circle cx={50} cy={16} r={11} {...S} />
      <path d="M39,13 Q50,20 61,13" {...S} />
      <path d="M50,5 L50,27" {...S} />
    </>
  ),
  Soccer: () => (
    <>
      <circle cx={50} cy={50} r={33} {...BOLD} />
      <path d="M59.4,37.06 L65.22,54.94 L50,66 L34.78,54.94 L40.6,37.06 Z" {...THIN} />
      <path d="M59.4,37.06 L69.98,22.49" {...THIN} />
      <path d="M65.22,54.94 L82.34,60.51" {...THIN} />
      <path d="M50,66 L50,84" {...THIN} />
      <path d="M34.78,54.94 L17.66,60.51" {...THIN} />
      <path d="M40.6,37.06 L30.02,22.49" {...THIN} />
      <path d="M69.98,22.49 Q68.55,43.97 82.34,60.51" {...THIN} />
      <path d="M82.34,60.51 Q61.47,65.79 50,84" {...THIN} />
      <path d="M50,84 Q38.53,65.79 17.66,60.51" {...THIN} />
      <path d="M17.66,60.51 Q31.45,43.97 30.02,22.49" {...THIN} />
      <path d="M30.02,22.49 Q50,30.49 69.98,22.49" {...THIN} />
    </>
  ),
  Swimming: () => (
    <>
      <circle cx={34} cy={28} r={13} {...S} />
      <circle cx={66} cy={28} r={13} {...S} />
      <path d="M47,26 L53,26" {...S} />
      <path d="M21,24 Q50,2 79,24" {...S} />
      <path d="M8,54 Q20,46 32,54 T56,54 T80,54 T104,54" {...S} />
      <path d="M8,76 Q20,68 32,76 T56,76 T80,76 T104,76" {...S} />
    </>
  ),
  Golf: () => (
    <>
      <path d="M28,14 L28,88" {...S} />
      <path d="M28,16 L50,26 L28,34 Z" {...S} />
      <ellipse cx={28} cy={90} rx={16} ry={5} {...S} />
      <circle cx={70} cy={66} r={15} {...S} />
      <circle cx={65} cy={61} r={1.6} fill="currentColor" />
      <circle cx={74} cy={63} r={1.6} fill="currentColor" />
      <circle cx={68} cy={70} r={1.6} fill="currentColor" />
    </>
  ),
  "Cross Country": () => (
    <>
      <path d="M4,44 L20,18 L32,34 L48,12 L64,36 L80,16 L96,44" {...S} />
      <path
        d="M18,74 C18,64 26,58 36,57 L64,50 C74,47 85,50 87,58 C89,64 85,69 78,71 L26,78 C20,79 17,78 18,74 Z"
        {...S}
      />
      <path d="M40,57 L46,50" {...S} />
      <path d="M55,54 L59,48" {...S} />
    </>
  ),
  "Academic Games": () => (
    <>
      <path d="M14,40 L50,24 L86,40 L50,56 Z" {...S} />
      <path d="M27,45 L27,63 Q50,75 73,63 L73,45" {...S} />
      <path d="M78,42 L78,64" {...S} />
      <circle cx={78} cy={70} r={4} fill="currentColor" />
    </>
  ),
  Tennis: () => (
    <>
      <rect x={4} y={18} width={62} height={64} {...S} />
      <rect x={12} y={18} width={46} height={64} {...S} />
      <path d="M4,50 L66,50" {...S} />
      <path d="M12,36 L58,36" {...S} />
      <path d="M12,64 L58,64" {...S} />
      <path d="M35,36 L35,64" {...S} />
      <ellipse cx={85.2} cy={42.8} rx={13.2} ry={15.6} {...S} />
      <path d="M85.2,28.4 L85.2,57.2" {...S} />
      <path d="M77.4,30.2 L77.4,54.8" {...S} />
      <path d="M93,30.2 L93,54.8" {...S} />
      <path d="M74.4,35.6 L96,35.6" {...S} />
      <path d="M72.6,42.8 L97.8,42.8" {...S} />
      <path d="M74.4,50 L96,50" {...S} />
      <path d="M83.4,57.2 L81.6,72.8" {...S} />
      <path d="M87,57.2 L88.8,72.8" {...S} />
    </>
  ),
  Wrestling: () => (
    <>
      <circle cx={50} cy={50} r={34} {...S} />
      <circle cx={50} cy={50} r={14} {...S} />
      <circle cx={50} cy={50} r={2.2} fill="currentColor" />
    </>
  ),
  "Senior Fine Arts": () => (
    <>
      <path
        d="M12.2,38.6 C12.2,29 19,23.6 27.1,23.6 C35.3,23.6 40.7,29 40.7,37.2 C40.7,46.7 33.9,52.2 25.8,52.2 C17.6,52.2 12.2,46.7 12.2,38.6 Z"
        {...S}
      />
      <path d="M19,35.8 Q20.3,33.1 22.4,35.8" {...S} />
      <path d="M29.8,35.8 Q31.9,33.1 33.9,35.8" {...S} />
      <path d="M19.6,44 Q26.4,39.9 33.2,44" {...S} />
      <path
        d="M35.3,39.9 C35.3,30.4 42.1,25 50.2,25 C58.4,25 63.8,30.4 63.8,39.9 C63.8,49.4 57.7,54.9 49.6,54.9 C42.1,54.9 35.3,49.4 35.3,39.9 Z"
        {...S}
      />
      <path d="M42.8,37.2 Q44.1,39.9 46.2,37.2" {...S} />
      <path d="M53.6,37.2 Q55.7,39.9 57,37.2" {...S} />
      <path d="M43.4,46.7 Q50.2,50.8 57,46.7" {...S} />
      <ellipse cx={76} cy={84} rx={9} ry={6.5} transform="rotate(-18 76 84)" fill="currentColor" />
      <path d="M84,80 L84,26" {...S} />
      <path d="M84,26 C94,30 96,40 88,46" {...S} />
    </>
  ),
  Badminton: () => (
    <>
      <rect x={4} y={18} width={62} height={64} {...S} />
      <rect x={12} y={18} width={46} height={64} {...S} />
      <path d="M4,50 L66,50" {...S} />
      <path d="M12,44 L58,44" {...S} />
      <path d="M12,56 L58,56" {...S} />
      <path d="M35,44 L35,56" {...S} />
      <circle cx={84} cy={32} r={12} {...S} />
      <path d="M84,21.2 L84,42.8" {...S} />
      <path d="M76.2,23.6 L76.2,40.4" {...S} />
      <path d="M91.8,23.6 L91.8,40.4" {...S} />
      <path d="M73.2,27.2 L94.8,27.2" {...S} />
      <path d="M73.2,36.8 L94.8,36.8" {...S} />
      <path d="M86.4,42.8 L90,64.4" {...S} />
      <path d="M82.8,42.8 L81.6,64.4" {...S} />
    </>
  ),
  "Track & Field": () => (
    <>
      <path d="M30,30 L70,30 A20,20 0 0 1 70,70 L30,70 A20,20 0 0 1 30,30 Z" {...S} />
      <path d="M30,38 L70,38 A12,12 0 0 1 70,62 L30,62 A12,12 0 0 1 30,38 Z" {...S} />
    </>
  ),
  Baseball: () => (
    <>
      <path d="M50,88 L83,55 L50,22 L17,55 Z" {...S} />
      <rect x={47} y={84.5} width={6} height={6} {...S} />
      <rect x={79.5} y={52} width={6} height={6} {...S} />
      <rect x={47} y={19.5} width={6} height={6} {...S} />
      <rect x={14.5} y={52} width={6} height={6} {...S} />
      <circle cx={50} cy={55} r={4} fill="currentColor" />
      <circle cx={80} cy={16} r={9} {...S} />
      <path d="M72,10 Q80,16 72,22" {...S} />
      <path d="M88,10 Q80,16 88,22" {...S} />
    </>
  ),
  Softball: () => (
    <>
      <path d="M50,88 L83,55 L50,22 L17,55 Z" {...S} />
      <rect x={47} y={84.5} width={6} height={6} {...S} />
      <rect x={79.5} y={52} width={6} height={6} {...S} />
      <rect x={47} y={19.5} width={6} height={6} {...S} />
      <rect x={14.5} y={52} width={6} height={6} {...S} />
      <circle cx={50} cy={55} r={13} {...S} />
      <circle cx={80} cy={16} r={9} {...S} />
      <path d="M74,11 Q80,16 74,21" {...S} />
    </>
  ),
  "Speech & Debate": () => (
    <>
      <rect x={38} y={12} width={24} height={42} rx={12} {...S} />
      <path d="M28,42 Q28,60 50,60 Q72,60 72,42" {...S} />
      <path d="M50,60 L50,84" {...S} />
      <path d="M32,86 L68,86" {...S} />
    </>
  ),
};

export function SportIcon({ sport, size = 20, className = "" }: { sport: string; size?: number; className?: string }) {
  const render = PATHS[sport];
  if (!render) return null;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden="true">
      {render()}
    </svg>
  );
}
