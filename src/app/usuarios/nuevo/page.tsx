"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  emptyUsuarioForm,
  rolFromNivelForm,
  UsuarioFormFields,
  type UsuarioFormValues,
} from "@/components/usuarios/UsuarioForm";

type ModuloRow = { id: string; nombre: string; slug: string; descripcion: string | null; activo_empresa?: boolean };

export default function NuevoUsuarioPage() {
  const router = useRouter();

  const [form, setForm] = useState(emptyUsuarioForm());
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [modulosDisponibles, setModulosDisponibles] = useState<ModuloRow[]>([]);
  const [modulosElegidos, setModulosElegidos] = useState<Set<string>>(new Set());
  const [cargandoModulos, setCargandoModulos] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetchWithSupabaseSession("/api/empresas/modulos", { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (cancelado) return;
        if (r.ok && j?.success !== false) {
          const lista = (j?.data?.modulos ?? []) as ModuloRow[];
          setModulosDisponibles(lista);
          // Por defecto se marcan los activos para la empresa (evita habilitar por accidente
          // módulos que la empresa todavía no compró/configuró).
          const preSel = lista.filter((m) => m.activo_empresa !== false).map((m) => m.id);
          setModulosElegidos(new Set(preSel));
        }
      } catch { /* opcional */ }
      finally { if (!cancelado) setCargandoModulos(false); }
    })();
    return () => { cancelado = true; };
  }, []);

  function toggleModulo(id: string) {
    setModulosElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function marcarTodos() { setModulosElegidos(new Set(modulosDisponibles.map((m) => m.id))); }
  function desmarcarTodos() { setModulosElegidos(new Set()); }

  const esRolAdminEmpresa = form.nivel === "administrador"; // admins ven todos, sin picker

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    const upper = ["nombre"];
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      let normalized = value;
      if (name === "email" || type === "email") normalized = value.toLowerCase();
      else if (upper.includes(name)) normalized = value.toUpperCase();
      setForm((prev) => ({ ...prev, [name]: normalized } as UsuarioFormValues));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!form.email.trim()) {
      setError("El email es obligatorio.");
      return;
    }
    if (!form.password) {
      setError("La contraseña es obligatoria.");
      return;
    }
    if (form.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (form.password !== form.password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    const pct = form.porcentaje_comision.trim();
    const pctNum = pct === "" ? null : Number(pct);
    if (pctNum !== null && (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100)) {
      setError("La comisión debe estar entre 0 y 100.");
      return;
    }

    setGuardando(true);

    try {
      const res = await fetchWithSupabaseSession("/api/empresas/usuarios/nuevo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          nombre: form.nombre.trim(),
          telefono: form.telefono.trim() || undefined,
          fecha_nacimiento: form.fecha_nacimiento || undefined,
          fecha_ingreso: form.fecha_ingreso || undefined,
          tipo_contrato: form.tipo_contrato,
          salario_base: form.salario_base.trim() || undefined,
          porcentaje_comision: pct.trim() || undefined,
          ips: form.ips,
          area: form.area,
          rol: rolFromNivelForm(form.nivel),
          modulo_ids: esRolAdminEmpresa ? undefined : Array.from(modulosElegidos),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Error al crear usuario");
      }
    } catch (err: unknown) {
      setGuardando(false);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      setError(`Error al crear usuario: ${msg}`);
      return;
    }

    setGuardando(false);
    router.push("/usuarios");
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/usuarios" className="hover:text-gray-700 transition-colors">
          Usuarios
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Nuevo usuario</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo usuario</h1>
        <p className="text-sm text-gray-500 mt-1">Código generado automáticamente al guardar.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <UsuarioFormFields
          variant="create"
          form={form}
          onChange={handleChange}
          onSalarioBaseChange={(n) => setForm((prev) => ({ ...prev, salario_base: String(n) }))}
          showPwd={showPwd}
          setShowPwd={setShowPwd}
          showPwd2={showPwd2}
          setShowPwd2={setShowPwd2}
        />

        {/* Selector de módulos permitidos */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Módulos habilitados</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {esRolAdminEmpresa
                  ? "Los administradores acceden a todos los módulos activos de la empresa."
                  : "Elegí a qué módulos podrá acceder este usuario en el sistema."}
              </p>
            </div>
            {!esRolAdminEmpresa && modulosDisponibles.length > 0 && (
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={marcarTodos} className="rounded-md border border-sky-200 bg-white px-2.5 py-1 font-medium text-sky-700 hover:bg-sky-50">
                  Marcar todos
                </button>
                <button type="button" onClick={desmarcarTodos} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-50">
                  Desmarcar todos
                </button>
              </div>
            )}
          </div>

          {esRolAdminEmpresa ? (
            <p className="text-xs text-slate-400 italic">Todos los módulos activos disponibles.</p>
          ) : cargandoModulos ? (
            <p className="text-xs text-slate-400 animate-pulse">Cargando módulos…</p>
          ) : modulosDisponibles.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No hay módulos activos configurados para esta empresa.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {modulosDisponibles.map((m) => {
                const marcado = modulosElegidos.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition ${marcado ? "border-sky-300 bg-sky-50/60" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => toggleModulo(m.id)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-slate-800">{m.nombre}</span>
                        {m.activo_empresa === false && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                            Inactivo en la empresa
                          </span>
                        )}
                      </div>
                      {m.descripcion && (
                        <div className="text-[11px] text-slate-500 line-clamp-2">{m.descripcion}</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={guardando}
            className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {guardando ? "Creando usuario…" : "Guardar usuario"}
          </button>
          <Link href="/usuarios" className="text-sm text-gray-500 hover:text-gray-800 transition-colors px-4 py-2.5">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
