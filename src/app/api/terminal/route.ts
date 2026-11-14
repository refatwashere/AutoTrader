import { NextRequest, NextResponse } from "next/server";
import {
  getTerminalState,
  runAutonomousTick,
  discoverMempoolTokens,
  manualSnipeToken,
  manualClosePosition,
  updateBotConfig,
  ensureInitialized,
} from "@/lib/trading-engine";
import { db } from "@/db";
import { botConfigs, executionLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCustodySession } from "@/lib/custody";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCustodySession(false);
    const state = await getTerminalState(session);
    return NextResponse.json(state);
  } catch (error) {
    console.error("GET /api/terminal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load terminal state" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = await getCustodySession(false);
    const action = body?.action;

    if (action === "TICK") {
      const state = await runAutonomousTick({ forceTrade: Boolean(body.forceTrade), sessionId: session });
      return NextResponse.json(state);
    }

    if (action === "SCAN_MEMPOOL") {
      const state = await discoverMempoolTokens();
      return NextResponse.json(state);
    }

    if (action === "SNIPE") {
      const tokenId = Number(body.tokenId);
      const amountUsd = body.amountUsd ? Number(body.amountUsd) : undefined;
      const state = await manualSnipeToken(tokenId, amountUsd);
      return NextResponse.json(state);
    }

    if (action === "CLOSE_POSITION") {
      const positionId = Number(body.positionId);
      const state = await manualClosePosition(positionId);
      return NextResponse.json(state);
    }

    if (action === "UPDATE_CONFIG") {
      const state = await updateBotConfig(body.updates ?? {});
      return NextResponse.json(state);
    }

    if (action === "TOP_UP_VAULT") {
      const config = await ensureInitialized();
      const topUp = Number(body.amountUsd || 2500);
      await db
        .update(botConfigs)
        .set({
          allocatedCapital: Number((config.allocatedCapital + topUp).toFixed(2)),
          cashBalance: Number((config.cashBalance + topUp).toFixed(2)),
          updatedAt: new Date(),
        })
        .where(eq(botConfigs.id, config.id));

      await db.insert(executionLogs).values({
        level: "SYSTEM",
        symbol: "VAULT",
        chain: "MULTI",
        message: `Vault funded with +$${topUp.toLocaleString()} liquidity — Available cash now $${(
          config.cashBalance + topUp
        ).toLocaleString()}`,
        details: "Ready for autonomous deployment across SOL, BASE, ETH, ARB",
      });

      const state = await getTerminalState();
      return NextResponse.json(state);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed";
    const isValidationError =
      /verify a wallet|invalid|required|insufficient|not found|exceeds|remains|budget|unsupported|curated|must be|cannot/i.test(
        message
      );
    console.error("POST /api/terminal error:", message);
    return NextResponse.json({ error: message }, { status: isValidationError ? 400 : 500 });
  }
}
