import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Mic, Send, Volume2, Square, Sparkles, Languages, Bot, User } from 'lucide-react';
import { useApp } from '@/lib/appContext';
import { buildContext } from '@/lib/agents';
import {
  generateResponse, getSpeechRecognition, speak, stopSpeaking, langToBcp47,
  makeMessage, ensureVoicesLoaded, type SpeechRecognitionLike,
} from '@/lib/voice';
import { LANG_LABELS, langNative } from '@/lib/i18n';
import type { ChatMessage, Lang } from '@/lib/types';
import { Card, SimBadge } from '@/components/ui';
import { classNames } from '@/lib/format';

const SUGGESTIONS: { te: string; en: string; hi: string }[] = [
  { te: 'నా టమాటాలను ఎక్కడ అమ్మితే ఎక్కువ లాభం వస్తుంది?', en: 'Where can I sell my tomatoes for the best return?', hi: 'मेरे टमाटर कहाँ बेचने से सबसे ज्यादा लाभ होगा?' },
  { te: 'నా నికర ఆదాయం ఎంత?', en: 'What are my net earnings?', hi: 'मेरी शुद्ध कमाई कितनी है?' },
  { te: 'ఫసలను ఇప్పుడు అమ్మాలా లేక ఆగాలా?', en: 'Should I sell now or wait?', hi: 'क्या मुझे अभी बेचना चाहिए या इंतजार करना चाहिए?' },
  { te: 'నిల్వ సౌకర్యాల గురించి చెప్పండి', en: 'Tell me about storage options', hi: 'भंडारण के विकल्प बताइए' },
];

function voiceErrorText(code: string, lang: Lang): string {
  const te: Record<string, string> = {
    unsupported: 'ఈ బ్రౌజర్‌లో వాయిస్ ఇన్‌పుట్ సపోర్ట్ లేదు. Google Chrome వాడండి లేదా కింద తెలుగులో టైప్ చేయండి.',
    'not-allowed': 'మైక్రోఫోన్ అనుమతి నిరాకరించబడింది. బ్రౌజర్ సెట్టింగ్స్‌లో మైక్ అనుమతి ఇవ్వండి.',
    'service-not-allowed': 'మైక్రోఫోన్ వాయిస్ సేవకు అనుమతి లేదు. దయచేసి సెట్టింగ్స్ చెక్ చేయండి.',
    'no-speech': 'మాట వినిపించలేదు. మళ్లీ మైక్ నొక్కి స్పష్టంగా మాట్లాడండి.',
    'audio-capture': 'మైక్రోఫోన్ కనుగొనబడలేదు. దయచేసి మైక్ కనెక్ట్ చేసి మళ్లీ ప్రయత్నించండి.',
    network: 'వాయిస్ గుర్తింపుకు ఇంటర్నెట్ కనెక్షన్ అవసరం. నెట్‌వర్క్ చెక్ చేసి మళ్లీ ప్రయత్నించండి.',
    'language-not-supported': 'ఈ బ్రౌజర్‌లో తెలుగు వాయిస్ గుర్తింపు సపోర్ట్ లేదు. Google Chrome వాడండి లేదా కింద టైప్ చేయండి.',
    unknown: 'వాయిస్ ఇన్‌పుట్ పని చేయలేదు. దయచేసి మళ్లీ ప్రయత్నించండి లేదా కింద టైప్ చేయండి.',
  };
  const hi: Record<string, string> = {
    unsupported: 'इस ब्राउज़र में वॉइस इनपुट समर्थित नहीं है। कृपया नीचे अपना प्रश्न टाइप करें।',
    'not-allowed': 'माइक्रोफ़ोन की अनुमति नहीं मिली। कृपया ब्राउज़र सेटिंग्स में अनुमति दें।',
    'service-not-allowed': 'माइक्रोफ़ोन सेवा की अनुमति नहीं मिली। कृपया सेटिंग्स जांचें।',
    'no-speech': 'आवाज़ सुनाई नहीं दी। माइक दबाकर फिर से साफ़ बोलें।',
    'audio-capture': 'माइक्रोफ़ोन नहीं मिला। कृपया माइक जांचकर फिर से प्रयास करें।',
    network: 'वॉइस पहचान के लिए इंटरनेट ज़रूरी है। कृपया नेटवर्क जांचें।',
    'language-not-supported': 'इस ब्राउज़र में इस भाषा की वॉइस पहचान समर्थित नहीं है। कृपया नीचे टाइप करें।',
    unknown: 'वॉइस इनपुट विफल रहा। कृपया फिर से प्रयास करें या नीचे टाइप करें।',
  };
  const en: Record<string, string> = {
    unsupported: 'Voice input is not supported in this browser. Please type your question below.',
    'not-allowed': 'Microphone permission was denied. Please allow mic access in your browser settings.',
    'service-not-allowed': 'Speech service permission is blocked. Please check browser microphone settings.',
    'no-speech': 'No speech was detected. Tap the mic and speak clearly.',
    'audio-capture': 'No microphone was found. Check your mic connection and try again.',
    network: 'Voice recognition requires an internet connection. Check your network or type below.',
    'language-not-supported': 'Voice recognition for this language is not supported in this browser. Try Chrome or type below.',
    unknown: 'Voice input failed. Please try again or type your question below.',
  };
  const map = lang === 'te' ? te : lang === 'hi' ? hi : en;
  return map[code] ?? map.unknown;
}

