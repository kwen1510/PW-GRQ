const SECTION_LABELS = [
  ['strengths', 'What students did well'],
  ['improvementAreas', 'What could be strengthened'],
  ['suggestedContentAreas', 'Suggested content to strengthen the response'],
  ['studentFeedback', 'Student-specific feedback'],
  ['followUpQuestions', 'Useful follow-up questions'],
  ['evidenceLimitations', 'Evidence limitations']
];

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function stringList(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

export function normalizeAnalysis(value) {
  if (typeof value === 'string') {
    return {
      summary: text(value, 'No analysis was returned.'),
      strengths: [], improvementAreas: [], suggestedContentAreas: [],
      studentFeedback: [], followUpQuestions: [], evidenceLimitations: []
    };
  }
  const source = value && typeof value === 'object' ? value : {};
  return {
    summary: text(source.summary, 'No overall summary was returned.'),
    strengths: stringList(source.strengths),
    improvementAreas: stringList(source.improvementAreas),
    suggestedContentAreas: Array.isArray(source.suggestedContentAreas)
      ? source.suggestedContentAreas.map((item) => ({
        area: text(item?.area),
        whyItMatters: text(item?.whyItMatters),
        researchDirection: text(item?.researchDirection)
      })).filter((item) => item.area)
      : [],
    studentFeedback: Array.isArray(source.studentFeedback)
      ? source.studentFeedback.map((item) => ({
        student: text(item?.student, 'Group'),
        evidence: text(item?.evidence, 'Insufficient individual evidence.'),
        nextStep: text(item?.nextStep, 'Gather more evidence before making an individual judgement.')
      }))
      : [],
    followUpQuestions: stringList(source.followUpQuestions),
    evidenceLimitations: stringList(source.evidenceLimitations)
  };
}

function addList(section, items) {
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted analysis-empty';
    empty.textContent = 'No evidence-supported item was identified.';
    section.append(empty);
    return;
  }
  const list = document.createElement('ul');
  list.className = 'analysis-list';
  items.forEach((item) => { const row = document.createElement('li'); row.textContent = item; list.append(row); });
  section.append(list);
}

function contentAreaList(section, items) {
  if (!items.length) return addList(section, []);
  const list = document.createElement('div'); list.className = 'content-suggestion-list';
  items.forEach((item) => {
    const card = document.createElement('article'); card.className = 'content-suggestion';
    const heading = document.createElement('h5'); heading.textContent = item.area;
    card.append(heading);
    if (item.whyItMatters) { const why = document.createElement('p'); why.append(Object.assign(document.createElement('strong'), { textContent: 'Why it matters: ' }), document.createTextNode(item.whyItMatters)); card.append(why); }
    if (item.researchDirection) { const direction = document.createElement('p'); direction.append(Object.assign(document.createElement('strong'), { textContent: 'Research direction: ' }), document.createTextNode(item.researchDirection)); card.append(direction); }
    list.append(card);
  });
  section.append(list);
}

function feedbackList(section, items) {
  if (!items.length) return addList(section, []);
  const list = document.createElement('div'); list.className = 'student-feedback-list';
  items.forEach((item) => {
    const card = document.createElement('article'); card.className = 'student-feedback-card';
    const heading = document.createElement('h5'); heading.textContent = item.student;
    const evidence = document.createElement('p'); evidence.append(Object.assign(document.createElement('strong'), { textContent: 'Evidence: ' }), document.createTextNode(item.evidence));
    const next = document.createElement('p'); next.append(Object.assign(document.createElement('strong'), { textContent: 'Next step: ' }), document.createTextNode(item.nextStep));
    card.append(heading, evidence, next); list.append(card);
  });
  section.append(list);
}

function questionsFor(record) {
  if (record.questions?.length) return record.questions;
  if (record.report) return [{ question: 'Previously saved report', analysis: record.report }];
  return [];
}

export function renderAnalysis(record) {
  const wrapper = document.createElement('article'); wrapper.className = 'analysis-report-card';
  const header = document.createElement('header'); header.className = 'analysis-report-header';
  const headingWrap = document.createElement('div');
  const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'Saved analysis';
  const heading = document.createElement('h3'); heading.textContent = record.title || 'Discussion analysis';
  const meta = document.createElement('p'); meta.className = 'muted analysis-meta';
  const date = record.createdAt ? new Date(record.createdAt).toLocaleString() : 'Date unavailable';
  meta.textContent = `${record.promptName || 'Custom instructions'} · ${date}`;
  headingWrap.append(eyebrow, heading, meta); header.append(headingWrap); wrapper.append(header);

  questionsFor(record).forEach((question, index) => {
    const questionCard = document.createElement('section'); questionCard.className = 'analysis-question-card';
    const questionHeading = document.createElement('h4'); questionHeading.textContent = `Question ${index + 1}: ${question.question || 'Untitled question'}`;
    questionCard.append(questionHeading);
    const analysis = normalizeAnalysis(question.analysis);
    const summary = document.createElement('section'); summary.className = 'analysis-section analysis-summary';
    const summaryHeading = document.createElement('h5'); summaryHeading.textContent = 'Overall assessment';
    const summaryText = document.createElement('p'); summaryText.textContent = analysis.summary;
    summary.append(summaryHeading, summaryText); questionCard.append(summary);
    SECTION_LABELS.forEach(([key, label]) => {
      const section = document.createElement('section'); section.className = `analysis-section analysis-${key}`;
      const sectionHeading = document.createElement('h5'); sectionHeading.textContent = label; section.append(sectionHeading);
      if (key === 'suggestedContentAreas') contentAreaList(section, analysis[key]);
      else if (key === 'studentFeedback') feedbackList(section, analysis[key]);
      else addList(section, analysis[key]);
      questionCard.append(section);
    });
    wrapper.append(questionCard);
  });
  return wrapper;
}

function linesForAnalysis(analysis) {
  const normalized = normalizeAnalysis(analysis);
  const lines = ['OVERALL ASSESSMENT', normalized.summary, ''];
  SECTION_LABELS.forEach(([key, label]) => {
    lines.push(label.toUpperCase());
    const items = normalized[key];
    if (!items.length) lines.push('- No evidence-supported item was identified.');
    else if (key === 'suggestedContentAreas') items.forEach((item) => {
      const why = item.whyItMatters ? ` — ${item.whyItMatters}` : '';
      const direction = item.researchDirection ? ` Research direction: ${item.researchDirection}` : '';
      lines.push(`- ${item.area}${why}${direction}`);
    });
    else if (key === 'studentFeedback') items.forEach((item) => lines.push(`- ${item.student}: ${item.evidence} Next step: ${item.nextStep}`));
    else items.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  });
  return lines;
}

export function analysisAsText(record, sessionTitle = 'PW GRQ session') {
  const lines = [sessionTitle, record.title || 'Discussion analysis', `Prompt: ${record.promptName || 'Custom instructions'}`, `Created: ${record.createdAt || 'Unknown'}`, ''];
  questionsFor(record).forEach((question, index) => {
    lines.push(`QUESTION ${index + 1}: ${question.question || 'Untitled question'}`, '', ...linesForAnalysis(question.analysis));
  });
  return `${lines.join('\n').trim()}\n`;
}

export function analysisFilename(record) {
  const date = String(record.createdAt || new Date().toISOString()).slice(0, 10);
  const title = text(record.title, 'analysis').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60) || 'analysis';
  return `pw-grq-${date}-${title}.txt`;
}
