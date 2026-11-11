import type { Lang, ChatMessage } from './types';
import { buildContext, type DecisionContext } from './agents';
import { formatINR, uid } from './format';

// Modular AI service layer. A real LLM API can be connected by replacing
// `generateResponse` with an async fetch to an LLM endpoint. The signature
// and intent-classification layer below stay the same.

export type Intent =
  | 'best_market'
  | 'sell_or_wait'
  | 'earnings'
  | 'transport'
  | 'storage'
  | 'greeting'
  | 'fallback';

const CROP_LABELS: Record<string, { te: string; hi: string }> = {
  Tomatoes: { te: 'టమాటా', hi: 'टमाटर' },
  Onions: { te: 'ఉల్లిపాయ', hi: 'प्याज' },
  Paddy: { te: 'వరి', hi: 'धान' },
  Cotton: { te: 'పత్తి', hi: 'कपास' },
  Chillies: { te: 'మిరప', hi: 'मिर्च' },
  Maize: { te: 'మొక్కజొన్న', hi: 'मक्का' },
};

function cropLabel(crop: string, lang: Lang): string {
  if (lang === 'en') return crop;
  return CROP_LABELS[crop]?.[lang] ?? crop;
}

export function classifyIntent(text: string): Intent {
  const t = text.toLowerCase().trim();

  // Check sell-or-wait before storage so "Should I sell now or wait?" / "ఇప్పుడు అమ్మాలా లేక ఆగాలా?"
  // resolves to `sell_or_wait` instead of being swallowed by `storage`.
  if (
    /(sell now or wait|should i (sell|wait)|sell or store|ఇప్పుడు అమ్మాలా|అమ్మాలా.*ఆగ|ఆగాలా|ఆగి అమ్మ|వేచి ఉండ|తర్వాత అమ్మ|ఇప్పుడు.*లేక.*ఆగ|अभी बेच.*या|इंतजार कर.*या|बेच.*या.*इंतजार|इंतजार.*या.*बेच|बेचूं या रुक|रुकना चाहिए|aagala|ammala)/.test(t)
  ) {
    return 'sell_or_wait';
  }

  if (
    /(store|storage|cold storage|warehouse|godown|నిల్వ|స్టోరేజ్|కోల్డ్|గోదాము|గోడౌన్|గిడ్డంగి|వేర్‌?హౌస్|దాచి|దాచు|భద్రపర|भंडार|गोदाम|कोल्ड|रखना|nilva)/.test(t)
  ) {
    return 'storage';
  }

  if (
    /(transport|distance|km|kilometre|kilometer|vehicle|truck|lorry|closest|nearest|రవాణ|దూరం|ట్రాన్స్‌?పోర్ట్|లారీ|ఆటో|బాడుగ|వాహన|కిలోమీట|దగ్గర|సమీప|परिवहन|दूरी|किराया|ट्रक|नजदीक|ravana|dooram)/.test(t)
  ) {
    return 'transport';
  }

  // Check explicit "where / which market" before earnings so
  // "Where can I sell for best return?" / "ఎక్కడ అమ్మితే ఎక్కువ లాభం వస్తుంది?" resolves to `best_market`.
  if (
    /(where.*sell|which market|best market|compare market|ఎక్కడ.*అమ్మ|ఏ మార్కెట్|ఏ మండి|ఉత్తమ మార్కెట్|మంచి మార్కెట్|బెస్ట్ మార్కెట్|ఎక్కడ|कहाँ.*बेच|कौन\s*सा.*बाजार|कौन\s*सी.*मंडी|सबसे अच्छा बाजार|ekkada|ekada)/.test(t)
  ) {
    return 'best_market';
  }

  if (
    /(earn|profit|income|revenue|expense|commission|net\b|how much.*get|లాభ|ఆదాయ|నికర|ఎంత వస్తుం|ఎంత మిగుల|ఎంత డబ్బు|డబ్బు|సంపాద|ఖర్చు|కమిషన్|कमाई|लाभ|शुद्ध|मुनाफा|आय|खर्च|कितना मिल|labham|adaya)/.test(t)
  ) {
    return 'earnings';
  }

  if (
    /(market|mandi|price|rate|best|sell|మార్కెట్|మండి|ధర|రేటు|రేట్|ప్రైస్|అమ్మ|बाजार|मंडी|भाव|कीमत|दाम|बेच|dhara)/.test(t)
  ) {
    return 'best_market';
  }

  if (/(wait|ఆగి|ఆగ|इंतजार|रुक)/.test(t)) {
    return 'sell_or_wait';
  }

  if (
    /(hello|hi\b|hey|namaste|namaskar|good morning|నమస్తే|నమస్కారం|హాయ్|హలో|శుభోదయం|వందన|नमस्ते|नमस्कार|हेलो|हाय|namaskaram)/.test(t)
  ) {
    return 'greeting';
  }

  return 'fallback';
}

