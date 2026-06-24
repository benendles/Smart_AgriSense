import { NextResponse } from "next/server";
import { getHistory } from "@/lib/services";
import type { HistoryData } from "@/lib/types";

function generateSeries(base: number, variance: number, count: number): number[] {
  const result: number[] = [];
  let current = base;
  for (let i = 0; i < count; i++) {
    current = Math.round((current + (Math.random() - 0.5) * variance) * 10) / 10;
    // Clamp to reasonable range
    const min = base - variance * 3;
    const max = base + variance * 3;
    current = Math.min(max, Math.max(min, current));
    result.push(current);
  }
  return result;
}

export async function GET(): Promise<NextResponse<HistoryData>> {
  const data = await getHistory();
  return NextResponse.json(data);
}
