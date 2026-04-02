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
Tu es un assistant vocal d'accessibilité. Ton seul but est de transformer la phrase de l'utilisateur en un objet JSON strict.

Actions autorisées : "APPELER", "MESSAGE", "WHATSAPP", "LIRE_MESSAGE", "IMPORTER_CONTACT", "SUPPRIMER_CONTACT", "INCONNU".

EXEMPLES DE PHRASES ET LEURS RÉPONSES EXACTES :
- "appelle papa" -> {"action": "APPELER", "contact": "papa", "contenu": null}
- "envoie un message à maman pour dire que j'arrive" -> {"action": "MESSAGE", "contact": "maman", "contenu": "j'arrive"}
- "envoie un whatsapp à thomas pour dire coucou" -> {"action": "WHATSAPP", "contact": "thomas", "contenu": "coucou"}
- "lis mes messages" -> {"action": "LIRE_MESSAGE", "contact": null, "contenu": null}
- "importe le contact de julie" -> {"action": "IMPORTER_CONTACT", "contact": "julie", "contenu": null}
- "supprime le numéro de maman" -> {"action": "SUPPRIMER_CONTACT", "contact": "maman", "contenu": null}
- "quel temps fait-il ?" -> {"action": "INCONNU", "contact": null, "contenu": null}

Règle d'or : Renvoie UNIQUEMENT le JSON formaté, sans aucun texte autour.
`;

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