export function generateResponse(
  text: string,
  lang: Lang,
  ctx: DecisionContext
): string {
  const intent = classifyIntent(text);
  const crop = cropLabel(ctx.farmer.crop, lang);
  const best = ctx.best;

  if (intent === 'greeting') {
    return lang === 'te'
      ? `నమస్తే! నేను అగ్రి మిత్ర. మీ ${crop} పంటను అమ్మడానికి సహాయం చేస్తాను. ఏమి తెలుసుకోవాలనుకుంటున్నారు?`
      : lang === 'hi'
      ? `नमस्ते! मैं अग्रि मित्र हूँ। आपकी ${crop} बेचने में मदद करूँगा। आप क्या जानना चाहते हैं?`
      : `Hello! I'm Agri Mitra. I'll help you sell your ${crop} smartly. What would you like to know?`;
  }

  if (!best || ctx.markets.length === 0) {
    return lang === 'te'
      ? `ప్రస్తుతం ${crop} పంటకు మార్కెట్ డేటా అందుబాటులో లేదు. దయచేసి ప్రొఫైల్‌లో టమాటా ఎంచుకుని ప్రయత్నించండి.`
      : lang === 'hi'
      ? `फिलहाल ${crop} के लिए बाजार डेटा उपलब्ध नहीं है। कृपया प्रोफ़ाइल में टमाटर चुनकर देखें।`
      : `Market demonstration data is not available for ${crop} yet. Please select Tomatoes in your profile to explore full market comparisons.`;
  }

  const sorted = [...ctx.earnings].sort((a, b) => b.netEarnings - a.netEarnings);
  const top3 = sorted.slice(0, 3);

  switch (intent) {
    case 'best_market': {
      const lines = top3.map((r) =>
        lang === 'te'
          ? `${r.marketName}: నికర లాభం ${formatINR(r.netEarnings)} (క్వింటాల్‌కు ₹${r.pricePerQuintal}, రవాణా ${formatINR(r.transport)})`
          : lang === 'hi'
          ? `${r.marketName}: शुद्ध लाभ ${formatINR(r.netEarnings)} (₹${r.pricePerQuintal}/क्विंटल, परिवहन ${formatINR(r.transport)})`
          : `${r.marketName}: ${formatINR(r.netEarnings)} net (₹${r.pricePerQuintal}/q, transport ${formatINR(r.transport)})`
      );
      return lang === 'te'
        ? `మీ ${crop} కోసం ${top3.length} మార్కెట్ అవకాశాలు ఉన్నాయి. ${best.marketName} అత్యుత్తమ నికర లాభం ${formatINR(best.netEarnings)} ఇస్తుంది. వేరే మార్కెట్‌లో ధర ఎక్కువగా ఉన్నా, రవాణా ఖర్చు తక్కువగా ఉండటం వల్ల ఇక్కడ మీకు ఎక్కువ మిగులుతుంది.\n${lines.join('\n')}`
        : lang === 'hi'
        ? `आपकी ${crop} के लिए ${top3.length} विकल्प मिले। ${best.marketName} सर्वश्रेष्ठ शुद्ध लाभ ${formatINR(best.netEarnings)} देता है। भले ही अन्य बाजार में कीमत अधिक हो, कम परिवहन खर्च के कारण यह बेहतर है।\n${lines.join('\n')}`
        : `I found ${top3.length} market opportunities for your ${crop}. ${best.marketName} offers the best net return of ${formatINR(best.netEarnings)}. Although another market may list a higher price, ${best.marketName} has lower transport, so you keep more.\n${lines.join('\n')}`;
    }

    case 'sell_or_wait': {
      const up = ctx.storage?.storeScenarios.find((s) => s.label === 'Prices rise 20%');
      const down = ctx.storage?.storeScenarios.find((s) => s.label === 'Prices drop 10%');
      return lang === 'te'
        ? `ఇప్పుడు అమ్మితే ${formatINR(best.netEarnings)} వస్తుంది. 7 రోజుల నిల్వ తర్వాత ధరలు 20% పెరిగితే ${up ? formatINR(up.netEarnings) : '—'} రావచ్చు, కానీ 10% పడితే ${down ? formatINR(down.netEarnings) : '—'} మాత్రమే. నిల్వ ఖర్చు కూడా ఉంటుంది.`
        : lang === 'hi'
        ? `अभी बेचने पर ${formatINR(best.netEarnings)} मिलेंगे। 7 दिन भंडारण के बाद कीमत 20% बढ़े तो ${up ? formatINR(up.netEarnings) : '—'}, लेकिन 10% गिरे तो ${down ? formatINR(down.netEarnings) : '—'}। भंडारण खर्च भी जोड़ें।`
        : `Selling now earns ${formatINR(best.netEarnings)}. If you store 7 days and prices rise 20%, you could earn ${up ? formatINR(up.netEarnings) : '—'} — but if they drop 10%, only ${down ? formatINR(down.netEarnings) : '—'}. Storage adds cost too.`;
    }

    case 'earnings': {
      return lang === 'te'
        ? `మీ ${ctx.farmer.quantityQuintals} క్వింటాళ్లకు ${best.marketName}లో నికర లాభం ${formatINR(best.netEarnings)}. మొత్తం ఆదాయం ${formatINR(best.grossRevenue)}, ఖర్చులు ${formatINR(best.totalExpenses)}.`
        : lang === 'hi'
        ? `आपके ${ctx.farmer.quantityQuintals} क्विंटल का ${best.marketName} में शुद्ध लाभ ${formatINR(best.netEarnings)}। सकल ${formatINR(best.grossRevenue)}, खर्च ${formatINR(best.totalExpenses)}।`
        : `For ${ctx.farmer.quantityQuintals} quintals at ${best.marketName}, your net earnings are ${formatINR(best.netEarnings)}. Gross ${formatINR(best.grossRevenue)} minus expenses ${formatINR(best.totalExpenses)}.`;
    }

    case 'transport': {
      const near = ctx.markets.reduce((a, b) => (a.distanceKm < b.distanceKm ? a : b));
      return lang === 'te'
        ? `${near.name} అత్యంత సమీపంలో (${near.distanceKm} km, రవాణా ${formatINR(near.transportCost)}). దూరం పెరిగితే ఖర్చు పెరుగుతుంది, నికర లాభం తగ్గుతుంది.`
        : lang === 'hi'
        ? `${near.name} सबसे नज़दीक (${near.distanceKm} कि.मी., परिवहन ${formatINR(near.transportCost)})। दूरी बढ़ेगी तो खर्च बढ़ेगा, शुद्ध लाभ घटेगा।`
        : `${near.name} is closest (${near.distanceKm} km, transport ${formatINR(near.transportCost)}). Greater distance means higher cost and lower net earnings.`;
    }

    case 'storage': {
      const fac = ctx.storageFacility;
      return lang === 'te'
        ? `${fac?.name ?? 'నిల్వ'} — రోజుకు క్వింటాల్‌కు ₹${fac?.chargePerQuintalPerDay ?? '—'}. 7 రోజుల నిల్వ ఖర్చు ${formatINR((fac?.chargePerQuintalPerDay ?? 0) * ctx.farmer.quantityQuintals * 7)}. భవిష్యత్తు ధరలు నిశ్చయం కాదు.`
        : lang === 'hi'
        ? `${fac?.name ?? 'भंडारण'} — ₹${fac?.chargePerQuintalPerDay ?? '—'}/क्विंटल/दिन। 7 दिन खर्च ${formatINR((fac?.chargePerQuintalPerDay ?? 0) * ctx.farmer.quantityQuintals * 7)}। भविष्य की कीमतें अनिश्चित हैं।`
        : `${fac?.name ?? 'Storage'} — ₹${fac?.chargePerQuintalPerDay ?? '—'}/quintal/day. 7-day storage cost ${formatINR((fac?.chargePerQuintalPerDay ?? 0) * ctx.farmer.quantityQuintals * 7)}. Future prices are uncertain.`;
    }

    default:
      return lang === 'te'
        ? `నేను మీ ${crop} అమ్మకంపై సహాయం చేయగలను. ఉత్తమ మార్కెట్, నికర లాభం, రవాణా లేదా నిల్వ గురించి అడగండి.`
        : lang === 'hi'
        ? `मैं आपकी ${crop} बिक्री में मदद कर सकता हूँ। बेहतरीन बाजार, लाभ, परिवहन या भंडारण के बारे में पूछें।`
        : `I can help with your ${crop} sale. Ask about the best market, net earnings, transport, or storage.`;
  }
}

