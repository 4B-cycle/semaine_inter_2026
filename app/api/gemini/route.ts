import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

// On initialise l'IA avec la clé cachée dans .env.local
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
  try {
    // On récupère le texte envoyé par ton bouton micro
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json({ error: "Texte manquant" }, { status: 400 });
    }

    // Le Prompt Système : Les instructions strictes pour l'IA
    const systemInstruction = `
      Tu es le cerveau d'une application d'accessibilité vocale pour des personnes analphabètes.
      Ton seul rôle est d'analyser le texte transcrit et d'extraire l'intention sous un format JSON strict.
      
      Actions possibles : "APPELER", "MESSAGE", ou "INCONNU".
      
      Règles d'extraction :
      1. Trouve l'action voulue.
      2. Trouve le nom du contact (ex: Maman, Jean, le docteur).
      3. S'il s'agit d'un message, extrait le contenu précis à envoyer.
      
      Format JSON exact attendu :
      {
        "action": "APPELER" ou "MESSAGE" ou "INCONNU",
        "contact": "Nom du contact ou null",
        "contenu": "Le message dicté ou null"
      }
    `;

    // On envoie la requête à Gemini 2.5 Flash (ultra rapide et parfait pour ça)
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: text,
      config: {
        systemInstruction: systemInstruction,
        // On force Gemini à répondre uniquement en JSON
        responseMimeType: "application/json",
      },
    });

    // On décode la réponse de l'IA et on la renvoie à ton interface
    if (response.text) {
      const result = JSON.parse(response.text);
      return NextResponse.json(result);
    } else {
      throw new Error("Réponse vide de Gemini");
    }
  } catch (error) {
    console.error("Erreur API Gemini:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse IA" },
      { status: 500 },
    );
  }
}
