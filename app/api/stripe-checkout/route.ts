import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// ─── Stripe client ────────────────────────────────────────────────────────────

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY non configurata.");
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRICE_CENTS = 490; // 4,90 €
const CURRENCY    = "eur";

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse body
  let body: Partial<{ token: string }>;
  try {
    body = (await request.json()) as Partial<{ token: string }>;
  } catch {
    return NextResponse.json(
      { error: "Corpo della richiesta non valido." },
      { status: 400 }
    );
  }

  const token = body.token?.trim();
  if (!token || !/^[\w-]{8,64}$/.test(token)) {
    return NextResponse.json(
      { error: "Token mancante o non valido." },
      { status: 400 }
    );
  }

  // 2. Build absolute URLs for Stripe redirects
  const origin =
    request.headers.get("origin") ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const successUrl = `${origin}/success?token=${token}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${origin}/?token=${token}&cancelled=1`;

  // 3. Create Stripe Checkout session
  let session: Stripe.Checkout.Session;
  try {
    const stripe = getStripe();
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: PRICE_CENTS,
            product_data: {
              name: "KPIGo — Report completo",
              description:
                "Grafici SVG, KPI dettagliati e accesso permanente al report.",
            },
          },
        },
      ],
      metadata: { token },           // used by webhook to unlock
      success_url: successUrl,
      cancel_url:  cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min TTL
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore Stripe.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ url: session.url }, { status: 200 });
}