export function buildContextFromFarmer(farmer: import('./types').FarmerProfile): DecisionContext {
  return buildContext(farmer);
}

export function makeMessage(
  role: ChatMessage['role'],
  text: string,
  lang: Lang
): ChatMessage {
  return { id: uid('msg'), role, text, lang, timestamp: Date.now() };
}

// --- Speech recognition & synthesis wrappers (browser APIs) ---

export type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & {
  isFinal?: boolean;
};

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((e: { results: ArrayLike<SpeechRecognitionResultLike>; resultIndex?: number }) => void) | null;
  onerror: ((e?: { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
};

export function getSpeechRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

export function langToBcp47(lang: Lang): string {
  if (lang === 'te') return 'te-IN';
  if (lang === 'hi') return 'hi-IN';
  return 'en-IN';
}

// Transliterate Telugu script to Devanagari so browsers without a native Telugu TTS voice
// (such as Desktop Chrome on Windows, which ships `hi-IN` but not `te-IN`) can still
// pronounce Telugu words phonetically instead of remaining silent.
export function teluguToDevanagari(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x200c || code === 0x200d || code === 0x0c55 || code === 0x0c56) {
      continue;
    }
    if (code === 0x0c01) {
      out += '\u0901';
    } else if (code === 0x0c02) {
      const next = text.charCodeAt(i + 1);
      const nextIsStop = next >= 0x0c15 && next <= 0x0c2e;
      out += nextIsStop ? '\u0902' : 'म्';
    } else if (code === 0x0c03) {
      out += '\u0903';
    } else if (code >= 0x0c05 && code <= 0x0c0b) {
      out += String.fromCharCode(code - 0x0300);
    } else if (code === 0x0c0e || code === 0x0c0f) {
      out += 'ए';
    } else if (code === 0x0c10) {
      out += 'ऐ';
    } else if (code === 0x0c12 || code === 0x0c13) {
      out += 'ओ';
    } else if (code === 0x0c14) {
      out += 'औ';
    } else if (
      (code >= 0x0c15 && code <= 0x0c28) ||
      (code >= 0x0c2a && code <= 0x0c30) ||
      (code >= 0x0c35 && code <= 0x0c39) ||
      (code >= 0x0c3e && code <= 0x0c44)
    ) {
      out += String.fromCharCode(code - 0x0300);
    } else if (code === 0x0c31) {
      out += 'र';
    } else if (code === 0x0c32 || code === 0x0c33 || code === 0x0c34) {
      out += 'ल';
    } else if (code === 0x0c46 || code === 0x0c47) {
      out += 'े';
    } else if (code === 0x0c48) {
      out += 'ै';
    } else if (code === 0x0c4a || code === 0x0c4b) {
      out += 'ो';
    } else if (code === 0x0c4c) {
      out += 'ौ';
    } else if (code === 0x0c4d) {
      out += '्';
    } else if (code >= 0x0c66 && code <= 0x0c6f) {
      out += String(code - 0x0c66);
    } else {
      out += text[i];
    }
  }
  return out;
}

