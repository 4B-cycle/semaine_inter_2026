"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Loader2, Check, X, Settings, Plus, Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";

import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { Contacts } from "@capacitor-community/contacts";
import { App } from "@capacitor/app";
import { AppLauncher } from "@capacitor/app-launcher";

interface AiData {
  action?: string;
  contact?: string;
  numero?: string;
  contenu?: string;
  error?: string;
}

let globalUtterance: SpeechSynthesisUtterance | null = null;

export default function ClientPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "listening" | "thinking" | "confirming" | "executing"
  >("idle");

  const [aiResponse, setAiResponse] = useState<AiData | null>(null);

  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(
    null,
  );
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const aiResponseRef = useRef<AiData | null>(null);
  const statusRef = useRef<
    "idle" | "listening" | "thinking" | "confirming" | "executing"
  >("idle");
  const analyzeTextRef = useRef<((t: string) => void) | null>(null);
  const handleConfirmationRef = useRef<((t: string) => void) | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    aiResponseRef.current = aiResponse;
    statusRef.current = status;
    analyzeTextRef.current = analyzeText;
    handleConfirmationRef.current = handleConfirmation;
  });

  // Mets ça juste après les autres useRef, vers le début du composant
  const API_BASE_URL = useRef(
    Capacitor.isNativePlatform() ? "https://semaine-inter-2026.vercel.app" : "",
  ).current;

  const speak = async (text: string, callback?: () => void) => {
    const textePropre = text
      .replace(/commente/gi, "comment")
      .replace(/comment /gi, "comman ");

    if (isMounted && Capacitor.isNativePlatform()) {
      try {
        await TextToSpeech.speak({
          text: textePropre,
          lang: "fr-FR",
          rate: 1.0,
        });
        if (callback) callback();
      } catch {
        if (callback) callback();
      }
    } else {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        globalUtterance = new SpeechSynthesisUtterance(textePropre);
        globalUtterance.lang = "fr-FR";
        globalUtterance.onend = () => {
          if (callback) callback();
        };
        window.speechSynthesis.speak(globalUtterance);
      }
    }
  };

  const startWebMic = (isConfirming: boolean) => {
    if (typeof window === "undefined") return;
    const W = window as unknown as Record<string, any>;
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;

    if (!SR) {
      alert("Le microphone n'est pas supporté sur ce navigateur.");
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

    reco.onresult = (event: { results: { transcript: string }[][] }) => {
      let currentText = "";
      for (let i = 0; i < event.results.length; i++) {
        currentText += event.results[i][0].transcript + " ";
      }
      currentText = currentText.toLowerCase().trim();

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      silenceTimerRef.current = setTimeout(() => {
        reco.stop();
        if (isConfirming) {
          if (handleConfirmationRef.current)
            handleConfirmationRef.current(currentText);
        } else {
          if (analyzeTextRef.current) analyzeTextRef.current(currentText);
        }
      }, 1500);
    };

    reco.onend = () => {
      if (statusRef.current === "listening") setStatus("idle");
    };

    recognitionRef.current = reco;
    reco.start();
  };

  // ✅ CORRECTION ABSOLUE : La récupération directe du texte depuis la popup
  const listenNative = async (isConfirming: boolean) => {
    try {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== "granted") {
        alert("Autorisation micro refusée.");
        setStatus("idle");
        return;
      }

      setStatus("listening");

      // La popup bloque le code ici, et renvoie "result" quand elle se ferme
      const result = await SpeechRecognition.start({
        language: "fr-FR",
        maxResults: 1,
        prompt: "Je vous écoute...",
        partialResults: false,
        popup: true,
      });

      // On vérifie qu'on a bien reçu une phrase
      if (result && result.matches && result.matches.length > 0) {
        const text = result.matches[0].toLowerCase().trim();
        if (isConfirming) {
          if (handleConfirmationRef.current)
            handleConfirmationRef.current(text);
        } else {
          if (analyzeTextRef.current) analyzeTextRef.current(text);
        }
      } else {
        setStatus("idle");
      }
    } catch {
      // Se déclenche si l'utilisateur appuie à côté de la popup pour l'annuler
      setStatus("idle");
    }
  };

  const syncContactsSilently = useCallback(async () => {
    if (!isMounted) return;
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Contacts.requestPermissions();
        if (permission.contacts === "granted") {
          const result = await Contacts.getContacts({
            projection: { name: true, phones: true },
          });

          setContacts((prev) => {
            const newBatch = { ...prev };
            let hasChanges = false;

            result.contacts.forEach((c) => {
              const displayName = c.name?.display;
              const firstPhone = c.phones?.[0]?.number;
              if (displayName && firstPhone) {
                try {
                  const nomNettoye = displayName.toLowerCase().trim();
                  const numNettoye = firstPhone.replace(/[\s\-\.]/g, "");
                  if (newBatch[nomNettoye] !== numNettoye) {
                    newBatch[nomNettoye] = numNettoye;
                    hasChanges = true;
                  }
                } catch {}
              }
            });

            if (hasChanges) {
              localStorage.setItem("hub_contacts", JSON.stringify(newBatch));
              return newBatch;
            }
            return prev;
          });
        }
      }
    } catch {}
  }, [isMounted]);

  const importAllContacts = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Contacts.requestPermissions();
        if (permission.contacts === "granted") {
          const result = await Contacts.getContacts({
            projection: { name: true, phones: true },
          });
          const newBatch: Record<string, string> = { ...contacts };
          let count = 0;
          result.contacts.forEach((c) => {
            const displayName = c.name?.display;
            const firstPhone = c.phones?.[0]?.number;
            if (displayName && firstPhone) {
              try {
                const nomNettoye = displayName.toLowerCase().trim();
                const numNettoye = firstPhone.replace(/[\s\-\.]/g, "");
                newBatch[nomNettoye] = numNettoye;
                count++;
              } catch {}
            }
          });
          setContacts(newBatch);
          localStorage.setItem("hub_contacts", JSON.stringify(newBatch));
          alert(`${count} contacts importés du téléphone !`);
        } else {
          alert("L'autorisation de lire les contacts a été refusée.");
        }
      } else {
        const navAny = navigator as unknown as Record<string, any>;
        if (navAny.contacts && navAny.contacts.select) {
          const selected = await navAny.contacts.select(["name", "tel"], {
            multiple: true,
          });
          if (selected.length > 0) {
            const newBatch: Record<string, string> = { ...contacts };
            selected.forEach((c: { name?: string[]; tel?: string[] }) => {
              if (c.name && c.tel && c.tel.length > 0) {
                const nomNettoye = c.name[0].toLowerCase().trim();
                newBatch[nomNettoye] = c.tel[0].replace(/[\s\-\.]/g, "");
              }
            });
            setContacts(newBatch);
            localStorage.setItem("hub_contacts", JSON.stringify(newBatch));
            alert(`${selected.length} contacts importés via le navigateur !`);
          }
        }
      }
    } catch (err) {
      alert("Erreur technique : " + String(err));
    }
  };

  useEffect(() => {
    if (!isMounted) return;

    const savedContacts = localStorage.getItem("hub_contacts");
    if (savedContacts) setContacts(JSON.parse(savedContacts));

    syncContactsSilently();

    let handler: { remove: () => void } | null = null;
    const initApp = async () => {
      if (Capacitor.isNativePlatform()) {
        handler = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) syncContactsSilently();
        });
      }
    };
    initApp();

    return () => {
      if (handler) handler.remove();
    };
  }, [isMounted, syncContactsSilently]);

  const analyzeText = async (text: string) => {
    if (!text || text.trim() === "") {
      speak("Je n'ai entendu aucun mot.");
      setStatus("idle");
      return;
    }

    setStatus("thinking");

    try {
      // ON FORCE L'URL SANS LE USE REF POUR LE TEST
      const url = `${API_BASE_URL}/api/gemini`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        // SI VERCEL RÉPOND MAIS AVEC UNE ERREUR
        const errorText = await response.text();
        throw new Error(`Serveur: ${response.status} - ${errorText}`);
      }

      const data: AiData = await response.json();
      setAiResponse(data);

      // --- LOGIQUE ACTIONS ---
      if (data.action === "LIRE_MESSAGE") {
        setStatus("executing");
        const smsReq = await fetch(`${API_BASE_URL}/api/receive-sms`);
        if (smsReq.ok) {
          const smsData = await smsReq.json();
          const savedName = Object.keys(contacts).find(
            (k) => contacts[k] === smsData.sender,
          );
          speak(
            `Message de ${savedName || smsData.sender}: ${smsData.message}`,
            () => setStatus("idle"),
          );
        } else {
          speak("Aucun message.", () => setStatus("idle"));
        }
      } else if (
        data.action === "AJOUTER_CONTACT" &&
        data.contact &&
        data.numero
      ) {
        setStatus("executing");
        const nom = data.contact.toLowerCase().trim();
        const num = data.numero.replace(/[\s\-\.]/g, "");
        setContacts((prev) => {
          const up = { ...prev, [nom]: num };
          localStorage.setItem("hub_contacts", JSON.stringify(up));
          return up;
        });
        speak(`Numéro de ${data.contact} enregistré.`, () => setStatus("idle"));
      } else if (data.action !== "INCONNU" && data.contact) {
        const nomRecherche = data.contact.toLowerCase().trim();
        if (!contacts[nomRecherche]) {
          speak(`Je n'ai pas le numéro de ${data.contact}.`, () =>
            setStatus("idle"),
          );
          return;
        }
        setStatus("confirming");
        speak(
          `Veux-tu ${data.action === "APPELER" ? "appeler" : "écrire à"} ${data.contact} ?`,
          () => {
            if (Capacitor.isNativePlatform()) listenNative(true);
            else startWebMic(true);
          },
        );
      } else {
        speak("Action inconnue.");
        setStatus("idle");
      }
    } catch (err: any) {
      // ON AFFICHE L'ERREUR RÉELLE POUR SAVOIR CE QUI BLOQUE
      alert("Erreur: " + err.message);
      speak("Erreur de connexion.");
      setStatus("idle");
    }
  };

  const handleConfirmation = (text: string) => {
    if (
      text.includes("oui") ||
      text.includes("d'accord") ||
      text.includes("vas-y") ||
      text.includes("oui je veux bien")
    ) {
      executeAction();
    } else {
      speak("D'accord, j'annule.");
      setStatus("idle");
      setAiResponse(null);
    }
  };

  const executeAction = async () => {
    const currentResponse = aiResponseRef.current;

    if (!currentResponse || !currentResponse.contact) {
      speak("Désolé, je n'ai pas bien compris le nom du contact.");
      setStatus("idle");
      return;
    }

    const contactNom = currentResponse.contact.toLowerCase().trim();
    const numero = contacts[contactNom];

    if (!numero) {
      speak(
        `Je n'ai pas le numéro de ${contactNom} dans ma mémoire. Demande à un proche de l'ajouter.`,
      );
      setStatus("idle");
      return;
    }

    setStatus("executing");
    speak(
      currentResponse.action === "APPELER"
        ? "J'appelle."
        : "J'envoie le message.",
    );

    setTimeout(async () => {
      let url = "";
      if (currentResponse.action === "APPELER") {
        url = `tel:${numero}`;
      } else if (currentResponse.action === "WHATSAPP") {
        let formatWa = numero.replace(/[\s\-\.]/g, "");
        if (formatWa.startsWith("0")) formatWa = "32" + formatWa.substring(1);
        else if (formatWa.startsWith("+")) formatWa = formatWa.substring(1);
        const message = encodeURIComponent(currentResponse.contenu || "");
        url = `https://wa.me/${formatWa}?text=${message}`;
      } else {
        const message = encodeURIComponent(currentResponse.contenu || "");
        url = `sms:${numero}?body=${message}`;
      }

      if (Capacitor.isNativePlatform()) {
        try {
          await AppLauncher.openUrl({ url });
        } catch {
          alert("Erreur ouverture application");
        }
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

      speak("Comment puis-je vous aider aujourd'hui ?", () => {
        if (Capacitor.isNativePlatform()) {
          listenNative(false);
        } else {
          startWebMic(false);
        }
      });
    } else {
      if (Capacitor.isNativePlatform()) {
        try {
          SpeechRecognition.stop();
        } catch {}
      } else {
        if (recognitionRef.current) recognitionRef.current.stop();
      }
      setStatus("idle");
    }
  };

  const handleAddContact = () => {
    if (newName && newPhone) {
      const updatedContacts = {
        ...contacts,
        [newName.toLowerCase().trim()]: newPhone.replace(/[\s\-\.]/g, ""),
      };
      setContacts(updatedContacts);
      localStorage.setItem("hub_contacts", JSON.stringify(updatedContacts));
      setNewName("");
      setNewPhone("");
    }
  };

  const handleDeleteContact = (nom: string) => {
    const updatedContacts = { ...contacts };
    delete updatedContacts[nom];
    setContacts(updatedContacts);
    localStorage.setItem("hub_contacts", JSON.stringify(updatedContacts));
  };

  if (!isMounted) return null;

  if (showSettings) {
    return (
      <main className="flex min-h-[100dvh] flex-col bg-slate-50 p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">
            Configuration Aidant
          </h1>
          <button
            onClick={() => setShowSettings(false)}
            className="p-2 bg-slate-200 rounded-full"
          >
            <X className="w-6 h-6 text-slate-600" />
          </button>
        </div>

        <div className="mb-8">
          <button
            onClick={importAllContacts}
            className="w-full p-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex justify-center items-center gap-3 shadow-lg transition-transform active:scale-95"
          >
            <Plus className="w-6 h-6" /> Importer le répertoire
          </button>
          <p className="text-xs text-slate-400 mt-2 text-center">
            S&apos;adapte automatiquement
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm mb-8 border border-slate-100">
          <h2 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Ajouter manuellement
          </h2>
          <input
            type="text"
            placeholder="Nom (ex: Maman)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full p-3 mb-3 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="tel"
            placeholder="Numéro (ex: 0475123456)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="w-full p-3 mb-3 border rounded-lg bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={handleAddContact}
            className="w-full p-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
          >
            Ajouter ce contact
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex-1">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-slate-700">
              Contacts en mémoire ({Object.entries(contacts).length})
            </h2>
            {Object.entries(contacts).length > 0 && (
              <button
                onClick={() => {
                  if (confirm("Tout effacer ?")) {
                    setContacts({});
                    localStorage.removeItem("hub_contacts");
                  }
                }}
                className="text-xs text-red-400 hover:text-red-600 underline"
              >
                Tout vider
              </button>
            )}
          </div>
          <div className="space-y-2 overflow-y-auto max-h-[40vh]">
            {Object.entries(contacts).length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8 italic">
                Aucun contact enregistré.
              </p>
            ) : (
              Object.entries(contacts).map(([nom, num]) => (
                <div
                  key={nom}
                  className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100"
                >
                  <div className="overflow-hidden">
                    <p className="font-bold capitalize text-slate-800 truncate">
                      {nom}
                    </p>
                    <p className="text-sm text-slate-500">{num}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteContact(nom)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 relative">
      <button
        onClick={() => setShowSettings(true)}
        className="absolute top-6 right-6 p-3 text-slate-300 hover:text-slate-500 transition-colors"
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
              className="flex items-center justify-center p-6 bg-green-100 border-4 border-green-500 rounded-full shadow-lg active:scale-90 transition-transform"
            >
              <Check className="w-16 h-16 text-green-600" />
            </button>

            <button
              onClick={() => handleConfirmation("non")}
              className="flex items-center justify-center p-6 bg-red-100 border-4 border-red-500 rounded-full shadow-lg active:scale-90 transition-transform"
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
        className={`w-64 h-64 rounded-full shadow-2xl transition-all duration-500 flex items-center justify-center 
          ${
            status === "listening" || status === "confirming"
              ? "bg-red-500 scale-110 shadow-red-500/50"
              : "bg-blue-600 active:scale-95"
          }
          ${
            status === "thinking" || status === "executing"
              ? "opacity-20 grayscale"
              : ""
          }
        `}
      >
        <Mic className="w-32 h-32 text-white" />
      </button>
    </main>
  );
}
