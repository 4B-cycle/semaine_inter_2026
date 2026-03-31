"use client";

import { useState, useEffect, useRef } from "react";
import {
  Mic,
  Loader2,
  Phone,
  MessageSquare,
  AlertCircle,
  Check,
  X,
} from "lucide-react";

export default function Home() {
  const [status, setStatus] = useState<
    "idle" | "listening" | "thinking" | "confirming" | "executing"
  >("idle");
  const [aiResponse, setAiResponse] = useState<any>(null);
  const recognitionRef = useRef<any>(null);

  // Simulation d'un carnet d'adresses (On pourra y ajouter navigator.contacts plus tard)
  const [contacts, setContacts] = useState<Record<string, string>>({});

  // --- SYNTHÈSE VOCALE AVEC CALLBACK ---
  const speak = (text: string, callback?: () => void) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "fr-FR";
      utterance.onend = () => {
        if (callback) callback();
      };
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const windowAny = window as any;
      const SpeechRecognition =
        windowAny.SpeechRecognition || windowAny.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const reco = new SpeechRecognition();
        reco.lang = "fr-FR";
        reco.continuous = false;

        reco.onresult = async (event: any) => {
          const text = event.results[0][0].transcript.toLowerCase();

          // LOGIQUE DE DÉCISION
          if (status === "confirming") {
            handleConfirmation(text);
          } else {
            analyzeText(text);
          }
        };

        reco.onend = () => {
          // On ne remet à idle que si on n'est pas en train d'attendre une confirmation
          if (status === "listening") setStatus("idle");
        };

        recognitionRef.current = reco;
      }
    }
  }, [status, aiResponse]);

  // Étape 1 : Analyse de l'intention via Gemini
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

      if (data.action !== "INCONNU" && data.contact) {
        setStatus("confirming");
        const phrase =
          data.action === "APPELER"
            ? `Veux-tu appeler ${data.contact} ?`
            : `Veux-tu envoyer un message à ${data.contact} ?`;

        // On parle, puis on relance le micro automatiquement
        speak(phrase, () => {
          recognitionRef.current.start();
          setStatus("listening");
        });
      } else {
        speak("Je n'ai pas compris. Peux-tu répéter ?");
        setStatus("idle");
      }
    } catch (err) {
      setStatus("idle");
    }
  };

  // Étape 2 : Gestion du Oui / Non
  const handleConfirmation = (text: string) => {
    if (
      text.includes("oui") ||
      text.includes("d'accord") ||
      text.includes("vas-y")
    ) {
      executeAction();
    } else {
      speak("D'accord, j'annule.");
      setStatus("idle");
      setAiResponse(null);
    }
  };

  // Étape 3 : Exécution finale
  const executeAction = async () => {
    setStatus("executing");
    const contactNom = aiResponse.contact.toLowerCase();
    let numero = contacts[contactNom];

    // Si numéro inconnu, on tentera d'ouvrir le répertoire (navigator.contacts)
    if (!numero) {
      speak(
        `Je n'ai pas le numéro de ${contactNom}. Choisis-le dans tes contacts.`,
      );
      try {
        const navAny = navigator as any;
        if (navAny.contacts && navAny.contacts.select) {
          const selected = await navAny.contacts.select(["name", "tel"], {
            multiple: false,
          });
          if (selected.length > 0) {
            numero = selected[0].tel[0];
            // On le sauve pour la prochaine fois !
            setContacts((prev) => ({ ...prev, [contactNom]: numero }));
          }
        }
      } catch (e) {
        speak("Je n'ai pas pu ouvrir tes contacts.");
      }
    }

    if (numero) {
      speak("C'est parti.");
      setTimeout(() => {
        if (aiResponse.action === "APPELER") {
          window.location.href = `tel:${numero}`;
        } else {
          window.location.href = `sms:${numero}?body=${encodeURIComponent(aiResponse.contenu || "")}`;
        }
        setStatus("idle");
        setAiResponse(null);
      }, 1000);
    } else {
      setStatus("idle");
    }
  };

  const toggleListen = () => {
    if (status === "idle") {
      setStatus("listening");
      recognitionRef.current.start();
    } else {
      recognitionRef.current.stop();
      setStatus("idle");
    }
  };

  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6">
      <div className="mb-12 h-40 flex flex-col items-center justify-center text-center">
        {status === "idle" && <p className="text-2xl text-gray-400">Prêt</p>}
        {status === "listening" && (
          <p className="text-3xl font-bold text-red-500 animate-pulse">
            Je t'écoute...
          </p>
        )}
        {status === "thinking" && (
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
        )}

        {status === "confirming" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-8">
              <Check className="w-16 h-16 text-green-500" />
              <X className="w-16 h-16 text-red-500" />
            </div>
            <p className="text-2xl font-bold">Dis OUI ou NON</p>
          </div>
        )}

        {status === "executing" && (
          <p className="text-3xl font-bold text-green-600">J'appelle...</p>
        )}
      </div>

      <button
        onClick={toggleListen}
        className={`w-64 h-64 rounded-full shadow-2xl transition-all duration-500 flex items-center justify-center
          ${status === "listening" ? "bg-red-500 scale-110" : "bg-blue-600 active:scale-95"}
        `}
      >
        <Mic className="w-32 h-32 text-white" />
      </button>
    </main>
  );
}