const TE_VOWELS: Record<number, string> = {
  0x0c05: 'a', 0x0c06: 'aa', 0x0c07: 'i', 0x0c08: 'ee',
  0x0c09: 'u', 0x0c0a: 'oo', 0x0c0b: 'ru',
  0x0c0e: 'e', 0x0c0f: 'e', 0x0c10: 'ai',
  0x0c12: 'o', 0x0c13: 'o', 0x0c14: 'au',
};

const TE_CONSONANTS: Record<number, string> = {
  0x0c15: 'k', 0x0c16: 'kh', 0x0c17: 'g', 0x0c18: 'gh', 0x0c19: 'ng',
  0x0c1a: 'ch', 0x0c1b: 'chh', 0x0c1c: 'j', 0x0c1d: 'jh', 0x0c1e: 'ny',
  0x0c1f: 't', 0x0c20: 'th', 0x0c21: 'd', 0x0c22: 'dh', 0x0c23: 'n',
  0x0c24: 't', 0x0c25: 'th', 0x0c26: 'd', 0x0c27: 'dh', 0x0c28: 'n',
  0x0c2a: 'p', 0x0c2b: 'ph', 0x0c2c: 'b', 0x0c2d: 'bh', 0x0c2e: 'm',
  0x0c2f: 'y', 0x0c30: 'r', 0x0c31: 'r', 0x0c32: 'l', 0x0c33: 'l',
  0x0c34: 'l', 0x0c35: 'v', 0x0c36: 'sh', 0x0c37: 'sh', 0x0c38: 's', 0x0c39: 'h',
};

