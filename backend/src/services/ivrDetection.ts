const IVR_PATTERNS: RegExp[] = [
  /press\s+\d/i,
  /para\s+español/i,
  /for\s+english/i,
  /please\s+hold/i,
  /your\s+call\s+is\s+important/i,
  /our\s+menu\s+has\s+(recently\s+)?changed/i,
  /listen\s+(carefully\s+)?as\s+our\s+(menu\s+)?options/i,
  /to\s+speak\s+with\s+a\s+(representative|agent|operator)/i,
  /for\s+(sales|support|billing|service)/i,
  /if\s+you\s+know\s+your\s+(party's?\s+)?extension/i,
  /dial\s+\d+\s+to/i,
  /main\s+menu/i,
  /leave\s+a\s+message/i,
  /at\s+the\s+tone/i,
  /after\s+the\s+beep/i,
  /not\s+available\s+(right\s+now|at\s+this\s+time)/i,
  /voicemail/i,
  /automated\s+(phone\s+|voice\s+)?system/i,
];

export interface IvrClassifyResult {
  isIvr: boolean;
  matchedPhrase: string | null;
}

export function classifyIvr(text: string): IvrClassifyResult {
  for (const pattern of IVR_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { isIvr: true, matchedPhrase: match[0] };
    }
  }
  return { isIvr: false, matchedPhrase: null };
}
