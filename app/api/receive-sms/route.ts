import { NextResponse } from "next/server";

// Hack pour la démo : On garde le dernier SMS en mémoire vive sur le serveur
// (Dans une vraie appli pro, on sauvegarderait ça dans une base de données)
let latestSms: { sender: string; message: string } | null = null;

// MacroDroid utilise cette route (POST) pour ENVOYER le SMS au site
export async function POST(request: Request) {
  try {
    const body = await request.json();

    latestSms = {
      sender: body.sender || "Inconnu",
      message: body.message || "Message vide",
    };

    console.log("Nouveau SMS intercepté :", latestSms);
    return NextResponse.json({ success: true, latestSms });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Erreur de lecture" },
      { status: 500 },
    );
  }
}

// Ton application Web utilise cette route (GET) pour LIRE le SMS
export async function GET() {
  if (!latestSms) {
    return NextResponse.json(
      { error: "Aucun nouveau message" },
      { status: 404 },
    );
  }
  return NextResponse.json(latestSms);
}