const TE_MATRAS: Record<number, string> = {
  0x0c3e: 'aa', 0x0c3f: 'i', 0x0c40: 'ee',
  0x0c41: 'u', 0x0c42: 'oo', 0x0c43: 'ru', 0x0c44: 'roo',
  0x0c46: 'e', 0x0c47: 'e', 0x0c48: 'ai',
  0x0c4a: 'o', 0x0c4b: 'o', 0x0c4c: 'au',
};

export function teluguToLatin(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x200c || code === 0x200d || code === 0x0c55 || code === 0x0c56) {
      continue;
    }
    if (TE_VOWELS[code]) {
      out += TE_VOWELS[code];
    } else if (TE_CONSONANTS[code]) {
      const next = text.charCodeAt(i + 1);
      out += TE_CONSONANTS[code];
      if (next === 0x0c4d) {
        i++; // virama suppresses inherent 'a'
      } else if (TE_MATRAS[next]) {
        out += TE_MATRAS[next];
        i++;
      } else {
        out += 'a';
      }
    } else if (code === 0x0c02) {
      const next = text.charCodeAt(i + 1);
      out += next >= 0x0c15 && next <= 0x0c39 ? 'n' : 'm';
    } else if (code === 0x0c01) {
      out += 'n';
    } else if (code === 0x0c03) {
      out += 'h';
    } else if (code >= 0x0c66 && code <= 0x0c6f) {
      out += String(code - 0x0c66);
    } else {
      out += text[i];
    }
  }
  return out;
}

function prepareTextForSpeech(text: string, lang: Lang): string {
  const rupeeWord = lang === 'te' ? 'రూపాయలు' : lang === 'hi' ? 'रुपये' : 'rupees';
  const kmWord = lang === 'te' ? 'కిలోమీటర్లు' : lang === 'hi' ? 'किलोमीटर' : 'kilometers';
  const pctWord = lang === 'te' ? 'శాతం' : lang === 'hi' ? 'प्रतिशत' : 'percent';

  return text
    // Strip Indian grouping commas inside numbers so TTS reads e.g. 100000 cleanly
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/₹\s*(\d+)/g, `$1 ${rupeeWord}`)
    .replace(/(\d+)\s*km\b/gi, `$1 ${kmWord}`)
    .replace(/(\d+)\s*%/g, `$1 ${pctWord}`)
    .replace(/\s*—\s*/g, ', ')
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSpeechChunks(text: string, maxLen = 160): string[] {
  const sentences = text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const s of sentences) {
    if (s.length <= maxLen) {
      chunks.push(s);
      continue;
    }
    const parts = s.split(/,\s+/);
    let current = '';
    for (const part of parts) {
      const candidate = current ? `${current}, ${part}` : part;
      if (candidate.length <= maxLen) {
        current = candidate;
      } else {
        if (current) chunks.push(current);
        current = part;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [text];
}

export async function ensureVoicesLoaded(timeoutMs = 700): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return [];
  const synth = window.speechSynthesis;
  const initial = synth.getVoices();
  if (initial.length > 0) return initial;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener?.('voiceschanged', onVoices);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const onVoices = () => {
      if (synth.getVoices().length > 0) finish();
    };
    synth.addEventListener?.('voiceschanged', onVoices);
    const timer = setTimeout(finish, timeoutMs);
  });
}

function scoreVoice(v: SpeechSynthesisVoice, lang: Lang): number {
  const vl = v.lang.toLowerCase().replace('_', '-');
  const vn = v.name.toLowerCase();

  let score = -1;
  if (lang === 'te') {
    if (vl === 'te-in') score = 100;
    else if (vl.startsWith('te')) score = 85;
    else if (vn.includes('telugu') || vn.includes('తెలుగు') || vn.includes('shruti') || vn.includes('mohan')) score = 80;
  } else if (lang === 'hi') {
    if (vl === 'hi-in') score = 100;
    else if (vl.startsWith('hi')) score = 85;
    else if (vn.includes('hindi') || vn.includes('हिन्दी')) score = 80;
  } else {
    if (vl === 'en-in') score = 100;
    else if (vl === 'en-gb' || vl === 'en-us') score = 90;
    else if (vl.startsWith('en')) score = 80;
  }

  if (score < 0) return -1;
  if (vn.includes('natural') || vn.includes('online') || vn.includes('google')) score += 15;
  if (!v.localService) score += 5;
  return score;
}

