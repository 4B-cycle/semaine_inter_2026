"use client";

import { useState, useEffect, useRef } from "react";
import { Mic, Loader2, Check, X, Settings, Plus, Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Contacts } from "@capacitor-community/contacts";
import { App } from "@capacitor/app";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

export default function Home() {
  const [status, setStatus] = useState<
    "idle" | "listening" | "thinking" | "confirming" | "executing"
  >("idle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiResponse, setAiResponse] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const API_BASE_URL = Capacitor.isNativePlatform()
    ? "https://semaine-inter-2026.vercel.app"
    : "";

  const syncContactsSilently = async () => {
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
              } catch (e) {
                // On ignore les erreurs en silence
              }
            }
          });

          // On met à jour l'état et le stockage local
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
      // On ne dit rien à l'utilisateur, on log juste pour nous
      console.error("Échec de la synchro auto:", error);
    }
  };

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
            // SÉCURITÉ : On extrait avec des "?" pour éviter les crashs si une donnée manque
            const displayName = c.name?.display;
            const firstPhone = c.phones?.[0]?.number;

            // On ne l'ajoute que si le contact a un VRAI nom ET un VRAI numéro
            if (displayName && firstPhone) {
              try {
                const nomNettoye = displayName.toLowerCase().trim();
                const numNettoye = firstPhone.replace(/[\s\-\.]/g, "");
                newBatch[nomNettoye] = numNettoye;
                count++;
              } catch (e) {
                console.log(
                  "Un contact a été ignoré car son format est invalide.",
                );
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
            "L'importation automatique n'est pas supportée sur ce navigateur Web. Utilisez l'ajout manuel.",
          );
        }
      }
    } catch (error) {
      console.error("Erreur complète:", error);
      // On affiche l'erreur technique pour comprendre ce qui bloque !
      alert(
        "Erreur technique : " + JSON.stringify(error) + " | " + String(error),
      );
    }
  };

  useEffect(() => {
    // 1. Chargement initial
    const savedContacts = localStorage.getItem("hub_contacts");
    if (savedContacts) {
      setContacts(JSON.parse(savedContacts));
    }
    syncContactsSilently();

    // 2. Écouteur de changement d'état (Le "Sync on Resume")
    const handler = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        console.log("App de retour au premier plan : synchronisation...");
        syncContactsSilently();
      }
    });

    // Nettoyage de l'écouteur quand on ferme l'app
    return () => {
      handler.then((h) => h.remove());
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const windowAny = window as any;
      const SpeechRecognition =
        windowAny.SpeechRecognition || windowAny.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const reco = new SpeechRecognition();
        reco.lang = "fr-FR";

        // --- NOUVEAUTÉ 1 : On laisse le micro écouter en continu ---
        reco.continuous = true;
        reco.interimResults = true;

        // --- DÉTECTEUR D'ERREUR MICRO (Pour déboguer l'APK) ---
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reco.onerror = (event: any) => {
          console.error("Erreur micro:", event.error);
          alert("Erreur Micro Android : " + event.error);
          setStatus("idle");
        };

        reco.onstart = () => {
          console.log("Le micro Android est bien ouvert.");
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reco.onresult = async (event: any) => {
          // On assemble tous les mots, même s'il y a eu une pause
          let currentText = "";
          for (let i = 0; i < event.results.length; i++) {
            currentText += event.results[i][0].transcript + " ";
          }
          currentText = currentText.toLowerCase().trim();

          // On remet le chronomètre à zéro tant que la personne parle
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // --- NOUVEAUTÉ 2 : On attend 2 secondes de silence avant d'envoyer ---
          silenceTimerRef.current = setTimeout(() => {
            reco.stop();
            if (status === "confirming") {
              handleConfirmation(currentText);
            } else {
              analyzeText(currentText);
            }
          }, 2000);
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
    // SÉCURITÉ 1 : On bloque si le micro n'a rien entendu de valide
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

      // SÉCURITÉ 2 : On capte les crashs du serveur Vercel
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
      }
      // --- NOUVEAUTÉ : AJOUT DE CONTACT VOCAL ---
      else if (
        data.action === "AJOUTER_CONTACT" &&
        data.contact &&
        data.numero
      ) {
        setStatus("executing");

        // Nettoyage : on met le nom en minuscules et on enlève espaces/tirets/points du numéro
        const nomPropre = data.contact.toLowerCase().trim();
        const numPropre = data.numero.replace(/[\s\-\.]/g, "");

        // On met à jour l'état ET le stockage du téléphone
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
          // 1. On vérifie si on est sur l'application Android (APK)
          if (Capacitor.isNativePlatform()) {
            const permission = await Contacts.requestPermissions();

            if (permission.contacts === "granted") {
              // On aspire tout le répertoire
              const result = await Contacts.getContacts({
                projection: { name: true, phones: true },
              });

              // On cherche le contact qui correspond au nom prononcé
              const contactTrouve = result.contacts.find(
                (c) =>
                  c.name &&
                  c.name.display.toLowerCase().includes(nomRecherche) &&
                  c.phones &&
                  c.phones.length > 0,
              );

              if (contactTrouve) {
                // On nettoie le numéro (enlève les espaces)
                const numPropre = contactTrouve.phones[0].number.replace(
                  /[\s\-\.]/g,
                  "",
                );

                // On l'ajoute à la mémoire de l'application
                setContacts((prev) => {
                  const updated = { ...prev, [nomRecherche]: numPropre };
                  localStorage.setItem("hub_contacts", JSON.stringify(updated));
                  return updated;
                });

                speak(
                  `C'est fait. J'ai trouvé ${data.contact} dans ton téléphone, son numéro est enregistré.`,
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
            // 2. Si on est sur le site Web (PWA), on explique que c'est bloqué
            speak(
              "Cette fonction automatique n'est pas possible sur le site web. Demande à un proche de l'ajouter manuellement.",
              () => setStatus("idle"),
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
          recognitionRef.current.start();
          setStatus("listening");
        });
      } else {
        // --- ASTUCE DE DEBUGGING VOCAL ---
        console.log("Erreur de l'IA :", data);
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
    // Sécurité : On s'assure que Gemini a bien renvoyé un nom de contact
    if (!aiResponse || !aiResponse.contact) {
      speak("Désolé, je n'ai pas bien compris le nom du contact.");
      setStatus("idle");
      return;
    }

    // Le .trim() est vital : il enlève les espaces invisibles (ex: "papa " devient "papa")
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
        // --- NOUVEAUTÉ 3 : Formatage propre du numéro pour WhatsApp ---
        let formatWa = numero.replace(/[\s\-\.]/g, ""); // Enlève les espaces
        if (formatWa.startsWith("0")) {
          formatWa = "33" + formatWa.substring(1); // Transforme 06 en 336
        } else if (formatWa.startsWith("+")) {
          formatWa = formatWa.substring(1); // Enlève le + si +336
        }

        const message = encodeURIComponent(aiResponse.contenu || "");
        // Lien universel officiel
        window.location.href = `https://wa.me/${formatWa}?text=${message}`;
      } else {
        // SMS Classique
        const message = encodeURIComponent(aiResponse.contenu || "");
        window.location.href = `sms:${numero}?body=${message}`;
      }

      setStatus("idle");
      setAiResponse(null);
    }, 1000);
  };

  const toggleListen = async () => {
    if (status === "idle") {
      setStatus("listening");

      // On fait parler l'application EN PREMIER
      speak("Je t'écoute.", async () => {
        // Une fois qu'elle a fini de parler, on allume le micro
        if (Capacitor.isNativePlatform()) {
          // --- STRATÉGIE APK ---
          try {
            const perm = await SpeechRecognition.requestPermissions();
            if (perm.speechRecognition === "granted") {
              const result = await SpeechRecognition.start({
                language: "fr-FR",
                popup: false,
                partialResults: false,
              });

              if (result.matches && result.matches.length > 0) {
                const text = result.matches[0].toLowerCase();
                setStatus("idle");

                if (status === "confirming") {
                  handleConfirmation(text);
                } else {
                  analyzeText(text);
                }
              }
            } else {
              speak("Désolé, je n'ai pas accès à ton micro.");
              setStatus("idle");
            }
          } catch (error) {
            console.error("Erreur micro natif:", error);
            setStatus("idle");
          }
        } else {
          // --- STRATÉGIE WEB ---
          if (recognitionRef.current) {
            recognitionRef.current.start();
          }
        }
      });
    } else {
      // Si on appuie pour arrêter manuellement
      if (Capacitor.isNativePlatform()) {
        SpeechRecognition.stop();
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
        {/* En attente : on ne met rien (ni texte ni icône) */}
        {status === "idle" && null}

        {/* Écoute : on affiche juste un petit point rouge qui clignote au lieu du texte */}
        {status === "listening" && (
          <div className="w-8 h-8 bg-red-500 rounded-full animate-pulse" />
        )}

        {/* Réflexion : on garde la roue bleue */}
        {status === "thinking" && (
          <Loader2 className="w-24 h-24 text-blue-600 animate-spin" />
        )}

        {/* Confirmation : on garde les grosses icônes Vertes et Rouges */}
        {status === "confirming" && (
          <div className="flex gap-12">
            <Check className="w-24 h-24 text-green-500 bg-green-100 rounded-full p-2" />
            <X className="w-24 h-24 text-red-500 bg-red-100 rounded-full p-2" />
          </div>
        )}

        {/* Action en cours : on peut mettre un téléphone vert qui clignote */}
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
