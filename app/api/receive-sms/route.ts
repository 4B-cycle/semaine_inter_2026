import { NextResponse } from "next/server";

// On met un message par défaut pour que l'URL ne soit JAMAIS en 404
let latestSms = {
  sender: "Système",
  message: "En attente du premier SMS...",
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    latestSms = {
      sender: body.sender || "Inconnu",
      message: body.message || "Message vide",
    };

    // On répond avec les headers d'autorisation
    return NextResponse.json(
      { success: true },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function GET() {
  // On renvoie TOUJOURS un JSON, même s'il n'y a rien de neuf
  return NextResponse.json(latestSms, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Requis pour que Vercel accepte les requêtes de MacroDroid sans ricaner
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    },
  );
}
