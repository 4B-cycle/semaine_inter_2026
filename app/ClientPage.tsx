"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, Loader2, Check, X, Settings, Plus, Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";

import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { Contacts } from "@capacitor-community/contacts";
import { AppLauncher } from "@capacitor/app-launcher";

interface AiData {
  action?: string;
  contact?: string;
  numero?: string;
  contenu?: string;
  error?: string;
}

export default function ClientPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "listening" | "thinking" | "confirming" | "executing"
  >("idle");
  const [aiResponse, setAiResponse] = useState<AiData | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasSynced = useRef(false); // Le bouclier anti-boucle infinie

  const API_BASE_URL = "https://semaine-inter-2026.vercel.app";

  useEffect(() => {
    setIsMounted(true);
    const savedContacts = localStorage.getItem("hub_contacts");
    if (savedContacts) {
      try {
        setContacts(JSON.parse(savedContacts));
      } catch {}
    }
  }, []);

  // Synchronisation des contacts : Sécurisée pour ne tourner qu'UNE SEULE FOIS
  useEffect(() => {
    if (!isMounted || hasSynced.current) return;

    const syncContacts = async () => {
      hasSynced.current = true;
      if (!Capacitor.isNativePlatform()) return;
      try {
        const permission = await Contacts.requestPermissions();
        if (permission.contacts === "granted") {
          const result = await Contacts.getContacts({
            projection: { name: true, phones: true },
          });
          const newBatch: Record<string, string> = {};
          result.contacts.forEach((c) => {
            if (c.name?.display && c.phones?.[0]?.number) {
              const nom = c.name.display.toLowerCase().trim();
              const num = c.phones[0].number.replace(/[\s\-\.]/g, "");
              newBatch[nom] = num;
            }
          });
          setContacts((prev) => {
            const finalContacts = { ...prev, ...newBatch };
            localStorage.setItem("hub_contacts", JSON.stringify(finalContacts));
            return finalContacts;
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    syncContacts();
  }, [isMounted]);

  const speak = async (text: string, callback?: () => void) => {
    const textePropre = text
      .replace(/commente/gi, "comment")
      .replace(/comment /gi, "comman ");
    try {
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.speak({
          text: textePropre,
          lang: "fr-FR",
          rate: 1.0,
        });
        if (callback) callback();
      } else {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textePropre);
          utterance.lang = "fr-FR";
          utterance.onend = () => {
            if (callback) callback();
          };
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch {
      if (callback) callback();
    }
  };

  const listenNative = async (isConfirming: boolean) => {
    try {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        alert("Autorisation micro refusée.");
        setStatus("idle");
        return;
      }

      setStatus("listening");
      const result = await SpeechRecognition.start({
        language: "fr-FR",
        maxResults: 1,
        prompt: "Je vous écoute...",
        partialResults: false,
        popup: true,
      });

      if (result && result.matches && result.matches.length > 0) {
        const text = result.matches[0].toLowerCase().trim();
        if (isConfirming) handleConfirmation(text);
        else analyzeText(text);
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
  };

  const startWebMic = (isConfirming: boolean) => {
    if (typeof window === "undefined") return;
    const W = window as any;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;

    if (!SR) {
      alert("Microphone non supporté.");
      setStatus("idle");
      return;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    const reco = new SR();
    reco.lang = "fr-FR";
    reco.continuous = true;
    reco.interimResults = true;

    reco.onresult = (event: any) => {
      let currentText = "";
      for (let i = 0; i < event.results.length; i++)
        currentText += event.results[i][0].transcript + " ";
      currentText = currentText.toLowerCase().trim();

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        reco.stop();
        if (isConfirming) handleConfirmation(currentText);
        else analyzeText(currentText);
      }, 1500);
    };

    reco.onend = () => setStatus((s) => (s === "listening" ? "idle" : s));
    recognitionRef.current = reco;
    reco.start();
  };

  const analyzeText = async (text: string) => {
    if (!text || text.trim() === "") {
      speak("Je n'ai entendu aucun mot.");
      setStatus("idle");
      return;
    }

    setStatus("thinking");

    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error(`Erreur serveur ${response.status}`);

      const data: AiData = await response.json();
      if (data.error || !data.action) {
        speak("Mon cerveau IA ne répond pas.");
        setStatus("idle");
        return;
      }

      setAiResponse(data);

      if (
        data.action === "APPELER" ||
        data.action === "MESSAGE" ||
        data.action === "WHATSAPP"
      ) {
        const nomRecherche = (data.contact || "").toLowerCase().trim();
        if (!contacts[nomRecherche]) {
          speak(`Je n'ai pas le numéro de ${data.contact}.`);
          setStatus("idle");
          return;
        }
        setStatus("confirming");
        const act = data.action === "APPELER" ? "appeler" : "écrire à";
        speak(`Veux-tu ${act} ${data.contact} ?`, () => {
          if (Capacitor.isNativePlatform()) listenNative(true);
          else startWebMic(true);
        });
      } else {
        speak("Action inconnue.");
        setStatus("idle");
      }
    } catch (err: any) {
      alert("Problème Réseau : " + err.message);
      speak("Problème de connexion.");
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
    if (!aiResponse || !aiResponse.contact) return;
    const nom = aiResponse.contact.toLowerCase().trim();
    const numero = contacts[nom];

    setStatus("executing");
    speak(
      aiResponse.action === "APPELER" ? "J'appelle." : "J'envoie le message.",
    );

    setTimeout(async () => {
      let url = "";
      if (aiResponse.action === "APPELER") url = `tel:${numero}`;
      else url = `sms:${numero}`;

      if (Capacitor.isNativePlatform()) {
        try {
          await AppLauncher.openUrl({ url });
        } catch {}
      } else {
        window.location.href = url;
      }

      setStatus("idle");
      setAiResponse(null);
    }, 1000);
  };

  const toggleListen = () => {
    if (status === "idle") {
      setStatus("listening");
      speak("Comment puis-je vous aider ?", () => {
        if (Capacitor.isNativePlatform()) listenNative(false);
        else startWebMic(false);
      });
    } else {
      setStatus("idle");
    }
  };

  if (!isMounted) return null;

  if (showSettings) {
    return (
      <main className="flex min-h-[100dvh] flex-col bg-slate-50 p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Paramètres</h1>
          <button
            onClick={() => setShowSettings(false)}
            className="p-2 bg-slate-200 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm mb-8">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Ajouter contact
          </h2>
          <input
            type="text"
            placeholder="Nom (ex: Maman)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full p-3 mb-3 border rounded-lg bg-slate-50 outline-none"
          />
          <input
            type="tel"
            placeholder="Numéro (ex: 0475123456)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="w-full p-3 mb-3 border rounded-lg bg-slate-50 outline-none"
          />
          <button
            onClick={() => {
              if (newName && newPhone) {
                setContacts((p) => ({
                  ...p,
                  [newName.toLowerCase().trim()]: newPhone.replace(
                    /[\s\-\.]/g,
                    "",
                  ),
                }));
                setNewName("");
                setNewPhone("");
              }
            }}
            className="w-full p-3 bg-blue-600 text-white font-bold rounded-lg"
          >
            Ajouter
          </button>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm flex-1">
          <h2 className="font-bold mb-4">
            Contacts ({Object.keys(contacts).length})
          </h2>
          <div className="space-y-2 overflow-y-auto max-h-[40vh]">
            {Object.entries(contacts).map(([nom, num]) => (
              <div
                key={nom}
                className="flex justify-between items-center p-3 bg-slate-50 rounded-lg"
              >
                <div>
                  <p className="font-bold capitalize">{nom}</p>
                  <p className="text-sm text-slate-500">{num}</p>
                </div>
                <button
                  onClick={() =>
                    setContacts((p) => {
                      const n = { ...p };
                      delete n[nom];
                      return n;
                    })
                  }
                  className="p-2 text-red-400"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 relative">
      <button
        onClick={() => setShowSettings(true)}
        className="absolute top-6 right-6 p-3 text-slate-300"
      >
        <Settings className="w-8 h-8" />
      </button>
      <div className="mb-12 h-48 flex flex-col items-center justify-center text-center">
        {status === "listening" && (
          <div className="w-8 h-8 bg-red-500 rounded-full animate-pulse" />
        )}
        {status === "thinking" && (
          <Loader2 className="w-24 h-24 text-blue-600 animate-spin" />
        )}
        {status === "confirming" && (
          <div className="flex gap-10 scale-110">
            <button
              onClick={() => handleConfirmation("oui")}
              className="flex items-center justify-center p-6 bg-green-100 border-4 border-green-500 rounded-full active:scale-90 transition-transform"
            >
              <Check className="w-16 h-16 text-green-600" />
            </button>
            <button
              onClick={() => handleConfirmation("non")}
              className="flex items-center justify-center p-6 bg-red-100 border-4 border-red-500 rounded-full active:scale-90 transition-transform"
            >
              <X className="w-16 h-16 text-red-600" />
            </button>
          </div>
        )}
        {status === "executing" && (
          <div className="w-12 h-12 bg-green-500 rounded-full animate-ping" />
        )}
      </div>
      <button
        onClick={toggleListen}
        disabled={
          status === "confirming" ||
          status === "thinking" ||
          status === "executing"
        }
        className={`w-64 h-64 rounded-full shadow-2xl flex items-center justify-center transition-all ${status === "listening" || status === "confirming" ? "bg-red-500 scale-110" : "bg-blue-600"} ${status === "thinking" || status === "executing" ? "opacity-20" : ""}`}
      >
        <Mic className="w-32 h-32 text-white" />
      </button>
    </main>
  );
}
