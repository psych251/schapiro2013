/*
 * Replication of Schapiro, Rogers, Cordova, Turk-Browne & Botvinick (2013), Experiment 2:
 * "Neural representations of events arise from temporal community structure".
 *
 * This file builds a jsPsych 8 timeline and wires it to DataSaver (src/save.js), which writes
 * to your Firebase project. The graph and sequence generation live in src/graph.js.
 *
 *   1. consent           course-wide consent text (required at the start of every study)
 *   2. instructions
 *   3. demographics      a multi-question survey page (jsPsych "survey" plugin, SurveyJS)
 *   4. exposure phase    all 15 images shown at once, then 1,400 images from a random walk on
 *                        the community graph, 1.5 s each, no ISI. Cover task: press one key if
 *                        the image is rotated 90 degrees (about 20% of trials), another if not.
 *                        Beep at one pitch for a wrong key, another for no response in time.
 *                        Self-paced break about every 7 minutes.
 *   5. parsing phase     600 images, 1.5 s each: 40 blocks of 15, alternating random walk and
 *                        one fixed Hamiltonian cycle per participant (entered next to where the
 *                        walk ended, forward or backward at random). Press the spacebar at
 *                        "natural breaking points".
 *   6. feedback          Likert + free text
 *   7. debrief           saves data, then shows thanks or redirects to Prolific
 *
 * Stimuli (stimuli/stim-01.svg ... stim-15.svg) are generated stand-ins for the original
 * ArtMatic Pro images; see scripts/make-stimuli.js. They are assigned to graph nodes at
 * random for each participant.
 */

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
window.TEMPLATE_VERSION = "0.1.0";

const EXPERIMENT = {
  // Firestore path: experiments/<id>/participants/... Change it when you start a new study
  // so pilot data and real data never mix (e.g. "schapiro2013-pilot-a", "schapiro2013-final").
  id: "schapiro2013-pilot-a",

  // Trials per Firestore write. With ~2,000 image trials per participant, chunk_size 1 would
  // spend ~2,000 of the free tier's 20,000 writes/day on every participant. 50 gives ~45
  // writes per participant; a dropout loses at most the last 50 trials (75 s).
  chunk_size: 50,

  // Also store the complete jsPsych dataset on the participant document at the end.
  // A full-length run is ~2,000 rows (~0.9 MB), over DataSaver's 800 KB cap, so it normally
  // records full_data_omitted instead. Nothing is lost: export reads the trial chunks first.
  // It is kept on so that a shortened pilot still gets the backup copy.
  save_full_data_at_end: true,

  // Prolific: if set, participants are redirected to Prolific when they finish.
  // Leave empty for local testing or non-Prolific samples.
  prolific_completion_code: "",

  // Contact shown in consent and debrief.
  contact_email: "suheecho@stanford.edu",

  // The rotation task and the parsing task are answered on the keyboard.
  requires_keyboard: true,

  // ---- Design (Schapiro et al., 2013, Online Methods) ----
  n_exposure: 1400,          // exposure-phase images (random walk)
  n_parse_blocks: 40,        // parsing-phase blocks of 15 images (40 x 15 = 600)
  stim_ms: 1500,             // each image is shown for 1.5 s with no interstimulus interval
  p_rotated: 0.2,            // "rotated 90 degrees ... about 20% of the time"
  break_every: 280,          // self-paced break "about every 7 min" (280 x 1.5 s = 7 min), exposure phase
  response_keys: ["f", "j"], // which of these means "rotated" is counterbalanced across participants
  beep_wrong_hz: 300,        // "a beep at one frequency ... when the response was incorrect"
  beep_slow_hz: 900,         // "... and at another frequency when the response was not within the time frame"
};

// True on anything with a mouse, trackpad, or stylus, including laptops with touchscreens.
// False on phones and tablets without a pointing device, which are also the devices with no
// physical keyboard. See docs/student-guide.md "Devices".
function hasFinePointer() {
  return !!(window.matchMedia && window.matchMedia("(any-pointer: fine)").matches);
}

