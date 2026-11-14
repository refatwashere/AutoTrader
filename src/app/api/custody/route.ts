import { NextRequest, NextResponse } from "next/server";
import {
  getCustodySession, getCustodyState, getOrCreateCustodyWallet,
  maybeSyncCustodyDeposits, syncCustodyDeposits, addCustodyAddress,
  addTestFunds, testWithdrawal, createWithdrawal, confirmWithdrawal,
  configureCustody, executeCustodyTrade,
} from "@/lib/custody";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getCustodySession();
    if (!session) throw new Error("Could not initialize vault session");
    return NextResponse.json({ custody: await maybeSyncCustodyDeposits(session) });
  } catch (error) {
    console.error("GET /api/custody:", error instanceof Error ? error.message : "Vault unavailable");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Vault unavailable" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = await getCustodySession();
    if (!session) throw new Error("Initialize your vault session first");
    const action = body.action;
    let result = null;
    let warning: string | undefined;
    let txHash: string | undefined;

    if (action === "CREATE_VAULT") {
      await getOrCreateCustodyWallet(session);
    } else if (action === "SYNC_DEPOSITS") {
      result = await syncCustodyDeposits(session);
    } else if (action === "ADD_ADDRESS") {
      result = await addCustodyAddress(session, String(body.address || "").trim(), body.label);
    } else if (action === "ADD_TEST_FUNDS") {
      result = await addTestFunds(session, Number(body.amountUsd || 1000));
    } else if (action === "TEST_WITHDRAW") {
      result = await testWithdrawal(session, Number(body.amountUsd), String(body.address || "").trim());
    } else if (action === "CREATE_WITHDRAWAL") {
      result = await createWithdrawal(session, Number(body.amountUsd), String(body.address || "").trim());
    } else if (action === "CONFIRM_WITHDRAWAL") {
      const confirmed = await confirmWithdrawal(session, Number(body.withdrawalId), String(body.confirmation || ""));
      if (!confirmed) throw new Error("Withdrawal confirmation unavailable");
      result = confirmed.state;
      warning = confirmed.error;
    } else if (action === "CONFIGURE_AUTO_SIGN") {
      result = await configureCustody(session, body.updates || {});
    } else if (action === "AUTO_SIGN") {
      const signed = await executeCustodyTrade(session, Number(body.orderId));
      result = signed.state;
      txHash = signed.txHash;
    } else {
      return NextResponse.json({ error: "Unknown vault action" }, { status: 400 });
    }

    return NextResponse.json({ custody: result ?? await getCustodyState(session), warning, txHash });
  } catch (error) {
    console.error("POST /api/custody:", error instanceof Error ? error.message : "Vault action failed");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Vault action failed" }, { status: 400 });
  }
}
