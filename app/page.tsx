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
  UserPlus,
} from "lucide-react";

export default function Home() {
  // AJOUT : Le nouvel état "needs_contact"
  const [status, setStatus] = useState<
    | "idle"
    | "listening"
    | "thinking"
    | "confirming"
    | "executing"
    | "needs_contact"
  >("idle");
  const [aiResponse, setAiResponse] = useState<any>(null);
  const recognitionRef = useRef<any>(null);

  // Carnet d'adresses vide, prêt à apprendre
  const [contacts, setContacts] = useState<Record<string, string>>({});

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

          if (status === "confirming") {
            handleConfirmation(text);
          } else {
            analyzeText(text);
          }
        };

        reco.onend = () => {
          if (status === "listening") setStatus("idle");
        };

        recognitionRef.current = reco;
      }
    }
  }, [status, aiResponse]);

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

  const executeAction = async () => {
    const contactNom = aiResponse.contact.toLowerCase();
    const numero = contacts[contactNom];

    if (!numero) {
      // MODIFICATION ICI : On bloque l'automatisation et on demande un vrai clic
      setStatus("needs_contact");
      speak(
        `Je ne connais pas le numéro de ${contactNom}. Appuie sur l'écran pour choisir le contact.`,
      );
      return; // On arrête la fonction ici, on attend le clic de l'utilisateur
    }

    // Si on a déjà le numéro, on appelle direct
    lancerAppel(numero);
  };

  // NOUVELLE FONCTION : Liée à un vrai clic (Autorisée par Android !)
  const openContactPicker = async () => {
    try {
      const navAny = navigator as any;
      if (navAny.contacts && navAny.contacts.select) {
        const selected = await navAny.contacts.select(["name", "tel"], {
          multiple: false,
        });

        if (selected.length > 0) {
          const nouveauNumero = selected[0].tel[0];
          const contactNom = aiResponse.contact.toLowerCase();

          // On sauvegarde dans la mémoire
          setContacts((prev) => ({ ...prev, [contactNom]: nouveauNumero }));

          // On lance l'appel
          lancerAppel(nouveauNumero);
        } else {
          setStatus("idle"); // L'utilisateur a fermé sans choisir
        }
      } else {
        alert(
          "Ton téléphone ne supporte pas l'ouverture automatique du répertoire.",
        );
        setStatus("idle");
      }
    } catch (e) {
      speak("Je n'ai pas pu ouvrir tes contacts.");
      setStatus("idle");
    }
  };

  const lancerAppel = (numero: string) => {
    setStatus("executing");
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

        {/* NOUVEAU BOUTON : Affiché uniquement quand le numéro manque */}
        {status === "needs_contact" && (
          <button
            onClick={openContactPicker}
            className="flex flex-col items-center justify-center p-6 bg-orange-500 rounded-3xl shadow-xl animate-bounce"
          >
            <UserPlus className="w-16 h-16 text-white mb-2" />
            <p className="text-xl font-bold text-white uppercase">
              Associer un contact
            </p>
          </button>
        )}
      </div>

      {/* On cache le micro si on attend un clic sur les contacts */}
      {status !== "needs_contact" && (
        <button
          onClick={toggleListen}
          className={`w-64 h-64 rounded-full shadow-2xl transition-all duration-500 flex items-center justify-center
            ${status === "listening" ? "bg-red-500 scale-110" : "bg-blue-600 active:scale-95"}
          `}
        >
          <Mic className="w-32 h-32 text-white" />
        </button>
      )}
    </main>
  );
}