// `?emulator=1` in the URL sends data to the local emulator instead of the real project.
// Used by `npm test`; handy for development too (start it with `npm run emulators`).
const URL_PARAMS = new URLSearchParams(window.location.search);
const USE_EMULATOR = URL_PARAMS.get("emulator") === "1";
// `?chunk_size=N` overrides the setting above; used by the test suite to exercise chunked writes.
const CHUNK_SIZE = Number(URL_PARAMS.get("chunk_size")) || EXPERIMENT.chunk_size;
// Test-only: `?cc=CODE` sets a Prolific completion code during emulator runs, so the test
// suite can check the screen a participant sees once you have set yours. Ignored in live runs.
if (USE_EMULATOR && URL_PARAMS.get("cc")) EXPERIMENT.prolific_completion_code = URL_PARAMS.get("cc");
// Short runs for testing and piloting: `?n_exposure=12&n_parse_blocks=2&stim_ms=600&break_every=6`.
// Honoured only in emulator runs or on localhost, never on the live site, so a participant
// cannot shorten the study. The values used are stored on the participant document.
const ALLOW_OVERRIDES = USE_EMULATOR || ["localhost", "127.0.0.1"].includes(window.location.hostname);
if (ALLOW_OVERRIDES) {
  for (const k of ["n_exposure", "n_parse_blocks", "stim_ms", "break_every"]) {
    if (URL_PARAMS.get(k)) EXPERIMENT[k] = Number(URL_PARAMS.get(k));
  }
}

const STIMULI = Array.from({ length: 15 }, (_, i) => "stimuli/stim-" + String(i + 1).padStart(2, "0") + ".svg");

// Beeps for the rotation task, via Web Audio (no sound files). The AudioContext has to be
// created from a click, so it is started when the participant agrees to participate.
let audioCtx = null;
function startAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { audioCtx = null; }
}
function beep(freq) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.21);
}

