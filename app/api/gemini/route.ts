import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ← AJOUTER pour le preflight Android
export async function OPTIONS() {
  return new Response(null, { status: 200, headers: CORS });
}

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: "Texte manquant" },
        { status: 400, headers: CORS },
      );
    }

    const systemInstruction = `
content: Tu es un assistant vocal. Transforme la phrase en JSON strict.
Actions: APPELER, MESSAGE, WHATSAPP, LIRE_MESSAGE, IMPORTER_CONTACT, SUPPRIMER_CONTACT, INCONNU.

Règles importantes:
- "appel", "appelle", "téléphone à" → APPELER
- "message", "SMS", "écris à", "envoie à", "dis à" → MESSAGE  
- "whatsapp", "watsap", "watshap", "wap" → WHATSAPP
- "lis", "lire", "mes messages" → LIRE_MESSAGE
- Ignore les fautes d\'orthographe et les approximations phonétiques
- Le contenu après "pour dire que", "pour dire", "que", ":" = contenu du message

Exemples:
"appel papa" → {"action":"APPELER","contact":"papa","contenu":null}
"appelle maman" → {"action":"APPELER","contact":"maman","contenu":null}
"envoie un message à maman j\'arrive" → {"action":"MESSAGE","contact":"maman","contenu":"j\'arrive"}
"dis à thomas que je suis là" → {"action":"MESSAGE","contact":"thomas","contenu":"je suis là"}
"envoie un whatsapp à julie coucou" → {"action":"WHATSAPP","contact":"julie","contenu":"coucou"}
"watsap à pierre bonjour" → {"action":"WHATSAPP","contact":"pierre","contenu":"bonjour"}
"lis mes messages" → {"action":"LIRE_MESSAGE","contact":null,"contenu":null}
"importe le contact de julie" → {"action":"IMPORTER_CONTACT","contact":"julie","contenu":null}
"supprime le numéro de maman" → {"action":"SUPPRIMER_CONTACT","contact":"maman","contenu":null}
"quel temps fait-il" → {"action":"INCONNU","contact":null,"contenu":null}

Renvoie UNIQUEMENT le JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: text,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    if (response.text) {
      const texteNettoye = response.text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const result = JSON.parse(texteNettoye);
      return NextResponse.json(result, { headers: CORS }); // ← CORS ici
    } else {
      throw new Error("Réponse vide de Gemini");
    }
  } catch (error) {
    console.error("Erreur API:", error);
    return NextResponse.json(
      { error: "Erreur IA" },
      { status: 500, headers: CORS },
    );
  }
}
