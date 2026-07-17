"use client";

import Link from "next/link";
import { Warehouse, ClipboardList, Egg, ArrowRight, CheckCircle2 } from "lucide-react";

type StepKey = "galpones" | "produccion" | "clasificacion";

const STEPS: { key: StepKey; label: string; sub: string; href: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "galpones",      label: "Galpones",      sub: "Infraestructura",        href: "/galpones",      icon: Warehouse },
  { key: "produccion",    label: "Producción",    sub: "Recolección diaria",     href: "/produccion",    icon: ClipboardList },
  { key: "clasificacion", label: "Clasificación", sub: "Desglose por tipo",      href: "/clasificacion", icon: Egg },
];

export default function GranjaStepper({ current }: { current: StepKey }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {STEPS.map((step, idx) => {
          const isCurrent = step.key === current;
          const isPast    = idx < currentIdx;
          const isFuture  = idx > currentIdx;
          const Icon = step.icon;

          const content = (
            <div
              className={[
                "group flex items-center gap-3 rounded-xl px-3 py-2 transition-all",
                isCurrent && "bg-gradient-to-br from-[#4FAEB2] to-[#3F8E91] text-white shadow-md shadow-[#4FAEB2]/25 ring-1 ring-white/20",
                isPast    && "border border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-50",
                isFuture  && "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
              ].filter(Boolean).join(" ")}
            >
              <div className={[
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                isCurrent && "bg-white/20 text-white",
                isPast    && "bg-emerald-100 text-emerald-700",
                isFuture  && "bg-slate-100 text-slate-500 group-hover:bg-slate-200",
              ].filter(Boolean).join(" ")}>
                {isPast ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <div className="min-w-0 hidden sm:block">
                <p className={`text-[9px] font-semibold uppercase tracking-wider leading-none ${isCurrent ? "text-white/80" : "text-slate-400"}`}>
                  Paso {idx + 1}
                </p>
                <p className={`mt-0.5 text-sm font-semibold leading-tight ${isCurrent ? "text-white" : ""}`}>{step.label}</p>
                <p className={`text-[10px] leading-tight ${isCurrent ? "text-white/70" : "text-slate-500"}`}>{step.sub}</p>
              </div>
              <div className="sm:hidden">
                <p className={`text-xs font-semibold ${isCurrent ? "text-white" : ""}`}>{step.label}</p>
              </div>
            </div>
          );

          return (
            <div key={step.key} className="flex flex-1 items-center gap-2">
              {isCurrent ? (
                <div className="flex-1">{content}</div>
              ) : (
                <Link href={step.href} className="flex-1">{content}</Link>
              )}
              {idx < STEPS.length - 1 && (
                <ArrowRight className={`h-4 w-4 shrink-0 ${idx < currentIdx ? "text-emerald-400" : "text-slate-300"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