export function findVoiceForLang(
  voices: SpeechSynthesisVoice[],
  lang: Lang
): SpeechSynthesisVoice | null {
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;
  for (const v of voices) {
    const s = scoreVoice(v, lang);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return best;
}

export interface SpeakMeta {
  nativeVoiceAvailable: boolean;
  usedFallbackVoice: boolean;
}

let activeSpeakToken = 0;
let pendingStartTimer: ReturnType<typeof setTimeout> | null = null;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers(): void {
  if (pendingStartTimer !== null) {
    clearTimeout(pendingStartTimer);
    pendingStartTimer = null;
  }
  if (watchdogTimer !== null) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

export function speak(
  text: string,
  lang: Lang,
  onEnd?: () => void,
  onMeta?: (meta: SpeakMeta) => void
): void {
  if (!('speechSynthesis' in window) || !text.trim()) {
    onEnd?.();
    return;
  }

  const token = ++activeSpeakToken;
  clearTimers();

  const synth = window.speechSynthesis;
  const wasActive = synth.speaking || synth.pending;
  if (wasActive) {
    synth.cancel();
  }

  const startPlayback = async () => {
    const voices = await ensureVoicesLoaded();
    if (token !== activeSpeakToken) return;

    const nativeVoice = findVoiceForLang(voices, lang);
    let chosenVoice = nativeVoice;
    let utterLang = langToBcp47(lang);
    let speechText = prepareTextForSpeech(text, lang);
    let usedFallbackVoice = false;

    if (lang === 'te' && !nativeVoice) {
      const hiVoice = findVoiceForLang(voices, 'hi');
      const enVoice = findVoiceForLang(voices, 'en');
      if (hiVoice) {
        chosenVoice = hiVoice;
        utterLang = hiVoice.lang || 'hi-IN';
        speechText = teluguToDevanagari(speechText);
        usedFallbackVoice = true;
      } else if (enVoice) {
        chosenVoice = enVoice;
        utterLang = enVoice.lang || 'en-IN';
        speechText = teluguToLatin(speechText);
        usedFallbackVoice = true;
      }
    }

    onMeta?.({
      nativeVoiceAvailable: Boolean(nativeVoice),
      usedFallbackVoice,
    });

    const chunks = splitSpeechChunks(speechText);
    let idx = 0;

    const finish = () => {
      clearTimers();
      if (token === activeSpeakToken) {
        onEnd?.();
      }
    };

    const speakNext = () => {
      if (token !== activeSpeakToken) return;
      if (idx >= chunks.length) {
        finish();
        return;
      }

      const chunk = chunks[idx++];
      const utter = new SpeechSynthesisUtterance(chunk);
      utter.lang = utterLang;
      if (chosenVoice) {
        utter.voice = chosenVoice;
      }
      utter.rate = lang === 'te' ? 0.92 : 0.95;

      let chunkDone = false;
      const onChunkFinished = (hadError: boolean) => {
        if (chunkDone) return;
        chunkDone = true;
        if (watchdogTimer !== null) {
          clearTimeout(watchdogTimer);
          watchdogTimer = null;
        }
        if (token !== activeSpeakToken) return;
        if (hadError) {
          finish();
        } else {
          speakNext();
        }
      };

      utter.onend = () => onChunkFinished(false);
      utter.onerror = () => onChunkFinished(true);

      // Watchdog prevents `speaking` state from hanging if browser TTS drops `onend`.
      const maxWaitMs = Math.max(8000, chunk.length * 180);
      watchdogTimer = setTimeout(() => onChunkFinished(false), maxWaitMs);

      synth.resume?.();
      synth.speak(utter);
    };

    speakNext();
  };

  // Chromium drops new utterances if `speak()` runs in the same tick as `cancel()`.
  if (wasActive) {
    pendingStartTimer = setTimeout(() => {
      pendingStartTimer = null;
      if (token === activeSpeakToken) {
        void startPlayback();
      }
    }, 50);
  } else {
    void startPlayback();
  }
}

export function stopSpeaking(): void {
  activeSpeakToken++;
  clearTimers();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
