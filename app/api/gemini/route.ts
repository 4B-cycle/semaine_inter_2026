import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json({ error: "Texte manquant" }, { status: 400 });
    }

    // Le Prompt Système : Les instructions strictes pour l'IA
    const systemInstruction = `
      Tu es le cerveau d'une application d'accessibilité vocale pour des personnes analphabètes.
      Ton seul rôle est d'analyser le texte transcrit et d'extraire l'intention sous un format JSON strict.
      
      Actions possibles : "APPELER", "MESSAGE", "WHATSAPP", "LIRE_MESSAGE", "IMPORTER_CONTACT", "SUPPRIMER_CONTACT", ou "INCONNU".
      
      Règles d'extraction :
      1. Si l'utilisateur veut téléphoner -> action "APPELER" + extrait le nom du contact.
      2. Si l'utilisateur veut envoyer un texte classique -> action "MESSAGE" + extrait le contact + extrait le contenu exact.
      3. Si l'utilisateur précise qu'il veut utiliser WhatsApp (ex: "Envoie un WhatsApp à Julie pour dire bonjour") -> action "WHATSAPP" + extrait le contact + extrait le contenu.
      4. Si l'utilisateur demande à écouter ou vérifier ses messages reçus -> action "LIRE_MESSAGE" (contact et contenu seront null).
      5. Si l'utilisateur demande d'importer, d'aller chercher ou de trouver un contact dans son téléphone (ex: "Importe papa", "Va chercher le numéro de maman") -> action "IMPORTER_CONTACT" + extrait le nom de la personne dans "contact".
      6. Si l'utilisateur veut effacer, oublier ou supprimer un contact (ex: "Supprime le numéro de Papa", "Oublie Julie") -> action "SUPPRIMER_CONTACT" + extrait le nom dans "contact".
      
      Format JSON exact attendu :
      {
        "action": "APPELER" | "MESSAGE" | "WHATSAPP" | "LIRE_MESSAGE" | "IMPORTER_CONTACT" | "SUPPRIMER_CONTACT" | "INCONNU",
        "contact": "Nom du contact ou null",
        "contenu": "Le message dicté ou null",
        "numero": "null"
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: text,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      },
    });

    if (response.text) {
      const result = JSON.parse(response.text);
      console.log("Gemini a compris :", result);
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