export function VoiceAssistantPage() {
  const { farmer, lang, setLang } = useApp();
  const ctx = useMemo(() => buildContext(farmer), [farmer]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState(false);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const submittedRef = useRef(false);
  const latestTranscriptRef = useRef('');
  const abortedBySystemRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ensureVoicesLoaded();
    return () => {
      abortedBySystemRef.current = true;
      submittedRef.current = true;
      recRef.current?.abort?.();
      recRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interimText]);

  const addMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => [...prev, m]);
  }, []);

  const playVoice = useCallback((text: string, responseLang: Lang) => {
    setSpeaking(true);
    speak(
      text,
      responseLang,
      () => setSpeaking(false),
      (meta) => setFallbackNotice(responseLang === 'te' && meta.usedFallbackVoice)
    );
  }, []);

  const respond = useCallback(
    (text: string, responseLang: Lang) => {
      const reply = generateResponse(text, responseLang, ctx);
      addMessage(makeMessage('assistant', reply, responseLang));
      playVoice(reply, responseLang);
    },
    [ctx, addMessage, playVoice]
  );

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setVoiceError(null);
      addMessage(makeMessage('farmer', trimmed, lang));
      setInput('');
      respond(trimmed, lang);
    },
    [lang, addMessage, respond]
  );

  const stopSpeak = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const switchLanguage = useCallback(
    (nextLang: Lang) => {
      if (listening && recRef.current) {
        abortedBySystemRef.current = true;
        submittedRef.current = true;
        recRef.current.abort?.();
        recRef.current.stop();
        setListening(false);
      }
      stopSpeak();
      setInterimText('');
      setVoiceError(null);
      setFallbackNotice(false);
      setLang(nextLang);
    },
    [listening, stopSpeak, setLang]
  );

  const toggleListen = useCallback(() => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }

    stopSpeak();
    setVoiceError(null);
    setInterimText('');

    const rec = getSpeechRecognition();
    if (!rec) {
      const msg = voiceErrorText('unsupported', lang);
      setVoiceError(msg);
      addMessage(makeMessage('assistant', msg, lang));
      return;
    }

    submittedRef.current = false;
    latestTranscriptRef.current = '';
    abortedBySystemRef.current = false;

    rec.lang = langToBcp47(lang);
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e) => {
      const parts: string[] = [];
      let hasFinal = false;
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const piece = res?.[0]?.transcript?.trim();
        if (piece) parts.push(piece);
        if (res?.isFinal !== false && i === e.results.length - 1) {
          hasFinal = true;
        }
      }
      const combined = parts.join(' ').trim();
      latestTranscriptRef.current = combined;
      setInterimText(combined);

      if (hasFinal && combined && !submittedRef.current) {
        submittedRef.current = true;
        setInterimText('');
        addMessage(makeMessage('farmer', combined, lang));
        respond(combined, lang);
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterimText('');
      if (!abortedBySystemRef.current && !submittedRef.current && latestTranscriptRef.current) {
        const finalTranscript = latestTranscriptRef.current;
        submittedRef.current = true;
        addMessage(makeMessage('farmer', finalTranscript, lang));
        respond(finalTranscript, lang);
      }
    };

    rec.onerror = (e) => {
      setListening(false);
      setInterimText('');
      const errCode = e?.error ?? 'unknown';
      if (errCode === 'aborted' && abortedBySystemRef.current) return;
      setVoiceError(voiceErrorText(errCode, lang));
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setVoiceError(voiceErrorText('unknown', lang));
    }
  }, [listening, lang, addMessage, respond, stopSpeak]);

  return (
    <div className="mx-auto max-w-3xl py-6">
      {/* Header */}
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className={classNames(
            'grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-forest-200 to-forest-500 text-forest-900 shadow-glow',
            listening && 'animate-pulse'
          )}>
            <Bot size={36} />
          </div>
          {listening && (
            <>
              <span className="absolute inset-0 rounded-3xl ring-2 ring-forest-200 animate-pulse-ring" />
              <span className="absolute inset-0 rounded-3xl ring-2 ring-forest-300 animate-pulse-ring" style={{ animationDelay: '0.6s' }} />
            </>
          )}
        </div>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-forest-900">Agri Mitra</h1>
        <p className="text-sm text-forest-600">Your Farming Decision Assistant</p>
        <div className="mt-2 flex items-center gap-2">
          <SimBadge />
          <span className="chip bg-forest-50 text-forest-700"><Sparkles size={12} /> Multilingual AI</span>
        </div>
      </div>

      {/* Language switcher */}
      <div className="mt-5 flex items-center justify-center gap-2">
        <Languages size={16} className="text-forest-500" />
        {LANG_LABELS.map((l) => (
          <button
            key={l.code}
            onClick={() => switchLanguage(l.code)}
            className={classNames(
              'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
              lang === l.code ? 'bg-forest-600 text-white' : 'bg-forest-50 text-forest-600 hover:bg-forest-100'
            )}
          >
            {l.native}
          </button>
        ))}
      </div>

      {/* Conversation */}
      <Card className="mt-6 flex flex-col p-0 overflow-hidden" >
        <div ref={scrollRef} className="h-[420px] overflow-y-auto p-5 scrollbar-thin space-y-4 bg-cream-50/30">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-forest-400">
              <Bot size={40} className="mb-3" />
              <p className="text-sm font-medium text-forest-600">
                {lang === 'te' ? 'నేను అగ్రి మిత్ర. మీ పంట అమ్మకం గురించి అడగండి.' : lang === 'hi' ? 'मैं अग्रि मित्र हूँ। अपनी फसल की बिक्री के बारे में पूछें।' : 'I am Agri Mitra. Ask me about selling your crop.'}
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={classNames('flex gap-3 animate-fade-up', m.role === 'farmer' ? 'flex-row-reverse' : '')}>
              <div className={classNames(
                'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                m.role === 'farmer' ? 'bg-forest-100 text-forest-600' : 'bg-forest-900 text-forest-200'
              )}>
                {m.role === 'farmer' ? <User size={18} /> : <Bot size={18} />}
              </div>
              <div className={classNames(
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line',
                m.role === 'farmer' ? 'bg-forest-600 text-white rounded-tr-md' : 'bg-white text-forest-800 border border-forest-50 rounded-tl-md shadow-sm'
              )}>
                <span>{m.text}</span>
                {m.role === 'assistant' && (
                  <button
                    type="button"
                    onClick={() => playVoice(m.text, m.lang)}
                    className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-forest-500 hover:text-forest-700"
                    title={m.lang === 'te' ? 'వినండి' : m.lang === 'hi' ? 'सुनें' : 'Listen'}
                  >
                    <Volume2 size={12} />
                    {m.lang === 'te' ? 'మళ్లీ వినండి' : m.lang === 'hi' ? 'फिर से सुनें' : 'Listen'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Suggestions */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-forest-50 bg-white">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                onClick={() => sendText(s[lang])}
                className="rounded-full bg-forest-50 px-3 py-1.5 text-xs font-medium text-forest-700 transition hover:bg-forest-100"
              >
                {s[lang]}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="border-t border-forest-50 bg-white p-3">
          {voiceError && (
            <div className="mb-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {voiceError}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleListen}
              className={classNames(
                'grid h-12 w-12 shrink-0 place-items-center rounded-xl transition active:scale-95',
                listening ? 'bg-rose-500 text-white' : 'bg-forest-600 text-white hover:bg-forest-700'
              )}
              title={listening ? 'Stop listening' : 'Speak'}
            >
              {listening ? <Square size={20} /> : <Mic size={22} />}
            </button>
            {speaking && (
              <button
                onClick={stopSpeak}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-forest-100 text-forest-600 hover:bg-forest-200 transition"
                title="Stop voice"
              >
                <Volume2 size={20} />
              </button>
            )}
            <input
              className="input-field"
              placeholder={lang === 'te' ? 'మీ ప్రశ్నను టైప్ చేయండి...' : lang === 'hi' ? 'अपना प्रश्न टाइप करें...' : 'Type your question...'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendText(input)}
            />
            <button
              onClick={() => sendText(input)}
              disabled={!input.trim()}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-forest-200 text-forest-900 transition hover:bg-forest-100 disabled:opacity-40 active:scale-95"
            >
              <Send size={20} />
            </button>
          </div>
          {/* Voice wave */}
          {(listening || speaking) && (
            <div className="mt-3 flex items-center justify-center gap-1 h-8">
              {Array.from({ length: 18 }).map((_, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-forest-400 animate-wave"
                  style={{
                    height: '28px',
                    animationDelay: `${i * 60}ms`,
                    animationDuration: `${0.6 + (i % 4) * 0.15}s`,
                  }}
                />
              ))}
            </div>
          )}
          {listening && (
            <p className="mt-1 text-center text-xs font-semibold text-rose-500">
              {lang === 'te' ? `వింటోంది… (${langNative(lang)})` : lang === 'hi' ? `सुन रहा है… (${langNative(lang)})` : `Listening… (${langNative(lang)})`}
            </p>
          )}
          {listening && interimText && (
            <p className="mt-1 text-center text-xs text-forest-700 italic">"{interimText}"</p>
          )}
          {speaking && !listening && (
            <p className="mt-1 text-center text-xs font-semibold text-forest-500">
              {lang === 'te' ? 'అగ్రి మిత్ర మాట్లాడుతోంది…' : lang === 'hi' ? 'अग्रि मित्र बोल रहा है…' : 'Agri Mitra is speaking…'}
            </p>
          )}
          {lang === 'te' && fallbackNotice && (
            <p className="mt-1.5 text-center text-[11px] text-forest-500">
              గమనిక: ఈ బ్రౌజర్‌లో నేటివ్ తెలుగు వాయిస్ లేదు — ప్రత్యామ్నాయ వాయిస్‌లో వినిపిస్తోంది. సహజ తెలుగు వాయిస్ కోసం Microsoft Edge లేదా Android Chrome వాడండి.
            </p>
          )}
        </div>
      </Card>

      <p className="mt-4 text-center text-xs text-forest-400">
        Uses your browser's speech recognition & synthesis. Text input always works as a fallback. No external AI API is connected — responses use a modular on-device layer.
      </p>
    </div>
  );
}
