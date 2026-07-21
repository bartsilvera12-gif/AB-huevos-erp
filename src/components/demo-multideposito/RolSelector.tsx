"use client";

import { useEffect, useState } from "react";
import { Building2, Warehouse, ShieldCheck } from "lucide-react";
import { getRol, setRol, type DemoRol } from "@/lib/demo-multideposito/store";

/**
 * Selector visual de rol para la demo multi-depósito.
 * Se muestra flotante arriba a la derecha (no toca el header oficial).
 */
export default function RolSelector() {
  const [rol, setRolState] = useState<DemoRol>("admin");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setRolState(getRol());
    setMounted(true);
    const handler = (e: Event) => {
      const r = (e as CustomEvent).detail as DemoRol;
      setRolState(r);
    };
    window.addEventListener("demo-rol-changed", handler as EventListener);
    return () => window.removeEventListener("demo-rol-changed", handler as EventListener);
  }, []);

  if (!mounted) return null;

  function cambiar(r: DemoRol) {
    setRol(r);
    setRolState(r);
    // Reload para que el sidebar/permisos recomputen
    setTimeout(() => window.location.reload(), 80);
  }

  return (
    <div className="fixed top-3 right-4 z-[70] print:hidden">
      <div className="rounded-full border border-slate-300 bg-white/95 backdrop-blur px-2 py-1 shadow-md flex items-center gap-1 text-[11px]">
        <span className="text-slate-500 mr-1 hidden sm:inline">Rol demo:</span>
        <button
          type="button"
          onClick={() => cambiar("admin")}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold transition ${rol === "admin" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          title="Admin: ve todo"
        >
          <ShieldCheck className="h-3 w-3" /> Admin
        </button>
        <button
          type="button"
          onClick={() => cambiar("central")}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold transition ${rol === "central" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          title="Central: produce, clasifica y despacha"
        >
          <Warehouse className="h-3 w-3" /> Central
        </button>
        <button
          type="button"
          onClick={() => cambiar("abasto_norte")}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold transition ${rol === "abasto_norte" ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          title="Abasto Norte: recibe stock y vende"
        >
          <Building2 className="h-3 w-3" /> Abasto Norte
        </button>
      </div>
    </div>
  );
}
