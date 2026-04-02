"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Loader2, Check, X, Settings, Plus, Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Contacts } from "@capacitor-community/contacts";
import { App } from "@capacitor/app";

export default function Home() {
  const [status, setStatus] = useState<
    "idle" | "listening" | "thinking" | "confirming" | "executing"
  >("idle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiResponse, setAiResponse] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const silenceTimerRef = useRef<any>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const API_BASE_URL = Capacitor.isNativePlatform()
    ? "https://semaine-inter-2026.vercel.app"
    : "";

  // 1. LA FONCTION SPEAK EST BIEN LÀ (Correction du "Cannot find name 'speak'")
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

  // Correction du "missing dependency" avec useCallback
  const syncContactsSilently = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const permission = await Contacts.requestPermissions();

        if (permission.contacts === "granted") {
          const result = await Contacts.getContacts({
            projection: { name: true, phones: true },
          });

          const newBatch: Record<string, string> = { ...contacts };
          result.contacts.forEach((c) => {
            const displayName = c.name?.display;
            const firstPhone = c.phones?.[0]?.number;

            if (displayName && firstPhone) {
              try {
                const nomNettoye = displayName.toLowerCase().trim();
                const numNettoye = firstPhone.replace(/[\s\-\.]/g, "");
                newBatch[nomNettoye] = numNettoye;
              } catch {
                // On ignore les erreurs en silence (Correction du 'e' is defined but never used)
              }
            }
          });

          setContacts(newBatch);
          localStorage.setItem("hub_contacts", JSON.stringify(newBatch));
          console.log(
            "Synchronisation auto réussie :",
            Object.keys(newBatch).length,
            "contacts.",
          );
        }
      }
    } catch (error) {
      console.error("Échec de la synchro auto:", error);
    }
  }, [contacts]);

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
              } catch {
                console.log("Un contact a été ignoré.");
              }
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
                const nomNettoye = c.name[0].toLowerCase().trim();
                newBatch[nomNettoye] = c.tel[0].replace(/[\s\-\.]/g, "");
              }
            });

            setContacts(newBatch);
            localStorage.setItem("hub_contacts", JSON.stringify(newBatch));
            alert(`${selected.length} contacts importés via le navigateur !`);
          }
        } else {
          alert(
            "L'importation automatique n'est pas supportée sur ce navigateur Web.",
          );
        }
      }
    } catch (error) {
      console.error("Erreur complète:", error);
      alert("Erreur technique : " + String(error));
    }
  };

  useEffect(() => {
    const savedContacts = localStorage.getItem("hub_contacts");
    if (savedContacts) {
      setContacts(JSON.parse(savedContacts));
    }
    syncContactsSilently();

    const handler = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        syncContactsSilently();
      }
    });

    return () => {
      handler.then((h) => h.remove());
    };
  }, [syncContactsSilently]);

  // LE MICRO WEB RÉGLÉ À 1,5 SECONDE
  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const windowAny = window as any;
      const SpeechRecognition =
        windowAny.SpeechRecognition || windowAny.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const reco = new SpeechRecognition();
        reco.lang = "fr-FR";
        reco.continuous = true;
        reco.interimResults = true;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reco.onresult = async (event: any) => {
          let currentText = "";
          for (let i = 0; i < event.results.length; i++) {
            currentText += event.results[i][0].transcript + " ";
          }
          currentText = currentText.toLowerCase().trim();

          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // LE TIMER EST À 1500ms
          silenceTimerRef.current = setTimeout(() => {
            reco.stop();
            if (status === "confirming") {
              handleConfirmation(currentText);
            } else {
              analyzeText(currentText);
            }
          }, 1500);
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
    if (!text || text.trim() === "") {
      speak("Je n'ai entendu aucun mot. Peux-tu répéter ?");
      setStatus("idle");
      return;
    }

    setStatus("thinking");
    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("Erreur Vercel:", data.error);
        speak("Il y a un problème de connexion avec mon cerveau IA.");
        setStatus("idle");
        return;
      }

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
      } else if (
        data.action === "AJOUTER_CONTACT" &&
        data.contact &&
        data.numero
      ) {
        setStatus("executing");
        const nomPropre = data.contact.toLowerCase().trim();
        const numPropre = data.numero.replace(/[\s\-\.]/g, "");

        setContacts((prevContacts) => {
          const updatedContacts = { ...prevContacts, [nomPropre]: numPropre };
          localStorage.setItem("hub_contacts", JSON.stringify(updatedContacts));
          return updatedContacts;
        });

        speak(
          `C'est noté. Le numéro de ${data.contact} a bien été enregistré.`,
          () => {
            setStatus("idle");
          },
        );
        return;
      } else if (data.action === "IMPORTER_CONTACT" && data.contact) {
        setStatus("executing");
        const nomRecherche = data.contact.toLowerCase().trim();

        try {
          if (Capacitor.isNativePlatform()) {
            const permission = await Contacts.requestPermissions();

            if (permission.contacts === "granted") {
              const result = await Contacts.getContacts({
                projection: { name: true, phones: true },
              });

              const contactTrouve = result.contacts.find(
                (c) =>
                  c.name &&
                  c.name.display &&
                  c.name.display.toLowerCase().includes(nomRecherche) &&
                  c.phones &&
                  c.phones.length > 0,
              );

              if (
                contactTrouve &&
                contactTrouve.phones &&
                contactTrouve.phones[0]
              ) {
                const numPropre = contactTrouve.phones[0].number.replace(
                  /[\s\-\.]/g,
                  "",
                );

                setContacts((prev) => {
                  const updated = { ...prev, [nomRecherche]: numPropre };
                  localStorage.setItem("hub_contacts", JSON.stringify(updated));
                  return updated;
                });

                speak(
                  `C'est fait. J'ai trouvé ${data.contact} dans ton téléphone.`,
                  () => setStatus("idle"),
                );
              } else {
                speak(
                  `Je n'ai pas trouvé de numéro pour ${data.contact} dans ton répertoire.`,
                  () => setStatus("idle"),
                );
              }
            } else {
              speak("Je n'ai pas l'autorisation de lire tes contacts.", () =>
                setStatus("idle"),
              );
            }
          } else {
            speak("Cette fonction n'est pas possible sur le site web.", () =>
              setStatus("idle"),
            );
          }
        } catch (error) {
          console.error("Erreur d'importation :", error);
          speak("Il y a eu un problème lors de la recherche du contact.", () =>
            setStatus("idle"),
          );
        }
        return;
      } else if (data.action === "SUPPRIMER_CONTACT" && data.contact) {
        setStatus("executing");
        const nomPropre = data.contact.toLowerCase().trim();

        if (contacts[nomPropre]) {
          setContacts((prev) => {
            const updated = { ...prev };
            delete updated[nomPropre];
            localStorage.setItem("hub_contacts", JSON.stringify(updated));
            return updated;
          });
          speak(`C'est fait, j'ai effacé ${data.contact} de ma mémoire.`, () =>
            setStatus("idle"),
          );
        } else {
          speak(
            `Je n'ai pas trouvé ${data.contact} dans ton répertoire rapide.`,
            () => setStatus("idle"),
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
        } else if (data.action === "WHATSAPP") {
          phrase = `Veux-tu envoyer un WhatsApp à ${data.contact} avec le message : ${data.contenu} ?`;
        }

        speak(phrase, () => {
          if (recognitionRef.current) recognitionRef.current.start();
          setStatus("listening");
        });
      } else {
        const actionRecue = data.action ? data.action : "aucune action";
        const contactRecu = data.contact ? data.contact : "aucun contact";
        speak(
          `Je n'ai pas compris. L'intelligence artificielle a détecté l'action ${actionRecue}, avec le contact ${contactRecu}.`,
        );
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
    if (!aiResponse || !aiResponse.contact) {
      speak("Désolé, je n'ai pas bien compris le nom du contact.");
      setStatus("idle");
      return;
    }

    const contactNom = aiResponse.contact.toLowerCase().trim();
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
      } else if (aiResponse.action === "WHATSAPP") {
        let formatWa = numero.replace(/[\s\-\.]/g, "");
        if (formatWa.startsWith("0")) {
          formatWa = "33" + formatWa.substring(1);
        } else if (formatWa.startsWith("+")) {
          formatWa = formatWa.substring(1);
        }
        const message = encodeURIComponent(aiResponse.contenu || "");
        window.location.href = `https://wa.me/${formatWa}?text=${message}`;
      } else {
        const message = encodeURIComponent(aiResponse.contenu || "");
        window.location.href = `sms:${numero}?body=${message}`;
      }
      setStatus("idle");
      setAiResponse(null);
    }, 1000);
  };

  // LE BOUTON AVEC LA VOIX
  const toggleListen = () => {
    if (status === "idle") {
      setStatus("listening");

      speak("Commen puis-je vous aidez aujourd'hui ?", () => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.log("Micro déjà actif");
          }
        }
      });
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
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
        {status === "idle" && null}
        {status === "listening" && (
          <div className="w-8 h-8 bg-red-500 rounded-full animate-pulse" />
        )}
        {status === "thinking" && (
          <Loader2 className="w-24 h-24 text-blue-600 animate-spin" />
        )}
        {status === "confirming" && (
          <div className="flex gap-12">
            <Check className="w-24 h-24 text-green-500 bg-green-100 rounded-full p-2" />
            <X className="w-24 h-24 text-red-500 bg-red-100 rounded-full p-2" />
          </div>
        )}
        {status === "executing" && (
          <div className="w-8 h-8 bg-green-500 rounded-full animate-pulse" />
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
