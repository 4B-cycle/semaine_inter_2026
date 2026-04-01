"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, Loader2, Check, X, Settings, Plus, Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
// @ts-expect-error - Ignore l'erreur TS si le module n'est pas encore bien lié par l'éditeur
import { Contacts } from "@capacitor-community/contacts";

export default function Home() {
  const [status, setStatus] = useState<
    "idle" | "listening" | "thinking" | "confirming" | "executing"
  >("idle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiResponse, setAiResponse] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const API_BASE_URL = Capacitor.isNativePlatform()
    ? "https://semaine-inter-2026.vercel.app"
    : "";

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
            if (c.name && c.phones && c.phones.length > 0) {
              const nomNettoye = c.name.display.toLowerCase();
              newBatch[nomNettoye] = c.phones[0].number;
              count++;
            }
          });

          setContacts(newBatch);
          localStorage.setItem("hub_contacts", JSON.stringify(newBatch));
          alert(
            `${count} contacts importés du téléphone Android avec succès !`,
          );
        } else {
          alert("L'autorisation de lire les contacts a été refusée.");
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const navAny = navigator as any;
        if (navAny.contacts && navAny.contacts.select) {
          const selected = await navAny.contacts.select(["name", "tel"], {
            multiple: true,
          });

          if (selected.length > 0) {
            const newBatch: Record<string, string> = { ...contacts };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            selected.forEach((c: any) => {
              if (c.name && c.tel && c.tel.length > 0) {
                const nomNettoye = c.name[0].toLowerCase();
                newBatch[nomNettoye] = c.tel[0];
              }
            });

            setContacts(newBatch);
            localStorage.setItem("hub_contacts", JSON.stringify(newBatch));
            alert(`${selected.length} contacts importés via le navigateur !`);
          }
        } else {
          alert(
            "L'importation automatique n'est pas supportée sur ce navigateur Web. Utilisez l'ajout manuel.",
          );
        }
      }
    } catch (error) {
      console.error("Erreur lors de l'importation:", error);
      alert("Erreur lors de l'importation.");
    }
  };

  useEffect(() => {
    const savedContacts = localStorage.getItem("hub_contacts");
    if (savedContacts) {
      setContacts(JSON.parse(savedContacts));
    }
  }, []);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const windowAny = window as any;
      const SpeechRecognition =
        windowAny.SpeechRecognition || windowAny.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const reco = new SpeechRecognition();
        reco.lang = "fr-FR";
        reco.continuous = false;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, aiResponse]);

  const analyzeText = async (text: string) => {
    setStatus("thinking");
    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      setAiResponse(data);

      if (data.action === "LIRE_MESSAGE") {
        setStatus("executing");

        try {
          const smsReq = await fetch(`${API_BASE_URL}/api/receive-sms`);

          if (smsReq.ok) {
            const smsData = await smsReq.json();
            const savedName = Object.keys(contacts).find(
              (key) => contacts[key] === smsData.sender,
            );
            const senderName = savedName ? savedName : smsData.sender;

            speak(
              `Tu as un message de ${senderName} qui dit : ${smsData.message}`,
              () => {
                setStatus("idle");
              },
            );
          } else {
            speak("Tu n'as aucun nouveau message.", () => setStatus("idle"));
          }
        } catch {
          speak("Désolé, je n'ai pas pu vérifier tes messages.", () =>
            setStatus("idle"),
          );
        }
        return;
      } else if (data.action !== "INCONNU" && data.contact) {
        setStatus("confirming");
        let phrase = "";
        if (data.action === "APPELER") {
          phrase = `Veux-tu appeler ${data.contact} ?`;
        } else if (data.action === "MESSAGE") {
          phrase = `Veux-tu envoyer à ${data.contact} le message suivant : ${data.contenu} ?`;
        }
        speak(phrase, () => {
          recognitionRef.current.start();
          setStatus("listening");
        });
      } else {
        speak("Je n'ai pas compris. Peux-tu répéter ?");
        setStatus("idle");
      }
    } catch {
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

  const executeAction = () => {
    const contactNom = aiResponse.contact.toLowerCase();
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
      aiResponse.action === "APPELER" ? "J'appelle." : "J'envoie le message.",
    );

    setTimeout(() => {
      if (aiResponse.action === "APPELER") {
        window.location.href = `tel:${numero}`;
      } else {
        const message = encodeURIComponent(aiResponse.contenu || "");
        window.location.href = `sms:${numero}?body=${message}`;
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

  const handleAddContact = () => {
    if (newName && newPhone) {
      const updatedContacts = {
        ...contacts,
        [newName.toLowerCase()]: newPhone,
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
            S&apos;adapte automatiquement (Application Native ou Site Web)
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
            placeholder="Numéro (ex: 0612345678)"
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

      <div className="mb-12 h-40 flex flex-col items-center justify-center text-center">
        {status === "idle" && <p className="text-2xl text-gray-400">Prêt</p>}
        {status === "listening" && (
          <p className="text-3xl font-bold text-red-500 animate-pulse">
            Je t&apos;écoute...
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
          </div>
        )}
        {status === "executing" && (
          <p className="text-3xl font-bold text-green-600">J&apos;appelle...</p>
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
