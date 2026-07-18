"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type VisaType = "B1/B2" | "F-1" | "J-1";
type Step = "landing" | "visa" | "consent" | "interview" | "processing" | "results";

const interviewQuestions: Record<VisaType, string[]> = {
  "B1/B2": [
    "What is the purpose of your trip to the United States?",
    "Which places will you visit, and how long will you stay?",
    "Who will pay for your trip?",
    "Tell me about your current job and a normal workday.",
    "What plans and responsibilities will bring you back home?",
  ],
  "F-1": [
    "Why did you choose this university and program?",
    "How does this program support your career plans?",
    "Who will pay for your tuition and living costs?",
    "What is your academic background?",
    "What will you do after you complete your studies?",
  ],
  "J-1": [
    "Why is this exchange program important to you?",
    "What will you do during the program?",
    "Who is sponsoring your trip and expenses?",
    "How will you use this experience after you return home?",
    "What responsibilities or plans are waiting for you at home?",
  ],
};

const visaOptions: Array<{ type: VisaType; title: string; detail: string; tag: string }> = [
  { type: "B1/B2", title: "Visitor visa", detail: "Tourism, family visits, or short business travel", tag: "Most popular" },
  { type: "F-1", title: "Student visa", detail: "University, college, or academic study", tag: "Study" },
  { type: "J-1", title: "Exchange visitor", detail: "Exchange, internship, trainee, or cultural program", tag: "Exchange" },
];

const scoreByVisa: Record<VisaType, number> = { "B1/B2": 82, "F-1": 78, "J-1": 85 };

function BrandMark() {
  return <img className="brand-logo" src="/econsul-logo.png" alt="eConsul" />;
}

