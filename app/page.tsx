"use client";

import { useState, useEffect } from "react";
import { Mic, Loader2 } from "lucide-react";

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const reco = new SpeechRecognition();
        reco.continuous = false;
        reco.interimResults = false;
        reco.lang = "fr-FR"; // On garde le français

        reco.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          setTranscript(text); // Affiche le texte à l'écran
          setIsListening(false);
        };

        reco.onerror = (event: any) => {
          console.error("Erreur vocale : ", event.error);
          setIsListening(false);
        };

        reco.onend = () => {
          setIsListening(false);
        };

        setRecognition(reco);
      } else {
        setTranscript("Navigateur non compatible (utilise Chrome PC).");
      }
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognition?.stop();
      setIsListening(false);
    } else {
      recognition?.start();
      setIsListening(true);
      setTranscript("");
    }
  };

  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center bg-gray-50 overflow-hidden gap-12">
      {/* L'écran de contrôle pour le développement */}
      <div className="h-24 px-8 text-center text-2xl text-gray-700 font-medium flex items-center justify-center">
        {transcript
          ? `"${transcript}"`
          : isListening
            ? "Je t'écoute..."
            : "Appuie pour parler"}
      </div>

      <button
        onClick={toggleListen}
        className={`flex items-center justify-center w-64 h-64 rounded-full shadow-2xl transition-all duration-300 active:scale-95 ${
          isListening ? "bg-red-500 animate-pulse" : "bg-blue-600"
        }`}
      >
        {isListening ? (
          <Loader2
            className="w-32 h-32 text-white animate-spin pointer-events-none"
            strokeWidth={1.5}
          />
        ) : (
          <Mic
            className="w-32 h-32 text-white pointer-events-none"
            strokeWidth={1.5}
          />
        )}
      </button>
    </main>
  );
}
