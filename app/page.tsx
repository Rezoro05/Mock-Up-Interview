"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type VisaType = "B1/B2" | "F-1" | "J-1";
type Step = "landing" | "briefing" | "interview" | "processing" | "results";

type QuestionSpec = {
  prompt: string;
  criteria: string[][];
  scored?: boolean;
};

type AnswerAnalysis = {
  question: string;
  transcript: string;
  duration: number;
  wordCount: number;
  fillerCount: number;
  wordsPerMinute: number;
  relevance: number;
  clarity: number;
  delivery: number;
  completeness: number;
  score: number;
};

type RecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
};

type RecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
};

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => RecognitionLike;

const interviewQuestions: Record<VisaType, QuestionSpec[]> = {
  "B1/B2": [
    { prompt: "What is the purpose of your trip to the United States?", criteria: [["tourism", "vacation", "visit", "business", "conference"], ["travel", "trip", "united states", "u.s."]] },
    { prompt: "Which places will you visit, and how long will you stay?", criteria: [["day", "week", "month", "date"], ["new york", "california", "florida", "washington", "boston", "chicago", "hotel", "city", "state"]] },
    { prompt: "Who will pay for your trip?", criteria: [["myself", "I will", "employer", "company", "parents", "family", "sponsor"], ["salary", "savings", "budget", "cost", "pay"]] },
    { prompt: "Tell me about your current job and a normal workday.", criteria: [["work", "job", "employed", "company", "business"], ["manage", "design", "teach", "develop", "meet", "client", "responsible", "daily"]] },
    { prompt: "What plans and responsibilities will bring you back home?", criteria: [["return", "back", "home"], ["job", "family", "children", "business", "study", "property", "responsibility", "project"]] },
  ],
  "F-1": [
    { prompt: "Why did you choose this university and program?", criteria: [["university", "college", "school"], ["program", "course", "degree", "faculty", "curriculum"], ["because", "choose", "selected"]] },
    { prompt: "How does this program support your career plans?", criteria: [["career", "profession", "job", "work"], ["skill", "knowledge", "experience", "qualification"], ["return", "home", "future"]] },
    { prompt: "Who will pay for your tuition and living costs?", criteria: [["myself", "parents", "family", "sponsor", "scholarship", "employer"], ["tuition", "living", "cost", "fund", "savings", "income"]] },
    { prompt: "What is your academic background?", criteria: [["degree", "school", "university", "college", "graduated"], ["studied", "major", "subject", "course", "academic"]] },
    { prompt: "What will you do after you complete your studies?", criteria: [["return", "back", "home"], ["career", "job", "work", "business", "profession"], ["after", "graduate", "complete", "finish"]] },
  ],
  "J-1": [
    { prompt: "Why is this exchange program important to you?", criteria: [["exchange", "program"], ["experience", "skill", "learn", "training", "culture"], ["career", "future", "work"]] },
    { prompt: "What will you do during the program?", criteria: [["training", "internship", "research", "study", "workshop", "activity"], ["program", "host", "organization", "sponsor"]] },
    { prompt: "Who is sponsoring your trip and expenses?", criteria: [["sponsor", "organization", "company", "program", "myself", "family"], ["cost", "expense", "fund", "pay", "stipend", "salary"]] },
    { prompt: "How will you use this experience after you return home?", criteria: [["return", "back", "home"], ["experience", "skill", "knowledge"], ["career", "job", "work", "business", "project"]] },
    { prompt: "What responsibilities or plans are waiting for you at home?", criteria: [["home", "return", "back"], ["job", "family", "children", "business", "study", "responsibility", "project"]] },
  ],
};

const warmupQuestion: QuestionSpec = {
  prompt: "Hello. How are you today?",
  criteria: [],
  scored: false,
};