export default function Home() {
  const [step, setStep] = useState<Step>("landing");
  const [visa, setVisa] = useState<VisaType>("B1/B2");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [permissionError, setPermissionError] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [demoSignedIn, setDemoSignedIn] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const questions = useMemo(() => interviewQuestions[visa], [visa]);
  const score = scoreByVisa[visa];

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const releaseMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      releaseMicrophone();
    };
  }, [releaseMicrophone, stopTimer]);

  const completeAnswer = useCallback(() => {
    setIsRecording(false);
    stopTimer();
    releaseMicrophone();
    setSeconds(0);
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((current) => current + 1);
      return;
    }
    setStep("processing");
    window.setTimeout(() => setStep("results"), 1800);
  }, [questionIndex, questions.length, releaseMicrophone, stopTimer]);

  const startRecording = async () => {
    setPermissionError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      setPermissionError("Microphone access is blocked. Allow access in your browser and try again.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    completeAnswer();
  };

  const restart = () => {
    setQuestionIndex(0);
    setSeconds(0);
    setStep("visa");
  };

  return (
    <main className="site-shell">
      <header className="site-header">
        <button className="logo-button" onClick={() => setStep("landing")} aria-label="Go to home">
          <BrandMark />
        </button>
        <div className="header-right">
          <span className="demo-pill"><span /> Prototype</span>
          {demoSignedIn && <span className="account-chip">AM</span>}
        </div>
      </header>

      {step === "landing" && (
        <section className="landing-page">
          <div className="hero-copy">
            <p className="eyebrow"><span>●</span> U.S. visa interview practice</p>
            <h1>Two minutes can feel like everything.</h1>
            <p className="hero-lede">
              Practice answering clearly, calmly, and honestly before your U.S. consular interview.
              Get focused feedback in under five minutes.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => setStep("visa")}>Start a practice interview <span>→</span></button>
              <button className="text-button" onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}>See how it works</button>
            </div>
            <div className="trust-row" aria-label="Product benefits">
              <span>✓ Voice practice</span>
              <span>✓ Private by design</span>
              <span>✓ Clear feedback</span>
            </div>
          </div>
          <div className="hero-visual" aria-label="Practice interview preview">
            <div className="pattern-orb pattern-orb-one" />
            <div className="pattern-orb pattern-orb-two" />
            <div className="interview-card">
              <div className="interview-card-top">
                <div><span className="live-dot" /> Practice in progress</div>
                <span>02:18</span>
              </div>
              <p className="question-label">CONSULAR OFFICER</p>
              <h2>What is the purpose of your trip to the United States?</h2>
              <div className="waveform" aria-hidden="true">
                {[10, 24, 38, 22, 52, 32, 62, 42, 28, 48, 20, 34, 14].map((height, index) => <i key={index} style={{ height }} />)}
              </div>
              <div className="recording-status"><span className="record-dot" /> Listening to your answer...</div>
              <div className="preview-progress"><span style={{ width: "40%" }} /></div>
              <p className="preview-count">Question 2 of 5</p>
            </div>
            <div className="floating-score"><strong>82%</strong><span>Practice score</span></div>
          </div>
          <div className="brand-strip">
            <span>Practice the questions that matter most</span>
            <strong>B1/B2</strong><strong>F-1</strong><strong>J-1</strong>
          </div>
          <section className="how-section" id="how">
            <p className="section-kicker">HOW IT WORKS</p>
            <h2>A calmer way to prepare.</h2>
            <div className="steps-grid">
              <article><b>01</b><h3>Choose your visa</h3><p>Select visitor, student, or exchange visitor practice.</p></article>
              <article><b>02</b><h3>Answer by voice</h3><p>Hear realistic questions and respond naturally in English.</p></article>
              <article><b>03</b><h3>Know what to improve</h3><p>See your score, strengths, weak points, and next steps.</p></article>
            </div>
          </section>
          <footer className="site-footer">
            <BrandMark />
            <p>Independent practice tool. Not affiliated with the U.S. government. Results do not predict a visa decision.</p>
          </footer>
        </section>
      )}

      {step === "visa" && (
        <section className="flow-page">
          <div className="flow-heading">
            <p className="eyebrow"><span>01</span> Set up your practice</p>
            <h1>Which interview are you preparing for?</h1>
            <p>Choose one path. Your questions will match the purpose of your trip.</p>
          </div>
          <div className="visa-grid">
            {visaOptions.map((option) => (
              <button key={option.type} className={`visa-card ${visa === option.type ? "selected" : ""}`} onClick={() => setVisa(option.type)}>
                <span className="visa-tag">{option.tag}</span>
                <strong>{option.type}</strong>
                <h2>{option.title}</h2>
                <p>{option.detail}</p>
                <i>{visa === option.type ? "✓" : "→"}</i>
              </button>
            ))}
          </div>
          <div className="flow-actions">
            <button className="back-button" onClick={() => setStep("landing")}>← Back</button>
            <button className="primary-button" onClick={() => setStep("consent")}>Continue <span>→</span></button>
          </div>
        </section>
      )}

      {step === "consent" && (
        <section className="flow-page narrow-flow">
          <div className="flow-heading">
            <p className="eyebrow"><span>02</span> Privacy & microphone</p>
            <h1>Before we begin</h1>
            <p>Your practice includes personal details. You stay in control of your data.</p>
          </div>
          {!demoSignedIn ? (
            <div className="consent-card sign-in-card">
              <div className="google-mark" aria-hidden="true">G</div>
              <div><h2>Save your practice result</h2><p>Continue with Google to keep your history and receive your report by email.</p></div>
              <button className="google-button" onClick={() => setDemoSignedIn(true)}>Continue with Google</button>
              <small>Prototype sign-in. Secure Google connection will be added in the integration phase.</small>
            </div>
          ) : (
            <div className="signed-in-row"><span className="account-chip">AM</span><div><strong>Signed in for this prototype</strong><small>alex@example.com</small></div><b>✓</b></div>
          )}
          <div className="consent-card">
            <h2>Your privacy confirmation</h2>
            <label className="check-row">
              <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} />
              <span>
                <strong>I understand how my practice data is processed and used to improve eConsul.</strong>
                <small>Audio is used for this session and deleted after transcription. Your transcript and result are saved to your account. De-identified transcripts and scores may be used to improve the product; raw audio is not included.</small>
              </span>
            </label>
          </div>
          <div className="ready-note"><span>◉</span><div><strong>Find a quiet place</strong><small>You will answer 5 questions by voice. Most sessions take about 3 minutes.</small></div></div>
          <div className="flow-actions">
            <button className="back-button" onClick={() => setStep("visa")}>← Back</button>
            <button className="primary-button" disabled={!privacyAccepted || !demoSignedIn} onClick={() => { setQuestionIndex(0); setStep("interview"); }}>Begin interview <span>→</span></button>
          </div>
        </section>
      )}

      {step === "interview" && (
        <section className="interview-page">
          <div className="interview-meta">
            <span>{visa} practice</span>
            <strong>Question {questionIndex + 1} of {questions.length}</strong>
            <span>About 3 min</span>
          </div>
          <div className="main-progress"><span style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div>
          <div className="question-stage">
            <p className="question-label">CONSULAR OFFICER</p>
            <h1>{questions[questionIndex]}</h1>
            <p className="answer-prompt">Answer clearly and truthfully. A short, direct answer is best.</p>
            <div className={`mic-zone ${isRecording ? "active" : ""}`}>
              <button className="mic-button" onClick={isRecording ? stopRecording : startRecording} aria-label={isRecording ? "Stop recording" : "Start recording"}>
                <span className="mic-icon" aria-hidden="true"><i /><b /></span>
              </button>
              <strong>{isRecording ? `${seconds}s · Recording` : "Tap to answer"}</strong>
              <small>{isRecording ? "Tap again when you finish" : "Your microphone will turn on"}</small>
            </div>
            {permissionError && <p className="permission-error" role="alert">{permissionError}</p>}
          </div>
          <button className="quiet-exit" onClick={() => { releaseMicrophone(); stopTimer(); setStep("visa"); }}>End practice</button>
        </section>
      )}

      {step === "processing" && (
        <section className="processing-page">
          <div className="processing-mark"><span>✓</span><i /><i /><i /></div>
          <p className="section-kicker">INTERVIEW COMPLETE</p>
          <h1>Reviewing your answers...</h1>
          <p>We are checking clarity, consistency, purpose, finances, and your plans to return home.</p>
          <div className="processing-list"><span>✓ Transcribing answers</span><span>✓ Reviewing consistency</span><span className="working">● Preparing feedback</span></div>
        </section>
      )}

      {step === "results" && (
        <section className="results-page">
          <div className="results-hero">
            <div>
              <p className="eyebrow"><span>✓</span> Practice complete</p>
              <h1>You gave a clear picture of your plans.</h1>
              <p>Your answers were direct and consistent. A few details could be more specific before the real interview.</p>
            </div>
            <div className="score-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}>
              <div><strong>{score}%</strong><span>Practice score</span></div>
            </div>
          </div>
          <div className="result-grid">
            <article className="result-card strengths">
              <div className="result-title"><span>✓</span><h2>What went well</h2></div>
              <ul><li><strong>Clear purpose</strong><small>You explained why you want to travel without unnecessary detail.</small></li><li><strong>Consistent answers</strong><small>Your timing, funding, and plans supported one another.</small></li><li><strong>Calm delivery</strong><small>Your answers were concise and easy to follow.</small></li></ul>
            </article>
            <article className="result-card improvements">
              <div className="result-title"><span>↗</span><h2>Needs improvement</h2></div>
              <ul><li><strong>Be more specific about timing</strong><small>State exact travel dates or program dates when you know them.</small></li><li><strong>Explain your return plan</strong><small>Connect your job, studies, or responsibilities to what happens after the trip.</small></li><li><strong>Name your main costs</strong><small>Briefly explain the travel budget and who will cover it.</small></li></ul>
            </article>
          </div>
          <div className="breakdown-card">
            <div><h2>Score breakdown</h2><p>This measures answer quality, not your chance of receiving a visa.</p></div>
            {[{ label: "Clarity", value: 88 }, { label: "Consistency", value: 84 }, { label: "Purpose", value: 86 }, { label: "Finances", value: 74 }, { label: "Return plans", value: 72 }].map((item) => (
              <div className="score-row" key={item.label}><span>{item.label}</span><i><b style={{ width: `${item.value}%` }} /></i><strong>{item.value}</strong></div>
            ))}
          </div>
          <div className="email-note"><span>✉</span><div><strong>Your result is ready</strong><small>In the connected version, a copy will be emailed to alex@example.com.</small></div></div>
          <div className="result-actions"><button className="primary-button" onClick={restart}>Practice again <span>→</span></button><button className="secondary-button" onClick={() => window.print()}>Save this result</button></div>
          <p className="legal-note">eConsul is an independent educational practice tool. This score is not a visa decision, approval prediction, or legal advice. Always answer truthfully.</p>
        </section>
      )}
    </main>
  );
}
