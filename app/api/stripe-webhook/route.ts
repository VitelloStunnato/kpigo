import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { put, list } from "@vercel/blob";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

// ─── Stripe client ────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY non configurata.");
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
}

// ─── Blob helpers (identical to other routes) ─────────────────────────────────

const LOCAL_BLOB_DIR = path.join(process.cwd(), ".local-blobs");

async function saveBlob(blobName: string, content: string): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    mkdirSync(LOCAL_BLOB_DIR, { recursive: true });
    writeFileSync(path.join(LOCAL_BLOB_DIR, blobName), content, "utf-8");
    return;
  }
  await put(blobName, content, {
    access: "public",
    contentType: "application/json",
  });
}

async function blobExists(blobName: string): Promise<boolean> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return existsSync(path.join(LOCAL_BLOB_DIR, blobName));
  }
  try {
    const { blobs } = await list({ prefix: blobName });
    return blobs.some(
      (b) => b.pathname === blobName || b.url.includes(blobName)
    );
  } catch {
    return false;
  }
}

// ─── Unlock helper ────────────────────────────────────────────────────────────

async function unlockReport(token: string): Promise<void> {
  const blobName = `paid_${token}`;
  const alreadyPaid = await blobExists(blobName);
  if (alreadyPaid) return; // idempotent
  await saveBlob(
    blobName,
    JSON.stringify({ paidAt: new Date().toISOString(), source: "stripe" })
  );
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET non configurata.");
    return NextResponse.json(
      { error: "Webhook non configurato." },
      { status: 500 }
    );
  }

  // 1. Read raw body — required for Stripe signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Firma Stripe mancante." },
      { status: 400 }
    );
  }

  // 2. Verify signature
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Firma non valida.";
    console.error("Stripe webhook signature error:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // 3. Handle events
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only unlock after confirmed payment
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const token = session.metadata?.token;
    if (!token || !/^[\w-]{8,64}$/.test(token)) {
      console.error("Token mancante o non valido nei metadata:", session.id);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    try {
      await unlockReport(token);
      console.log(`Report sbloccato: ${token} (sessione ${session.id})`);
    } catch (err) {
      console.error("Errore unlock report:", err);
      // Return 200 anyway — Stripe won't retry on 5xx after webhook succeeds
      return NextResponse.json({ received: true }, { status: 200 });
    }
  }

  // 4. Acknowledge all events (even unhandled ones)
  return NextResponse.json({ received: true }, { status: 200 });
}