const mandatoryQuestions: QuestionSpec[] = [
  {
    prompt: "What's the purpose of your visit?",
    criteria: [
      ["tourism", "vacation", "visit", "business", "conference", "study", "exchange", "training", "internship"],
      ["travel", "trip", "united states", "u.s.", "university", "program", "meeting", "family"],
    ],
  },
  {
    prompt: "Where will you stay in the United States?",
    criteria: [
      ["hotel", "hostel", "apartment", "campus", "dorm", "family", "friend", "relative", "housing", "accommodation"],
      ["address", "street", "city", "new york", "california", "florida", "washington", "boston", "chicago", "with my", "reservation"],
    ],
  },
  {
    prompt: "Where do you work?",
    criteria: [
      ["work at", "work for", "employed by", "company", "organization", "business", "school", "university", "hospital", "government"],
      ["manager", "engineer", "teacher", "developer", "doctor", "owner", "student", "position", "role", "responsible"],
    ],
  },
];

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function selectInterviewQuestions(visa: VisaType) {
  const randomVisaQuestions = shuffled(interviewQuestions[visa]).slice(0, 2);
  const [purposeQuestion, ...otherMandatoryQuestions] = mandatoryQuestions;
  return [warmupQuestion, purposeQuestion, ...shuffled([...otherMandatoryQuestions, ...randomVisaQuestions])];
}

function inferVisaType(transcript: string): VisaType {
  const lower = transcript.toLowerCase();
  if (/\b(university|college|student|study|degree|academic|tuition|campus)\b/.test(lower)) return "F-1";
  if (/\b(exchange|internship|intern|training|trainee|research|cultural program|j-?1)\b/.test(lower)) return "J-1";
  return "B1/B2";
}

