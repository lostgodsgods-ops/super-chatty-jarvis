/** Detect queries that require fresh external evidence before model synthesis. */
const CURRENT_INFO_PATTERNS = [
  /\b(latest|current|currently|today|tonight|this week|this month|this year|real[- ]time|live|breaking|recent|updated|as of now|2026)\b/i,
  /\b(price|weather|news|score|result|election|release|version|status|availability|schedule)\b/i,
  /\b(verify|fact[- ]?check|source|sources|citation|evidence|approved by|approved|hydroelectric|hydro[- ]?electric|installed capacity|\d{2,5}\s*mw|ccea|arunachal pradesh|kamala|kamle)\b/i,
  /अभी|आज|ताज़ा|ताजा|लेटेस्ट|वर्तमान|मौजूदा|इस हफ्ते|इस महीने|इस साल|लाइव|समाचार|खबर|कीमत|मौसम|नतीजे|स्कोर|अपडेट|स्रोत|प्रमाण|पुष्टि|मंजूरी|जलविद्युत|परियोजना/i
];
export function requiresLiveSearch(message) {
  if (typeof message !== "string") return false;
  const normalized = message.trim();
  return Boolean(normalized) && CURRENT_INFO_PATTERNS.some(pattern => pattern.test(normalized));
}