// ---------------------------------------------------------------------------
// Boot: connect the saver first so even a crash in the first trial gets logged.
// ---------------------------------------------------------------------------
(async function main() {
  const deviceSupported = !EXPERIMENT.requires_keyboard || hasFinePointer();

  const saver = await DataSaver.init({
    experiment_id: EXPERIMENT.id,
    chunk_size: CHUNK_SIZE,
    save_full_data_at_end: EXPERIMENT.save_full_data_at_end,
    use_emulator: USE_EMULATOR,
    contact_email: EXPERIMENT.contact_email,
  });
  window.__saver = saver; // for debugging and the automated test

  // Record the device verdict on the participant document before anything else, so a
  // participant turned away below is still visible in the data rather than simply absent.
  saver.updateParticipant({ device_supported: deviceSupported, requires_keyboard: EXPERIMENT.requires_keyboard });

  if (!deviceSupported) {
    document.body.innerHTML =
      '<div id="device-unsupported" class="jspsych-content" style="max-width:640px;margin:15vh auto;font:16px/1.6 system-ui,sans-serif;">' +
      "<h2>Please use a computer</h2>" +
      "<p>This study needs a computer with a physical keyboard, because part of it is answered " +
      "by pressing keys. Phones and tablets cannot be used.</p>" +
      "<p>Please reopen this link on a laptop or desktop computer. If you were sent here from " +
      "Prolific, you can return the study and take it later on a computer; nothing has been recorded " +
      "against you.</p>" +
      "<p>Questions: <a href=\"mailto:" + EXPERIMENT.contact_email + "\">" + EXPERIMENT.contact_email + "</a></p></div>";
    return;
  }

  const jsPsych = initJsPsych({
    show_progress_bar: true,
    auto_update_progress_bar: true,
    on_data_update: (trial) => saver.onTrial(trial),
    on_finish: async () => {
      const el = jsPsych.getDisplayElement();
      el.innerHTML = '<div id="finish-message"><p class="thanks">Saving your responses…</p></div>';
      // finish() flushes remaining trials, marks the participant complete, and (only if
      // saving failed) appends a download-fallback box to the display element.
      const result = await saver.finish(jsPsych);
      const consentRow = jsPsych.data.get().filter({ task: "consent" }).values()[0];
      const consented = !consentRow || consentRow.consented !== false;
      const msg = document.getElementById("finish-message");

      if (!consented) {
        msg.innerHTML = "<h2 class='thanks'>Thank you</h2><p class='thanks'>You chose not to participate. " +
          "You may close this window" + (EXPERIMENT.prolific_completion_code ? " and return the study on Prolific" : "") + ".</p>";
        return;
      }
      if (result.ok && EXPERIMENT.prolific_completion_code && !USE_EMULATOR) {
        msg.innerHTML = "<p class='thanks'>Saved. Returning you to Prolific…</p>";
        window.location.href =
          "https://app.prolific.com/submissions/complete?cc=" + EXPERIMENT.prolific_completion_code;
        return;
      }
      // In emulator/test runs we stay on the page instead of navigating to Prolific, so that
      // setting a completion code can never turn `npm test` or CI red. Live runs redirect above.
      msg.innerHTML =
        "<h2 class='thanks'>All done</h2>" +
        (result.ok ? "<p class='thanks'>Your responses were saved. Thank you for participating!</p>" : "") +
        (EXPERIMENT.prolific_completion_code
          ? "<p class='thanks'>Your completion code is <strong>" + EXPERIMENT.prolific_completion_code + "</strong>.</p>"
          : "");
    },
  });

  // Record the participant id and URL parameters on every trial row.
  jsPsych.data.addProperties({
    // Must be the run-scoped document id, so trial rows join to participants.csv on export.
    participant_id: saver.docId,
    prolific_pid: saver.params.PROLIFIC_PID || null,
    experiment_id: EXPERIMENT.id,
  });

  // -------------------------------------------------------------------------
  // Per-participant randomization: stimulus-to-node mapping, key assignment, the fixed
  // Hamiltonian cycle, and both sequences. All of it is stored on the participant document.
  // -------------------------------------------------------------------------
  const G = window.CommunityGraph;
  const nodeStim = jsPsych.randomization.shuffle(STIMULI);           // nodeStim[node] = image file
  const [rotatedKey, uprightKey] = jsPsych.randomization.shuffle(EXPERIMENT.response_keys);
  const condition = "rotated-" + rotatedKey;                          // the key counterbalance
  const cycle = G.drawHamiltonianCycle(Math.random);

  const exposureNodes = G.randomWalk(EXPERIMENT.n_exposure, Math.random);
  const nRotated = Math.round(EXPERIMENT.p_rotated * EXPERIMENT.n_exposure);
  const rotatedFlags = jsPsych.randomization.shuffle(
    Array.from({ length: EXPERIMENT.n_exposure }, (_, i) => i < nRotated));
  const exposureItems = G.annotate(exposureNodes)
    .map((a, i) => ({ ...a, seq_index: i, stim: nodeStim[a.node], rotated: rotatedFlags[i] }));

  const parseRaw = G.parsingSequence(EXPERIMENT.n_parse_blocks, cycle, Math.random,
    exposureNodes[exposureNodes.length - 1]);
  const parseItems = G.annotate(parseRaw.map((p) => p.node))
    .map((a, i) => ({ ...parseRaw[i], ...a, seq_index: i, stim: nodeStim[a.node] }));

  jsPsych.data.addProperties({ condition: condition });
  saver.updateParticipant({
    condition: condition,
    rotated_key: rotatedKey,
    upright_key: uprightKey,
    node_stimuli: nodeStim,
    hamiltonian_cycle: cycle,
    settings: {
      n_exposure: EXPERIMENT.n_exposure, n_parse_blocks: EXPERIMENT.n_parse_blocks,
      stim_ms: EXPERIMENT.stim_ms, p_rotated: EXPERIMENT.p_rotated, break_every: EXPERIMENT.break_every,
    },
  });
  // For the automated test: which key means "rotated" for this participant.
  window.__exp = { rotated_key: rotatedKey, upright_key: uprightKey };

  // Load every image before the timed phases so no trial starts with a blank image.
  await Promise.all(STIMULI.map((src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = src;
  })));

  // -------------------------------------------------------------------------
  // 1. Consent (course-wide IRB text; edit only the contact address)
  // -------------------------------------------------------------------------
  const consent = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <div class="consent">
        <h2>Consent</h2>
        <p>By answering the following questions, you are participating in a study being performed by
        cognitive scientists in the Stanford Department of Psychology. If you have questions about
        this research, please contact us at <a href="mailto:${EXPERIMENT.contact_email}">${EXPERIMENT.contact_email}</a>.
        You must be at least 18 years old to participate. Your participation in this research is
        voluntary. You may decline to answer any or all of the following questions. You may decline
        further participation, at any time, without adverse consequences. Your anonymity is assured;
        the researchers who have requested your participation will not receive any personal
        information about you.</p>
      </div>`,
    choices: ["I agree to participate", "I do not agree"],
    data: { task: "consent" },
    on_finish: (data) => {
      data.consented = data.response === 0;
      if (!data.consented) {
        // No end message here: jsPsych would paint it over the screen that on_finish renders.
        jsPsych.abortExperiment();
        return;
      }
      startAudio(); // runs inside the click, which browsers require before playing sound
    },
  };

  // -------------------------------------------------------------------------
  // 2. Instructions
  // -------------------------------------------------------------------------
  const totalMin = Math.round(
    (EXPERIMENT.n_exposure + 15 * EXPERIMENT.n_parse_blocks) * EXPERIMENT.stim_ms / 60000) + 5;
  const instructions = {
    type: jsPsychInstructions,
    pages: [
      `<h2>Welcome</h2>
       <p>Welcome to the study! This study has two main parts. In both you will watch a stream of abstract images,
       shown one at a time, and press keys in response. It takes about ${totalMin} minutes,
       with short breaks along the way.</p>`,
      `<p>Please complete the study in one sitting, in a quiet place, on a laptop or desktop
       computer with a keyboard. <strong>Please turn your sound on</strong>: the first part uses
       beeps as feedback. Use the buttons or the arrow keys to move between pages.</p>`,
    ],
    show_clickable_nav: true,
    data: { task: "instructions" },
    on_finish: startAudio,
  };

  // -------------------------------------------------------------------------
  // 3. Demographics (survey plugin: one page, several question types)
  // -------------------------------------------------------------------------
  const demographics = {
    type: jsPsychSurvey,
    survey_json: {
      showQuestionNumbers: "off",
      completeText: "Continue",
      // Commit the age as it is typed, so its error clears (and the page reflows) then, not
      // when the participant clicks the next question.
      textUpdateMode: "onTyping",
      pages: [
        {
          elements: [
            // Every item must be answered, but the consent text promises participants may decline
            // any question, so each one offers "Prefer not to say". Ticking it for age clears the age.
            {
              type: "text", name: "age", title: "How old are you?", inputType: "number", min: 18, max: 120,
              requiredIf: "{age_declined} empty", enableIf: "{age_declined} empty",
            },
            {
              type: "checkbox", name: "age_declined", titleLocation: "hidden",
              choices: [{ value: "declined", text: "Prefer not to say" }],
            },
            {
              type: "radiogroup", name: "gender", title: "What is your gender?", isRequired: true,
              choices: ["Woman", "Man", "Non-binary"], showOtherItem: true, showNoneItem: true, noneText: "Prefer not to say",
            },
            {
              type: "radiogroup", name: "native_english", title: "Is English your first language?", isRequired: true,
              choices: [{ value: true, text: "Yes" }, { value: false, text: "No" }], showNoneItem: true, noneText: "Prefer not to say",
            },
            { type: "html", name: "missing_msg", visible: false },
          ],
        },
      ],
    },
    // On Continue with items left blank, list them under the questions (each one is also flagged
    // inline). The list then updates as they are answered and disappears once nothing is missing.
    survey_function: (survey) => {
      const labels = { age: "your age", gender: "your gender", native_english: "whether English is your first language" };
      const missing = () => {
        const d = survey.data;
        const out = [];
        if ((d.age === undefined || d.age === "") && !(d.age_declined || []).length) out.push(labels.age);
        if (d.gender === undefined || (d.gender === "other" && !d["gender-Comment"])) out.push(labels.gender);
        if (d.native_english === undefined) out.push(labels.native_english);
        return out;
      };
      const show = () => {
        const msg = survey.getQuestionByName("missing_msg");
        const items = missing();
        msg.html = `<p class="missing-msg">To continue, please answer: ${items.join("; ")}. ` +
          `If you would rather not answer a question, choose "Prefer not to say".</p>`;
        msg.visible = items.length > 0;
      };
      survey.onValidatedErrorsOnCurrentPage.add(show);
      survey.onValueChanged.add((s, opts) => {
        if (opts.name === "age_declined" && (opts.value || []).length) s.clearValue("age");
        if (s.getQuestionByName("missing_msg").visible) show();
      });
    },
    data: { task: "demographics" },
  };

  // -------------------------------------------------------------------------
  // 4. Exposure phase: rotation-detection cover task on a random walk
  // -------------------------------------------------------------------------
  const K = (k) => `<strong>${k.toUpperCase()}</strong>`;
  const stimHtml = (cls, seqIndex, node, rotated) =>
    `<div class="stim-frame"><img class="stim ${cls}${rotated ? " rotated" : ""}" ` +
    `data-seq="${seqIndex}" src="${nodeStim[node]}" alt=""></div>`;

  const allImagesGrid = jsPsych.randomization.shuffle(STIMULI)
    .map((src) => `<img class="grid-stim" src="${src}" alt="">`).join("");
  const exposureInstructions = {
    type: jsPsychInstructions,
    pages: [
      `<h2>Part 1</h2>
       <p>Here are all of the images you will see, in their normal orientation. During the experiment, you will be asked 
       to identify whether the presented images are rotated from the original orientation. Feel free to take a moment
       to look at them.</p>
       <div class="stim-grid">${allImagesGrid}</div>`,
      `<h2>Part 1</h2>
       <p>The images will now appear one at a time, each for ${(EXPERIMENT.stim_ms / 1000).toFixed(1)} seconds,
       one straight after the other. Sometimes an image will be <strong>rotated</strong> away
       from the orientation you just saw.</p>
       <p>For <em>every</em> image, press:</p>
       <ul>
         <li>${K(rotatedKey)} if the image is <strong>rotated</strong></li>
         <li>${K(uprightKey)} if it is in its <strong>normal orientation</strong></li>
       </ul>
       <p>Respond while the image is still on the screen. You will hear a <strong>low beep</strong>
       if you press the wrong key, and a <strong>high beep</strong> if you do not respond in time.</p>
       <p>There will be a short break about every 7 minutes. Place your fingers on
       ${K(EXPERIMENT.response_keys[0])} and ${K(EXPERIMENT.response_keys[1])}, then press Next to begin.</p>`,
    ],
    show_clickable_nav: true,
    data: { task: "instructions" },
  };

  // Exposure trial: the plugin records the first key press; an extra listener beeps the
  // moment a wrong key is pressed, and on_finish beeps for no response at stimulus offset.
  const tv = (name) => jsPsych.timelineVariable(name);
  const ev = (name) => jsPsych.evaluateTimelineVariable(name);
  const exposureTrial = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: () => stimHtml("exposure-stim", ev("seq_index"), ev("node"), ev("rotated")),
    choices: EXPERIMENT.response_keys,
    trial_duration: EXPERIMENT.stim_ms,
    response_ends_trial: false,
    data: {
      task: "exposure", seq_index: tv("seq_index"), node: tv("node"), community: tv("community"),
      stim: tv("stim"), rotated: tv("rotated"),
      community_change: tv("community_change"), prev_run: tv("prev_run"),
    },
    on_load: () => {
      const expected = ev("rotated") ? rotatedKey : uprightKey;
      jsPsych.pluginAPI.getKeyboardResponse({
        callback_function: (info) => {
          if (!jsPsych.pluginAPI.compareKeys(info.key, expected)) beep(EXPERIMENT.beep_wrong_hz);
        },
        valid_responses: EXPERIMENT.response_keys,
        rt_method: "performance",
        persist: false,
        allow_held_key: false,
      });
    },
    on_finish: (data) => {
      const expected = data.rotated ? rotatedKey : uprightKey;
      data.timed_out = data.response === null;
      data.correct = !data.timed_out && jsPsych.pluginAPI.compareKeys(data.response, expected);
      if (data.timed_out) beep(EXPERIMENT.beep_slow_hz);
      delete data.stimulus; // the image is identified by `stim`; the HTML only bloats the data
    },
  };

  const breakScreen = (phaseName, done, total) => ({
    type: jsPsychHtmlButtonResponse,
    stimulus: `<h2>Break</h2>
      <p class="thanks">You have finished ${done} of ${total} images in ${phaseName}.
      Take a short break if you like. As a reminder, as you continue the session, press ${K(rotatedKey)} if the image is rotated and ${K(uprightKey)} if it is in its normal orientation. 
      Press Continue when you are ready.</p>`,
    choices: ["Continue"],
    data: { task: "break", phase: phaseName, after_trials: done },
  });

  // Split the walk into segments with a break between them.
  const exposurePhase = [];
  for (let start = 0; start < exposureItems.length; start += EXPERIMENT.break_every) {
    const seg = exposureItems.slice(start, start + EXPERIMENT.break_every);
    if (start > 0) exposurePhase.push(breakScreen("Part 1", start, exposureItems.length));
    exposurePhase.push({ timeline: [exposureTrial], timeline_variables: seg });
  }

  // -------------------------------------------------------------------------
  // 5. Parsing phase: spacebar at "natural breaking points"
  // -------------------------------------------------------------------------
  const parsingInstructions = {
    type: jsPsychInstructions,
    pages: [
      `<h2>Part 2</h2>
       <p>Well done! Part 1 is over. In the next part, you will see more sequences of the same
       images, all in their original orientation, again one at a time.</p>
       <p>In part 2, you no longer need to judge rotation. Instead, simply press the <strong>spacebar</strong>
       at times in the sequence that you feel would be natural to place <strong>breaking points</strong>.</p>
       <p>There are no right or wrong answers. Press Next to begin.</p>`,
    ],
    show_clickable_nav: true,
    data: { task: "instructions" },
  };

  const parsingTrial = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: () => stimHtml("parse-stim", ev("seq_index"), ev("node"), false),
    choices: [" "],
    trial_duration: EXPERIMENT.stim_ms,
    response_ends_trial: false,
    data: {
      task: "parsing", seq_index: tv("seq_index"), node: tv("node"), community: tv("community"),
      stim: tv("stim"), block: tv("block"), block_pos: tv("block_pos"),
      walk_type: tv("walk_type"), direction: tv("direction"),
      community_change: tv("community_change"), prev_run: tv("prev_run"),
    },
    on_finish: (data) => {
      data.parsed = data.response !== null;
      delete data.stimulus;
    },
  };
  const parsingPhase = { timeline: [parsingTrial], timeline_variables: parseItems };

  // -------------------------------------------------------------------------
  // 6. Feedback
  // -------------------------------------------------------------------------
  const feedback = {
    type: jsPsychSurveyLikert,
    questions: [
      {
        prompt: "How clear were the instructions?", name: "instructions_clear", required: false,
        labels: ["Very unclear", "Unclear", "Neutral", "Clear", "Very clear"],
      },
    ],
    data: { task: "feedback_likert" },
  };
  const comments = {
    type: jsPsychSurveyText,
    questions: [{ prompt: "Any comments about the study? (optional)", name: "comments", rows: 4 }],
    data: { task: "feedback_text" },
  };

  // -------------------------------------------------------------------------
  // 7. Debrief
  // -------------------------------------------------------------------------
  const debrief = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `
      <h2>Debrief</h2>
      <p>You are all done, thank you! In fact, the order of the images in this study was not random.
      The images fell into three groups that tended to appear together, meaning that certain images were more likely to be followed by others.
      We are testing whether people pick up on this probabilistic structure of the groups without being told about
      them by observing whether they place "breaking points" where the sequence moves from one group to
      another. If you have questions about this research, contact
      <a href="mailto:${EXPERIMENT.contact_email}">${EXPERIMENT.contact_email}</a>.
      Press the button to save your responses and finish. Thank you again. </p>`,
    choices: ["Finish"],
    data: { task: "debrief" },
  };

  await jsPsych.run([
    consent,
    instructions,
    demographics,
    exposureInstructions,
    ...exposurePhase,
    parsingInstructions,
    parsingPhase,
    feedback,
    comments,
    debrief,
  ]);
})();
