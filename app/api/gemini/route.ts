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
      
      Actions possibles : "APPELER", "MESSAGE", "LIRE_MESSAGE", "AJOUTER_CONTACT", ou "INCONNU".
      
      Règles d'extraction :
      1. Si l'utilisateur veut téléphoner -> action "APPELER" + extrait le nom du contact.
      2. Si l'utilisateur veut envoyer un texte -> action "MESSAGE" + extrait le contact + extrait le contenu exact du message.
      3. Si l'utilisateur demande à écouter, lire ou vérifier ses messages reçus (ex: "Lis mes messages", "Est-ce que j'ai un message ?") -> action "LIRE_MESSAGE" (contact et contenu seront null).
      4. Si l'utilisateur demande d'ajouter, d'enregistrer ou de mémoriser un contact et donne un numéro (ex: "Ajoute le numéro de Maman, c'est le 06 12 34 56 78") -> action "AJOUTER_CONTACT" + extrait le nom dans "contact" + extrait le numéro de téléphone dans "numero". Formate toujours le numéro en une seule suite de chiffres sans espaces.
      
      Format JSON exact attendu :
      {
        "action": "APPELER" | "MESSAGE" | "LIRE_MESSAGE" | "AJOUTER_CONTACT" | "INCONNU",
        "contact": "Nom du contact ou null",
        "contenu": "Le message dicté ou null",
        "numero": "Le numéro de téléphone (sans espaces) ou null"
      }
    `;

    // On envoie la requête à Gemini 2.5 Flash
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
      console.log("Gemini a compris :", result); // Petit log pour t'aider à débugger
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
