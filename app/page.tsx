"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ENGLISH_BY_GEORGIAN } from "./english-copy";

type VisaType = "B1/B2" | "F-1" | "J-1";
type Step = "landing" | "briefing" | "interview" | "processing" | "results";
type InterfaceLanguage = "en" | "ka";

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

type InterviewResponse = {
  question: string;
  answer: string;
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
    { prompt: "Have you traveled outside your home country before?", criteria: [["yes", "have traveled", "visited", "went", "no", "never"], ["year", "last", "before", "country", "europe", "asia", "turkey", "georgia", "armenia", "azerbaijan"]] },
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
  const [language, setLanguage] = useState<InterfaceLanguage>("ka");
  const [step, setStep] = useState<Step>("landing");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [permissionError, setPermissionError] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [demoSignedIn, setDemoSignedIn] = useState(false);
  const [isQuestionSpeaking, setIsQuestionSpeaking] = useState(false);
  const [answerSeconds, setAnswerSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [answers, setAnswers] = useState<AnswerAnalysis[]>([]);
  const [responses, setResponses] = useState<InterviewResponse[]>([]);
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const t = useCallback((georgian: string) => language === "en" ? (ENGLISH_BY_GEORGIAN[georgian] ?? georgian) : georgian, [language]);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("econsul-language");
    if (savedLanguage === "en" || savedLanguage === "ka") setLanguage(savedLanguage);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("econsul-language", language);
    document.documentElement.lang = language;
    document.title = language === "en" ? "eConsul | U.S. Visa Practice Interview" : "eConsul | აშშ-ის ვიზის საცდელი გასაუბრება";
  }, [language]);

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
    const maleVoiceNames = ["microsoft guy", "microsoft davis", "microsoft christopher", "microsoft eric", "google uk english male", "aaron", "daniel", "alex", "david", "eddy", "evan", "nathan", "reed", "fred", "rishi", "rocko"];
    const femaleVoiceNames = ["samantha", "victoria", "zira", "aria", "jenny", "ava", "allison", "susan", "karen", "moira", "tessa", "veena", "fiona"];
    const voiceScore = (voice: SpeechSynthesisVoice) => {
      const name = voice.name.toLowerCase();
      const languageScore = voice.lang.toLowerCase().startsWith("en-us") ? 30 : voice.lang.toLowerCase().startsWith("en") ? 10 : 0;
      const maleScore = maleVoiceNames.reduce((score, token, index) => name.includes(token) ? Math.max(score, 100 - index) : score, 0);
      const femalePenalty = femaleVoiceNames.some((token) => name.includes(token)) ? 120 : 0;
      const qualityScore = /neural|natural|premium|enhanced/.test(name) ? 25 : 0;
      return languageScore + maleScore + qualityScore + (voice.localService ? 0 : 5) - femalePenalty;
    };
    const maleVoice = [...voices].filter((voice) => voice.lang.toLowerCase().startsWith("en")).sort((left, right) => voiceScore(right) - voiceScore(left))[0];
    if (maleVoice) utterance.voice = maleVoice;
    utterance.rate = 0.92;
    utterance.pitch = 0.88;
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
      setResponses([]);
      setQuestionIndex(0);
      setStep("interview");
    } catch {
      setPermissionError(t("ინტერვიუსთვის საჭიროა მიკროფონზე წვდომა. დართეთ წვდომა ბრაუზერში და სცადეთ ხელახლა."));
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
    setResponses((current) => [...current, { question: currentQuestion.prompt, answer: transcript.trim() }]);

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
    setResponses([]);
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
        improvements: [{ title: t("ქულა არ გაცემულა"), detail: t("ამ ბრაუზერმა არ მოგვაწოდა გამოსაყენებელი საუბრის ტრანსკრიპტი. eConsul არ გამოიგონებს შედეგს მტკიცებულების გარეშე.") }],
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
    if (relevance >= 80) strengths.push({ title: t("რელევანტური პასუხები"), detail: t("პასუხების უმეტესობა ზუსტად პასუხობდა კითხვას და მოიცავდა მოსალოდნელ დეტალებს.") });
    if (clarity >= 78) strengths.push({ title: t("მკაფიო სტრუქტურა"), detail: t("თქვენი პასუხები შესაფერისი სიგრძის იყო და თქვენი საუბრის ტემპი – გასაგები.") });
    if (delivery >= 75) strengths.push({ title: t("მტკიცე გადმოცემა"), detail: t("თქვენი ხმის აქტივობა და ამოცნობის სანდოობა გონივრულად თანმიმდევრული იყო.") });
    if (!strengths.length) strengths.push({ title: t("ინტერვიუ დასრულებულია"), detail: t("თქვენ ბოლომდე დარჩით ინტერვიუზე. ახლა ფოკუსირდით იმაზე, რომ თითოეული პასუხი იყოს კონკრეტული და პირდაპირი.") });

    const improvements: Array<{ title: string; detail: string }> = [];
    if (relevance < 78) improvements.push({ title: t("ზუსტად უპასუხეთ კითხვას"), detail: t("კონსულმა შეიძლება ეჭვქვეშ დააყენოს პასუხები, რომლებიც არ შეიცავს სახელებს, თარიღებს, ადგილებს, ხარჯებს, პასუხისმგებლობებს ან დაბრუნების გეგმებს.") });
    if (completeness < 75) improvements.push({ title: t("დაასაბუთეთ ყოველი პასუხი"), detail: t("გაეცით ერთი პირდაპირი პასუხი და დაასახელეთ მინიმუმ ერთი კონკრეტული დამადასტურებელი ფაქტი. ბუნდოვანი ან დაუსაბუთებელი მტკიცებები ფასდება სიფრთხილით.") });
    if (clarity < 75) improvements.push({ title: t("გააუმჯობესეთ ტემპი და სტრუქტურა"), detail: t("შეინარჩუნეთ პასუხები დაახლოებით 10–45 წამის ფარგლებში და გამოიყენეთ მარტივი წინადადებები გრძელი განმარტებების ნაცვლად.") });
    if (delivery < 70) improvements.push({ title: t("ისუბრეთ უფრო კონტროლირებად"), detail: t("ისაუბრეთ ოდნავ უფრო ხმამაღლა, შეამცირეთ გრძელი პაუზები და შეინარჩუნეთ სტაბილური ტემპი. ეს არის გადმოცემის უკუკავშირი და არა პიროვნული შეფასება.") });
    if (averageFillers > 1) improvements.push({ title: t("შეამცირეთ პარაზიტი სიტყვები"), detail: t("ჩუმად შეჩერდით „ამ“, „უჰ“, „ტიპა“ ან „ხომ იცით“ გამოყენების ნაცვლად.") });
    if (!improvements.length) improvements.push({ title: t("დაამატეთ უფრო მკაფიო მტკიცებულება"), detail: t("თქვენი გადმოცემა მყარი იყო. კიდევ უფრო გააუმჯობესეთ ზუსტი თარიღების, თანხების, სახელების და დაბრუნების გეგმების დამატებით.") });

    return { available: true, score, relevance, clarity, delivery, completeness, strengths: strengths.slice(0, 3), improvements: improvements.slice(0, 3) };
  }, [answers, recognitionSupported, t]);

  return (
    <main className="site-shell">
      <header className="site-header">
        <div className="header-brand"><button className="logo-button" onClick={() => setStep("landing")} aria-label={t("მთავარ გვერდზე გადასვლა")}><BrandMark /></button><span className="beta-badge">{t("ბეტა")}</span></div>
        <div className="header-right">
          <div className="language-toggle" role="group" aria-label="Language / ენა">
            <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} aria-pressed={language === "en"} title="English"><span aria-hidden="true">🇺🇸</span><small>ENG</small></button>
            <button className={language === "ka" ? "active" : ""} onClick={() => setLanguage("ka")} aria-pressed={language === "ka"} title="ქართული"><span aria-hidden="true">🇬🇪</span><small>GEO</small></button>
          </div>
          {demoSignedIn && <span className="account-chip">AM</span>}
        </div>
      </header>

      {step === "landing" && (
        <section className="landing-page">
          <div className="hero-copy">
            <p className="eyebrow"><span>●</span> {t("აშშ-ის ვიზის საცდელი გასაუბრება ვირტუალურ კონსულ ოფიცერთან")}</p>
            <h1>{t("მზად ხარ კონსულ ოფიცერთან ინტერვიუსთვის?")}</h1>
            <div className="hero-actions"><button className="primary-button" onClick={() => setStep("briefing")}>{t("გასაუბრების დაწყება")} <span>→</span></button></div>
          </div>
          <div className="hero-visual" aria-label={t("პრაქტიკული ინტერვიუს წინასწარი ნახვა")}>
            <img className="hero-scene" src="/hero-realistic.png" alt={t("ვიზის მაძიებელი ესაუბრება კონსულს შეერთებული შტატების დროშის გვერდით")} />
            <div className="mobile-hero-message">
              <strong>{t("გაიარეთ ყველაზე მნიშვნელოვანი სამოგზაურო ინტერვიუს პრაქტიკა.")}</strong>
              <span>{t("დაიწყეთ იმიტირებული ინტერვიუ აშშ-ის eConsul-თან")}</span>
            </div>
            <div className="hero-scene-caption"><span className="live-dot" /><small>{t("მოუსმინეთ, უპასუხეთ, გააგრძელეთ.")}</small></div>
          </div>
          <section className="how-section" id="how"><p className="section-kicker">{t("როგორ მუშაობს")}</p><h2>{t("მომზადების მარტივი მეთოდი")}</h2><div className="steps-grid"><article><b>01</b><h3>{t("ჯერ მოუსმინეთ")}</h3><p>{t("ოფიცერი თითოეულ კითხვას ხმამაღლა სვამს. თუ კითხვა ვერ გაიგეთ, შეგიძლიათ ღილაკზე თითის დაჭერით ხელახლა მოუსმინოთ კითხვას. მიეცით წვდომა თქვენს მიკროფონს, რათა მოახდინოთ მიკროფონით კომუნიკაცია.")}</p></article><article><b>02</b><h3>{t("დარჩით ინტერვიუში")}</h3><p>{t("ბოლომდე უპასუხეთ ყველა კითხვას. ინტერვიუს მსვლელობისას მიკროფონი აგრძელებს მუშაობას მთელი სესიის განმავლობაში.")}</p></article><article><b>03</b><h3>{t("მიიღეთ მკაცრი უკუკავშირი")}</h3><p>{t("თქვენი შედეგი დაფუძნებულია მხოლოდ ჩაწერილ საუბარზე, შესაბამისობაზე, ტემპზე, სიტყვებზე და მთლიან კომუნიკაციაზე.")}</p></article></div></section>
          <footer className="site-footer"><BrandMark /><p>{t("დამოუკიდებელი პრაქტიკული ინსტრუმენტი. არ არის დაკავშირებული აშშ-ის მთავრობასთან. შედეგები არ პროგნოზირებს ვიზის გადაწყვეტილებას.")}</p></footer>
        </section>
      )}

      {step === "briefing" && (
        <section className="briefing-page">
          <div className="briefing-visual"><img src="/embassy-security-only.png" alt={t("შეერთებული შტატების საკონსულოს შესასვლელი დაცვით")} /><span>{t("თქვენი ინტერვიუ მალე დაიწყება")}</span></div>
          <div className="briefing-copy">
            <p className="eyebrow"><span>02</span> {t("საბოლოო მომზადება")}</p>
            <h1>{t("როგორ მოვემზადოთ ინტერვიუსთვის?")}</h1>
            <p>{t("შემდეგი გვერდი არის საკონსულო ინტერვიუს სიმულაცია. დაწყების ღილაკზე დაჭერისას, იყავით ფოკუსირებული და უპასუხეთ კითხვებს ბუნებრივად ინგლისურ ენაზე.")}</p>
            <ol className="briefing-list">
              <li><b>1</b><div><strong>{t("ოფიცერი საუბრობს პირველი")}</strong><span>{t("მოუსმინეთ სრულ კითხვას. საჭიროების შემთხვევაში, კიდევ ერთხელ მოუსმინეთ.")}</span></div></li>
              <li><b>2</b><div><strong>{t("თქვენ პასუხობთ")}</strong><span>{t("მიკროფონი და ინტერვიუს ტაიმერი ჩართული რჩება მთელი სესიის განმავლობაში.")}</span></div></li>
              <li><b>3</b><div><strong>{t("შეეცადეთ თითო კითხვას უპასუხოთ 15-45 წამის ინტერვალით.")}</strong><span>{t("ინტერვიუს მაქსიმალური ხანგრძლივობა არის 5 წუთი. თითო კითხვაზე გადაჭარბებული პასუხის შემთხვევაში ოფიცერი ავტომატურად გადადის შემდეგ კითხვაზე.")}</span></div></li>
              <li><b>4</b><div><strong>{t("მოემზადეთ კრიტიკული შეფასებისთვის")}</strong><span>{t("მოკლე, შეუსაბამო ან გაურკვეველი პასუხები კარგავს ქულებს. პასუხის გაუცემლობა ფასდება ნულით.")}</span></div></li>
            </ol>
            <div className="briefing-confirmation">
              <h2>{t("სანამ დაიწყებთ")}</h2>
              {!demoSignedIn ? <div className="consent-card sign-in-card"><div className="google-mark" aria-hidden="true">G</div><div><h2>{t("შეინახეთ და მიიღეთ თქვენი შედეგი")}</h2><p>{t("გააგრძელეთ Google-ით, რათა თქვენი პრაქტიკის შედეგი შეინახოს და გაიგზავნოს თქვენს ელფოსტაზე.")}</p></div><button className="google-button" onClick={() => setDemoSignedIn(true)}>{t("Google-ით გაგრძელება")}</button><small>{t("პროტოტიპში შესვლა. უსაფრთხო Google კავშირი დაემატება ინტეგრაციის ფაზაში.")}</small></div> : <div className="signed-in-row"><span className="account-chip">AM</span><div><strong>{t("ავტორიზებული ხართ ამ პროტოტიპისთვის")}</strong><small>alex@example.com</small></div><b>✓</b></div>}
              <div className="consent-card"><label className="check-row"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} /><span><strong>{t("თანხმობას ვაცხადებ მონაცემების გამოყენების შესახებ, რაც ემსახურება eConsul-ის სერვისების გაუმჯობესებას.")}</strong><small>{t("მიკროფონი ჩართული რჩება მთელი ინტერვიუს განმავლობაში. ეს ბეტა ვერსია აანალიზებს საუბარს თქვენს ბრაუზერში და შლის ჩაწერილ აუდიოს სესიის დასრულებისას. თქვენი ტრანსკრიპტი და შედეგი შეიძლება შეინახოს თქვენს ანგარიშში და გამოიგზავნოს ელფოსტით.")}</small><em>{t("ეს არ არის ოფიციალური ინტერვიუ, ეს არის მხოლოდ საკონსულო ინტერვიუს სიმულაცია.")}</em></span></label></div>
              <div className="ready-note"><span>◉</span><div><strong>{t("დაწყებამდე იპოვეთ წყნარი ადგილი")}</strong><small>{t("მოუსმინეთ ყველა კითხვას, უპასუხეთ ბუნებრივად და დაასრულეთ თითოეული პასუხი შემდეგზე გადასვლით.")}</small></div></div>
            </div>
            {permissionError && <p className="permission-error" role="alert">{permissionError}</p>}
            <div className="briefing-actions"><button className="back-button" onClick={() => setStep("landing")}>← {t("უკან")}</button><button className="primary-button" disabled={!privacyAccepted || !demoSignedIn} onClick={beginInterview}>{t("ინტერვიუს დაწყება")} <span>→</span></button></div>
          </div>
        </section>
      )}

      {step === "interview" && (
        <section className="interview-page">
          <div className="interview-meta"><strong>{questions[questionIndex].scored === false ? t("მიმდინარეობს ინტერვიუ") : language === "en" ? `Question ${answers.length + 1} of ${questions.filter((question) => question.scored !== false).length}` : `კითხვა ${answers.length + 1} ${questions.filter((question) => question.scored !== false).length}-დან`}</strong></div>
          <div className="answer-timeline" aria-label={t("პასუხისთვის დარჩენილი დრო")}><span style={{ width: `${Math.max(0, 100 - (answerSeconds / 180) * 100)}%` }} /></div>
          <div className="interview-room">
            <div className={`officer-panel ${isQuestionSpeaking ? "speaking" : ""}`}>
              <img src="/consular-officer-solo.png" alt={t("კონსული, რომელიც ატარებს იმიტირებულ ინტერვიუს")} />
              <div className="officer-status"><span>●</span><strong>{isQuestionSpeaking ? t("საუბრობს") : t("გისმენთ")}</strong></div>
              {isQuestionSpeaking && <div className="portrait-wave" aria-hidden="true">{[18, 34, 52, 30, 62, 42, 24].map((height, index) => <i key={index} style={{ height }} />)}</div>}
            </div>
            <div className="question-stage">
              <h1 className="question-reveal">{questions[questionIndex].prompt}</h1>
              {isQuestionSpeaking && <div className="audio-bars" aria-label={t("იკვრება კითხვის აუდიო")}>{[22, 42, 64, 34, 76, 48, 60, 28, 52].map((height, index) => <i key={index} style={{ height }} />)}</div>}
              <div className={`mic-live ${isQuestionSpeaking ? "muted-analysis" : ""}`}><span className="mic-icon" aria-hidden="true"><i /><b /></span><strong>{isQuestionSpeaking ? t("მოუსმინეთ") : t("უპასუხეთ კითხვას")}</strong></div>
              <div className="question-controls"><button className="secondary-button" disabled={isQuestionSpeaking} onClick={speakQuestion}>↻ {t("კითხვის გამეორება")}</button><button className="primary-button finish-answer" disabled={isQuestionSpeaking} onClick={finishAnswer}>{questionIndex === questions.length - 1 ? t("ინტერვიუს დასრულება") : t("შემდეგი")} <span>→</span></button></div>
            </div>
          </div>
          <button className="quiet-exit" onClick={endPractice}>{t("ინტერვიუს შეწყვეტა")}</button>
        </section>
      )}

      {step === "processing" && (
        <section className="processing-page"><div className="processing-mark"><span>✓</span><i /><i /><i /></div><p className="section-kicker">{t("ინტერვიუ დასრულებულია")}</p><h1>{t("მტკიცებულებების შემოწმება...")}</h1><p>{t("წინასწარ განსაზღვრული ქულა არ გამოიყენება. შედეგი გამოითვლება იმის მიხედვით, რაც ბრაუზერმა რეალურად გაიგონა.")}</p><div className="processing-list"><span>✓ {t("ტრანსკრიპტების შემოწმება")}</span><span>✓ {t("გადმოცემის გაზომვა")}</span><span className="working">● {t("მკაცრი ქულების ლიმიტების გამოყენება")}</span></div></section>
      )}

      {step === "results" && (
        <section className="results-page">
          <div className={`results-hero ${!result.available ? "no-score" : result.score < 40 ? "result-red" : result.score < 80 ? "result-yellow" : "result-green"}`}><div><p className="eyebrow"><span>{result.available ? "✓" : "!"}</span> {t("გამოცდილებაზე დაფუძნებული შეფასება")}</p><h1>{result.available ? (result.score >= 80 ? t("მყარი პრაქტიკა, თუმცა დეტალები ჯერ კიდევ დასახვეწია.") : result.score >= 40 ? t("თქვენს პასუხებს მეტი სიზუსტე სჭირდება.") : t("ეს ინტერვიუ სერიოზულ გაუმჯობესებას საჭიროებს.")) : t("სანდო ქულა არ გაცემულა.")}</h1><p>{result.available ? t("პასუხები არის შეუსაბამო, ძალიან მოკლე ან ბუნდოვანი. თავის არიდებისას ან დაუსაბუთებელი პასუხების გაცემით ქულები ნულდება.") : t("საუბრის ტრანსკრიფცია მიუწვდომელი იყო, ამიტომ eConsul-მა უარი თქვა პროცენტის გამოგონებაზე.")}</p></div><div className="score-ring" style={{ "--score": `${result.score * 3.6}deg` } as React.CSSProperties}><div><strong>{result.available ? `${result.score}%` : "—"}</strong><span>{result.available ? t("პრაქტიკის ქულა") : t("არ არის მტკიცებულება")}</span></div></div></div>
          <div className="result-grid"><article className="result-card strengths"><div className="result-title"><span>✓</span><h2>{t("შედეგები")}</h2></div><ul>{result.strengths.length ? result.strengths.map((item) => <li key={item.title}><strong>{item.title}</strong><small>{item.detail}</small></li>) : <li><strong>{t("არანაირი დადებითი მტკიცება მტკიცებულების გარეშე")}</strong><small>{t("აპლიკაცია არ შეაქებს პასუხებს, რომელთა მოსმენაც და გაანალიზებაც ვერ შეძლო.")}</small></li>}</ul></article><article className="result-card improvements"><div className="result-title"><span>↗</span><h2>{t("საჭიროებს გაუმჯობესებას")}</h2></div><ul>{result.improvements.map((item) => <li key={item.title}><strong>{item.title}</strong><small>{item.detail}</small></li>)}</ul></article></div>
          {result.available && <div className="breakdown-card"><div><h2>{t("ქულების გადანაწილება")}</h2><p>{t("გადმოცემის სანდოობა არის მიახლოებითი მაჩვენებელი, რომელიც ეფუძნება მეტყველების ამოცნობის სანდოობას და ხმის აქტივობას — და არა თქვენი პიროვნების შეფასებას.")}</p></div>{[{ label: t("რელევანტურობა"), value: result.relevance }, { label: t("სიცხადე"), value: result.clarity }, { label: t("გადმოცემა"), value: result.delivery }, { label: t("დასრულებულია"), value: result.completeness }].map((item) => <div className="score-row" key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.value}%` }} /></i><strong>{item.value}</strong></div>)}</div>}
          <div className="transcript-review"><div><h2>{t("თქვენი ინტერვიუ: კითხვები და პასუხები")}</h2><p>{t("გადახედეთ ზუსტად რა გკითხეს და რა გაიგონა აპლიკაციამ თითოეული პასუხიდან.")}</p></div><div className="qa-review-list">{responses.map((response, index) => <article key={`${response.question}-${index}`}><span>Q{index + 1}</span><div><strong>{response.question}</strong><p>{response.answer || t("ვერ მოხერხდა საუბრის აღქმა.")}</p></div></article>)}</div></div>
          <div className="result-actions"><a className="primary-button consultation-button" href={`https://wa.me/995596114488?text=${encodeURIComponent(t("გამარჯობა eConsul, მსურს კონსულტაციის დაჯავშნა აშშ-ის ვიზის ინტერვიუსთვის ექსპერტთან მოსამზადებლად."))}`} target="_blank" rel="noopener noreferrer">{t("მოემზადე ინტერვიუსთვის პროფესიონალის დახმარებით. დაგვიკავშირდი WhatsApp-ზე")} <span>→</span></a><button className="secondary-button" onClick={restart}>{t("სცადე ხელახლა")}</button></div>
          <p className="legal-note">{t("eConsul არის დამოუკიდებელი საგანმანათლებლო პრაქტიკული ინსტრუმენტი. ეს ქულა ზომავს მხოლოდ ჩაწერილ პრაქტიკულ პასუხს. ეს არ არის ვიზის გადაწყვეტილება, დამტკიცების პროგნოზი, ფსიქოლოგიური შეფასება ან იურიდიული რჩევა.")}</p>
        </section>
      )}
    </main>
  );
}
