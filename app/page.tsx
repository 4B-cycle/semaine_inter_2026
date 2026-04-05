"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Loader2, Check, X, Settings, Plus, Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";

let globalUtterance: any = null;

// ── Recherche floue ──────────────────────────────────────────────────────────
const normaliser = (str: string) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const ressemblance = (a: string, b: string): number => {
  const na = normaliser(a);
  const nb = normaliser(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const setA = new Set(na.split(""));
  const setB = new Set(nb.split(""));
  const communs = [...setA].filter((c) => setB.has(c)).length;
  return communs / Math.max(setA.size, setB.size);
};

// ── Calcul du délai TTS adaptatif ────────────────────────────────────────────
// ~130 mots/min → ~460ms/mot, on ajoute 800ms de marge de sécurité
const delaiApres = (texte: string): number => {
  const mots = texte.trim().split(/\s+/).length;
  return Math.max(1800, mots * 460 + 800);
};

// ── Composant principal ──────────────────────────────────────────────────────
export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "listening" | "thinking" | "confirming" | "executing"
  >("idle");
  const [micListening, setMicListening] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [aiResponse, setAiResponse] = useState<any>(null);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const nativeListenerRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const watchdogRef = useRef<any>(null);

  const aiResponseRef = useRef<any>(null);
  const statusRef = useRef<
    "idle" | "listening" | "thinking" | "confirming" | "executing"
  >("idle");
  const analyzeTextRef = useRef<any>(null);
  const handleConfirmationRef = useRef<any>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const contactsRef = useRef(contacts);
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);
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

  // Nettoyage au démontage
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  const API_BASE_URL =
    isMounted && Capacitor.isNativePlatform()
      ? "https://semaine-inter-2026.vercel.app"
      : "";

  // ── TTS avec délai adaptatif ──────────────────────────────────────────────
  const speak = (text: string, callback?: () => void) => {
    const textePropre = text
      .replace(/commente/gi, "comment")
      .replace(/comment /gi, "comman ");

    if (isMounted && Capacitor.isNativePlatform()) {
      import("@capacitor-community/text-to-speech").then(({ TextToSpeech }) => {
        // On note l'heure de début pour mesurer la durée réelle
        const debut = Date.now();
        TextToSpeech.speak({ text: textePropre, lang: "fr-FR", rate: 1.0 })
          .then(() => {
            if (callback) {
              // Durée réelle écoulée + 600ms de sécurité (micro ne capte pas la fin)
              const dureeReelle = Date.now() - debut;
              const extra = dureeReelle < 800 ? 1200 : 600;
              setTimeout(callback, extra);
            }
          })
          .catch(() => {
            if (callback) setTimeout(callback, delaiApres(textePropre));
          });
      });
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

  // ── Micro Web ─────────────────────────────────────────────────────────────
  const startWebMic = (isConfirming: boolean) => {
    if (typeof window === "undefined") return;
    const windowAny = window as any;
    const SpeechRecognition =
      windowAny.SpeechRecognition || windowAny.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Le microphone n'est pas supporté sur ce navigateur.");
      setStatus("idle");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    const reco = new SpeechRecognition();
    reco.lang = "fr-FR";
    reco.continuous = true;
    reco.interimResults = true;

    reco.onresult = (event: any) => {
      let currentText = "";
      for (let i = 0; i < event.results.length; i++) {
        currentText += event.results[i][0].transcript + " ";
      }
      currentText = currentText.toLowerCase().trim();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        reco.stop();
        if (isConfirming) handleConfirmationRef.current(currentText);
        else analyzeTextRef.current(currentText);
      }, 1500);
    };

    reco.onend = () => {
      setMicListening(false);
      if (statusRef.current === "listening") setStatus("idle");
    };

    recognitionRef.current = reco;
    setMicListening(isConfirming);
    reco.start();
  };

  // ── Micro Android ─────────────────────────────────────────────────────────
  const listenNative = async (isConfirming: boolean, tentative = 0) => {
    // Watchdog : si le micro ne répond pas en 12s, on abandonne proprement
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      setMicListening(false);
      if (!isConfirming) setStatus("idle");
      // En confirming : les boutons restent visibles
    }, 12000);

    try {
      const { SpeechRecognition } =
        await import("@capacitor-community/speech-recognition");
      const perm = await SpeechRecognition.requestPermissions();

      if (perm.speechRecognition !== "granted") {
        clearTimeout(watchdogRef.current);
        alert("Autorisation micro refusée.");
        setStatus("idle");
        return;
      }

      if (!isConfirming) setStatus("listening");
      setMicListening(true);

      const result = await SpeechRecognition.start({
        language: "fr-FR",
        maxResults: 1,
        partialResults: false,
        popup: false,
      });

      clearTimeout(watchdogRef.current);
      setMicListening(false);

      const texteCapte = result?.matches?.[0]?.trim() ?? "";

      if (texteCapte !== "") {
        const text = texteCapte.toLowerCase();
        if (isConfirming) handleConfirmationRef.current(text);
        else analyzeTextRef.current(text);
      } else {
        // Android a coupé sans rien capter
        if (!isConfirming) {
          if (tentative < 1) {
            // 1 retry silencieux
            speak("Je n'ai pas entendu, réessaie.", () =>
              listenNative(false, tentative + 1),
            );
          } else {
            setStatus("idle");
          }
        } else if (tentative < 2) {
          // En confirmation : retry sans message (boutons toujours là)
          setTimeout(() => listenNative(true, tentative + 1), 500);
        }
        // Après max tentatives : on reste en confirming → boutons visibles
      }
    } catch {
      clearTimeout(watchdogRef.current);
      setMicListening(false);
      if (isConfirming && statusRef.current === "confirming" && tentative < 2) {
        const delai = 800 + tentative * 500;
        setTimeout(() => listenNative(true, tentative + 1), delai);
      } else if (!isConfirming) {
        setStatus("idle");
      }
    }
  };

  // ── Contacts ──────────────────────────────────────────────────────────────
  const syncContactsSilently = useCallback(async () => {
    if (!isMounted) return;
    try {
      if (Capacitor.isNativePlatform()) {
        const { Contacts } = await import("@capacitor-community/contacts");
        const permission = await Contacts.requestPermissions();
        if (permission.contacts === "granted") {
          const result = await Contacts.getContacts({
            projection: { name: true, phones: true },
          });
          const newBatch: Record<string, string> = { ...contactsRef.current };
          result.contacts.forEach((c) => {
            const displayName = c.name?.display;
            const firstPhone = c.phones?.[0]?.number;
            if (displayName && firstPhone) {
              try {
                newBatch[displayName.toLowerCase().trim()] = firstPhone.replace(
                  /[\s\-\.]/g,
                  "",
                );
              } catch {}
            }
          });
          setContacts(newBatch);
          localStorage.setItem("hub_contacts", JSON.stringify(newBatch));
        }
      }
    } catch {}
  }, [isMounted]);

  const importAllContacts = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { Contacts } = await import("@capacitor-community/contacts");
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
                newBatch[displayName.toLowerCase().trim()] = firstPhone.replace(
                  /[\s\-\.]/g,
                  "",
                );
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
        const navAny = navigator as any;
        if (navAny.contacts && navAny.contacts.select) {
          const selected = await navAny.contacts.select(["name", "tel"], {
            multiple: true,
          });
          if (selected.length > 0) {
            const newBatch: Record<string, string> = { ...contacts };
            selected.forEach((c: any) => {
              if (c.name && c.tel && c.tel.length > 0) {
                newBatch[c.name[0].toLowerCase().trim()] = c.tel[0].replace(
                  /[\s\-\.]/g,
                  "",
                );
              }
            });
            setContacts(newBatch);
            localStorage.setItem("hub_contacts", JSON.stringify(newBatch));
            alert(`${selected.length} contacts importés via le navigateur !`);
          }
        }
      }
    } catch (error) {
      alert("Erreur technique : " + String(error));
    }
  };

  useEffect(() => {
    if (!isMounted) return;
    const savedContacts = localStorage.getItem("hub_contacts");
    if (savedContacts) setContacts(JSON.parse(savedContacts));
    syncContactsSilently();

    let handler: any;
    const initApp = async () => {
      if (Capacitor.isNativePlatform()) {
        const { App } = await import("@capacitor/app");
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

  // ── Analyse IA ────────────────────────────────────────────────────────────
  const analyzeText = async (text: string) => {
    if (!text || text.trim() === "") {
      speak("Je n'ai entendu aucun mot. Peux-tu répéter ?");
      setStatus("idle");
      return;
    }

    setStatus("thinking");

    abortControllerRef.current = new AbortController();
    const timeoutId = setTimeout(
      () => abortControllerRef.current?.abort(),
      8000,
    );

    try {
      const response = await fetch(`${API_BASE_URL}/api/gemini`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: abortControllerRef.current.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();

      if (data.error) {
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
            const savedName = Object.keys(contactsRef.current).find(
              (key) => contactsRef.current[key] === smsData.sender,
            );
            speak(
              `Tu as un message de ${savedName ?? smsData.sender} qui dit : ${smsData.message}`,
              () => setStatus("idle"),
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
        setContacts((prev) => {
          const updated = { ...prev, [nomPropre]: numPropre };
          localStorage.setItem("hub_contacts", JSON.stringify(updated));
          return updated;
        });
        speak(
          `C'est noté. Le numéro de ${data.contact} a bien été enregistré.`,
          () => setStatus("idle"),
        );
        return;
      } else if (data.action === "IMPORTER_CONTACT" && data.contact) {
        setStatus("executing");
        const nomRecherche = data.contact.toLowerCase().trim();
        try {
          if (Capacitor.isNativePlatform()) {
            const { Contacts } = await import("@capacitor-community/contacts");
            const permission = await Contacts.requestPermissions();
            if (permission.contacts === "granted") {
              const result = await Contacts.getContacts({
                projection: { name: true, phones: true },
              });
              const contactTrouve = result.contacts.find(
                (c) =>
                  c.name?.display?.toLowerCase().includes(nomRecherche) &&
                  c.phones?.length,
              );
              if (contactTrouve?.phones?.[0]) {
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
        } catch {
          speak("Il y a eu un problème lors de la recherche du contact.", () =>
            setStatus("idle"),
          );
        }
        return;
      } else if (data.action === "SUPPRIMER_CONTACT" && data.contact) {
        setStatus("executing");
        const nomPropre = data.contact.toLowerCase().trim();
        if (contactsRef.current[nomPropre]) {
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
        const nomDemande = data.contact.toLowerCase().trim();

        const contactsTrouves = Object.keys(contactsRef.current)
          .map((nom) => ({ nom, score: ressemblance(nom, nomDemande) }))
          .filter(({ score }) => score >= 0.6)
          .sort((a, b) => b.score - a.score || a.nom.length - b.nom.length)
          .map(({ nom }) => nom);

        if (contactsTrouves.length === 0) {
          speak(
            `Je ne connais pas ${data.contact}. Demande à un proche de l'ajouter.`,
          );
          setStatus("idle");
          return;
        }

        const contactFinal = contactsTrouves[0];
        const dataAvecChoix =
          contactsTrouves.length > 1
            ? {
                ...data,
                contact: contactFinal,
                choixContacts: contactsTrouves,
                choixIndex: 0,
              }
            : { ...data, contact: contactFinal };

        setAiResponse(dataAvecChoix);
        setStatus("confirming");

        let phrase = "";
        if (data.action === "APPELER") {
          phrase =
            contactsTrouves.length > 1
              ? `J'ai plusieurs ${data.contact}. Veux-tu appeler ${contactFinal} ?`
              : `Veux-tu appeler ${contactFinal} ?`;
        } else if (data.action === "MESSAGE") {
          phrase = `Veux-tu envoyer à ${contactFinal} le message : ${data.contenu} ?`;
        } else if (data.action === "WHATSAPP") {
          phrase = `Veux-tu envoyer un WhatsApp à ${contactFinal} avec : ${data.contenu} ?`;
        }

        speak(phrase, () => {
          if (Capacitor.isNativePlatform()) listenNative(true);
          else startWebMic(true);
        });
      } else {
        speak("Je n'ai pas compris ta demande. Peux-tu répéter autrement ?");
        setStatus("idle");
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === "AbortError") {
        speak("La connexion est trop lente. Vérifie ton réseau et réessaie.");
      } else {
        speak("Une erreur s'est produite. Réessaie dans un moment.");
      }
      setStatus("idle");
    }
  };

  // ── Confirmation ──────────────────────────────────────────────────────────
  const handleConfirmation = (text: string) => {
    const current = aiResponseRef.current;

    if (current?.choixContacts) {
      if (
        text.includes("oui") ||
        text.includes("d'accord") ||
        text.includes("vas-y")
      ) {
        const dataToExecute = {
          ...current,
          contact: current.choixContacts[current.choixIndex],
          choixContacts: undefined,
        };
        setAiResponse(dataToExecute);
        executeAction(dataToExecute);
      } else {
        const nextIndex = current.choixIndex + 1;
        if (nextIndex < current.choixContacts.length) {
          setAiResponse({
            ...current,
            contact: current.choixContacts[nextIndex],
            choixIndex: nextIndex,
          });

          let phrase = "";
          if (current.action === "APPELER")
            phrase = `Veux-tu appeler ${current.choixContacts[nextIndex]} ?`;
          else if (current.action === "MESSAGE")
            phrase = `Veux-tu envoyer un message à ${current.choixContacts[nextIndex]} ?`;
          else if (current.action === "WHATSAPP")
            phrase = `Veux-tu envoyer un WhatsApp à ${current.choixContacts[nextIndex]} ?`;

          speak(phrase, () => {
            if (Capacitor.isNativePlatform()) listenNative(true);
            else startWebMic(true);
          });
        } else {
          speak("Je n'ai trouvé personne d'autre. J'annule.");
          setStatus("idle");
          setAiResponse(null);
        }
      }
      return;
    }

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

  // ── Exécution ─────────────────────────────────────────────────────────────
  const executeAction = async (overrideResponse?: any) => {
    const currentResponse = overrideResponse ?? aiResponseRef.current;

    if (!currentResponse?.contact) {
      speak("Désolé, je n'ai pas bien compris le nom du contact.");
      setStatus("idle");
      return;
    }

    const contactNom = currentResponse.contact.toLowerCase().trim();
    const numero = contactsRef.current[contactNom];

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
        url = `https://wa.me/${formatWa}?text=${encodeURIComponent(currentResponse.contenu || "")}`;
      } else {
        url = `sms:${numero}?body=${encodeURIComponent(currentResponse.contenu || "")}`;
      }

      if (Capacitor.isNativePlatform()) {
        try {
          const { AppLauncher } = await import("@capacitor/app-launcher");
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

  // ── Bouton micro principal ────────────────────────────────────────────────
  const toggleListen = () => {
    if (status === "idle") {
      setStatus("listening");
      speak("Comment puis-je vous aider ?", () => {
        if (Capacitor.isNativePlatform()) listenNative(false);
        else startWebMic(false);
      });
    } else {
      if (Capacitor.isNativePlatform()) {
        if (nativeListenerRef.current) {
          nativeListenerRef.current.remove();
          nativeListenerRef.current = null;
        }
        import("@capacitor-community/speech-recognition").then(
          ({ SpeechRecognition }) => {
            SpeechRecognition.stop();
          },
        );
      } else {
        if (recognitionRef.current) recognitionRef.current.stop();
      }
      setMicListening(false);
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

  // ── Page paramètres ───────────────────────────────────────────────────────
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

  // ── Page principale ───────────────────────────────────────────────────────
  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center bg-slate-50 p-6 relative">
      <button
        onClick={() => setShowSettings(true)}
        className="absolute top-6 right-6 p-3 text-slate-300 hover:text-slate-500 transition-colors"
      >
        <Settings className="w-8 h-8" />
      </button>

      <div className="mb-12 h-56 flex flex-col items-center justify-center text-center gap-6">
        {status === "listening" && (
          <div className="w-8 h-8 bg-red-500 rounded-full animate-pulse" />
        )}

        {status === "thinking" && (
          <Loader2 className="w-24 h-24 text-blue-600 animate-spin" />
        )}

        {status === "confirming" && (
          <>
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

            {micListening && (
              <div className="flex items-center gap-2 text-blue-500 text-sm font-medium animate-pulse">
                <Mic className="w-5 h-5" />
                <span>J&apos;écoute ta réponse…</span>
              </div>
            )}
          </>
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
          ${status === "thinking" || status === "executing" ? "opacity-20 grayscale" : ""}
        `}
      >
        <Mic className="w-32 h-32 text-white" />
      </button>
    </main>
  );
}
