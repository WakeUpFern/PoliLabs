import type { ResourceOccupancyStatus } from "@/modules/reservations/domain/reservation";

export type CanvasElement = {
  id: string;
  kind: "resource" | "location" | "label";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status?: ResourceOccupancyStatus;
  href?: string;
};

export const occupancyLabels: Record<ResourceOccupancyStatus, string> = {
  free: "Libre",
  occupied: "Ocupado",
  blocked: "Bloqueado",
};

const tones: Record<ResourceOccupancyStatus | "unknown", string> = {
  free: "fill-emerald-100 stroke-emerald-600",
  occupied: "fill-[#7a1731]/20 stroke-[#7a1731]",
  blocked: "fill-amber-100 stroke-amber-600",
  unknown: "fill-white stroke-stone-500",
};
const textTones: Record<ResourceOccupancyStatus | "unknown", string> = {
  free: "text-emerald-900",
  occupied: "text-[#641229]",
  blocked: "text-amber-900",
  unknown: "text-stone-800",
};

function fit(text: string, width: number, fontSize: number) {
  const chars = Math.max(1, Math.floor((width - 0.2) / (fontSize * 0.55)));
  return text.length > chars
    ? `${text.slice(0, Math.max(1, chars - 1))}…`
    : text;
}

// Plain SVG on a cell grid: no client JavaScript and no drawing library.
export function FloorPlanCanvas({
  name,
  width,
  height,
  elements,
}: {
  name: string;
  width: number;
  height: number;
  elements: CanvasElement[];
}) {
  const ordered = [
    ...elements.filter((e) => e.kind === "label"),
    ...elements.filter((e) => e.kind === "location"),
    ...elements.filter((e) => e.kind === "resource"),
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white p-3">
      <svg
        role="img"
        aria-label={`Plano ${name}`}
        viewBox={`-0.1 -0.1 ${width + 0.2} ${height + 0.2}`}
        className="mx-auto block h-auto w-full max-w-4xl"
        style={{ minWidth: Math.min(width * 14, 640) }}
      >
        <defs>
          <pattern
            id="plan-grid"
            width="1"
            height="1"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 1 0 L 0 0 0 1"
              fill="none"
              className="stroke-stone-200"
              strokeWidth="0.03"
            />
          </pattern>
        </defs>
        <rect
          width={width}
          height={height}
          fill="url(#plan-grid)"
          className="stroke-stone-400"
          strokeWidth="0.06"
        />
        {ordered.map((element) => {
          const fontSize = Math.min(0.5, Math.max(0.3, element.height * 0.25));
          const shape =
            element.kind === "resource" ? (
              <rect
                x={element.x + 0.08}
                y={element.y + 0.08}
                width={element.width - 0.16}
                height={element.height - 0.16}
                rx="0.25"
                strokeWidth="0.08"
                className={tones[element.status ?? "unknown"]}
              />
            ) : element.kind === "location" ? (
              <rect
                x={element.x + 0.05}
                y={element.y + 0.05}
                width={element.width - 0.1}
                height={element.height - 0.1}
                rx="0.1"
                strokeWidth="0.06"
                strokeDasharray="0.25 0.15"
                className="fill-sky-50 stroke-sky-600"
              />
            ) : (
              <rect
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                className="fill-stone-100 stroke-stone-300"
                strokeWidth="0.03"
              />
            );
          const label = (
            <text
              x={element.x + element.width / 2}
              y={element.y + element.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              className="fill-current font-semibold"
            >
              {fit(element.name, element.width, fontSize)}
            </text>
          );
          const title = element.status
            ? `${element.name}: ${occupancyLabels[element.status]}`
            : element.name;
          const textTone =
            element.kind === "resource"
              ? textTones[element.status ?? "unknown"]
              : element.kind === "location"
                ? "text-sky-900"
                : "text-stone-600";
          return element.href ? (
            <a
              key={element.id}
              href={element.href}
              aria-label={title}
              className={textTone}
            >
              <title>{title}</title>
              {shape}
              {label}
            </a>
          ) : (
            <g key={element.id} className={textTone}>
              <title>{title}</title>
              {shape}
              {label}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
