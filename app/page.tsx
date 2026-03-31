"use client";

import { useState, useEffect, useRef } from "react";
// Assure-toi d'avoir bien installé lucide-react (npm install lucide-react)
import { Mic, Loader2, Phone, MessageSquare, AlertCircle } from "lucide-react";

export default function Home() {
  // Les états complets pour gérer l'interface de A à Z
  const [status, setStatus] = useState<
    "idle" | "listening" | "thinking" | "result"
  >("idle");
  const [aiResponse, setAiResponse] = useState<any>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // L'astuce "as any" pour calmer TypeScript lors du déploiement Vercel
      const windowAny = window as any;
      const SpeechRecognition =
        windowAny.SpeechRecognition || windowAny.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const reco = new SpeechRecognition();
        reco.lang = "fr-FR";

        reco.onresult = async (event: any) => {
          const text = event.results[0][0].transcript;
          analyzeText(text); // On envoie à Gemini !
        };

        reco.onend = () => {
          // Si le micro s'éteint tout seul, on remet l'état à zéro
          setStatus((prev) => (prev === "listening" ? "idle" : prev));
        };

        recognitionRef.current = reco;
      }
    }
  }, []);

  // La fonction qui appelle ton mini-serveur (/api/gemini)
  const analyzeText = async (text: string) => {
    setStatus("thinking");
    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      setAiResponse(data);
      setStatus("result");

      // On affiche le résultat 5 secondes, puis on revient au bouton normal
      setTimeout(() => {
        setStatus("idle");
        setAiResponse(null);
      }, 5000);
    } catch (err) {
      console.error("Erreur de connexion avec l'API", err);
      setStatus("idle");
    }
  };

  const toggleListen = () => {
    if (!recognitionRef.current) {
      alert("La reconnaissance vocale n'est pas supportée sur ce navigateur.");
      return;
    }

    // Si on écoute déjà, on arrête tout proprement
    if (status === "listening") {
      recognitionRef.current.stop();
      setStatus("idle");
    }
    // Sinon, on lance l'écoute avec un filet de sécurité (try/catch)
    else if (status === "idle") {
      try {
        setStatus("listening");
        recognitionRef.current.start();
      } catch (erreur) {
        console.warn("Le micro écoute déjà !");
      }
    }
  };

  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 overflow-hidden">
      {/* Zone d'affichage des retours visuels */}
      <div className="mb-12 h-32 flex flex-col items-center justify-center text-center">
        {status === "idle" && (
          <p className="text-2xl font-medium text-gray-500">
            Appuie pour parler
          </p>
        )}
        {status === "listening" && (
          <p className="text-2xl font-bold text-red-500 animate-pulse">
            Je t'écoute...
          </p>
        )}
        {status === "thinking" && (
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
        )}

        {/* L'affichage de l'analyse Gemini */}
        {status === "result" && aiResponse && (
          <div className="animate-bounce flex flex-col items-center">
            {aiResponse.action === "APPELER" && (
              <Phone className="w-20 h-20 text-green-500" />
            )}
            {aiResponse.action === "MESSAGE" && (
              <MessageSquare className="w-20 h-20 text-blue-500" />
            )}
            {aiResponse.action === "INCONNU" && (
              <AlertCircle className="w-20 h-20 text-orange-500" />
            )}
            <p className="text-2xl font-bold mt-2 text-gray-800">
              {aiResponse.contact || "Inconnu"}
            </p>
          </div>
        )}
      </div>

      {/* Le gros bouton */}
      <button
        onClick={toggleListen}
        disabled={status === "thinking"}
        className={`w-64 h-64 rounded-full shadow-2xl transition-all duration-500 flex items-center justify-center
          ${status === "listening" ? "bg-red-500 scale-110 animate-pulse" : "bg-blue-600 active:scale-90"}
          ${status === "thinking" ? "opacity-50 cursor-not-allowed" : "opacity-100"}
        `}
      >
        <Mic
          className="w-32 h-32 text-white pointer-events-none"
          strokeWidth={1.5}
        />
      </button>
    </main>
  );
}
