import { NextRequest, NextResponse } from "next/server";
import {
  createWalletChallenge,
  linkVerifiedWallet,
  listWallets,
  removeWallet,
  setPrimaryWallet,
} from "@/lib/wallet-store";
import { LIVE_ASSETS, LIVE_CHAINS } from "@/lib/live-universe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const wallets = await listWallets();
    return NextResponse.json({
      wallets,
      chains: Object.values(LIVE_CHAINS),
      assets: LIVE_ASSETS,
    });
  } catch (error) {
    console.error("GET /api/wallet error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load wallets" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action;

    if (action === "CHALLENGE") {
      const challenge = await createWalletChallenge(
        String(body.address || "").trim(),
        String(body.chain || "").trim()
      );
      return NextResponse.json(challenge);
    }

    if (action === "VERIFY") {
      const wallet = await linkVerifiedWallet({
        challengeId: Number(body.challengeId),
        address: String(body.address || "").trim(),
        chain: String(body.chain || "").trim(),
        signature: String(body.signature || "").trim(),
        provider: String(body.provider || "injected"),
        label: body.label ? String(body.label) : undefined,
      });
      const wallets = await listWallets();
      return NextResponse.json({ wallet, wallets });
    }

    if (action === "UNLINK") {
      await removeWallet(Number(body.id));
      const wallets = await listWallets();
      return NextResponse.json({ wallets });
    }

    if (action === "SET_PRIMARY") {
      await setPrimaryWallet(Number(body.id));
      const wallets = await listWallets();
      return NextResponse.json({ wallets });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/wallet error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Wallet action failed" },
      { status: 400 }
    );
  }
}
