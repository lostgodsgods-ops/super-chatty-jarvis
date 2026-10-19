/** Detect queries that need fresh external evidence or explicitly named recent years. */
const CURRENT_INFO_PATTERNS = [
  /\b(latest|current|currently|today|tonight|this week|this month|this year|real[- ]time|live|breaking|recent|updated|as of now)\b/i,
  /\b20(?:2[3-9]|[3-9]\d)\b/i,
  /\b(price|weather|news|score|result|election|release|version|status|availability|schedule|history|historical|timeline|recent years|year by year)\b/i,
  /\b(verify|fact[- ]?check|source|sources|citation|evidence|approved by|approved|hydroelectric|hydro[- ]?electric|installed capacity|\d{2,5}\s*mw|ccea|arunachal pradesh|kamala|kamle)\b/i,
  /\b(tavily|search (?:the )?web|web search|internet search|search online|browse (?:the )?web|live search|look up online)\b/i,
  /इंटरनेट|ऑनलाइन|खोजो|खोजकर|सर्च|टैविली|लाइव सर्च|अभी की जानकारी|ताज़ा|ताजा|लेटेस्ट|वर्तमान|मौजूदा|इस हफ्ते|इस महीने|इस साल|लाइव|समाचार|खबर|कीमत|मौसम|नतीजे|स्कोर|अपडेट|स्रोत|प्रमाण|पुष्टि|मंजूरी|जलविद्युत|परियोजना|इतिहास|पिछले साल|साल-दर-साल/i
];
export function requiresLiveSearch(message) {
  if (typeof message !== "string") return false;
  const normalized = message.trim();
  return Boolean(normalized) && CURRENT_INFO_PATTERNS.some(pattern => pattern.test(normalized));
}
