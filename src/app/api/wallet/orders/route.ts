import { NextRequest, NextResponse } from "next/server";
import { getCustodySession } from "@/lib/custody";
import {
  createLiveOrder,
  createLiveExitIntent,
  confirmLiveOrder,
  failLiveOrder,
  cancelLiveOrder,
  listLiveOrders,
  listLivePositions,
  listWallets,
} from "@/lib/wallet-store";
import { getTerminalState } from "@/lib/trading-engine";
import { db } from "@/db";
import { custodyWallets, liveOrders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { LIVE_ASSETS } from "@/lib/live-universe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [orders, livePositions, wallets, state] = await Promise.all([
      listLiveOrders(),
      listLivePositions(),
      listWallets(),
      getTerminalState(),
    ]);
    return NextResponse.json({
      orders,
      livePositions,
      wallets,
      liveMetrics: state.liveMetrics,
      config: state.config,
      assets: LIVE_ASSETS,
    });
  } catch (error) {
    console.error("GET /api/wallet/orders error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load live orders" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action;
    const session = await getCustodySession(false);

    if (action === "CREATE") {
      const order = await createLiveOrder({
        walletAddress: body.walletAddress ? String(body.walletAddress) : undefined,
        chain: body.chain ? String(body.chain) : undefined,
        side: body.side === "SELL" ? "SELL" : "BUY",
        assetSymbol: String(body.assetSymbol || ""),
        amountUsd: body.amountUsd !== undefined ? Number(body.amountUsd) : undefined,
        slippagePct: body.slippagePct !== undefined ? Number(body.slippagePct) : undefined,
        source: "MANUAL",
        reason: body.reason ? String(body.reason) : undefined,
        sessionId: body.useCustody && session ? session : undefined,
      });
      const state = await getTerminalState();
      return NextResponse.json({ order, state });
    }

    if (action === "EXIT_POSITION") {
      const order = await createLiveExitIntent(
        Number(body.positionId),
        body.amountUsd !== undefined ? Number(body.amountUsd) : undefined
      );
      const state = await getTerminalState();
      return NextResponse.json({ order, state });
    }

    if (action === "CONFIRM") {
      const [existing] = await db.select().from(liveOrders).where(eq(liveOrders.id, Number(body.orderId)));
      if (!existing) throw new Error("Live order not found");
      const [managed] = await db.select().from(custodyWallets).where(eq(custodyWallets.address, existing.walletAddress));
      if (managed && (!session || managed.sessionId !== session)) throw new Error("Only the owning vault session can settle this order");
      const order = await confirmLiveOrder(Number(body.orderId), String(body.txHash || ""));
      const state = await getTerminalState();
      return NextResponse.json({ order, state });
    }

    if (action === "FAIL") {
      await failLiveOrder(Number(body.orderId), String(body.error || "Wallet rejected the transaction"));
      const state = await getTerminalState();
      return NextResponse.json({ state });
    }

    if (action === "CANCEL") {
      const [managed] = await db.select().from(custodyWallets).where(eq(custodyWallets.address, (await db.select().from(liveOrders).where(eq(liveOrders.id, Number(body.orderId))))[0]?.walletAddress));
      if (managed) throw new Error("Pending server-signed transactions cannot be cancelled — retry to reconcile the receipt");
      await cancelLiveOrder(Number(body.orderId));
      const state = await getTerminalState();
      return NextResponse.json({ state });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/wallet/orders error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Live order action failed" },
      { status: 400 }
    );
  }
}