const fillerPattern = /\b(um+|uh+|erm+|like|you know|basically|actually|sort of|kind of)\b/gi;
const evasivePattern = /\b(i do not know|i don't know|not sure|maybe|probably|i guess|whatever)\b/i;

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function analyzeAnswer(question: QuestionSpec, transcript: string, duration: number, confidence: number | null, voiceRatio: number): AnswerAnalysis {
  const cleanTranscript = transcript.trim().replace(/\s+/g, " ");
  const lower = cleanTranscript.toLowerCase();
  const words = cleanTranscript ? cleanTranscript.split(/\s+/) : [];
  const fillerCount = (lower.match(fillerPattern) ?? []).length;
  const wordsPerMinute = duration > 0 ? Math.round(words.length / (duration / 60)) : 0;
  const matchedCriteria = question.criteria.filter((group) => group.some((term) => lower.includes(term.toLowerCase()))).length;
  const relevance = Math.round((matchedCriteria / question.criteria.length) * 100);

  let lengthQuality = 100;
  if (words.length < 6) lengthQuality = 5;
  else if (words.length < 12) lengthQuality = 38;
  else if (words.length > 75) lengthQuality = 42;
  else if (words.length > 55) lengthQuality = 68;

  let paceQuality = 100;
  if (wordsPerMinute < 65 || wordsPerMinute > 205) paceQuality = 20;
  else if (wordsPerMinute < 85 || wordsPerMinute > 175) paceQuality = 55;

  const fillerQuality = fillerCount === 0 ? 100 : fillerCount === 1 ? 78 : fillerCount <= 3 ? 52 : 18;
  const clarity = Math.round(lengthQuality * 0.4 + paceQuality * 0.35 + fillerQuality * 0.25);
  const recognitionConfidence = confidence === null || confidence <= 0 ? 35 : confidence * 100;
  const delivery = Math.round(clamp(recognitionConfidence * 0.65 + Math.min(100, voiceRatio * 180) * 0.35));
  const completeness = Math.round(lengthQuality * 0.45 + relevance * 0.55);

  let score = Math.round(relevance * 0.55 + clarity * 0.15 + delivery * 0.1 + completeness * 0.2);
  if (!cleanTranscript) score = 0;
  else if (words.length < 6) score = Math.min(score, 15);
  else if (evasivePattern.test(lower)) score = Math.min(score, 20);
  else if (relevance === 0) score = Math.min(score, 20);
  else if (relevance < 50) score = Math.min(score, 40);
  else if (matchedCriteria < question.criteria.length) score = Math.min(score, 68);

  return {
    question: question.prompt,
    transcript: cleanTranscript,
    duration,
    wordCount: words.length,
    fillerCount,
    wordsPerMinute,
    relevance,
    clarity,
    delivery,
    completeness,
    score,
  };
}

function BrandMark() {
  return <img className="brand-logo" src="/econsul-logo.png" alt="eConsul" />;
}

export default function Home() {
  const [step, setStep] = useState<Step>("landing");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [permissionError, setPermissionError] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [demoSignedIn, setDemoSignedIn] = useState(false);
  const [isQuestionSpeaking, setIsQuestionSpeaking] = useState(false);
  const [answerSeconds, setAnswerSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [answers, setAnswers] = useState<AnswerAnalysis[]>([]);
  const [recognitionSupported, setRecognitionSupported] = useState(true);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const answerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answerStartedAtRef = useRef(0);
  const answerActiveRef = useRef(false);
  const transcriptRef = useRef("");
  const confidenceSamplesRef = useRef<number[]>([]);
  const voiceFramesRef = useRef(0);
  const totalFramesRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const speechVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const autoFinishRef = useRef<() => void>(() => {});

  const [questions, setQuestions] = useState<QuestionSpec[]>(() => selectInterviewQuestions("B1/B2"));

  const stopAnswerCapture = useCallback(() => {
    answerActiveRef.current = false;
    if (answerTimerRef.current) clearInterval(answerTimerRef.current);
    answerTimerRef.current = null;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
  }, []);

  const releaseMicrophone = useCallback(() => {
    stopAnswerCapture();
    window.speechSynthesis?.cancel();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, [stopAnswerCapture]);

  useEffect(() => () => releaseMicrophone(), [releaseMicrophone]);

  useEffect(() => {
    const loadVoices = () => { speechVoicesRef.current = window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const startVoiceActivityAnalysis = useCallback((stream: MediaStream) => {
    const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioContextRef.current = context;
    const samples = new Uint8Array(analyser.fftSize);
    const measure = () => {
      analyser.getByteTimeDomainData(samples);
      if (answerActiveRef.current) {
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / samples.length);
        totalFramesRef.current += 1;
        if (rms > 0.025) voiceFramesRef.current += 1;
      }
      animationFrameRef.current = requestAnimationFrame(measure);
    };
    measure();
  }, []);

  const getRecognitionConstructor = useCallback(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
  }, []);

  const startAnswerCapture = useCallback(() => {
    transcriptRef.current = "";
    confidenceSamplesRef.current = [];
    voiceFramesRef.current = 0;
    totalFramesRef.current = 0;
    answerStartedAtRef.current = Date.now();
    answerActiveRef.current = true;
    setAnswerSeconds(0);
    setLiveTranscript("");
    setIsQuestionSpeaking(false);
    answerTimerRef.current = setInterval(() => setAnswerSeconds((value) => value + 1), 1000);

    const Recognition = getRecognitionConstructor();
    setRecognitionSupported(Boolean(Recognition));
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let interim = "";
      let finalAddition = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalAddition += ` ${text}`;
          if (result[0]?.confidence > 0) confidenceSamplesRef.current.push(result[0].confidence);
        } else {
          interim += ` ${text}`;
        }
      }
      if (finalAddition) transcriptRef.current = `${transcriptRef.current} ${finalAddition}`.trim();
      setLiveTranscript(`${transcriptRef.current} ${interim}`.trim());
    };
    recognition.onerror = () => undefined;
    recognition.onend = () => {
      if (!answerActiveRef.current) return;
      window.setTimeout(() => {
        if (!answerActiveRef.current) return;
        try { recognition.start(); } catch { /* browser is restarting */ }
      }, 180);
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { setRecognitionSupported(false); }
  }, [getRecognitionConstructor]);

  const speakQuestion = useCallback(() => {
    if (step !== "interview") return;
    stopAnswerCapture();
    setLiveTranscript("");
    setAnswerSeconds(0);
    setIsQuestionSpeaking(true);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(questions[questionIndex].prompt);
    utterance.lang = "en-US";
    const availableVoices = window.speechSynthesis.getVoices();
    const voices = availableVoices.length ? availableVoices : speechVoicesRef.current;
    const naturalVoiceNames = ["microsoft guy", "google us english", "neural", "natural", "premium", "enhanced", "aaron", "daniel", "alex", "david", "eddy", "evan", "nathan", "reed"];
    const voiceScore = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      const languageScore = voice.lang.toLowerCase().startsWith("en-us") ? 30 : voice.lang.toLowerCase().startsWith("en") ? 10 : 0;
      const qualityScore = naturalVoiceNames.reduce((score, token, index) => name.includes(token) ? Math.max(score, 40 - index) : score, 0);
      return languageScore + qualityScore + (voice.localService ? 0 : 5);
    };
    const maleVoice = [...voices].filter((voice) => voice.lang.toLowerCase().startsWith("en")).sort((left, right) => voiceScore(right) - voiceScore(left))[0];
    if (maleVoice) utterance.voice = maleVoice;
    utterance.rate = 0.93;
    utterance.pitch = 0.98;
    utterance.volume = 1;
    utterance.onend = startAnswerCapture;
    utterance.onerror = startAnswerCapture;
    window.speechSynthesis.speak(utterance);
  }, [questionIndex, questions, startAnswerCapture, step, stopAnswerCapture]);

  useEffect(() => {
    if (step !== "interview") return;
    const playbackDelay = window.setTimeout(speakQuestion, 250);
    return () => window.clearTimeout(playbackDelay);
  }, [questionIndex, speakQuestion, step]);

  const beginInterview = async () => {
    setPermissionError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.start();
      startVoiceActivityAnalysis(stream);
      setQuestions(selectInterviewQuestions("B1/B2"));
      setAnswers([]);
      setQuestionIndex(0);
      setStep("interview");
    } catch {
      setPermissionError("Microphone access is required for the interview. Allow access in your browser and try again.");
    }
  };

  const finishAnswer = () => {
    if (isQuestionSpeaking || !answerActiveRef.current) return;
    const duration = Math.max(1, Math.round((Date.now() - answerStartedAtRef.current) / 1000));
    const confidenceSamples = confidenceSamplesRef.current;
    const confidence = confidenceSamples.length ? confidenceSamples.reduce((sum, value) => sum + value, 0) / confidenceSamples.length : null;
    const voiceRatio = totalFramesRef.current ? voiceFramesRef.current / totalFramesRef.current : 0;
    const transcript = transcriptRef.current || liveTranscript;
    const currentQuestion = questions[questionIndex];
    stopAnswerCapture();

    if (currentQuestion.scored === false) {
      setQuestionIndex((current) => current + 1);
      return;
    }

    const analysis = analyzeAnswer(currentQuestion, transcript, duration, confidence, voiceRatio);
    const updatedAnswers = [...answers, analysis];
    setAnswers(updatedAnswers);

    if (currentQuestion.prompt === mandatoryQuestions[0].prompt) {
      setQuestions(selectInterviewQuestions(inferVisaType(transcript)));
    }

    if (questionIndex < questions.length - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }

    releaseMicrophone();
    setStep("processing");
    window.setTimeout(() => setStep("results"), 1600);
  };

  autoFinishRef.current = finishAnswer;

  useEffect(() => {
    if (step !== "interview" || isQuestionSpeaking || !answerActiveRef.current || answerSeconds < 180) return;
    autoFinishRef.current();
  }, [answerSeconds, isQuestionSpeaking, step]);

  const endPractice = () => {
    releaseMicrophone();
    setStep("landing");
  };

  const restart = () => {
    releaseMicrophone();
    setQuestionIndex(0);
    setAnswers([]);
    setStep("briefing");
  };

  const result = useMemo(() => {
    const noScore = !recognitionSupported;
    if (!answers.length || noScore) {
      return {
        available: false,
        score: 0,
        relevance: 0,
        clarity: 0,
        delivery: 0,
        completeness: 0,
        strengths: [] as Array<{ title: string; detail: string }>,
        improvements: [{ title: "No score issued", detail: "This browser did not provide a usable speech transcript. eConsul will not invent a result without evidence." }],
      };
    }
    const average = (key: keyof Pick<AnswerAnalysis, "score" | "relevance" | "clarity" | "delivery" | "completeness">) => Math.round(answers.reduce((sum, answer) => sum + answer[key], 0) / answers.length);
    const score = average("score");
    const relevance = average("relevance");
    const clarity = average("clarity");
    const delivery = average("delivery");
    const completeness = average("completeness");
    const averageFillers = answers.reduce((sum, answer) => sum + answer.fillerCount, 0) / answers.length;
    const strengths: Array<{ title: string; detail: string }> = [];
    if (relevance >= 80) strengths.push({ title: "Relevant answers", detail: "Most answers addressed the exact question and included expected details." });
    if (clarity >= 78) strengths.push({ title: "Clear structure", detail: "Your answers were a useful length and your speaking pace was understandable." });
    if (delivery >= 75) strengths.push({ title: "Steady delivery", detail: "Your voice activity and recognition confidence were reasonably consistent." });
    if (!strengths.length) strengths.push({ title: "Interview completed", detail: "You stayed with the full interview. Now focus on making each answer specific and direct." });

    const improvements: Array<{ title: string; detail: string }> = [];
    if (relevance < 78) improvements.push({ title: "Answer the exact question", detail: "A consular officer may challenge answers that omit names, dates, locations, costs, responsibilities, or return plans." });
    if (completeness < 75) improvements.push({ title: "Support every answer", detail: "Give one direct answer and at least one concrete supporting fact. Vague or unsupported claims are scored cautiously." });
    if (clarity < 75) improvements.push({ title: "Improve pace and structure", detail: "Keep answers around 10–45 seconds and use simple sentences instead of long explanations." });
    if (delivery < 70) improvements.push({ title: "Sound more controlled", detail: "Speak slightly louder, reduce long pauses, and keep a steady pace. This is delivery feedback, not a personality judgment." });
    if (averageFillers > 1) improvements.push({ title: "Reduce filler words", detail: "Pause silently instead of using “um,” “uh,” “like,” or “you know.”" });
    if (!improvements.length) improvements.push({ title: "Add sharper evidence", detail: "Your delivery was solid. Improve further by adding exact dates, amounts, names, and return plans." });

    return { available: true, score, relevance, clarity, delivery, completeness, strengths: strengths.slice(0, 3), improvements: improvements.slice(0, 3) };
  }, [answers, recognitionSupported]);

  return (
    <main className="site-shell">
      <header className="site-header">
        <button className="logo-button" onClick={() => setStep("landing")} aria-label="Go to home"><BrandMark /></button>
        <div className="header-right"><span className="demo-pill"><span /> Beta</span>{demoSignedIn && <span className="account-chip">AM</span>}</div>
      </header>

      {step === "landing" && (
        <section className="landing-page">
          <div className="hero-copy">
            <p className="eyebrow"><span>●</span> U.S. visa interview practice</p>
            <h1>Two minutes can feel like everything.</h1>
            <p className="hero-lede">Practice answering clearly, calmly, and honestly before your U.S. consular interview. Get strict, evidence-based feedback in under five minutes.</p>
            <div className="hero-actions"><button className="primary-button" onClick={() => setStep("briefing")}>Start a practice interview <span>→</span></button><button className="text-button" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>See how it works</button></div>
            <div className="trust-row" aria-label="Product benefits"><span>✓ Questions spoken first</span><span>✓ Continuous interview</span><span>✓ No invented scores</span></div>
          </div>
          <div className="hero-visual" aria-label="Practice interview preview">
            <img className="hero-scene" src="/hero-realistic.png" alt="Visa applicant speaking with a consular officer beside a United States flag" />
            <div className="mobile-hero-message">
              <strong>Practice the most important travel interview.</strong>
              <span>Start mock-up interview with eConsul of US</span>
            </div>
            <div className="hero-scene-caption"><span className="live-dot" /><div><strong>Practice the real rhythm</strong><small>Listen, answer, continue.</small></div></div>
          </div>
          <div className="brand-strip"><span>Practice the questions that matter most</span><strong>B1/B2</strong><strong>F-1</strong><strong>J-1</strong></div>
          <section className="how-section" id="how"><p className="section-kicker">HOW IT WORKS</p><h2>A more realistic way to prepare.</h2><div className="steps-grid"><article><b>01</b><h3>Listen first</h3><p>The officer asks each question aloud. Replay it or reveal the text only when needed.</p></article><article><b>02</b><h3>Stay in the interview</h3><p>The timer and microphone continue through the full session.</p></article><article><b>03</b><h3>Get strict feedback</h3><p>Your result uses only captured speech, relevance, pace, fillers, and delivery evidence.</p></article></div></section>
          <footer className="site-footer"><BrandMark /><p>Independent practice tool. Not affiliated with the U.S. government. Results do not predict a visa decision.</p></footer>
        </section>
      )}

      {step === "briefing" && (
        <section className="briefing-page">
          <div className="briefing-visual"><img src="/embassy-security-only.png" alt="United States consulate entrance with security" /><span>YOUR INTERVIEW IS ABOUT TO BEGIN</span></div>
          <div className="briefing-copy">
            <p className="eyebrow"><span>02</span> Final preparation</p>
            <h1>Step into the interview prepared.</h1>
            <p>The next screen simulates a short consular interview. Once you start, stay focused and answer naturally.</p>
            <ol className="briefing-list">
              <li><b>1</b><div><strong>The officer speaks first</strong><span>Listen to the full question. Replay it once if needed.</span></div></li>
              <li><b>2</b><div><strong>You answer by voice</strong><span>The microphone and interview timer remain on for the entire session.</span></div></li>
              <li><b>3</b><div><strong>Three minutes per answer</strong><span>At the limit, the officer automatically moves to the next question.</span></div></li>
              <li><b>4</b><div><strong>Expect a strict review</strong><span>Short, irrelevant, or unclear answers lose points. No answer receives zero.</span></div></li>
            </ol>
            <div className="briefing-confirmation">
              <h2>Before you start</h2>
              {!demoSignedIn ? <div className="consent-card sign-in-card"><div className="google-mark" aria-hidden="true">G</div><div><h2>Save and receive your result</h2><p>Continue with Google so your practice result can be saved and sent to your email.</p></div><button className="google-button" onClick={() => setDemoSignedIn(true)}>Continue with Google</button><small>Prototype sign-in. A secure Google connection will be added in the integration phase.</small></div> : <div className="signed-in-row"><span className="account-chip">AM</span><div><strong>Signed in for this prototype</strong><small>alex@example.com</small></div><b>✓</b></div>}
              <div className="consent-card"><label className="check-row"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} /><span><strong>I understand how my practice data is processed and may be used to improve eConsul.</strong><small>The microphone stays on for the full interview. This beta analyzes speech in your browser and discards recorded audio when the session ends. Your transcript and result may be saved to your account and emailed to you.</small></span></label></div>
              <div className="ready-note"><span>◉</span><div><strong>Find a quiet place before starting</strong><small>The timer begins immediately. Listen to every question, answer naturally, and finish each answer before moving on.</small></div></div>
            </div>
            {permissionError && <p className="permission-error" role="alert">{permissionError}</p>}
            <div className="briefing-actions"><button className="back-button" onClick={() => setStep("landing")}>← Back</button><button className="primary-button" disabled={!privacyAccepted || !demoSignedIn} onClick={beginInterview}>Start interview <span>→</span></button></div>
          </div>
        </section>
      )}

      {step === "interview" && (
        <section className="interview-page">
          <div className="interview-meta"><strong>{questions[questionIndex].scored === false ? "Warm-up" : `Question ${answers.length + 1} of ${questions.filter((question) => question.scored !== false).length}`}</strong></div>
          <div className="answer-timeline" aria-label="Answer time remaining"><span style={{ width: `${Math.max(0, 100 - (answerSeconds / 180) * 100)}%` }} /></div>
          <div className="interview-room">
            <div className={`officer-panel ${isQuestionSpeaking ? "speaking" : ""}`}>
              <img src="/consular-officer-solo.png" alt="Consular officer conducting the mock interview" />
              <div className="officer-status"><span>●</span><strong>{isQuestionSpeaking ? "Speaking" : "Listening"}</strong></div>
              {isQuestionSpeaking && <div className="portrait-wave" aria-hidden="true">{[18, 34, 52, 30, 62, 42, 24].map((height, index) => <i key={index} style={{ height }} />)}</div>}
            </div>
            <div className="question-stage">
              <h1 className="question-reveal">{questions[questionIndex].prompt}</h1>
              {isQuestionSpeaking && <div className="audio-bars" aria-label="Question audio is playing">{[22, 42, 64, 34, 76, 48, 60, 28, 52].map((height, index) => <i key={index} style={{ height }} />)}</div>}
              <div className={`mic-live ${isQuestionSpeaking ? "muted-analysis" : ""}`}><span className="mic-icon" aria-hidden="true"><i /><b /></span><strong>{isQuestionSpeaking ? "Listen" : "Answer now"}</strong></div>
              <div className="question-controls"><button className="secondary-button" disabled={isQuestionSpeaking} onClick={speakQuestion}>↻ Hear again</button><button className="primary-button finish-answer" disabled={isQuestionSpeaking} onClick={finishAnswer}>{questionIndex === questions.length - 1 ? "Finish interview" : "Finish answer"} <span>→</span></button></div>
            </div>
          </div>
          <button className="quiet-exit" onClick={endPractice}>End practice</button>
        </section>
      )}

      {step === "processing" && (
        <section className="processing-page"><div className="processing-mark"><span>✓</span><i /><i /><i /></div><p className="section-kicker">INTERVIEW COMPLETE</p><h1>Checking the evidence...</h1><p>No preset score is used. The result is calculated from what the browser actually heard.</p><div className="processing-list"><span>✓ Checking transcripts</span><span>✓ Measuring delivery</span><span className="working">● Applying strict score caps</span></div></section>
      )}

      {step === "results" && (
        <section className="results-page">
          <div className={`results-hero ${!result.available ? "no-score" : result.score < 40 ? "result-red" : result.score < 80 ? "result-yellow" : "result-green"}`}><div><p className="eyebrow"><span>{result.available ? "✓" : "!"}</span> Evidence-based review</p><h1>{result.available ? (result.score >= 80 ? "A solid practice, with details still to sharpen." : result.score >= 40 ? "Your answers need more precision." : "This interview needs serious improvement.") : "No reliable score was issued."}</h1><p>{result.available ? "This result is deliberately strict. Irrelevant, very short, vague, evasive, or unsupported answers are capped." : "Speech transcription was unavailable, so eConsul refused to invent a percentage."}</p></div><div className="score-ring" style={{ "--score": `${result.score * 3.6}deg` } as React.CSSProperties}><div><strong>{result.available ? `${result.score}%` : "—"}</strong><span>{result.available ? "Practice score" : "No evidence"}</span></div></div></div>
          <div className="result-grid"><article className="result-card strengths"><div className="result-title"><span>✓</span><h2>What the evidence supports</h2></div><ul>{result.strengths.length ? result.strengths.map((item) => <li key={item.title}><strong>{item.title}</strong><small>{item.detail}</small></li>) : <li><strong>No positive claim without evidence</strong><small>The app will not praise answers it could not hear and analyze.</small></li>}</ul></article><article className="result-card improvements"><div className="result-title"><span>↗</span><h2>Needs improvement</h2></div><ul>{result.improvements.map((item) => <li key={item.title}><strong>{item.title}</strong><small>{item.detail}</small></li>)}</ul></article></div>
          {result.available && <div className="breakdown-card"><div><h2>Strict score breakdown</h2><p>Delivery confidence is an approximation based on speech-recognition confidence and audible voice activity—not a judgment about your personality.</p></div>{[{ label: "Relevance", value: result.relevance }, { label: "Clarity", value: result.clarity }, { label: "Delivery", value: result.delivery }, { label: "Complete", value: result.completeness }].map((item) => <div className="score-row" key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.value}%` }} /></i><strong>{item.value}</strong></div>)}</div>}
          <div className="transcript-review"><div><h2>What the app heard</h2><p>Review this before trusting the score. A wrong transcript can produce a wrong evaluation.</p></div>{answers.map((answer, index) => <details key={answer.question}><summary><span>Q{index + 1}</span><strong>{answer.score}%</strong>{answer.transcript || "No answer detected"}</summary><div><p><b>Question:</b> {answer.question}</p><p><b>Transcript:</b> {answer.transcript || "No usable speech was detected."}</p><small>{answer.duration}s · {answer.wordCount} words · {answer.wordsPerMinute} words/min · {answer.fillerCount} filler words</small></div></details>)}</div>
          <div className="email-note"><span>✉</span><div><strong>Your result is ready</strong><small>In the connected version, the evidence and transcript review—not a preset score—will be emailed to you.</small></div></div>
          <div className="result-actions"><button className="primary-button" onClick={restart}>Practice again <span>→</span></button><button className="secondary-button" onClick={() => window.print()}>Save this result</button></div>
          <p className="legal-note">eConsul is an independent educational practice tool. This score measures the captured practice answer only. It is not a visa decision, approval prediction, psychological assessment, or legal advice.</p>
        </section>
      )}
    </main>
  );
}
