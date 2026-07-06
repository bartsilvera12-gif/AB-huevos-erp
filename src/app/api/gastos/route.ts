import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/gastos
 * Gastos operativos del tenant (service role).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const { data, error } = await supabase
      .from("gastos")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .order("fecha", { ascending: false });

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/** POST /api/gastos — alta de gasto operativo (service role, evita RLS del navegador). */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const body = (await request.json().catch(() => ({}))) as {
      categoria?: string; descripcion?: string; monto?: number;
      tipo?: string; recurrente?: boolean; frecuencia?: string | null; fecha?: string;
    };
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json(errorResponse("El monto debe ser mayor a 0"), { status: 400 });
    }
    if (!body.fecha) {
      return NextResponse.json(errorResponse("La fecha es obligatoria"), { status: 400 });
    }
    const { data, error } = await supabase
      .from("gastos")
      .insert({
        empresa_id: auth.empresa_id,
        categoria: (body.categoria ?? "").trim() || null,
        descripcion: (body.descripcion ?? "").trim() || null,
        monto,
        tipo: body.tipo ?? "fijo",
        recurrente: body.recurrente === true,
        frecuencia: (body.frecuencia ?? "").toString().trim() || null,
        fecha: body.fecha,
      })
      .select()
      .single();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse({ gasto: data }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
